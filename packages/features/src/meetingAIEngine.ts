/**
 * MeetingAIEngine.ts
 *
 * Shared AI pipeline for meeting recording, transcription,
 * multilingual support, and structured summarization.
 * Used by both MinistryInteractiveMeetings and LiveChannelInteractiveMeetings.
 *
 * All AI calls go through the `meeting-ai` Supabase edge function (OpenAI
 * gpt-4o-mini), which holds OPENAI_API_KEY server-side. The client never talks to
 * a model provider directly.
 * No hallucination: if information is missing, fields are null or empty arrays.
 */

import { supabase } from '@rekindle/supabase';
import { meetingNotesToPlainText, meetingNotesToReportDocument } from './meetingNotesFormat';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp: number; // seconds from session start
  language?: string;
}

export interface RawTranscript {
  lines: TranscriptLine[];
  durationSeconds: number;
  detectedLanguages: string[];
}

export interface CleanedTranscript {
  lines: TranscriptLine[];
  dominantLanguage: string;
  isMixedLanguage: boolean;
  translatedLines?: TranscriptLine[]; // English translation if original is non-English
}

export interface ActionItem {
  text: string;
  owner: string | null;
  deadline: string | null;
}

export interface SpeakerInsight {
  speaker: string;
  wordCount: number;
  contributionPercent: number;
  keyTopics: string[];
}

export interface MeetingInsights {
  summaryEnglish: string;
  summaryOriginal: string | null; // null if original was English
  keyPoints: string[];
  actionItems: ActionItem[];
  decisions: string[];
  openQuestions: string[];
  sentiment: 'positive' | 'neutral' | 'mixed' | 'negative';
  keyThemes: string[];
  speakerInsights: SpeakerInsight[];
  dominantLanguage: string;
  processingDurationMs: number;
  /**
   * Detailed meeting notes / report (Markdown subset, see meetingNotesFormat.ts):
   * overview, topic sections, tables, action items with owners. Missing on
   * insights generated before this was added; the Summary tab offers to create it.
   */
  meetingNotes?: string | null;
}

export interface MeetingNotesOptions {
  /** Shown under the report title, e.g. "6 November 2026". Defaults to today. */
  meetingDate?: string;
}

export type SlashCommand = '/record' | '/transcribe' | '/summarize';

// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_DURATION_SECONDS = 180; // 3-minute chunks for long sessions
const CHUNK_OVERLAP_SECONDS = 20;   // overlap to preserve context at boundaries

// gpt-4o-mini has a 128k-token context, so a normal meeting (a 45-minute
// meeting is ~30k characters, ~8k tokens) fits in ONE call. Summarising it in
// 3-minute, 300-token pieces first is what made the insights so thin, so we
// only fall back to segment notes for very long sessions.
const SINGLE_PASS_MAX_CHARS = 180_000;
const NOTES_SEGMENT_CHARS = 60_000;
// The report is written by a stronger model: gpt-4o-mini dropped most names,
// assignments and plans when tested on a real 46-minute meeting. meeting-ai
// falls back to gpt-4o-mini if it can't serve this one.
const NOTES_MODEL = 'gpt-4.1';

// ── Internal helper ────────────────────────────────────────────────────────

/**
 * All AI calls go through the `meeting-ai` edge function (OpenAI gpt-4o-mini),
 * which holds OPENAI_API_KEY server-side.
 *
 * This previously fetched api.anthropic.com straight from the browser with no
 * API key and no CORS allowance, so every AI step failed. Never call a model
 * provider from the client: the key would be exposed, and browsers block it.
 */
async function callAI(systemPrompt: string, userContent: string, maxTokens = 1000, model?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('meeting-ai', {
    body: { system: systemPrompt, user: userContent, maxTokens, ...(model ? { model } : {}) },
  });
  if (error) throw new Error(`meeting-ai failed: ${error.message}`);
  if (data?.error) throw new Error(`meeting-ai: ${data.error}`);
  if (typeof data?.text !== 'string') throw new Error('No text in meeting-ai response');
  return data.text;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ── Transcript line formatter ──────────────────────────────────────────────

export function formatTranscriptToText(lines: TranscriptLine[]): string {
  return lines
    .map(l => {
      const mm = Math.floor(l.timestamp / 60).toString().padStart(2, '0');
      const ss = Math.floor(l.timestamp % 60).toString().padStart(2, '0');
      return `[${mm}:${ss}] ${l.speaker}: ${l.text}`;
    })
    .join('\n');
}

// ── Chunking ──────────────────────────────────────────────────────────────

function chunkTranscript(lines: TranscriptLine[]): TranscriptLine[][] {
  if (lines.length === 0) return [];

  const chunks: TranscriptLine[][] = [];
  let chunkStart = 0;

  while (chunkStart < lines.length) {
    const startTime = lines[chunkStart].timestamp;
    const chunkEnd = startTime + CHUNK_DURATION_SECONDS;

    // Find last line in this window
    let endIdx = chunkStart;
    while (endIdx < lines.length - 1 && lines[endIdx + 1].timestamp < chunkEnd) {
      endIdx++;
    }

    chunks.push(lines.slice(chunkStart, endIdx + 1));

    // Next chunk starts with overlap
    const nextStart = lines.findIndex(
      (l, i) => i > chunkStart && l.timestamp >= chunkEnd - CHUNK_OVERLAP_SECONDS
    );
    chunkStart = nextStart === -1 ? lines.length : nextStart;
  }

  return chunks;
}

// ── Language Detection ────────────────────────────────────────────────────

export async function detectLanguages(lines: TranscriptLine[]): Promise<{
  dominantLanguage: string;
  allLanguages: string[];
  isMixed: boolean;
}> {
  if (lines.length === 0) return { dominantLanguage: 'en', allLanguages: ['en'], isMixed: false };

  // Sample up to 20 lines spread across the transcript
  const step = Math.max(1, Math.floor(lines.length / 20));
  const sample = lines.filter((_, i) => i % step === 0).slice(0, 20);
  const sampleText = sample.map(l => l.text).join('\n');

  const raw = await callAI(
    `You are a language detection expert. Respond ONLY with valid JSON. No preamble.`,
    `Detect the language(s) in this transcript sample. Return JSON:
{"dominantLanguage": "<ISO 639-1 code, e.g. en, fr, yo, sw>", "allLanguages": ["<code>", ...], "isMixed": <true|false>}

Transcript sample:
${sampleText}`,
    200
  );

  return safeJsonParse(raw, { dominantLanguage: 'en', allLanguages: ['en'], isMixed: false });
}

// ── Transcript Cleaning ───────────────────────────────────────────────────

export async function cleanTranscriptChunk(
  lines: TranscriptLine[],
  dominantLanguage: string
): Promise<TranscriptLine[]> {
  if (lines.length === 0) return [];

  const raw = formatTranscriptToText(lines);
  const cleaned = await callAI(
    `You are a professional transcript editor. Clean the provided transcript segment by:
1. Removing filler words (um, uh, like, you know, basically, literally, right?, so so, etc.)
2. Fixing grammar and run-on sentences
3. Adding proper punctuation
4. Preserving all original timestamps and speaker names exactly
5. Preserving the original language (do NOT translate)
6. Never inventing content — only clean what is there
7. Return ONLY valid JSON, no preamble

Output format: {"lines": [{"speaker": "...", "text": "...", "timestamp": <number>}, ...]}`,
    `Clean this transcript segment (language: ${dominantLanguage}):\n\n${raw}`,
    Math.max(800, lines.length * 40)
  );

  const parsed = safeJsonParse<{ lines: TranscriptLine[] }>(cleaned, { lines });
  return parsed.lines.length > 0 ? parsed.lines : lines;
}

// ── Translation ────────────────────────────────────────────────────────────

export async function translateTranscriptToEnglish(
  lines: TranscriptLine[],
  sourceLanguage: string
): Promise<TranscriptLine[]> {
  if (sourceLanguage === 'en' || lines.length === 0) return [];

  const raw = formatTranscriptToText(lines);
  const result = await callAI(
    `You are a professional translator. Translate the provided transcript to English.
Preserve all timestamps and speaker names exactly.
Return ONLY valid JSON: {"lines": [{"speaker": "...", "text": "...", "timestamp": <number>}, ...]}
Never add information that is not in the original.`,
    `Translate from ${sourceLanguage} to English:\n\n${raw}`,
    Math.max(800, lines.length * 50)
  );

  const parsed = safeJsonParse<{ lines: TranscriptLine[] }>(result, { lines: [] });
  return parsed.lines;
}

// ── Full Clean Pipeline ───────────────────────────────────────────────────

export async function processTranscript(raw: RawTranscript): Promise<CleanedTranscript> {
  const langResult = await detectLanguages(raw.lines);
  const chunks = chunkTranscript(raw.lines);

  // Clean all chunks in parallel (max 3 at a time to avoid rate limits)
  const cleanedChunks: TranscriptLine[][] = [];
  for (let i = 0; i < chunks.length; i += 3) {
    const batch = chunks.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(chunk => cleanTranscriptChunk(chunk, langResult.dominantLanguage))
    );
    cleanedChunks.push(...results);
  }

  // De-duplicate overlapping lines (keep first occurrence by timestamp)
  const seen = new Set<number>();
  const mergedLines: TranscriptLine[] = [];
  for (const chunk of cleanedChunks) {
    for (const line of chunk) {
      if (!seen.has(line.timestamp)) {
        seen.add(line.timestamp);
        mergedLines.push({ ...line, language: langResult.dominantLanguage });
      }
    }
  }

  // Translate to English if non-English
  let translatedLines: TranscriptLine[] | undefined;
  if (langResult.dominantLanguage !== 'en') {
    translatedLines = await translateTranscriptToEnglish(mergedLines, langResult.dominantLanguage);
  }

  return {
    lines: mergedLines,
    dominantLanguage: langResult.dominantLanguage,
    isMixedLanguage: langResult.isMixed,
    translatedLines,
  };
}

// ── Summarization Pipeline ────────────────────────────────────────────────

export async function generateMeetingInsights(
  cleaned: CleanedTranscript,
  meetingTitle: string,
  notesOptions: MeetingNotesOptions = {},
): Promise<MeetingInsights> {
  const start = Date.now();

  // Use translated lines for summarization if available (more consistent results)
  const linesForSummary = cleaned.translatedLines ?? cleaned.lines;
  const transcriptText = formatTranscriptToText(linesForSummary);

  // Only chunk when the transcript is too long for one call (see SINGLE_PASS_MAX_CHARS).
  const chunks = transcriptText.length > SINGLE_PASS_MAX_CHARS ? chunkTranscript(linesForSummary) : [linesForSummary];
  let combinedContext = transcriptText;

  // The detailed report runs alongside the structured insights.
  const notesPromise = generateMeetingNotes(cleaned, meetingTitle, notesOptions).catch(err => {
    console.error('Meeting notes generation failed:', err);
    return null;
  });

  if (chunks.length > 1) {
    // Summarize each chunk first, then summarize summaries
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i += 2) {
      const batch = chunks.slice(i, i + 2);
      const results = await Promise.all(
        batch.map(chunk =>
          callAI(
            'Summarize this meeting segment concisely. Extract only what is explicitly said. Return plain text.',
            formatTranscriptToText(chunk),
            300
          )
        )
      );
      chunkSummaries.push(...results);
    }
    combinedContext = chunkSummaries.join('\n\n---\n\n');
  }

  // Speaker word counts from cleaned lines
  const speakerWordCounts: Record<string, number> = {};
  for (const line of cleaned.lines) {
    const words = line.text.trim().split(/\s+/).length;
    speakerWordCounts[line.speaker] = (speakerWordCounts[line.speaker] ?? 0) + words;
  }
  const totalWords = Object.values(speakerWordCounts).reduce((a, b) => a + b, 0);

  const insightsRaw = await callAI(
    `You are an expert meeting analyst. Analyze the provided meeting transcript and return ONLY valid JSON.
CRITICAL RULES:
- Never hallucinate or invent details not present in the transcript
- If information is missing, use null or empty arrays
- Be specific: prefer concrete details (who, what, when, how many) over generic phrases
- Give 6-12 key points for a typical meeting, fewer only if little was said
- Action items must include owner and deadline ONLY if explicitly mentioned
- Sentiment must be based on the actual tone, not guessed

Output this exact JSON structure:
{
  "summaryEnglish": "<4-6 sentence summary in English: purpose, main discussion, outcomes and next steps>",
  "keyPoints": ["<specific point, with names, numbers, dates and scripture references when stated>", ...],
  "actionItems": [{"text": "<task>", "owner": "<name or null>", "deadline": "<date/time or null>"}, ...],
  "decisions": ["<decision>", ...],
  "openQuestions": ["<question>", ...],
  "sentiment": "<positive|neutral|mixed|negative>",
  "keyThemes": ["<theme>", ...]
}`,
    `Meeting title: "${meetingTitle}"\n\nTranscript:\n${combinedContext}`,
    1500
  );

  const parsed = safeJsonParse<Omit<MeetingInsights, 'summaryOriginal' | 'speakerInsights' | 'dominantLanguage' | 'processingDurationMs'>>(insightsRaw, {
    summaryEnglish: 'Summary could not be generated.',
    keyPoints: [],
    actionItems: [],
    decisions: [],
    openQuestions: [],
    sentiment: 'neutral',
    keyThemes: [],
  });

  // Generate original-language summary if needed
  let summaryOriginal: string | null = null;
  if (cleaned.dominantLanguage !== 'en' && cleaned.lines.length > 0) {
    const origText = formatTranscriptToText(cleaned.lines.slice(0, Math.min(cleaned.lines.length, 50)));
    summaryOriginal = await callAI(
      `Write a 2-4 sentence meeting summary in ${cleaned.dominantLanguage}. Be concise and accurate. Return only the summary text, nothing else.`,
      `Meeting title: "${meetingTitle}"\n\nTranscript excerpt:\n${origText}`,
      300
    );
  }

  // Build speaker insights
  const speakerInsights: SpeakerInsight[] = Object.entries(speakerWordCounts).map(([speaker, wordCount]) => ({
    speaker,
    wordCount,
    contributionPercent: totalWords > 0 ? Math.round((wordCount / totalWords) * 100) : 0,
    keyTopics: [], // Could be enriched with another Claude call but kept lean
  }));

  const meetingNotes = await notesPromise;

  return {
    ...parsed,
    summaryOriginal,
    speakerInsights,
    dominantLanguage: cleaned.dominantLanguage,
    meetingNotes,
    processingDurationMs: Date.now() - start,
  };
}

// ── Detailed meeting notes (report) ───────────────────────────────────────

const MEETING_NOTES_SYSTEM = `You are an experienced minute-taker for church and ministry meetings. From the transcript, write a DETAILED meeting report in Markdown that a leader who missed the meeting could act on.

STRUCTURE (follow this order; skip a section only if the transcript has nothing for it):
# <Meeting title> – Meeting Report
<Meeting date line, exactly as given>

## Overview
One short paragraph: what the meeting set out to do and what it produced (assignments, plans, decisions), plus its approximate length. Then bullets:
- **Convened by:** <who led it, described by role if no name is said>
- **Participants named:** <every person named, with what they did or were mentioned for>
- **Purpose:** <the stated purpose>
If parts of the transcript are garbled, inaudible or missing (e.g. during feedback), say so in one sentence with the rough time range, and say that unclear details are marked.

Then 3-7 topic sections ("## <Topic>"), in the order they were discussed, named for what they cover (e.g. "Opening exhortation", "Vision and context", "Assignments to leaders", "Proposed event", "Feedback"). Each section:
- starts with one lead sentence that states the main point of the section;
- then bullets with concrete detail. Start a bullet with a short **bold label:** when it names a sub-topic (e.g. "**Why now:**", "**Visas:**", "**Date:**");
- uses a numbered list when the meeting gave numbered assignments, steps or requests, with indented sub-bullets (two spaces then "- ") for detail under an item;
- uses a Markdown table (| col | col |, with a |---| separator row) for any schedule, programme, day-by-day plan, budget or comparison;
- includes scripture references and short quotes when the speaker cited them;
- includes names, countries, numbers, dates, prices, features and reasons exactly as stated.
For sermon-like or teaching portions, capture each distinct point as its own bullet.

## Decisions
Bullets of what was agreed or decided (omit the section if nothing was decided).

## Action items
One sentence on the most important next step, then a table:
| Action | Owner | Due |
|---|---|---|
Use the person, role or group responsible ("All leaders", "Coordinator"); write "Not stated" when no owner or due date was given. Drop the Due column if no dates were mentioned at all.
After the table, list anything still to be confirmed as lines starting with "☐ ".

RULES:
- Use ONLY what is in the transcript. Never invent names, dates, numbers or decisions. If something is unclear write "(unclear in the recording)".
- Speaker labels like "Speaker" or "Participant 1" are not names; describe people by role instead.
- Correct obvious speech-to-text errors only when the meaning is certain (e.g. a misheard Bible book).
- Write in English, in clear full sentences and bullets, past tense, neutral tone. No emojis.
- Be thorough: a 45-60 minute meeting should produce roughly 700-1200 words. Shorter meetings proportionally less.
- Output only the Markdown report, with no code fences and no commentary.`;

/**
 * Detailed, sectioned meeting report (Markdown). Uses the whole transcript in one
 * call when it fits; very long meetings are first turned into detailed segment
 * notes, which are then written up as one report.
 */
export async function generateMeetingNotes(
  cleaned: CleanedTranscript,
  meetingTitle: string,
  options: MeetingNotesOptions = {},
): Promise<string | null> {
  const lines = cleaned.translatedLines ?? cleaned.lines;
  if (lines.length === 0) return null;

  const meetingDate = options.meetingDate
    || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const first = lines[0]?.timestamp ?? 0;
  const last = lines[lines.length - 1]?.timestamp ?? 0;
  const minutes = Math.max(1, Math.round((last - first) / 60));

  let transcriptText = formatTranscriptToText(lines);

  if (transcriptText.length > SINGLE_PASS_MAX_CHARS) {
    // Split into large segments and take detailed notes on each, keeping
    // timestamps, names and specifics so the final write-up loses little.
    const segments: TranscriptLine[][] = [];
    let current: TranscriptLine[] = [];
    let size = 0;
    for (const l of lines) {
      const len = l.text.length + l.speaker.length + 12;
      if (size + len > NOTES_SEGMENT_CHARS && current.length) {
        segments.push(current);
        current = [];
        size = 0;
      }
      current.push(l);
      size += len;
    }
    if (current.length) segments.push(current);

    const segmentNotes: string[] = [];
    for (let i = 0; i < segments.length; i += 3) {
      const batch = segments.slice(i, i + 3);
      const results = await Promise.all(
        batch.map((seg, j) =>
          callAI(
            `You are taking detailed notes on part ${i + j + 1} of ${segments.length} of a meeting transcript. Write thorough bullet notes of everything substantive: each point made, names, numbers, dates, scripture references, plans, requests, assignments, decisions and who owns what. Keep the [mm:ss] time of each topic. Note any inaudible or garbled stretches. Use only what is in the transcript. Plain bullets, no preamble.`,
            formatTranscriptToText(seg),
            2500,
          ),
        ),
      );
      segmentNotes.push(...results);
    }
    transcriptText = segmentNotes.map((n, i) => `### Notes on part ${i + 1}\n${n}`).join('\n\n');
  }

  const userContent = `Meeting title: "${meetingTitle}"\nMeeting date line: ${meetingDate}\nApproximate length: ${minutes} minutes\n\nTranscript:\n${transcriptText}`;
  let raw: string;
  try {
    raw = await callAI(MEETING_NOTES_SYSTEM, userContent, 6000, NOTES_MODEL);
  } catch (err) {
    // e.g. the session token expired and the stronger model was refused.
    console.warn('Meeting notes: falling back to the default model', err);
    raw = await callAI(MEETING_NOTES_SYSTEM, userContent, 4000);
  }

  const notes = raw.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return notes || null;
}

// ── Slash Command Parser ───────────────────────────────────────────────────

export function parseSlashCommand(message: string): SlashCommand | null {
  const trimmed = message.trim().toLowerCase();
  if (trimmed.startsWith('/record')) return '/record';
  if (trimmed.startsWith('/transcribe')) return '/transcribe';
  if (trimmed.startsWith('/summarize')) return '/summarize';
  return null;
}

// ── Download helpers ───────────────────────────────────────────────────────

export function downloadTranscriptAsTxt(cleaned: CleanedTranscript, meetingTitle: string): void {
  const lines = [`Meeting: ${meetingTitle}`, `Language: ${cleaned.dominantLanguage}`, '─'.repeat(60), ''];
  for (const line of cleaned.lines) {
    const mm = Math.floor(line.timestamp / 60).toString().padStart(2, '0');
    const ss = Math.floor(line.timestamp % 60).toString().padStart(2, '0');
    lines.push(`[${mm}:${ss}] ${line.speaker}: ${line.text}`);
  }
  if (cleaned.translatedLines && cleaned.translatedLines.length > 0) {
    lines.push('', '─'.repeat(60), 'ENGLISH TRANSLATION', '─'.repeat(60), '');
    for (const line of cleaned.translatedLines) {
      const mm = Math.floor(line.timestamp / 60).toString().padStart(2, '0');
      const ss = Math.floor(line.timestamp % 60).toString().padStart(2, '0');
      lines.push(`[${mm}:${ss}] ${line.speaker}: ${line.text}`);
    }
  }
  triggerDownload(lines.join('\n'), `${sanitizeFilename(meetingTitle)}_transcript.txt`, 'text/plain');
}

export function downloadInsightsAsJson(insights: MeetingInsights, meetingTitle: string): void {
  const json = JSON.stringify({ meetingTitle, generatedAt: new Date().toISOString(), ...insights }, null, 2);
  triggerDownload(json, `${sanitizeFilename(meetingTitle)}_insights.json`, 'application/json');
}

export function downloadInsightsAsTxt(insights: MeetingInsights, meetingTitle: string): void {
  const lines = [
    `MEETING INSIGHTS — ${meetingTitle}`,
    `Generated: ${new Date().toLocaleString()}`,
    '═'.repeat(60),
    '',
    '📋 SUMMARY',
    insights.summaryEnglish,
    '',
  ];

  if (insights.summaryOriginal) {
    lines.push('📋 SUMMARY (ORIGINAL LANGUAGE)', insights.summaryOriginal, '');
  }

  if (insights.meetingNotes) {
    lines.push('📝 MEETING NOTES', '─'.repeat(60), meetingNotesToPlainText(insights.meetingNotes), '', '═'.repeat(60), '');
  }

  if (insights.keyPoints.length > 0) {
    lines.push('🔑 KEY POINTS');
    insights.keyPoints.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
    lines.push('');
  }

  if (insights.actionItems.length > 0) {
    lines.push('✅ ACTION ITEMS');
    insights.actionItems.forEach(a => {
      const owner = a.owner ? ` (${a.owner})` : '';
      const deadline = a.deadline ? ` — Due: ${a.deadline}` : '';
      lines.push(`  • ${a.text}${owner}${deadline}`);
    });
    lines.push('');
  }

  if (insights.decisions.length > 0) {
    lines.push('🏛️ DECISIONS');
    insights.decisions.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
    lines.push('');
  }

  if (insights.openQuestions.length > 0) {
    lines.push('❓ OPEN QUESTIONS');
    insights.openQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    lines.push('');
  }

  if (insights.keyThemes.length > 0) {
    lines.push('🏷️ KEY THEMES');
    lines.push('  ' + insights.keyThemes.join(', '));
    lines.push('');
  }

  if (insights.speakerInsights.length > 0) {
    lines.push('🎤 SPEAKER BREAKDOWN');
    insights.speakerInsights.forEach(s => {
      lines.push(`  ${s.speaker}: ${s.wordCount} words (${s.contributionPercent}%)`);
    });
  }

  triggerDownload(lines.join('\n'), `${sanitizeFilename(meetingTitle)}_insights.txt`, 'text/plain');
}

/**
 * The detailed report as a Word document (.doc holding styled HTML, which Word,
 * Google Docs and LibreOffice all open), ready to print or save as PDF.
 */
export function downloadMeetingNotesAsDoc(notes: string, meetingTitle: string): void {
  triggerDownload(
    meetingNotesToReportDocument(notes, `${meetingTitle} – Meeting Report`),
    `${sanitizeFilename(meetingTitle)}_meeting_report.doc`,
    'application/msword',
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase().slice(0, 60);
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
