-- 0340_speaker_add_vocabulary_term.sql
-- =====================================================================
-- Speaker Link live captions (2026-09-12): the speaker can now see the
-- session's own live transcript as it's captioned (rendered client-side
-- from translation_logs via Supabase Realtime — that table is already
-- public-readable and already in the realtime publication, migration
-- 0273, so no schema change was needed for the captions themselves).
--
-- This migration adds the one genuinely new piece: a way for the speaker
-- to bank a correction when a word/phrase gets misheard, WITHOUT that
-- correction blocking or retroactively changing anything already
-- translated/spoken — explicit product decision (translation stays
-- fully real-time, corrections only ever improve FUTURE accuracy). It
-- reuses ministry_sermon_vocabularies (0292) — the exact same "approved
-- terms" table the Sermon Library review flow and the bot's own
-- Deepgram keyword-boosting (getMinistrySermonTerms in
-- rekindle-translation-bot) already read — so a correction made live
-- from the Speaker Link feeds the same downstream accuracy improvement
-- a Sermon Library admin adding a term already does, just from a
-- different front door.
--
-- Token-authorized, not admin-authorized — same trust model as
-- speaker_stop_session (0288): the speaker's browser calls this
-- directly with no Supabase session, the per-session token in their
-- link IS the credential.
-- =====================================================================

begin;

create or replace function public.speaker_add_vocabulary_term(
  p_session_id     uuid,
  p_speaker_token  text,
  p_term           text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash        text;
  v_ministry_id uuid;
  v_term        text := trim(coalesce(p_term, ''));
begin
  if v_term = '' then
    raise exception 'term is required';
  end if;
  if length(v_term) > 200 then
    raise exception 'term is too long';
  end if;

  select speaker_token_hash, ministry_id into v_hash, v_ministry_id
    from public.translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_hash is null or v_hash <> encode(digest(coalesce(p_speaker_token, ''), 'sha256'), 'hex') then
    raise exception 'Invalid speaker token';
  end if;

  insert into public.ministry_sermon_vocabularies (ministry_id, term)
    values (v_ministry_id, v_term)
    on conflict (ministry_id, term) do nothing;
end;
$$;

grant execute on function public.speaker_add_vocabulary_term(uuid, text, text) to anon, authenticated;

commit;
