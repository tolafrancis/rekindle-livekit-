-- supabase/migrations/0322_register_language_lo.sql
-- Registers Lao (lo) in the language registry so it appears in the
-- Language Manager. Pairs with the lo UI dictionary seeded in 0315-0321.
--
-- Deliberately DRAFT + NOT enabled. All ~6,536 rows in ui_translations are
-- reviewed=false (assistant-drafted), so Lao must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'lo';
--
-- ── Address form: neutral throughout ────────────────────────────────────
-- Lao verbs don't inflect for register the way Thai particles do, and this
-- seed uses "ທ່ານ" (respectful "you") consistently for direct address —
-- the conventional choice for apps, official notices, and a mixed-age
-- congregation. Commands (buttons, labels) read as neutral, professional
-- app copy without an explicit pronoun.
--
-- ── Terminology worth a reviewer's eye ─────────────────────────────────────
--   devotional -> ບົດອ່ານປະຈຳວັນ (lit. "daily reading passage")
--   ministry   -> ພັນທະກິດ (also used for "service/serve" generally —
--                                   context should disambiguate, but a reviewer
--                                   may want a more specific coinage)
--   revelation -> ການເປີດເຜີຍ, testimony -> ຄຳພະຍານ
--   streak     -> ຊຸດວັນ (a run of consecutive days)
--   declaration -> ຄຳປະກາດ, affirmation -> ຄຳຢືນຢັນ
-- These were chosen for consistency across all 7 chunk files; a native
-- reviewer should confirm they read naturally before publishing.
--
-- ── "God"/"LORD" rendered per Lao Christian convention ─────────────────
-- Devotional-style prose (guided-prayer benediction, welcome lines) uses
-- "ພຣະຜູ້ເປັນເຈົ້າ" for LORD and "ພຣະເຈົ້າ" for God generally, following
-- common Lao Protestant usage. Scripture citations (Matthew 11:28,
-- Numbers 6:24-26) are translated by hand for readability inside the seed,
-- not pulled from a published Lao Bible.
--
-- ── No scripture localization for Lao ──────────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'lo', so verses fall back to
-- stored English (or machine-translated text) rather than a published Lao
-- Bible. Same gap as 'id', 'ms', 'my', and 'ne'. Wiring up a real Lao Bible
-- version at read time is a separate change to bibleLocalization.ts.
--
-- font_family is set here for parity with what the Language Manager writes when
-- an admin adds a language through the UI (LanguageManager.tsx:110 copies it
-- from SUPPORTED_LANGUAGES). Note this column is NOT what styles the app: at
-- runtime LanguageContext calls getLanguageFontFamily(), which reads
-- SUPPORTED_LANGUAGES in packages/features/src/i18n.ts:44 — already correct for
-- lo ('Noto Sans Lao, sans-serif'). So Lao script renders whether or not
-- this column is populated; it is stored for the registry's own bookkeeping.
-- Ensure the Noto Sans Lao webfont is actually loaded, or the OS fallback
-- decides — naming a family does not ship it.
--
-- Region is 'asian' per SUPPORTED_LANGUAGES (i18n.ts:44).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, font_family, enabled, ui_status, sort_order)
values
  ('lo', 'Lao', 'ລາວ', '🇱🇦', false, 'asian', 'Noto Sans Lao, sans-serif', false, 'draft', 14)
on conflict (code) do nothing;

commit;
