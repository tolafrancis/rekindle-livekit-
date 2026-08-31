-- supabase/migrations/0314_register_language_ne.sql
-- Registers Nepali (ne) in the language registry so it appears in the
-- Language Manager. Pairs with the ne UI dictionary seeded in 0307-0313.
--
-- Deliberately DRAFT + NOT enabled. All 6,036 rows in ui_translations are
-- reviewed=false (assistant-drafted), so Nepali must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'ne';
--
-- ── Address form: respectful "तपाईं" throughout ───────────────────────────
-- Nepali has three registers for "you" — intimate "तँ", familiar "तिमी", and
-- respectful "तपाईं". This seed uses "तपाईं" (and its possessive "तपाईंको")
-- consistently, the register conventional for apps, official notices, and
-- addressing a mixed-age congregation. The informal "तिमी" is not used.
--
-- ── Terminology worth a reviewer's eye ─────────────────────────────────────
--   devotional -> भक्ति          (kept distinct from prayer = प्रार्थना)
--   ministry   -> सेवा            (also used for "service"/"serve" generally —
--                                   context should disambiguate, but a reviewer
--                                   may want a more specific coinage)
--   revelation -> प्रकाश          (literally "light/revelation"; distinct from
--                                   the Bible's last book, which is not named
--                                   in this seed)
--   testimony  -> गवाही           (witness/testimony, standard Christian usage)
--   streak     -> शृंखला          (chain/series — Nepali has no established
--                                   equivalent for the gamification sense)
--   declaration -> घोषणा, affirmation -> प्रतिज्ञान
-- These were chosen for consistency across all 7 chunk files; a native
-- reviewer should confirm they read naturally before publishing.
--
-- ── "God"/"LORD" rendered per Nepali Christian convention ─────────────────
-- Devotional-style prose (guided-prayer benediction, welcome lines) uses
-- "परमप्रभु" for LORD/the divine name and "परमेश्वर" for God generally,
-- matching common Nepali Bible (Nepali Bible Society) usage. Scripture
-- citations (Matthew 11:28, Psalm 119:105) are translated by hand for
-- readability inside the seed, not pulled from a published Nepali Bible.
--
-- ── No scripture localization for Nepali ──────────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'ne', so verses fall back to
-- stored English (or machine-translated text) rather than a published Nepali
-- Bible. Same gap as 'id', 'ms', and 'my'. Wiring up a real Nepali Bible
-- version at read time is a separate change to bibleLocalization.ts.
--
-- font_family is set here for parity with what the Language Manager writes when
-- an admin adds a language through the UI (LanguageManager.tsx:110 copies it
-- from SUPPORTED_LANGUAGES). Note this column is NOT what styles the app: at
-- runtime LanguageContext calls getLanguageFontFamily(), which reads
-- SUPPORTED_LANGUAGES in packages/features/src/i18n.ts:45 — already correct for
-- ne ('Noto Sans Devanagari, sans-serif'). So Devanagari renders whether or not
-- this column is populated; it is stored for the registry's own bookkeeping.
-- Ensure the Noto Sans Devanagari webfont is actually loaded, or the OS
-- fallback decides — naming a family does not ship it.
--
-- Region is 'asian' per SUPPORTED_LANGUAGES (i18n.ts:45).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, font_family, enabled, ui_status, sort_order)
values
  ('ne', 'Nepali', 'नेपाली', '🇳🇵', false, 'asian', 'Noto Sans Devanagari, sans-serif', false, 'draft', 13)
on conflict (code) do nothing;

commit;
