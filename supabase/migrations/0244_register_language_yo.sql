-- supabase/migrations/0244_register_language_yo.sql
-- Registers Yoruba (yo) in the language registry so it appears in the
-- Language Manager. Pairs with the yo UI dictionary seeded in 0237-0243.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Yoruba must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'yo';
--
-- ── Diacritics are semantic, not decorative ───────────────────────────────
-- Yoruba requires sub-dots (ẹ ọ ṣ) AND tone marks (à á ẹ̀ ẹ́ ọ̀ ọ́ …). Stripping
-- them changes meaning outright: ọkọ̀ = vehicle, ọkọ = husband, oko = farm.
-- Every row in this seed is fully marked and was audited for it. Anything that
-- later round-trips these strings through a system that normalises or strips
-- combining marks WILL corrupt the language — worth checking any export,
-- search-indexing or TTS path before publishing.
--
-- ── Address form ──────────────────────────────────────────────────────────
-- The respectful plural "ẹ" form (Ẹ jọ̀wọ́, possessive yín) is used throughout,
-- appropriate for addressing adults and mixed congregations. The familiar
-- singular "o/ìwọ" is not used.
--
-- ── KNOWN ISSUE FOR THE REVIEWER: one word-family, three senses ───────────
-- Yoruba routes "declaration", "campaign" and "proclamation" through the same
-- root. This seed pins Ìpolongo = declaration (to keep it distinct from
-- Ìkéde = announcement, which otherwise collided in the cards/announcements
-- UI). That left "campaign" without an obvious word, and the chunk files
-- resolved it three different ways:
--     0238 landing       -> ìpolongo   (used the natural word anyway)
--     0240 ministry_mgmt -> Àkànṣe Ètò (coined, ~22 rows)
--     0242/0243          -> Ìpolówó    (coined)
-- This is an assignment problem for a Yoruba speaker, not a find-and-replace:
-- they may well decide ìpolongo belongs to campaign and declaration takes
-- something else. Settle the whole family at once before publishing.
--
-- Related, same cause: `Ètò` is pinned to settings, so a few Bible-reading-plan
-- labels read "Bẹ̀rẹ̀ Ètò" ("Start Settings"). Also worth revisiting together.
--
-- ── No scripture localization for Yoruba ──────────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'yo', so verses fall back to
-- stored English rather than a published Yoruba Bible (Bíbélì Mímọ́). Same gap
-- as 'ms' and 'my'. Display-prose verses inside the seed ARE translated.
--
-- Latin script with combining marks; the default stack covers it, so no
-- font_family. Region is 'african' per SUPPORTED_LANGUAGES (i18n.ts:69).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('yo', 'Yoruba', 'Yorùbá', '🇳🇬', false, 'african', false, 'draft', 11)
on conflict (code) do nothing;

commit;
