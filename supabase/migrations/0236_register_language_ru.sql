-- supabase/migrations/0236_register_language_ru.sql
-- Registers Russian (ru) in the language registry so it appears in the
-- Language Manager. Pairs with the ru UI dictionary seeded in 0229-0235.
--
-- Deliberately DRAFT + NOT enabled. The 6,036 rows in ui_translations are all
-- reviewed=false (assistant-drafted), so Russian must not reach the public
-- switcher until a native reviewer has been through them. The switcher reads
-- enabled + ui_status='published'; this row satisfies neither yet.
--
-- To publish after review (or just flip it in the Language Manager UI):
--   update public.app_languages set enabled = true, ui_status = 'published'
--    where code = 'ru';
--
-- ── Address form: polite "вы", not informal "ты" ──────────────────────────
-- The dictionary addresses the user with lowercase "вы" throughout — the safer
-- choice for a congregation that includes older members. God is addressed with
-- capitalised "Ты/Тебя/Твой" in prayer and devotional content, per the Synodal
-- convention. Switching the UI to "ты" would be a re-draft, not a replace:
-- verb forms and possessives change with it.
--
-- ── KNOWN LIMITATION: Russian needs three plural forms, the schema has two ──
-- Russian inflects numerically in three ways — 1 день / 2-4 дня / 5+ дней — but
-- ui_translations gives each concept only a singular key and a plural key. The
-- plural slot uses the GENITIVE PLURAL (дней, часов, минут), which is correct
-- for 5+ and the most common case, so counts of 2-4 render slightly wrong
-- ("2 дней" instead of "2 дня").
--
-- This is a dictionary-schema limitation, NOT a translation defect, and it
-- cannot be fixed by editing these rows. A real fix needs either a third key
-- per concept or ICU plural rules in TranslationLoader. The same will apply to
-- Polish, Czech, Ukrainian and Serbian if those are added later.
--
-- Affected keys include: streak.days, streak.progress, devotionals.days,
-- devotionals.daysCompleted, devotionals.daysOf, liveChannelEventCard.inDays /
-- inHours / inMinutes, prayerSeriesViewer.daysUnit.
--
-- Note some chunks sidestep this by rewording as "label: {count}"
-- (e.g. "Выбрано языков: {count}"), which is grammatically safe at any number
-- but reads more clerical. Both strategies are present in the seed; a reviewer
-- may want to standardise on one.
--
-- ── Terminology worth a reviewer's eye ────────────────────────────────────
--   devotional -> духовное чтение   (kept distinct from reflection = размышление)
--   streak     -> цепочка           (kept distinct from series = серия)
--   challenge  -> марафон           (chosen over испытание, which reads as "trial")
--   counselling -> душепопечение    (correct Protestant register, but long)
--   meeting/session -> встреча      (one word doing double duty)
--
-- aiScriptureGuidance.footerVerse cites Псалом 118:105, not 119:105. That is
-- correct: Synodal Psalm numbering is offset from English Bibles. It will look
-- mismatched next to the English UI but is right for a Russian reader.
--
-- Cyrillic renders in the default stack; SUPPORTED_LANGUAGES (i18n.ts:61) names
-- 'Noto Sans, sans-serif' and the runtime reads that, so no font_family here.
--
-- Scripture needs no seeding: bibleLocalization.ts already maps ru -> 'synodal'
-- (Synodal 1876), so verses localize at READ time from a real published Bible.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

insert into public.app_languages
  (code, name, native_name, flag, rtl, region, enabled, ui_status, sort_order)
values
  ('ru', 'Russian', 'Русский', '🇷🇺', false, 'european', false, 'draft', 10)
on conflict (code) do nothing;

commit;
