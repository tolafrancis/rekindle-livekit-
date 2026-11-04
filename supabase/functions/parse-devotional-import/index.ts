// supabase/functions/parse-devotional-import/index.ts
// Reads an uploaded sheet or document of devotionals and returns them as rows
// for the import preview. It never writes anything: the app shows the rows,
// the leader checks them, and the app saves them under the leader's own RLS.
//
// Who may call it: a ministry admin for that ministry (ministry_id), or
// platform staff (stream_id, the admin devotional streams).
//
// POST body:
//   { ministry_id? | stream_id?, file_name?, file_base64?, text? }
//   -> { mode: 'sheet' | 'template' | 'ai', devotionals: ParsedDevotional[], warnings: string[] }
//
// How a file is read, cheapest first:
//   1. Sheets (.csv .tsv .xlsx .xls): columns are matched by their header
//      (Date, Title, Memory verse...). No AI.
//   2. Documents (.docx .txt .md, a Word "web page" .doc, or pasted text)
//      written with the labels from the template (Date:, Title:, Message:...).
//      No AI.
//   3. Anything else (a free-form doc, or a sheet with unknown headers) goes to
//      Claude, which only says where each day and each part starts and ends
//      (by line number). The text itself is cut from the original, so it is
//      never reworded.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { unzipSync, strFromU8 } from 'npm:fflate@0.8.2'
import * as XLSX from 'npm:xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 300_000
const MAX_ROWS = 400

interface ParsedDevotional {
  date: string            // YYYY-MM-DD, or '' when the source has none
  date_text: string       // the date as written, for the preview
  title: string
  author: string
  scripture_reference: string
  scripture_text: string
  bible_passage_reference: string
  bible_passage_text: string
  message: string
  prayer: string
  reflection_questions: string[]
}

const emptyDevotional = (): ParsedDevotional => ({
  date: '', date_text: '', title: '', author: '', scripture_reference: '', scripture_text: '',
  bible_passage_reference: '', bible_passage_text: '', message: '', prayer: '', reflection_questions: [],
})

type Field = keyof Omit<ParsedDevotional, 'date_text'>

// Header / label names people use for each field. Matched after lower-casing
// and dropping everything but letters and digits.
const FIELD_NAMES: Record<Field, string[]> = {
  date: ['date', 'day', 'scheduleddate', 'scheduledate', 'publishdate', 'devotionaldate'],
  title: ['title', 'topic', 'heading', 'devotionaltitle'],
  author: ['author', 'writer', 'by', 'authorname', 'writtenby'],
  scripture_reference: ['memoryverse', 'memoryversereference', 'keyverse', 'keyversereference', 'verse', 'versereference', 'scripture', 'scripturereference', 'text', 'anchorverse', 'focusverse', 'reference'],
  scripture_text: ['memoryversetext', 'keyversetext', 'versetext', 'scripturetext', 'memoryverseword', 'versewords'],
  bible_passage_reference: ['biblereading', 'biblereadingreference', 'reading', 'readingreference', 'passage', 'biblepassage', 'biblepassagereference', 'readthrough', 'context'],
  bible_passage_text: ['biblereadingtext', 'readingtext', 'passagetext', 'biblepassagetext'],
  message: ['message', 'devotional', 'body', 'content', 'devotion', 'reflection', 'teaching', 'word', 'devotionalmessage'],
  prayer: ['prayer', 'prayerfocus', 'prayerpoint', 'prayerpoints', 'letspray', 'pray'],
  reflection_questions: ['reflectionquestions', 'questions', 'question', 'reflectionquestion', 'discussionquestions', 'thinkaboutit', 'applicationquestions', 'application'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function fieldFor(header: string): Field | null {
  const h = norm(header)
  if (!h) return null
  for (const [field, names] of Object.entries(FIELD_NAMES) as [Field, string[]][]) {
    if (names.includes(h)) return field
  }
  // "Reflection question 2", "Question 1"
  if (/^(reflection|discussion)?questions?\d+$/.test(h)) return 'reflection_questions'
  return null
}

// ---------- dates ----------

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return ''
  return `${y}-${pad(m)}-${pad(d)}`
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Best-effort date reading. Day/month order: YYYY-MM-DD always works; for
 *  12/11/2026 the day comes first unless that is impossible. */
function parseDate(raw: unknown, warnings: Set<string>): string {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    // Spreadsheet dates can land a few seconds before midnight; round to the nearest day.
    const dt = new Date(raw.getTime() + 12 * 3600 * 1000)
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial day number.
    const dt = new Date(Date.UTC(1899, 11, 30) + raw * 86400000)
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  const s = String(raw ?? '').trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
  if (!s) return ''
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    let a = +m[1], b = +m[2]
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (a <= 12 && b > 12) [a, b] = [b, a] // clearly month first
    else if (a <= 12 && b <= 12 && a !== b) warnings.add('Some dates like 03/04/2026 could be read two ways. They were read as day/month. Check the dates in the preview, or use the format 2026-04-03.')
    return iso(y, b, a)
  }
  // "1 November 2026", "November 1, 2026", "Monday, 1 Nov 2026"
  const words = s.toLowerCase().replace(/,/g, ' ').split(/\s+/)
  let day = 0, month = 0, year = 0
  for (const w of words) {
    const mi = MONTHS.findIndex((mo) => w.startsWith(mo))
    if (mi >= 0 && !month) month = mi + 1
    else if (/^\d{4}$/.test(w)) year = +w
    else if (/^\d{1,2}$/.test(w) && !day) day = +w
  }
  if (day && month) {
    if (!year) {
      // No year written: the next time that date comes round.
      const now = new Date()
      year = now.getUTCFullYear()
      const candidate = Date.UTC(year, month - 1, day)
      if (candidate < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 31 * 86400000) year += 1
      warnings.add('Some dates had no year, so the next time that date comes round was used. Check the dates in the preview.')
    }
    return iso(year, month, day)
  }
  return ''
}

// ---------- text clean-up ----------

const tidy = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** Questions from one cell or block: one per line, bullets and numbers removed. */
function splitQuestions(s: string): string[] {
  return s.split(/\n|(?<=\?)\s+(?=\S)/)
    .map((q) => q.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|[a-z][.)]|q\d+[:.)]?)\s*/i, '').trim())
    .filter((q) => q.length > 1)
}

// ---------- sheets ----------

function rowsFromSheet(bytes: Uint8Array, isText: boolean, warnings: Set<string>): { devotionals: ParsedDevotional[]; unmatched: string | null } {
  // CSV/TSV: keep every cell as typed text, so 01/12/2026 is read by parseDate
  // (day first) and not as a US date.
  const wb = XLSX.read(bytes, isText ? { type: 'array', raw: true } : { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { devotionals: [], unmatched: '' }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
  // The header row is the first row that names at least a title or a message column.
  let headerIdx = -1
  let fields: (Field | null)[] = []
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const f = (grid[i] as unknown[]).map((c) => fieldFor(String(c ?? '')))
    if (f.includes('title') || f.includes('message')) { headerIdx = i; fields = f; break }
  }
  if (headerIdx < 0 || !fields.includes('title')) {
    // Headers we don't know: let the AI read it as text.
    return { devotionals: [], unmatched: XLSX.utils.sheet_to_csv(sheet) }
  }
  if (!fields.includes('date')) warnings.add('The sheet has no Date column. Set the dates in the preview, or add a Date column.')

  const out: ParsedDevotional[] = []
  for (const row of grid.slice(headerIdx + 1) as unknown[][]) {
    const d = emptyDevotional()
    fields.forEach((field, col) => {
      if (!field) return
      const cell = row[col]
      if (field === 'date') {
        d.date = parseDate(cell, warnings)
        d.date_text = cell instanceof Date ? d.date : String(cell ?? '').trim()
        return
      }
      const value = tidy(String(cell ?? ''))
      if (!value) return
      if (field === 'reflection_questions') d.reflection_questions.push(...splitQuestions(value))
      else if (!d[field]) (d as any)[field] = value
      else (d as any)[field] += `\n\n${value}`
    })
    if (d.title || d.message) out.push(d)
  }
  return { devotionals: out, unmatched: null }
}

// ---------- documents ----------

function textFromDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
  const xml = files['word/document.xml']
  if (!xml) throw new Error('This .docx file has no document text in it.')
  const doc = strFromU8(xml)
  const paragraphs = doc.split(/<\/w:p>/)
  const decode = (s: string) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
  return paragraphs.map((p) => {
    const isListItem = /<w:numPr>/.test(p)
    let text = ''
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g)) {
      if (m[0].startsWith('<w:tab')) text += '\t'
      else if (m[0].startsWith('<w:br')) text += '\n'
      else text += decode(m[1])
    }
    return isListItem && text.trim() ? `- ${text}` : text
  }).join('\n\n') // a blank line between paragraphs, as the app shows them
}

function textFromHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

// "Label: value" lines from the doc template. Longest names first so that
// "Memory verse text" wins over "Memory verse".
const LABELS: [Field, RegExp][] = ([
  ['scripture_text', ['memory verse text', 'key verse text', 'verse text', 'scripture text']],
  ['bible_passage_text', ['bible reading text', 'reading text', 'passage text']],
  ['reflection_questions', ['reflection questions', 'reflection question', 'questions', 'discussion questions']],
  ['scripture_reference', ['memory verse', 'key verse', 'scripture']],
  ['bible_passage_reference', ['bible reading', 'reading', 'passage']],
  ['prayer', ['prayer focus', 'prayer points', 'prayer']],
  ['message', ['message', 'devotional']],
  ['author', ['author', 'written by']],
  ['title', ['title', 'topic']],
  ['date', ['date']],
] as [Field, string[]][]).map(([field, names]) => [field, new RegExp(`^\\s*(?:\\*\\*|#+\\s*)?(?:${names.join('|')})\\s*(?:\\*\\*)?\\s*(?:[:：]|\\s[-–—]\\s)\\s*(?:\\*\\*)?\\s*(.*)$`, 'i')])

function parseLabelledText(text: string, warnings: Set<string>): ParsedDevotional[] {
  const out: ParsedDevotional[] = []
  let cur: ParsedDevotional | null = null
  let field: Field | null = null
  let buf: string[] = []
  const flush = () => {
    if (!cur || !field) return
    const value = tidy(buf.join('\n'))
    if (field === 'date') { cur.date_text = value; cur.date = parseDate(value, warnings) }
    else if (field === 'reflection_questions') cur.reflection_questions.push(...splitQuestions(value))
    else (cur as any)[field] = value
    buf = []
  }
  for (const line of text.split('\n')) {
    const hit = LABELS.find(([, re]) => re.test(line))
    if (hit) {
      flush()
      const [f, re] = hit
      if (f === 'date' || (f === 'title' && cur?.title)) {
        if (cur) out.push(cur)
        cur = emptyDevotional()
      }
      if (!cur) cur = emptyDevotional()
      field = f
      buf = [line.match(re)![1]]
    } else if (/^\s*(?:[-_=*]{3,}|day\s+\d+\s*[:.]?)\s*$/i.test(line)) {
      // A separator or "Day 3" heading between days, not part of any field.
      continue
    } else if (field) {
      buf.push(line)
    }
  }
  flush()
  if (cur) out.push(cur)
  return out.filter((d) => d.title || d.message)
}

// ---------- AI ----------

const AI_TOOL = {
  name: 'submit_devotionals',
  description: 'Report where each devotional in the numbered document starts and ends, and where each of its parts is.',
  input_schema: {
    type: 'object',
    properties: {
      devotionals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'The day it is for, as YYYY-MM-DD. Empty string if the document gives no date for it.' },
            date_text: { type: 'string', description: 'The date exactly as written in the document, or "Day 3" style labels. Empty if none.' },
            title: { type: 'string', description: 'The title, copied exactly.' },
            author: { type: 'string', description: 'The author if named for this day, else empty.' },
            scripture_reference: { type: 'string', description: 'Reference of the main / memory / key verse, e.g. "Psalm 24:1". Empty if none.' },
            scripture_text: { type: 'string', description: 'The words of that verse, copied exactly. Empty if the document only gives the reference.' },
            bible_passage_reference: { type: 'string', description: 'Reference of a longer Bible reading or context passage, if any.' },
            bible_passage_lines: { type: ['array', 'null'], items: { type: 'integer' }, description: '[first, last] line numbers of the Bible reading text, or null.' },
            message_lines: { type: ['array', 'null'], items: { type: 'integer' }, description: '[first, last] line numbers of the devotional message body. Do not include the title, date, verse or prayer lines.' },
            prayer_lines: { type: ['array', 'null'], items: { type: 'integer' }, description: '[first, last] line numbers of the prayer, or null.' },
            question_lines: { type: 'array', items: { type: 'array', items: { type: 'integer' } }, description: 'One [first, last] line range for each reflection / discussion question.' },
          },
          required: ['date', 'title', 'message_lines'],
        },
      },
      notes: { type: 'string', description: 'Anything the person should check, in one or two plain sentences. Empty if nothing.' },
    },
    required: ['devotionals'],
  },
}

async function callClaude(apiKey: string, numbered: string, today: string) {
  const system = `You split a church's devotional document into separate daily devotionals for a devotional app.
The document is given with a line number before every line ("12| text").
For every devotional in it, call submit_devotionals once with all of them, in document order.
Rules:
- Never rewrite, summarise or translate anything. Titles, references and verse words are copied exactly; long parts are given as line ranges.
- A devotional usually has a date or "Day N" heading, a title, a key verse, a message, often a prayer, and sometimes questions.
- Today is ${today}. If a date has no year, use the year that makes it the next time that date comes round. If there are no dates at all, leave date empty.
- If the document is one long devotional with no days, return it as one devotional.
- Skip introductions, tables of contents and notes that are not part of a day.`
  const body = (model: string) => JSON.stringify({
    model,
    max_tokens: 16000,
    system,
    tools: [AI_TOOL],
    tool_choice: { type: 'tool', name: 'submit_devotionals' },
    messages: [{ role: 'user', content: numbered }],
  })
  let res: Response | null = null
  for (const model of ['claude-sonnet-5-5', 'claude-sonnet-5']) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: body(model),
    })
    if (res.ok || res.status !== 404) break
  }
  if (!res || !res.ok) throw new Error(`The AI reader failed (${res?.status}): ${(await res?.text())?.slice(0, 300)}`)
  const data = await res.json()
  const tool = data.content?.find((b: any) => b.type === 'tool_use')
  if (!tool) throw new Error('The AI reader returned no devotionals.')
  return tool.input as { devotionals: any[]; notes?: string }
}

const LEADING_LABEL = /^\s*(?:\*\*)?(?:message|devotional|prayer(?: focus| points)?|let'?s pray|reflection questions?|questions?|bible reading(?: text)?|reading|passage)\s*(?:\*\*)?\s*[:：\-–—]\s*/i

async function parseWithAI(text: string, warnings: Set<string>): Promise<ParsedDevotional[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in Supabase secrets.')
  const lines = text.split('\n')
  const numbered = lines.map((l, i) => `${i + 1}| ${l}`).join('\n')
  const today = new Date().toISOString().slice(0, 10)
  const result = await callClaude(apiKey, numbered, today)
  const slice = (range: unknown, stripLabel = true) => {
    if (!Array.isArray(range) || range.length < 1) return ''
    const a = Math.max(1, Math.floor(Number(range[0])))
    const b = Math.min(lines.length, Math.floor(Number(range[1] ?? range[0])))
    if (!a || !b || b < a) return ''
    const part = lines.slice(a - 1, b)
    if (stripLabel && part.length) part[0] = part[0].replace(LEADING_LABEL, '')
    return tidy(part.join('\n'))
  }
  if (result.notes?.trim()) warnings.add(result.notes.trim())
  return (result.devotionals ?? []).map((r) => {
    const d = emptyDevotional()
    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    d.date_text = s(r.date_text) || s(r.date)
    d.date = parseDate(s(r.date), new Set()) || ''
    d.title = s(r.title)
    d.author = s(r.author)
    d.scripture_reference = s(r.scripture_reference)
    d.scripture_text = s(r.scripture_text)
    d.bible_passage_reference = s(r.bible_passage_reference)
    d.bible_passage_text = slice(r.bible_passage_lines)
    d.message = slice(r.message_lines)
    d.prayer = slice(r.prayer_lines)
    d.reflection_questions = (Array.isArray(r.question_lines) ? r.question_lines : [])
      .flatMap((q: unknown) => splitQuestions(slice(q)))
    return d
  }).filter((d) => d.title || d.message)
}

// ---------- handler ----------

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Please sign in again.' }, 401)
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Please sign in again.' }, 401)

    const body = await req.json().catch(() => ({}))
    const { ministry_id, stream_id, file_name, file_base64, text } = body ?? {}

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    let allowed = false
    if (typeof ministry_id === 'string' && ministry_id) {
      const { data } = await admin.rpc('is_ministry_admin', { p_ministry_id: ministry_id, p_user_id: user.id })
      allowed = data === true
    }
    if (!allowed) {
      // Platform staff may import into a stream, or into any ministry.
      const { data } = await admin.rpc('is_platform_staff', { p_uid: user.id })
      allowed = data === true && (!!stream_id || !!ministry_id)
    }
    if (!allowed) return json({ error: 'Only this ministry’s leaders can import devotionals.' }, 403)

    const warnings = new Set<string>()
    const name = String(file_name ?? '').toLowerCase()
    const ext = name.includes('.') ? name.split('.').pop()! : ''
    let docText = ''
    let devotionals: ParsedDevotional[] = []
    let mode: 'sheet' | 'template' | 'ai' = 'template'

    if (typeof file_base64 === 'string' && file_base64) {
      const bytes = decodeBase64(file_base64)
      if (bytes.length > MAX_FILE_BYTES) return json({ error: 'That file is over 10 MB. Split it into smaller files.' }, 400)
      const head = strFromU8(bytes.slice(0, 600)).toLowerCase()
      if (['csv', 'tsv', 'xlsx', 'xls', 'ods'].includes(ext)) {
        const sheet = rowsFromSheet(bytes, ext === 'csv' || ext === 'tsv', warnings)
        if (sheet.unmatched === null) { devotionals = sheet.devotionals; mode = 'sheet' }
        else docText = sheet.unmatched
      } else if (ext === 'docx' || (bytes[0] === 0x50 && bytes[1] === 0x4b && ext !== 'xlsx')) {
        docText = textFromDocx(bytes)
      } else if (head.includes('<html') || head.includes('<!doctype') || ext === 'htm' || ext === 'html') {
        docText = textFromHtml(strFromU8(bytes))
      } else if (ext === 'doc' || ext === 'pdf' || ext === 'pages') {
        return json({ error: ext === 'doc'
          ? 'Old Word (.doc) files can’t be read. In Word, choose File › Save As › Word Document (.docx) and upload that.'
          : 'This file type can’t be read. Upload a Word (.docx), Excel (.xlsx), CSV or text file, or paste the text.' }, 400)
      } else {
        docText = strFromU8(bytes)
      }
    } else if (typeof text === 'string' && text.trim()) {
      docText = text
    } else {
      return json({ error: 'Choose a file or paste some text first.' }, 400)
    }

    if (mode !== 'sheet') {
      docText = tidy(docText.replace(/\u00a0/g, ' '))
      if (!docText) return json({ error: 'No text was found in that file.' }, 400)
      if (docText.length > MAX_TEXT_CHARS) return json({ error: 'That document is too long to read in one go. Split it into a few smaller files (for example one per month).' }, 400)
      devotionals = parseLabelledText(docText, warnings)
      const labelled = devotionals.filter((d) => d.title && d.message).length
      if (labelled === 0) {
        mode = 'ai'
        devotionals = await parseWithAI(docText, warnings)
        warnings.add('This file didn’t follow the template, so AI read it. Check each day in the preview before importing.')
      } else {
        mode = 'template'
      }
    }

    if (devotionals.length > MAX_ROWS) {
      warnings.add(`Only the first ${MAX_ROWS} devotionals are shown. Import the rest in a second file.`)
      devotionals = devotionals.slice(0, MAX_ROWS)
    }
    if (!devotionals.length) return json({ error: 'No devotionals were found. Check the file follows the template, or paste the text instead.' }, 400)

    return json({ mode, devotionals, warnings: [...warnings] })
  } catch (err) {
    console.error('[parse-devotional-import]', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
