-- =====================================================================
-- Fix: Live Translation "Conversation" questions never reach the speaker
--
-- Real bug reported 2026-10-02: an audience member asks a question on
-- /display, gets no error, and the speaker never sees it or gets any
-- notification. Three separate gaps in 0373_translation_questions.sql
-- stacked up to cause that:
--
-- 1. get_speaker_pending_questions and dismiss_translation_question were
--    created with `set search_path = public`. Both call pgcrypto's
--    digest(), which lives in the `extensions` schema on this project —
--    the exact failure 0285_fix_pgcrypto_search_path.sql already fixed
--    for the 0273 functions. Every call raised "function digest(text,
--    unknown) does not exist", so /speak's 5s poll always came back with
--    an error (which SpeakerPage silently ignored) and an empty queue.
--    The speaker's Dismiss button failed the same way.
--
-- 2. translation_questions was never added to the supabase_realtime
--    publication, so the realtime subscriptions in
--    MinistryTranslationServiceManager (admin queue) and
--    TranslationDisplayPage (pinned banner) never fired. Admins only saw
--    new questions after a full reload; listeners only saw a pin after
--    reopening the page.
--
-- 3. (Client side, fixed in the same change) SpeakerPage swallowed the
--    RPC error, and nothing ever notified the speaker of a new question.
--
-- Also adds a written answer: the speaker can pin a question together
-- with a short typed reply, translated for every listener the same way
-- the question itself is (see translation-pin-question).
-- =====================================================================

begin;

alter function public.get_speaker_pending_questions(uuid, text)
  set search_path = public, extensions;

alter function public.dismiss_translation_question(uuid, text)
  set search_path = public, extensions;

do $$
begin
  alter publication supabase_realtime add table public.translation_questions;
exception when duplicate_object then null;
end $$;

alter table public.translation_questions
  add column if not exists answer_text text,
  -- language code -> translated answer, filled in at pin time alongside
  -- pinned_translations. Empty when the speaker pinned without a reply.
  add column if not exists pinned_answer_translations jsonb not null default '{}'::jsonb;

commit;
