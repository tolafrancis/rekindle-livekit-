-- supabase/migrations/0196_register_language_es.sql
-- Registers Spanish (es) in the language registry so it appears in the
-- Language Manager. Pairs with the es UI dictionary seeded in 0189-0195.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Spanish must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet, so Spanish
-- shows up for an admin to review and publish, and stays hidden from users.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'es';
--
-- No font_family: Spanish is Latin script and uses the default UI stack
-- (contrast with km/0188, which names Noto Sans Khmer). Field values otherwise
-- mirror the SUPPORTED_LANGUAGES entry in packages/features/src/i18n.ts:57.
--
-- Scripture needs no seeding: bibleLocalization.ts already maps es -> 'valera'
-- (Reina Valera 1909), so verses localize at READ time from a real published
-- Bible rather than from machine translation.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('es', 'Spanish', 'Español', '🇪🇸', false, 'european', false, 'draft', 5)
on conflict (code) do nothing;

commit;
