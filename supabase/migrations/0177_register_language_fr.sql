-- supabase/migrations/0177_register_language_fr.sql
-- Registers French (fr) in the language registry so it appears in the
-- Language Manager. Pairs with the fr UI dictionary seeded in 0170-0176.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so French must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet, so French
-- shows up for an admin to review and publish, and stays hidden from users.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'fr';
--
-- Field values mirror the SUPPORTED_LANGUAGES entry in
-- packages/features/src/i18n.ts:58 so the two catalogues agree.
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order) values
  ('fr', 'French', 'Français', '🇫🇷', false, 'european', false, 'draft', 3)
on conflict (code) do nothing;

commit;
