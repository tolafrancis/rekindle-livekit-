-- supabase/migrations/0220_register_language_my.sql
-- Registers Burmese (my) in the language registry so it appears in the
-- Language Manager. Pairs with the my UI dictionary seeded in 0213-0219.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Burmese must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'my';
--
-- ── Myanmar Unicode, NOT Zawgyi ───────────────────────────────────────────
-- The dictionary is standard Myanmar Unicode (U+1000–U+109F). This was audited:
-- zero codepoints in the U+105A–U+109F range that Zawgyi hijacks, and U+1031
-- always stored AFTER its base consonant (the decisive Zawgyi tell). This
-- matters because Zawgyi is still widespread in Myanmar and the two encodings
-- render each other as garbage. Noto Sans Myanmar (named in SUPPORTED_LANGUAGES
-- at packages/features/src/i18n.ts:42) is Unicode-only, so a Zawgyi-encoded
-- dictionary would have displayed as broken text for every user.
-- Readers on Zawgyi-only devices will still see mojibake — that is a device-side
-- font issue, not something the dictionary can fix.
--
-- font_family is stored for parity with what the Language Manager writes; the
-- runtime actually reads getLanguageFontFamily() from SUPPORTED_LANGUAGES, which
-- is already correct for 'my'. Confirm the Noto Sans Myanmar webfont is bundled
-- — naming a family does not ship it.
--
-- ── Vocabulary notes for the reviewer ─────────────────────────────────────
-- The Buddhist-associated root ဓမ္မ (dhamma) was deliberately avoided app-wide:
-- "devotional" is ဝိညာဉ်ရေးစာစဉ် (spiritual) and "ministry" is အမှုတော် rather
-- than any dhamma-derived compound. Christian vocabulary follows the Judson
-- Bible register. "Revelations" renders as ဖွင့်ပြချက်များ (insights from
-- Scripture), NOT ဗျာဒိတ်ကျမ်း (the book of Revelation).
--
-- ── No scripture localization for Burmese ─────────────────────────────────
-- bibleLocalization.ts has no getbible slug for 'my', so verses fall back to
-- stored English rather than a published Burmese Bible. Same gap as 'ms'.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, font_family, enabled, ui_status, sort_order)
values
  ('my', 'Burmese', 'မြန်မာ', '🇲🇲', false, 'asian', 'Noto Sans Myanmar, sans-serif', false, 'draft', 8)
on conflict (code) do nothing;

commit;
