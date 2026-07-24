-- supabase/migrations/0212_register_language_ms.sql
-- Registers Malay (ms) in the language registry so it appears in the
-- Language Manager. Pairs with the ms UI dictionary seeded in 0205-0211.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Malay must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'ms';
--
-- ── MALAYSIAN Malay, not Indonesian ───────────────────────────────────────
-- Drafted as Bahasa Melayu (Malaysia/Brunei/Singapore): tetapan, padam,
-- muat naik/muat turun, kongsi, akaun, kata laluan, e-mel, fail, komuniti.
-- Indonesian is a SEPARATE catalogue entry ('id', not yet seeded) and uses
-- different words for most of those — do not treat this dictionary as covering
-- Indonesian readers.
--
-- ── "God" is rendered "Tuhan" — please have a local reviewer confirm ───────
-- Malay-language Christian usage differs by region, and the word used for God
-- is legally and socially sensitive in parts of Malaysia. This dictionary uses
-- "Tuhan" throughout for both God and Lord, which is the widely-accepted
-- neutral choice. The Alkitab convention of using "Allah" for God was NOT
-- adopted, since its use by non-Muslims is restricted in several Malaysian
-- states. This is a judgement call made without local input: if the ministries
-- using this language prefer otherwise, it should be corrected BEFORE
-- publishing, not after.
--
-- ── No scripture localization for Malay ───────────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'ms', so verses fall back to
-- the stored English (or machine-translated text) rather than a published Malay
-- Bible. Contrast es -> 'valera' and pt -> 'almeida', which localize at read
-- time. Adding a Malay version there is a separate change.
--
-- Latin script, so no font_family is needed.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('ms', 'Malay', 'Bahasa Melayu', '🇲🇾', false, 'asian', false, 'draft', 7)
on conflict (code) do nothing;

commit;
