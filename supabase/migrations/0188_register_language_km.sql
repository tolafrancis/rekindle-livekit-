-- supabase/migrations/0188_register_language_km.sql
-- Registers Khmer (km) in the language registry so it appears in the
-- Language Manager. Pairs with the km UI dictionary seeded in 0181-0187.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Khmer must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet, so Khmer
-- shows up for an admin to review and publish, and stays hidden from users.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'km';
--
-- font_family is set here for parity with what the Language Manager writes when
-- an admin adds a language through the UI (LanguageManager.tsx:110 copies it
-- from SUPPORTED_LANGUAGES). Note this column is NOT what styles the app: at
-- runtime LanguageContext calls getLanguageFontFamily(), which reads
-- SUPPORTED_LANGUAGES in packages/features/src/i18n.ts:43 — already correct for
-- km ('Noto Sans Khmer, sans-serif'). So the Khmer script renders whether or not
-- this column is populated; it is stored for the registry's own bookkeeping.
-- Ensure the Noto Sans Khmer webfont is actually loaded, or the OS fallback
-- decides — naming a family does not ship it.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, font_family, enabled, ui_status, sort_order)
values
  ('km', 'Khmer', 'ខ្មែរ', '🇰🇭', false, 'asian', 'Noto Sans Khmer, sans-serif', false, 'draft', 4)
on conflict (code) do nothing;

commit;
