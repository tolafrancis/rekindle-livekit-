-- supabase/migrations/0204_register_language_pt.sql
-- Registers Portuguese (pt) in the language registry so it appears in the
-- Language Manager. Pairs with the pt UI dictionary seeded in 0197-0203.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Portuguese must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'pt';
--
-- ── BRAZILIAN Portuguese, and the flag is deliberately 🇧🇷 ─────────────────
-- The dictionary was drafted in pt-BR (você, salvar, arquivo, tela, usuário,
-- senha, compartilhar, and the BR gerund "está carregando"), because Brazil is
-- the largest Portuguese-speaking audience by far. SUPPORTED_LANGUAGES in
-- packages/features/src/i18n.ts:60 carries flag '🇵🇹' and region 'european',
-- which would show a Portugal flag over Brazilian text in the switcher — so
-- this row overrides the flag to 🇧🇷 and the region to 'american'.
--
-- NOTE: the app renders the switcher from its own catalogue in some paths, so
-- for a fully consistent flag you may also want to update i18n.ts:60 to
-- flag: '🇧🇷'. Left unchanged here to keep this migration data-only.
-- If you would rather target European Portuguese, the dictionary needs
-- re-drafting, not just a flag swap — the vocabulary differs throughout.
--
-- Scripture needs no seeding: bibleLocalization.ts already maps pt -> 'almeida'
-- (Almeida Atualizada), so verses localize at READ time from a real published
-- Bible rather than from machine translation.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('pt', 'Portuguese (Brazil)', 'Português (Brasil)', '🇧🇷', false, 'american', false, 'draft', 6)
on conflict (code) do nothing;

commit;
