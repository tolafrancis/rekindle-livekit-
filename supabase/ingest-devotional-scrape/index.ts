// supabase/ingest-devotional-scrape/index.ts
//
// Daily ingester for devotional STREAMS fed by an external source
// (see docs/devotional-stream-automation-plan.md). For every ACTIVE `kind='scrape'`
// row in devotional_stream_sources it pulls today's devotional into that stream.
//
// Design notes that matter:
//   • RSS/Atom ONLY (parser_key='rss'). The plan is explicit: prefer feeds — HTML
//     scraping is the fragile path that silently breaks on layout changes.
//   • LICENCE GATE: a source with no `license_basis` recorded is REFUSED. Republishing
//     copyrighted devotionals is infringement even with attribution, so the basis
//     (public domain / explicit "reproduce freely" / permitted RSS) must be recorded
//     before a scraped stream can produce anything.
//   • Inserts are DRAFTS (is_published = false) for an admin to approve — doubly
//     important here while a parser is unproven.
//   • Idempotent: skips when a row exists for (stream_id, today); the DB also enforces
//     uq_devotionals_stream_day.
//   • Never publishes a broken row — on error it records the status and leaves
//     yesterday's devotional standing.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → new function named exactly: ingest-devotional-scrape
//   2. Paste this whole file as its index.ts and deploy.
//   3. Requires migration 0161.
//   4. Schedule it with supabase/cron-setup-devotional-streams.sql
//
// Manual run:  POST /functions/v1/ingest-devotional-scrape  { }          → all active
//              POST /functions/v1/ingest-devotional-scrape  { streamId } → one (Run now)
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** Strip site chrome/markup → plain text (ads, tracking pixels, nav all go). */
function htmlToText(html: string): string {
  return (html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|br|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Best-effort scripture reference sniff, e.g. "John 3:16", "1 Cor 13:4-7".
const BOOKS =
  '(?:1|2|3|I|II|III)?\\s?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)';
const REF_RE = new RegExp(`${BOOKS}\\.?\\s+\\d{1,3}:\\d{1,3}(?:\\s?[-–]\\s?\\d{1,3})?`, 'i');

function sniffReference(text: string): string | null {
  const m = (text ?? '').match(REF_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

async function fetchScripture(reference: string, version = 'kjv'): Promise<string | null> {
  try {
    const url = version && version !== 'web'
      ? `https://bible-api.com/${encodeURIComponent(reference)}?translation=${version}`
      : `https://bible-api.com/${encodeURIComponent(reference)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.text
      || (Array.isArray(data?.verses) ? data.verses.map((v: any) => v.text).join(' ') : '');
    return (text || '').trim() || null;
  } catch {
    return null; // scripture text is a bonus here, not a blocker — admin can fill it
  }
}

interface FeedItem { title: string; body: string; published?: string }

/** parser_key='rss' — RSS 2.0 and Atom. Returns items newest-first. */
function parseRss(xml: string): FeedItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);

  // RSS 2.0
  const rssItems = doc?.rss?.channel?.item;
  if (rssItems) {
    const arr = Array.isArray(rssItems) ? rssItems : [rssItems];
    return arr.map((it: any) => ({
      title: String(it?.title ?? '').trim(),
      body: htmlToText(String(it?.['content:encoded'] ?? it?.description ?? '')),
      published: it?.pubDate ? String(it.pubDate) : undefined,
    }));
  }

  // Atom
  const atomEntries = doc?.feed?.entry;
  if (atomEntries) {
    const arr = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    return arr.map((e: any) => {
      const content = e?.content?.['#text'] ?? e?.content ?? e?.summary?.['#text'] ?? e?.summary ?? '';
      return {
        title: String(e?.title?.['#text'] ?? e?.title ?? '').trim(),
        body: htmlToText(typeof content === 'string' ? content : ''),
        published: e?.updated ? String(e.updated) : (e?.published ? String(e.published) : undefined),
      };
    });
  }

  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const onlyStreamId: string | undefined = body?.streamId;
    const day = todayUtc();

    let q = admin.from('devotional_stream_sources').select('*').eq('kind', 'scrape').eq('is_active', true);
    if (onlyStreamId) q = q.eq('stream_id', onlyStreamId);
    const { data: sources, error: srcErr } = await q;
    if (srcErr) throw srcErr;

    const results: any[] = [];

    for (const src of sources ?? []) {
      const s = src as any;
      const streamId = s.stream_id as string;
      let status = 'ok';
      try {
        // 0. LICENCE GATE — refuse to republish without a recorded basis.
        if (!s.license_basis || !String(s.license_basis).trim()) {
          throw new Error('license_basis is required before a scraped stream can publish');
        }
        if (s.parser_key !== 'rss') {
          throw new Error(`unknown parser_key "${s.parser_key}" (only 'rss' is supported)`);
        }

        // 1. Idempotency.
        const { data: existing } = await admin
          .from('devotionals')
          .select('id')
          .eq('stream_id', streamId)
          .eq('schedule_date', day)
          .maybeSingle();
        if (existing) {
          status = 'skipped';
          results.push({ streamId, status });
          await admin.from('devotional_stream_sources')
            .update({ last_run_at: new Date().toISOString(), last_status: status, updated_at: new Date().toISOString() })
            .eq('stream_id', streamId);
          continue;
        }

        // 2. Fetch + parse the feed.
        const res = await fetch(s.source_url, { headers: { 'User-Agent': 'ReKindle-DevotionalIngest/1.0' } });
        if (!res.ok) throw new Error(`feed fetch failed (${res.status})`);
        const items = parseRss(await res.text());
        if (!items.length) throw new Error('no items found in feed');

        // 3. Prefer an item actually published today; else the newest.
        const item = items.find((i) => {
          if (!i.published) return false;
          const d = new Date(i.published);
          return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
        }) ?? items[0];

        // 4. Validate — never publish an empty/broken parse.
        const title = (item.title || '').trim();
        const message = (item.body || '').trim();
        if (!title) throw new Error('parsed item has no title');
        if (message.length < 200) throw new Error(`parsed body too short (${message.length} chars) — parser may be broken`);

        // 5. Scripture is a bonus: sniff a reference and resolve its text.
        const reference = sniffReference(`${title}\n${message}`);
        const version = s.scripture_version || 'kjv';
        const scriptureText = reference ? await fetchScripture(reference, version) : null;

        // 6. Insert as a DRAFT for admin approval.
        const { error: insErr } = await admin.from('devotionals').insert({
          stream_id: streamId,
          schedule_date: day,
          is_published: false, // draft — an admin approves it
          title,
          message,
          scripture: reference,
          scripture_reference: reference,
          scripture_text: scriptureText,
          scripture_version: reference ? version : null,
        });
        if (insErr) throw insErr;

        results.push({ streamId, status, title, reference });
      } catch (e) {
        status = `error: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[ingest-devotional-scrape] stream ${streamId}:`, status);
        results.push({ streamId, status });
      }

      await admin.from('devotional_stream_sources')
        .update({ last_run_at: new Date().toISOString(), last_status: status, updated_at: new Date().toISOString() })
        .eq('stream_id', streamId);
    }

    return json({ success: true, day, processed: results.length, results });
  } catch (error) {
    console.error('[ingest-devotional-scrape] critical:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
