# ReKindle BC — Multilingual Architecture & Build Plan

**Status:** Approved for build (diagnosis complete)
**Launch languages:** English + Vietnamese
**Ceiling:** Unlimited — new languages added by an admin, no developer, no deploy
**Date:** 2026-07-03

---

## 1. Goal

Make the entire product fully multilingual — **both** the app UI (chrome: labels,
buttons, toasts, system messages) **and** all user-facing content (devotionals,
prayers, declarations, affirmations, book summaries, ministry content) — driven by
a **single language selection**.

Launch with English + Vietnamese. Architect so that adding a 3rd+ language is a
**self-service admin action** (add → auto-draft → review → publish → bulk-translate
content), not an engineering project.

## 2. Decisions locked in

| Decision | Choice | Why |
|---|---|---|
| UI translation approach | Keep the custom `t()` API; back it with **stored, editable** dictionaries (DB), not runtime machine translation | Small corpus, pastoral tone matters, must be instant + offline; runtime-translating our own buttons is pure cost/latency/failure risk |
| Content translation approach | **Hybrid** — translate-once-and-store for durable content; on-the-fly + cache only for ephemeral/AI/user-generated | Repeated reads make stored cheaper & higher quality; enables human review & offline |
| Provider consolidation | **One** provider+model for stored translation (retire the dual OpenAI/Gemini split) | Two providers = inconsistent tone, duplicate spend, incompatible caches today |
| Language registry | **Moves from code into the database** (`app_languages` table) | Enables no-developer "add a language" |
| Add-a-language UX | **Full admin, no developer** — a "Language Manager" screen | Explicit product requirement |
| Scripture | **Never machine-translated** — link an existing per-language Bible version | Theological accuracy; MT of scripture is unacceptable |

## 3. Current state (why this work is needed)

The infrastructure is heavily built but barely adopted. Full findings in the audit;
the load-bearing facts:

- **UI:** elaborate engine (33 language codes, RTL, fonts, formatting) but only **4
  files call `t()`** ([DevotionalSeriesViewer](../src/components/DevotionalSeriesViewer.tsx),
  [DevotionalReader](../src/components/DevotionalReader.tsx),
  [AppLayout](../src/components/AppLayout.tsx),
  [LanguageSettings](../src/components/LanguageSettings.tsx)). ~**1,283 hardcoded
  toasts across 148 files** bypass i18n. **No curated Vietnamese exists** — all
  non-English is live machine translation with silent fallback to English on failure.
- **Content:** **two uncoordinated systems** write the same `translation_cache` table
  with incompatible keys — System A on-the-fly OpenAI `gpt-4o-mini`
  ([translate-content](../supabase/translate-content/index.sql)) and System B queue
  Gemini `2.5-flash` ([process-translation-queue](../supabase/process-translation-queue/index.sql))
  writing a `translations` JSONB per row. Only **ministry devotionals** actually
  trigger translation. Affirmations, declarations, prayers, book summaries are
  **English-only**.
- **AI is language-blind:** GraceCounsel chat, prayer generator, and meeting AI never
  receive the selected language ([AiSpiritualCompanion.ts](../src/lib/AiSpiritualCompanion.ts),
  [spiritual-companion](../supabase/functions/spiritual-companion)).
- **Same content, two languages in two views:** the devotional *reader* localizes;
  the *library/module/widget* render English.
- **TTS is the one well-built layer:** OpenAI `tts-1`, cached per-language in
  `tts_audio_cache` keyed `(content_id, content_type, language)`.

### Known bugs to fix along the way

1. **System A contract mismatch** — [i18n.ts](../src/lib/i18n.ts) and
   [AdminTranslationDashboard.tsx](../src/components/AdminTranslationDashboard.tsx)
   send `sourceLanguage`/`targetLanguage`/`skipCache` and read `data.translated`,
   but the function reads `sourceLang`/`targetLang`/`cacheResult` and returns
   `translatedText`. (Likely the deployed function differs from the repo — verify.)
2. **Cache incompatibility** — System A keys `(hash[SHA-256], src, tgt, content_type)`;
   System B keys `(hash[weak 32-bit], src, tgt)`. Same table, no shared hits.
3. **`book_summaries` field drift** — seed uses `key_takeaways`
   ([0020_seed_book_summaries.sql](../supabase/migrations/0020_seed_book_summaries.sql)),
   queue expects `key_points` — silent no-op.
4. **`tts_audio_cache` column drift** — function writes `voice`; frontend writes `voice_used`.
5. **`user_profiles.preferred_language` may not exist** — code swallows Postgres `42703`.
6. **Orphaned code** — [src/hooks/useTranslation.ts](../src/hooks/useTranslation.ts)
   has zero importers.
7. **No DDL in repo** — content tables + cache tables are dashboard-created; migrations missing.

## 4. Target architecture

Principle: **static UI = curated & stored · durable content = translate-once & store ·
ephemeral/AI = translate-on-the-fly + cache.** One language selection drives all three,
and every surface reads translations **uniformly**.

### 4.1 Data model (new / changed tables)

```
app_languages                     -- the registry (replaces hardcoded SUPPORTED_LANGUAGES)
  code            text pk         -- 'en', 'vi', ...
  name            text            -- 'Vietnamese'
  native_name     text            -- 'Tiếng Việt'
  flag            text
  rtl             boolean
  region          text
  font_family     text null
  ui_status       text            -- 'draft' | 'published'
  enabled         boolean         -- shows in the switcher when true
  bible_version   text null       -- linked scripture version id/key for this language
  sort_order      int

ui_translations                   -- editable UI chrome (replaces runtime MT of the dictionary)
  language_code   text
  namespace       text            -- 'common','navigation','devotionals',...
  key             text
  value           text
  reviewed        boolean
  pk (language_code, namespace, key)

-- Content: keep the per-row translations JSONB, standardized on EVERY durable table
--   translations JSONB  -- { [langCode]: { field: translatedValue } }
--   language     text   -- source language of the row (for the fallback banner)

-- Existing translation infra (keep, consolidate):
translation_cache, translation_queue, content_translation_status, content_popularity, tts_audio_cache
```

### 4.2 UI (chrome)

- Keep the `t(namespace, key, fallback)` API and `LanguageContext`.
- Load strings from `ui_translations` (DB) instead of runtime machine translation.
- Add lightweight `{var}` interpolation (the current `t()` has none — today values are
  string-concatenated in JSX). Adopt `react-i18next` **only** if ICU pluralization
  becomes a real need; default is to extend the custom system.
- English is seeded from `DEFAULT_TRANSLATIONS`. Other languages are drafted by MT then
  human-reviewed in the Language Manager before publish.

### 4.3 Content (data)

- **Durable content** (devotionals, ministry devotionals, prayers/topics/series,
  affirmations, declarations, book summaries, announcements): translate-once via the
  queue → store in `translations[lang]` → serve instantly. One shared read helper
  `getLocalizedContent(row, language)` used by **every** view so library and reader agree.
- **Ephemeral / AI / user-generated** (GraceCounsel replies, AI prayers, meeting
  captions, community posts): translate-on-the-fly + cache, **or** generate natively in
  the target language by passing `language` into the prompt (preferred for AI).
- **Scripture:** never MT — resolve by reference against `app_languages.bible_version`.

### 4.4 AI & TTS

- Pass the selected `language` into `spiritual-companion` / prayer generator / meeting AI
  so they respond natively in the chosen language.
- Confirm the per-language TTS voice map is actually deployed (frontend declares one the
  edge function ignores); keep the per-language cache key.

### 4.5 The "Language Manager" admin screen

One admin surface, full lifecycle, zero deploy:

1. **Add language** — pick a code → row in `app_languages` as `draft`, `enabled=false`.
2. **Auto-draft UI** — one click machine-translates all UI keys into `ui_translations` (draft).
3. **Review/edit** — side-by-side EN → target editor; mark strings `reviewed`.
4. **Link scripture** — set `bible_version` for the language.
5. **Publish** — `ui_status='published'`, `enabled=true`; language appears in the
   switcher app-wide, instantly.
6. **Bulk-translate content** — "Translate all content to X" fans the existing queue
   across every content type, surfaced via `TranslationProgressIndicator`.

Reuses existing plumbing: `process-translation-queue`, `translation_queue`,
`content_translation_status`, `TranslateNowButton`, `TranslationProgressIndicator`.

## 5. Phased plan

Effort in dev-days (rough). Each phase ships independently.

| Phase | Scope | Effort | Risk | Ships |
|---|---|---|---|---|
| **0 — Ground truth & de-risk** | Export live schemas into committed migrations (content tables, `translation_cache`, `tts_audio_cache`). Diff deployed edge functions vs repo. Fix System A contract (§3 bug 1). Pick one provider + one cache hash/key. | ~2–3 | Low | Nothing user-facing; unblocks everything |
| **1 — DB-backed EN + VI UI** | Create `ui_translations`; seed EN from `DEFAULT_TRANSLATIONS`; machine-draft + human-review VI; switch loader to read DB; add `{var}` interpolation. | ~5–8 | Low | Instant, reliable, offline VI for surfaces already using `t()`; removes silent-fallback |
| **2 — UI adoption sweep** | Extract hardcoded strings into keys, screen by screen: AppLayout → home (Index/LandingPage) → Prayer surfaces → Devotional library/module/widget → Admin last. Codemod for the ~1,283 toasts. | ~10–15 | Medium | Per-screen; each PR makes one more screen fully bilingual |
| **3 — Consolidate content translation** | Retire one provider; unify cache. Add `translations` JSONB + `language` to all durable tables. Wire translate trigger + auto-queue into platform devotionals, prayers, affirmations, declarations, books. Fix `key_points`. Route all reads through `getLocalizedContent`. | ~6–10 | Medium | Content that switches everywhere it's shown |
| **3.5 — Language Manager admin** | `app_languages` + `ui_translations` tables; admin CRUD/review/publish UI; auto-draft + bulk-translate actions; rewire switcher + loader to read the DB registry. | ~6–9 | Medium | Self-service add-a-language (no developer) |
| **4 — VI content backfill + review** | Run the queue to populate `translations[vi]`; link a Vietnamese Bible version; human review of pastoral text. | Ongoing | Low | Trustworthy VI content, not raw MT |
| **5 — AI & TTS language-awareness** | Pass `language` into AI prompts (native generation); confirm per-language TTS voice map deployed; consider `tts-1-hd`. | ~4–6 | Low | Assistant + audio respond to the toggle |
| **6 — Extensibility hardening** | CI check: every enabled language has UI coverage; lint flags literal JSX strings; document the admin add-a-language flow. | ~2 | Low | 3rd language = config + content, not engineering |

**Recommended first cut for build:** Phase 0 → Phase 1. Converts the fragile
runtime-translated UI into a solid bilingual base and exposes the real schema, without
touching content flows yet.

## 6. Adding a language later (post-launch, admin only)

1. Language Manager → **Add language** (pick code).
2. **Auto-draft UI** → review/edit strings → mark reviewed.
3. **Link** the Bible version.
4. **Publish** → appears in switcher.
5. **Bulk-translate content** → queue fans across all content types.

No code change, no deploy.

## 7. Caveats

- Machine-drafted strings still need **human review** before publish — the screen
  supports it; quality is on the reviewer.
- Scripture must be **linked**, never machine-translated.
- Edge functions are deployed by **pasting into the Supabase dashboard**; local `.sql`
  files may be stale. Phase 0 must reconcile deployed vs repo before relying on them.
