-- supabase/migrations/0169_register_language_tl.sql
-- Registers Filipino (tl) in the language registry so it appears in the
-- Language Manager. Pairs with the tl UI dictionary seeded in 0162-0168.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Filipino must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'tl';
--
-- Field values mirror the SUPPORTED_LANGUAGES entry in
-- packages/features/src/i18n.ts:47 so the two catalogues agree.
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order) values
  ('tl', 'Filipino', 'Tagalog', '🇵🇭', false, 'asian', false, 'draft', 2)
on conflict (code) do nothing;

commit;
