-- supabase/migrations/0330_register_language_si.sql
-- Registers Sinhala (si) in the language registry so it appears in the
-- Language Manager. Pairs with the si UI dictionary seeded in 0323-0329.
--
-- Deliberately DRAFT + NOT enabled. All ~6,036 rows in ui_translations are
-- reviewed=false (assistant-drafted), so Sinhala must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'si';
--
-- ── Address form: respectful throughout ─────────────────────────────────
-- This seed uses "ඔබ" (respectful "you") consistently for direct address —
-- the conventional choice for apps, official notices, and a mixed-age
-- congregation. Commands (buttons, labels) read as neutral, professional
-- app copy without an explicit pronoun.
--
-- ── Terminology worth a reviewer's eye ─────────────────────────────────────
--   devotional -> භක්ති වර්ධනය (lit. "growth in devotion")
--   ministry   -> සේවාව (also used for "service" generally —
--                                   context should disambiguate, but a reviewer
--                                   may want a more specific coinage)
--   revelation -> එළිදරව්ව, testimony -> සාක්ෂිය
--   streak     -> අඛණ්ඩ දින (a run of consecutive days)
--   declaration -> ප්‍රකාශය, affirmation -> ස්ථිර කිරීම
-- These were chosen for consistency across all 7 chunk files; a native
-- reviewer should confirm they read naturally before publishing.
--
-- ── "God"/"LORD" rendered per Sinhala Christian convention ──────────────
-- Devotional-style prose uses "දෙවියන් වහන්සේ" for God generally and
-- "ස්වාමීන් වහන්සේ" for LORD, following common Sinhala Christian usage
-- (the "වහන්සේ" honorific, familiar from Buddhist monastic address, is also
-- the standard respectful form for God/Christ in Sinhala Christian idiom).
-- Scripture citations are translated by hand for readability inside the
-- seed, not pulled from a published Sinhala Bible.
--
-- ── No scripture localization for Sinhala ────────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'si', so verses fall back to
-- stored English (or machine-translated text) rather than a published
-- Sinhala Bible. Same gap as 'id', 'ms', 'my', 'ne', and 'lo'. Wiring up a
-- real Sinhala Bible version at read time is a separate change to
-- bibleLocalization.ts.
--
-- font_family is set here for parity with what the Language Manager writes when
-- an admin adds a language through the UI (LanguageManager.tsx:110 copies it
-- from SUPPORTED_LANGUAGES). Note this column is NOT what styles the app: at
-- runtime LanguageContext calls getLanguageFontFamily(), which reads
-- SUPPORTED_LANGUAGES in packages/features/src/i18n.ts:46 — already correct for
-- si ('Noto Sans Sinhala, sans-serif'). So Sinhala script renders whether or
-- not this column is populated; it is stored for the registry's own
-- bookkeeping. Ensure the Noto Sans Sinhala webfont is actually loaded, or
-- the OS fallback decides — naming a family does not ship it.
--
-- Region is 'asian' per SUPPORTED_LANGUAGES (i18n.ts:46).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, font_family, enabled, ui_status, sort_order)
values
  ('si', 'Sinhala', 'සිංහල', '🇱🇰', false, 'asian', 'Noto Sans Sinhala, sans-serif', false, 'draft', 15)
on conflict (code) do nothing;

commit;
