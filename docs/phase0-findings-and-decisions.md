# Phase 0 — Ground Truth & De-risk: Findings, Decisions, Handoff

**Status:** COMPLETE. Live schema + deployed edge-function source captured directly
via the Supabase Management API (PAT) on 2026-07-03. Project `vpnpembyqbbaaiynfvli`,
PostgreSQL 17.6.

> How this was captured, for reproducibility: the Supabase CLI v2.109 ships as a Bun
> standalone binary that crashes on this Windows box (stack overflow, baseline build),
> so ground truth was pulled through `POST /v1/projects/{ref}/database/query` and
> `GET /v1/projects/{ref}/functions/{slug}/body` instead. No DB password was needed for
> schema; the PAT sufficed. Extraction SQL: [phase0-ground-truth-extraction.sql](phase0-ground-truth-extraction.sql).

---

## Headline discovery: translation caching is 100% broken in production

The deployed `translate-content` (v60, 2026-01-31) upserts the cache with
`onConflict: 'content_hash,source_language,target_language,content_type'` — **4 columns** —
but the live `translation_cache` table's only unique index is **3 columns**
`(content_hash, source_language, target_language)`. Postgres rejects an `ON CONFLICT`
whose columns have no matching unique index, so **every cache write throws and is
silently swallowed** (`saveToCache` logs and continues). On top of that, the current
function hashes with **SHA-256** while the 276 pre-existing cache rows were written by an
older revision using a short weak hash (observed hash lengths 7–9 chars), so **lookups
never match them either**. Net effect: the UI-string translation path re-calls OpenAI on
every request and caches nothing — ongoing, avoidable spend + latency.

This is the single most important thing to fix, and it's small (one line + a hash
alignment). Scheduled below.

---

## Production reality (from live row counts)

- `translation_queue` and `content_translation_status` are **empty** → **System B (the
  Gemini queue) has never run in production.** The `TranslateNowButton` wired into
  ministry devotionals has effectively never succeeded.
- `tts_audio_cache`: **206 rows, all `language = 'en'`** → **no non-English audio has ever
  been generated.**
- Content `translations` coverage is ~nil: `devotionals` 0/52, `ministry_devotionals`
  0/74, `devotional_series` 0/46, `prayer_points` 0/1. Only `prayer_topics` has any:
  **17/145**.
- `translation_cache`: 276 rows, **content_type `ui` (275)**, target **`vi` (261)**, ko/ja/zh
  trace amounts, all labelled `provider=openai / gpt-4o-mini` (defaults). Legacy, and
  unreachable by the current function's hash.

Bottom line: despite all the infrastructure, **almost no content or audio is actually
translated in prod today**, and the one live UI path that does translate isn't caching.

---

## Live schema (now committed)

Captured into [supabase/migrations/0029_translation_infra_baseline.sql](../supabase/migrations/0029_translation_infra_baseline.sql)
(idempotent baseline). Key facts:

- **`translation_cache`** unique key = `(content_hash, source_language, target_language)`
  (3-col). Has `provider` (default `openai`) + `model` (default `gpt-4o-mini`) columns.
- **`tts_audio_cache`** unique key = `(content_id, content_type, language)`. Only a
  `voice` column (default `alloy`) — **no** `voice_used` / `duration_seconds` /
  `file_size_bytes`.
- **9 content tables already have `translations jsonb`**: `devotionals`,
  `devotional_series`, `devotional_entries`, `devotional_categories`,
  `ministry_devotionals`, `ministry_announcements`, `prayer_points`, `prayer_library`,
  `prayer_topics`.
- **Missing `translations`** (Phase 3 additions): `affirmations`, `declarations`,
  `book_summaries`, `prayer_series`.
- **`book_summaries`** has `summary` + **`key_takeaways`** (NOT `key_points`) → the queue
  field-map (`key_points`) is a confirmed no-op.
- **`user_profiles.preferred_language` EXISTS** (text) → language preference persistence
  works; the defensive Postgres-`42703` handling in `LanguageContext.tsx` is now moot
  (harmless, can be simplified later).

---

## Deployed-vs-repo diff (3 functions)

| Function | Deployed | Repo `.sql` | Verdict |
|---|---|---|---|
| `translate-content` v60 | reads `sourceLang`/`targetLang`/`cacheResult`; returns **both** `translated` + `translatedText`; SHA-256; `onConflict` **4-col**; no `OPENAI_KEY_MISSING` | same param names; same 4-col onConflict; SHA-256 | **Matches repo.** Repo is accurate. The 4-col onConflict bug exists in both. |
| `process-translation-queue` v55 | Gemini `gemini-2.5-flash` via fastrouter; `onConflict` 3-col; status onConflict `(content_type,content_id)` | same | **Matches repo.** |
| `generate-tts-audio` v66 | OpenAI `tts-1`, voice `alloy`, single voice; no `voice_used`/voice-map/`tts-1-hd` | same | **Matches repo.** Frontend `openaiTTSService.ts` (tts-1-hd, per-language voice map, `voice_used`) is aspirational and NOT deployed. |

So the repo `.sql` files are trustworthy for these three. The frontend was the wrong side
of the contract, which is why the fix went there.

---

## What I completed (committed to working tree)

### 1. Fixed the System A contract bug — deploy-independent
[src/lib/i18n.ts](../src/lib/i18n.ts) (`executeTranslation`, `translateBatch`,
`TranslationResult`). The old code sent `sourceLanguage`/`targetLanguage`, but the
deployed function reads `sourceLang`/`targetLang`, so `targetLang` arrived `undefined` →
function threw "Target language is required" → caught → **silent English fallback**. That
is why runtime UI translation never worked. The fix sends **both** conventions and reads
**both** response shapes. Confirmed against the deployed source (reads `sourceLang`,
returns `translatedText`). `npx tsc --noEmit` passes.

### 2. Committed the live schema as a baseline migration
[0029_translation_infra_baseline.sql](../supabase/migrations/0029_translation_infra_baseline.sql) —
the repo finally has DDL for the translation/TTS tables.

---

## Decisions (updated with ground truth)

### D1. Canonical `translate-content` contract
`REQUEST { text|texts[], sourceLang, targetLang, contentType?, cacheResult? }`
(accept `sourceLanguage`/`targetLanguage`/`skipCache` as aliases),
`RESPONSE single { success, translatedText, cached }`, `batch { success, translations[], cached }`.

### D2. One cache-key scheme (CORRECTED to match live)
- **Canonical unique key = 3-column `(content_hash, source_language, target_language)`** —
  matches the only unique index that exists. `content_type` stays as advisory metadata,
  NOT part of the conflict target. (Trade-off: the same source string translated under two
  content types shares one cache row; acceptable for this app.)
- **Canonical hash = SHA-256** of `source_text` (already in `translate-content`).
- **Fix:** change `translate-content`'s `onConflict` from 4-col → 3-col so writes succeed.
  Align `process-translation-queue` to SHA-256 (it already uses the 3-col key).
- **Legacy 276 rows** use a non-SHA-256 short hash → unreachable → **purge** when the fix
  ships (they'd never be hit and just mislead cache stats).

### D3. Provider
OpenAI `gpt-4o-mini` is canonical for stored translation; retire the Gemini path in
Phase 3 (queue orchestration stays). Scripture never machine-translated.

---

## Fixes this uncovered (scheduled, not all done in Phase 0)

| # | Fix | Where | When | Note |
|---|---|---|---|---|
| F1 | `onConflict` 4-col → 3-col (unbreak caching) | `translate-content` edge fn | **Hotfix candidate** | Small; stops re-billing every UI translation. Needs dashboard paste. |
| F2 | Unify hash to SHA-256 + purge legacy rows | `translate-content`, `process-translation-queue` | Phase 3 | Depends on F1. |
| F3 | Frontend writes non-existent `tts_audio_cache` columns (`voice_used`, `duration_seconds`, `file_size_bytes`) | `src/lib/openaiTTSService.ts` | Phase 5 | Client cache-save fails silently; edge fn handles caching correctly so low urgency. |
| F4 | Queue field-map `key_points` vs actual `key_takeaways` | `process-translation-queue`, `translationQueueService.ts` | Phase 3 | Add `translations` to `book_summaries` too. |
| F5 | Dead `OPENAI_KEY_MISSING` check; moot `42703` handling | `i18n.ts`, `LanguageContext.tsx` | Cleanup (any phase) | Harmless. |

---

## Phase 0 exit criteria — DONE

- [x] System A frontend contract fixed (deploy-independent) — `i18n.ts`, tsc clean
- [x] Live schema captured → committed as `0029_translation_infra_baseline.sql`
- [x] Deployed functions captured + diffed vs repo (all 3 match repo)
- [x] Canonical contract (D1), cache key (D2 — corrected to 3-col/SHA-256), provider (D3) recorded
- [x] Uncovered-fixes backlog recorded (F1–F5)
- [ ] Decision for you: ship **F1 as a hotfix now** (unbreak caching immediately) vs bundle into Phase 3?

**Phase 0 is closed.** Recommend deciding F1 (hotfix vs bundle), then starting Phase 1
(DB-backed EN + VI UI dictionary via a new `ui_translations` table).
