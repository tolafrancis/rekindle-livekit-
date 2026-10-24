-- 0418_translation_addon_voice_label.sql
-- =====================================================================
-- Live Translation add-on names now say what's included: every translated
-- hour is spoken in a voice as well as shown as captions, and the voice is
-- most of what an hour costs to run. Hours are counted per language (each
-- language is its own translation session, see
-- get_ministry_translation_minutes_used), which the billing page now says.
-- Same names are used for the Stripe products.
-- =====================================================================

begin;

update public.ministry_addon_catalog
  set label = 'Live Translation, voice + captions, ' || unit_hours || ' hours/month'
  where addon_type = 'live_translation';

commit;
