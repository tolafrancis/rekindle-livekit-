-- supabase/migrations/0306_register_language_id.sql
-- Registers Indonesian (id) in the language registry so it appears in the
-- Language Manager. Pairs with the id UI dictionary seeded in 0299-0305.
--
-- Deliberately DRAFT + NOT enabled. All rows in ui_translations are
-- reviewed=false (assistant-drafted), so Indonesian must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'id';
--
-- ── INDONESIAN Bahasa Indonesia, not Malaysian Malay ──────────────────────
-- Drafted as Bahasa Indonesia: pengaturan, hapus, unggah/unduh, bagikan, akun,
-- kata sandi, email, berkas, komunitas. Malay ('ms', seeded earlier) is a
-- SEPARATE catalogue entry and uses different words for most of those
-- (tetapan, padam, muat naik/turun, kongsi, akaun, kata laluan, e-mel) — do
-- not treat one dictionary as covering the other's readers.
--
-- ── KNOWN ISSUE FOR THE REVIEWER: address-form consistency ────────────────
-- Indonesian has two common registers for "you": formal/respectful "Anda" and
-- the more casual "kamu" / the possessive clitic "-mu" (e.g. "profilmu").
-- This seed leans "kamu/-mu" for warmer, conversational strings (toasts,
-- encouragement, devotional copy) and "Anda" for more formal or
-- administrative contexts (legal notices, admin/ministry-management screens,
-- error/validation messages) — mirroring how Indonesian apps commonly mix
-- registers by context. But the split was made per-string by an assistant,
-- not against a fixed rule, so it is almost certainly inconsistent in places
-- (e.g. two strings in the same dialog using different registers). A native
-- reviewer should either confirm the per-context split is acceptable or
-- standardize on one register throughout before publishing.
--
-- ── God/Lord terminology ───────────────────────────────────────────────────
-- Rendered as "Tuhan" throughout (God/Lord), consistent with common
-- Indonesian Protestant usage (Alkitab Terjemahan Baru also uses "TUHAN" for
-- the divine name and "Tuhan" for Lord/God in address). Devotional-style
-- prose (e.g. the guided-prayer benediction) draws on Numbers 6:24-26 phrasing
-- familiar from the TB translation.
--
-- ── No scripture localization for Indonesian ──────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'id', so verses fall back to
-- stored English (or machine-translated text) rather than a published
-- Indonesian Bible (e.g. Alkitab Terjemahan Baru). Same gap as 'ms' and 'my'.
-- Display-prose verses inside this seed (e.g. Matthew 11:28, Psalm 119:105,
-- the Numbers 6:24-26 benediction) ARE translated by hand for readability,
-- but are not a substitute for wiring up a real published Bible version at
-- read time — that is a separate change to bibleLocalization.ts.
--
-- Latin script; the default stack covers it, so no font_family. Region is
-- 'asian' per SUPPORTED_LANGUAGES (i18n.ts:36).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('id', 'Indonesian', 'Bahasa Indonesia', '🇮🇩', false, 'asian', false, 'draft', 12)
on conflict (code) do nothing;

commit;
