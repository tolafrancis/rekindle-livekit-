-- 0364_webinar_realtime_publication.sql
-- Real bug found live (2026-09-22): webinar_questions, webinar_polls,
-- webinar_poll_options, webinar_poll_votes, webinar_question_votes, and
-- webinar_speaker_requests were never added to the supabase_realtime
-- publication when they were created (0357/0354) — confirmed via
-- pg_publication_tables, only meeting_chat was actually in it. Every
-- postgres_changes subscription these hooks set up (useWebinarQuestions,
-- useWebinarPolls, useWebinarSpeakerRequests) was silently a no-op; each
-- hook's own 5s polling-fallback interval was the ONLY thing ever
-- delivering updates, and only while its owning panel happened to be
-- mounted (the host's Manage popover, gated behind a click) — with no
-- notification pulling the host there, "not delivering" is exactly what a
-- host doing a normal join-and-watch pass would see. meeting_chat itself is
-- unaffected (already correctly in the publication) but included below via
-- IF NOT EXISTS-equivalent guards for idempotency, not because it needed it.

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'webinar_questions', 'webinar_question_votes',
    'webinar_polls', 'webinar_poll_options', 'webinar_poll_votes',
    'webinar_speaker_requests'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
