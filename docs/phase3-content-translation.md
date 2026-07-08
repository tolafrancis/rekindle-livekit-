# Phase 3 — Content Translation: what changed + deploy checklist

Phase 3 makes the **DB content itself** translatable (devotionals, prayers,
affirmations, declarations, books), not just the UI chrome (Phase 2). It has
three parts, all committed on `feat/multilingual`.

## What was done (code + migrations, committed)

### Part 1 — fix & consolidate the translation engine
- **`0051_content_translations_columns.sql`** — adds the `translations` JSONB
  column (+ GIN index) to `affirmations`, `declarations`, `book_summaries`,
  `prayer_series` (the durable content tables the Phase 0 audit found lacking it).
  Shape matches the rest: `{ "<lang>": { "<field>": "<translated>" } }`.
- **`translate-content` edge fn** — fixed the cache write (F1): `onConflict` was
  4-column (`…,content_type`) but the only unique index is 3-column, so every
  upsert failed silently and the cache never populated. Now 3-column; `checkCache`
  relaxed to the 3-column key + `maybeSingle()`.
- **`process-translation-queue` edge fn** — retired the divergent Gemini/FastRouter
  path and its incompatible 32-bit hash; `translateText` now delegates to
  `translate-content` (OpenAI gpt-4o-mini + SHA-256 3-col cache). One provider,
  one cache. Fixed the field map (`book_summary`/`teaching` → `key_takeaways`,
  not `key_points`), and added `affirmation`/`declaration`/`ministry_devotional`/
  `prayer_library`/`prayer_series`/`devotional_series` field lists.
- **`translationQueueService.ts`** — `CONTENT_TABLE_MAP` + `CONTENT_FIELDS_MAP`
  now include `affirmation`→`affirmations` and `declaration`→`declarations`
  (they were unmapped, so those types couldn't be queued); `key_points`→
  `key_takeaways`.

### Part 2 — content read paths display translations
Content components now render per-language content from each row's `translations`
via `LanguageContext.getLocalizedContent(row, fields)` (safe helper: overlays
translated fields when present, returns the original row otherwise — so English
is preserved until content is translated): AffirmationCard, DeclarationCard,
BookSummaries, DailyDevotionalWidget, DevotionalLibrary, PrayerLibrary.
(DevotionalReader / DevotionalSeriesViewer already did this.)

### Part 3 — admin can trigger translation
`TranslateNowButton` added to the content admin managers for the content types
that had no translation trigger: **AdminAffirmationManager**,
**AdminDeclarationManager**, **AdminBookManager**. (Ministry devotionals already
had it.) Clicking queues the row for translation into the platform languages.

## Deploy checklist (dashboard — pasted, per this project's workflow)

1. **SQL Editor:** run `supabase/migrations/0051_content_translations_columns.sql`.
2. **Edge Functions:** paste the updated source of
   - `translate-content` (`supabase/translate-content/index.sql`)
   - `process-translation-queue` (`supabase/process-translation-queue/index.sql`)
3. **Deploy the app** (the src/ changes) as usual.
4. Also ensure the earlier UI seed migrations `0030`–`0050` are run if not already.

## Verify (after deploy)
- In an admin content manager (e.g. Affirmations), click **Translate** on a row →
  a `translation_queue` row appears; the queue processor writes
  `affirmations.translations.vi = { text, title, scripture_reference }`.
- Switch the app language to Vietnamese → that affirmation now renders in
  Vietnamese; untranslated ones stay English.
- Confirm `translation_cache` now GROWS (F1 fix) instead of re-billing every call.

## Not in Phase 3 (tracked for later)
- Platform **devotional / prayer-series** admin translate buttons (those managers
  juggle multiple entities — series vs entries vs days — so wiring the trigger
  correctly is a careful follow-up).
- **Scripture** should be linked to a real Vietnamese Bible version, never MT
  (Phase 4).
- Human review of machine translations (Phase 4); Language Manager admin
  (Phase 3.5); AI/TTS language (Phase 5).
