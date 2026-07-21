-- supabase/migrations/0228_register_language_de.sql
-- Registers German (de) in the language registry so it appears in the
-- Language Manager. Pairs with the de UI dictionary seeded in 0221-0227.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so German must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'de';
--
-- ── Address form: informal "du", not formal "Sie" ─────────────────────────
-- The dictionary addresses the user with lowercase "du" throughout — the modern
-- German app convention (and the warmer fit for a church community product).
-- God is addressed with capitalised "Du/Dir/Dein" in prayer and devotional
-- content, per the traditional German reverence convention.
-- If the target congregations expect formal "Sie", that is a re-draft of most
-- rows, not a find-and-replace: verb forms and possessives change with it.
--
-- ── Terminology worth a reviewer's eye ────────────────────────────────────
--   ministry  -> Dienst      (NOT Ministerium, which is a government ministry)
--   church    -> Gemeinde    (congregation sense, not the Kirche building)
--   counselling -> Seelsorge (the established German pastoral-care term)
--   streak -> Serie, series -> Reihe  (kept distinct deliberately)
--   challenge -> Challenge   (loanword, chosen over the longer Herausforderung
--                             for layout; revert if house style prefers German)
--
-- German compound nouns run long (Benachrichtigungseinstellungen,
-- Gebetsanliegen), so expect tighter layouts than English — worth checking the
-- nav and card labels visually before publishing.
--
-- Latin script, so no font_family is needed.
--
-- Scripture needs no seeding: bibleLocalization.ts already maps de -> 'luther1545'
-- (Luther 1545), so verses localize at READ time from a real published Bible
-- rather than from machine translation.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('de', 'German', 'Deutsch', '🇩🇪', false, 'european', false, 'draft', 9)
on conflict (code) do nothing;

commit;
