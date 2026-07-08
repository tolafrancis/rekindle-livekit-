# Multilingual — consolidated deploy runbook

Everything the multilingual initiative (Phases 0–6) needs, in order. All DB
changes are pasted into the **Supabase SQL Editor**; all edge functions are
pasted into their **Supabase Edge Function** (this project's deploy method — the
local `.sql`/`.ts` files are the source you paste). App code deploys as usual.

Branch: `feat/multilingual` (~30 commits, `4992117`…). Nothing pushed yet.

## 1. Run migrations (SQL Editor), in order
All are idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`) — safe to re-run.

| # | File | What it does |
|---|---|---|
| 0030 | `ui_translations.sql` | UI dictionary table (translated strings per language) + RLS |
| 0031 | `seed_..._vi.sql` | Vietnamese for the base dictionary (285) |
| 0032–0042 | `seed_..._vi_*.sql` | VI for nav/hero/prayers/cards/devotionals/reader/devlibrary/prayerlib/landing/grace/live |
| 0043–0050 | `seed_..._vi_sweep1.sql` | VI for the 8 workflow batches (~145 components) |
| 0051 | `content_translations_columns.sql` | `translations` JSONB on affirmations/declarations/book_summaries/prayer_series |
| 0052 | `language_registry.sql` | `app_languages` registry (+ seeds en, vi enabled/published) |

Total Vietnamese UI strings seeded: **~7,539** (all `reviewed=false` — drafts for human review).

## 2. Paste edge functions (Edge Functions)
| Function | Why it changed |
|---|---|
| `translate-content` | **F1 fix** — `onConflict` was 4-col vs a 3-col unique index, so every cache write failed silently. Now 3-col; caching finally works. |
| `process-translation-queue` | Retired the divergent Gemini path + 32-bit hash; now delegates to `translate-content` (one provider, one SHA-256 cache). Field maps fixed (`key_takeaways`) + affirmation/declaration added. |
| `spiritual-companion` | Reads `language` and responds in it (Phase 5). |

## 3. Deploy the app
The `src/` changes (Phases 1–5) — UI wired to `t()`, content read via
`getLocalizedContent`, registry-driven switcher, Language Manager, AI language.

## 4. Smoke test
- Switch language (footer/profile) to **Tiếng Việt** → UI is Vietnamese; the AI
  chat welcome + replies are Vietnamese.
- Admin → an affirmation/declaration/book manager → **Translate** a row → after
  the queue runs, switch to VI → that item's content is Vietnamese.
- Platform Admin → **Languages** tab → the Language Manager lists en + vi.
- Confirm `translation_cache` GROWS (F1 fixed) rather than re-billing every call.

## Adding a language later (admin, no developer)
Platform Admin → **Languages** → **Add language** → **Auto-draft** (machine-
translates the whole UI dictionary into `ui_translations`) → **Review** (edit +
mark reviewed) → **Publish** (appears in the switcher instantly) → optionally
**Translate** content per item in the content managers. Link a real Bible
version for scripture; never machine-translate verses.

## Known follow-ups (not blocking)
- **Phase 4** — human review of the ~7.5k VI drafts (flip `reviewed=true`);
  backfill content translations; link a Vietnamese Bible for scripture.
- Platform **devotional / prayer-series** admin Translate buttons (those managers
  juggle series/entries/days — wire carefully).
- Per-language **TTS voice** map (currently one voice; fine for VI).
- Thread `language` through the remaining AI helper methods (scripture guidance,
  meditate-on-verse) — chat + prayer already done.
- **CI**: lint for literal JSX strings; check every enabled language has UI
  coverage.

## Phase status
0 diagnosis · 1 UI dictionary · 2 UI sweep (~145 components) · 3 content pipeline ·
3.5 Language Manager · 5 AI language — **DONE**. 4 (human review/backfill) and 6
(CI) are ongoing/optional.
