-- =====================================================================
-- get_speaker_session_status — lets /speak notice its session ended
--
-- Real bug reported 2026-10-02: a Speaker Link session ended (listeners'
-- /display switched to "no longer available") while /speak kept showing
-- the speaker as live, until the speaker refreshed. /speak never watched
-- its own session row at all, only its LiveKit connection, and the
-- speaker stays connected to the room even after the bot has left it.
--
-- /speak has no Supabase auth session and a private ministry's session
-- row isn't publicly readable, so this is keyed on the speaker token,
-- the same way get_speaker_pending_questions is. Returns 'invalid_token'
-- (rather than raising) when the token was replaced, e.g. an admin
-- pressed "Copy speaker link" on the running session, which mints a new
-- one, so the page can say exactly that.
--
-- search_path includes extensions: digest() lives there (see 0285/0385).
-- =====================================================================

begin;

create or replace function public.get_speaker_session_status(
  p_session_id uuid,
  p_speaker_token text
)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_status text;
begin
  select speaker_token_hash, status into v_hash, v_status
    from translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_status is null then
    return 'not_found';
  end if;
  if v_hash is null or v_hash <> encode(digest(coalesce(p_speaker_token, ''), 'sha256'), 'hex') then
    return 'invalid_token';
  end if;
  return v_status;
end;
$$;

grant execute on function public.get_speaker_session_status(uuid, text) to anon, authenticated;

commit;
