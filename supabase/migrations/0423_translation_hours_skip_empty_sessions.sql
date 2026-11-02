-- 0423_translation_hours_skip_empty_sessions.sql
-- =====================================================================
-- A translation session that produced no translated lines at all doesn't
-- use Live Translation hours (agreed with the user 2026-10-31). Quick tests,
-- links opened with no microphone, and failed sessions (RCCG Vietnam,
-- 2026-10-27: 25 minutes of speech, nothing translated) were being billed
-- start to end. A session starts counting, from its start, as soon as its
-- first line is translated.
--
-- Only get_ministry_translation_minutes_used changes; 0419's limit, check
-- job and trigger all go through it. translation_logs rows are kept as long
-- as their session (deleted with it after 90 days, 0368), so a month's
-- billing never loses lines.
-- =====================================================================

create or replace function public.get_ministry_translation_minutes_used(p_ministry_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(greatest(least(
           extract(epoch from (
             least(coalesce(t.ended_at, now()), coalesce(t.interim_updated_at, t.started_at) + interval '60 minutes')
             - greatest(t.started_at, date_trunc('month', now())))) / 60,
           360), 0)), 0)
    from public.translation_sessions t
   where t.ministry_id = p_ministry_id
     and t.session_kind = 'translate'
     and t.started_at is not null
     and coalesce(t.ended_at, now()) > date_trunc('month', now())
     and exists (select 1 from public.translation_logs l where l.session_id = t.id);
$$;
