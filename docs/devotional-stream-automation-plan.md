# Devotional stream automation — plan

Auto-populate daily-devotional **streams** (migration `0149_devotional_streams.sql`)
with two independent cron jobs:

1. **Scraper** — pulls each day's devotional from a *free-to-publish* website into one stream.
2. **AI generator** — writes a fresh devotional each day (via the existing `meeting-ai`
   OpenAI proxy) into another stream.

Both write rows into `public.devotionals` scoped to a `stream_id`. Everything the app
already renders (home widget, ministry homepages, source picker) then shows them
automatically — **no client changes**, because those surfaces resolve by
`stream_id` + `schedule_date`.

> Status: **BUILT** (2026-07-17). Population mode is now **per-stream** — a stream with
> no `devotional_stream_sources` row stays **manual** (an admin authors each day, exactly
> as before); a stream with an active row is automated. Decisions taken: build **both**
> jobs, insert **drafts for admin approval** (`is_published=false`), AI passage chosen by
> **themed rotation from the prompt**. Scraping is **RSS/Atom only** (`parser_key='rss'`)
> and refuses to run without a recorded `license_basis`.
>
> **Deploy steps remain** — see "Deploying what was built" at the bottom.

---

## Why this drops into existing infrastructure

The repo already runs several daily jobs on one pattern — `pg_cron` fires on a
schedule and `pg_net` POSTs to an edge function:

- `supabase/cron-setup.sql` (process-scheduled-broadcasts, every 2 min)
- `supabase/cron-setup-translation-queue.sql`, `cron-setup-auto-translate.sql`
- `supabase/migrations/0027_schedule_recording_cleanup.sql`
- `supabase/functions/process-daily-reminders`, `process-prayer-reminders`

Both new jobs reuse this exact shape. Nothing new is needed at the platform level
beyond enabling `pg_cron` + `pg_net` (already used).

---

## Shared design

### Target: one row per stream per day
Each job inserts into `public.devotionals`:

| column | value |
|---|---|
| `stream_id` | the target stream (from config) |
| `schedule_date` | today (local), so the widget shows it immediately |
| `is_published` | `true` (or `false` while a stream is in test) |
| `title`, `message`/`content` | the devotional |
| `scripture_reference`, `scripture_text` | the verse + text |
| `prayer`, `reflection_questions` | optional |
| `bible_passage_reference`, `bible_passage_text` | optional long passage |
| `image_url`, `audio_url` | optional |

These are the same columns the admin editor writes (`AdminDashboard.tsx` devotional
form), so anything a human could author, the cron can.

### Idempotency (critical)
A cron can fire twice (retries, overlap). **Before inserting, check for an existing
row** for `(stream_id, schedule_date::date)` and skip if present. Enforce it in the DB
too, so a double-fire can never create duplicates:

```sql
-- add in the build migration:
create unique index if not exists uq_devotionals_stream_day
  on public.devotionals (stream_id, (schedule_date::date))
  where stream_id is not null;
```

### Config: a small source registry
Rather than hard-coding stream ids / URLs in the function, add a config table so
streams can be pointed at sources without redeploying:

```sql
create table if not exists public.devotional_stream_sources (
  stream_id    uuid primary key references public.devotional_streams (id) on delete cascade,
  kind         text not null check (kind in ('scrape','ai')),
  source_url   text,          -- scrape: the page/RSS URL
  parser_key   text,          -- scrape: which parser profile to use
  prompt       text,          -- ai: the generation prompt/template
  is_active    boolean not null default true,
  last_run_at  timestamptz,
  last_status  text,          -- 'ok' | 'skipped' | 'error: …'
  updated_at   timestamptz not null default now()
);
```

Each cron reads the active rows for its `kind` and processes them. Adding a new
scraped or AI stream becomes a row insert, not a code change.

### Observability
Write `last_run_at` / `last_status` back to `devotional_stream_sources` on every run.
An admin panel (later) can show "last populated 6h ago / error" per stream. On error,
**do not publish a broken row** — record the error and leave yesterday's devotional
standing.

---

## Job 1 — Scraper (`ingest-devotional-scrape`)

Edge function. For each active `kind='scrape'` source:

1. Skip if a row already exists for `(stream_id, today)`.
2. `fetch(source_url)`.
3. Parse to `{ title, scripture_reference, scripture_text, body, prayer }` using the
   profile named by `parser_key`. **Prefer RSS/JSON** if the site offers it — HTML
   scraping is the fragile path.
4. Sanitize (strip site chrome, ads, tracking).
5. Insert the devotional row; update `last_run_at`/`last_status`.

**Cron:** daily, early (source must have published for the day). Stagger from the AI
job so they don't contend:

```sql
select cron.schedule('ingest-devotional-scrape', '15 5 * * *',  -- 05:15 daily
  $$ select net.http_post(
       url := 'https://<proj>.supabase.co/functions/v1/ingest-devotional-scrape',
       headers := jsonb_build_object('Authorization','Bearer <service_role>',
                                     'Content-Type','application/json'),
       body := '{}'::jsonb) $$);
```

### Scraper risks — decide per source before building
- **Licensing:** only point this at a source that is genuinely *free to publish*
  (public domain, or an explicit "reproduce freely" license / permitted RSS). Scraping
  copyrighted devotionals and republishing to users is infringement regardless of
  attribution. **This is a per-source decision, recorded alongside the source.**
- **Fragility:** HTML layout changes silently break the parser. Mitigations: prefer
  RSS/JSON; validate the parsed result (non-empty title + body + a scripture ref)
  before publishing; alert on `last_status = error`.
- **One parser per site.** `parser_key` selects it. Don't build a generic scraper.

---

## Job 2 — AI generator (`ingest-devotional-ai`)

Edge function. For each active `kind='ai'` source:

1. Skip if a row already exists for `(stream_id, today)`.
2. Choose the day's scripture (a lectionary/plan table, or a themed rotation from
   `prompt`). Pull the verse text from the existing Bible API the admin form uses.
3. Call the existing `meeting-ai` proxy (holds `OPENAI_API_KEY`, already deployed) to
   generate `{ title, body (~400 words), prayer, 2 reflection_questions }` grounded in
   that passage. Enforce JSON output.
4. Basic quality gate (length, on-topic, no empty fields).
5. Insert the devotional row; update `last_run_at`/`last_status`.

**Cron:** daily; offset from the scraper:

```sql
select cron.schedule('ingest-devotional-ai', '45 5 * * *',  -- 05:45 daily
  $$ select net.http_post(
       url := 'https://<proj>.supabase.co/functions/v1/ingest-devotional-ai',
       headers := jsonb_build_object('Authorization','Bearer <service_role>',
                                     'Content-Type','application/json'),
       body := '{}'::jsonb) $$);
```

### AI notes
- **Legally clean** — it's original content, no external site to break.
- Scripture *text* comes from the Bible API, not the model (models misquote verses).
- Keep the prompt in `devotional_stream_sources.prompt` so tone/theme is editable
  without redeploying.

---

## Build checklist

- [x] Migration `0161_devotional_stream_sources.sql`: `uq_devotionals_stream_day` unique index + `devotional_stream_sources` table + RLS (admin-only writes; the functions use the service role and bypass RLS). **Applied.**
- [x] Edge fn `supabase/ingest-devotional-scrape/index.ts` (parser profile: `rss` — RSS 2.0 + Atom).
- [x] Edge fn `supabase/ingest-devotional-ai/index.ts` (reuses `meeting-ai` + Bible API).
- [x] `supabase/cron-setup-devotional-streams.sql` — schedules both jobs (05:15 / 05:45 UTC).
- [x] Admin: population mode (Manual / AI / Feed) + config, `last_run_at`/`last_status` per stream, and a **Run now** button in `AdminDevotionalStreamsManager`.
- [x] Licence basis captured per scraped source and **enforced** — the scrape job errors out if `license_basis` is blank.

## Resolved decisions
1. **Which website** for the scraper — deferred *by design*. The job is feed-driven: an
   admin supplies the RSS/Atom URL **and** its licence basis in the admin UI. No source is
   hard-coded, and no scraped stream can produce anything until a basis is recorded.
2. **AI scripture selection** — **themed rotation from the prompt**. The editable prompt
   drives theme/tone; the model picks a passage within it, avoiding the stream's last 30
   references. Verse **text** always comes from the Bible API, never the model.
3. **Run time / timezone** — one early-UTC fire (05:15 scrape / 05:45 AI). `schedule_date`
   is a DATE and the client resolves "today" locally against it, so a single run is correct
   for a global audience.
4. **Publish immediately vs stage** — **drafts** (`is_published=false`) for an admin to
   approve. A bad generation or broken parse never reaches users.

---

## Deploying what was built

1. **Migration** — `0161_devotional_stream_sources.sql` is already applied to production.
2. **Edge functions** (Dashboard → Edge Functions → deploy, paste each file):
   - `ingest-devotional-ai` — needs the existing `meeting-ai` fn + `OPENAI_API_KEY`.
   - `ingest-devotional-scrape`
3. **Cron** — run `supabase/cron-setup-devotional-streams.sql` in the SQL Editor after
   replacing `<YOUR_SERVICE_ROLE_KEY>`.
4. **Try it** — Admin → Devotional Streams → edit a stream → *How is this stream filled?*
   → AI or Feed → **Run now** (the Play button) to fire it once without waiting for cron.
   Then approve the resulting draft in the Devotionals tab.

Until step 2+3 are done, the admin UI saves configuration fine but nothing runs (and
**Run now** will fail because the function isn't deployed yet).
