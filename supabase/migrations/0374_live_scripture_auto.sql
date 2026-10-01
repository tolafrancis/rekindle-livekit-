-- =====================================================================
-- Live Scripture: automatic by default, and from the speaker link too
--
-- 1. Verses go up automatically by default (auto_show), including for
--    ministries that already saved settings under 0373's off-by-default.
-- 2. The speaker link (/speak/:sessionId, unauthenticated, speaker token in
--    the URL) now runs detection itself, so a speaker-link service shows
--    verses without anyone keeping the dashboard open. It can't read
--    ministry_scripture_settings or insert into translation_scripture_events
--    directly (both need a signed-in member/admin), so it goes through the
--    two speaker-token functions below, the same way
--    speaker_add_vocabulary_term (0340) does.
-- 3. Verses show in both languages: the preferred version (text, as
--    before) plus the same passage in the listener's language (listener_*),
--    from a public-domain edition the app ships, e.g. the 1926 Vietnamese
--    Bible. Never machine-translated: no edition, no second text.
-- 4. The dashboard and the speaker link can both be watching the same
--    captions, so a "shown" row for the verse that is already on screen is
--    skipped instead of stacking duplicates.
-- =====================================================================

begin;

alter table public.translation_scripture_events
  add column if not exists listener_text     text,
  add column if not exists listener_version  text,
  add column if not exists listener_language text;

alter table public.ministry_scripture_settings alter column auto_show set default true;
update public.ministry_scripture_settings set auto_show = true, updated_at = now() where auto_show = false;

-- (4) Skip a repeat of the verse that is still on screen for this session.
create or replace function public.translation_scripture_events_skip_repeat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last public.translation_scripture_events%rowtype;
begin
  if new.status <> 'shown' then
    return new;
  end if;
  select * into v_last
    from public.translation_scripture_events
   where session_id = new.session_id
   order by created_at desc
   limit 1;
  if v_last.id is not null
     and v_last.status = 'shown'
     and v_last.reference = new.reference
     and v_last.version = new.version
     and (v_last.display_seconds = 0
          or v_last.created_at + make_interval(secs => v_last.display_seconds) > now()) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_translation_scripture_events_skip_repeat on public.translation_scripture_events;
-- BEFORE INSERT triggers run in name order; this one needs nothing from ..._set_ministry.
create trigger trg_translation_scripture_events_skip_repeat
  before insert on public.translation_scripture_events
  for each row execute function public.translation_scripture_events_skip_repeat();

-- (2a) What the speaker link needs to know: the ministry's Live Scripture
-- settings for this session. Null when the token doesn't match.
create or replace function public.speaker_scripture_settings(
  p_session_id     uuid,
  p_speaker_token  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash        text;
  v_ministry_id uuid;
  v_source      text;
  v_target      text;
  v_settings    public.ministry_scripture_settings%rowtype;
begin
  select speaker_token_hash, ministry_id, source_language, target_language
    into v_hash, v_ministry_id, v_source, v_target
    from public.translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_hash is null or v_hash <> encode(digest(coalesce(p_speaker_token, ''), 'sha256'), 'hex') then
    return null;
  end if;

  select * into v_settings from public.ministry_scripture_settings where ministry_id = v_ministry_id;
  return jsonb_build_object(
    'ministry_id', v_ministry_id,
    'source_language', v_source,
    'target_language', v_target,
    'preferred_version', coalesce(v_settings.preferred_version, 'KJV'),
    'preferred_version_label', coalesce(v_settings.preferred_version_label, 'KJV'),
    'auto_detect', coalesce(v_settings.auto_detect, true),
    'auto_show', coalesce(v_settings.auto_show, true),
    'display_seconds', coalesce(v_settings.display_seconds, 30)
  );
end;
$$;

grant execute on function public.speaker_scripture_settings(uuid, text) to anon, authenticated;

-- (2b) Put a detected verse on screen from the speaker link. Only while the
-- session is live and the ministry has auto-detect and auto-show on; the
-- display time always comes from the ministry's settings.
create or replace function public.speaker_show_scripture(
  p_session_id     uuid,
  p_speaker_token  text,
  p_reference      text,
  p_version        text,
  p_text           text,
  p_attribution       text default null,
  p_is_licensed       boolean default false,
  p_listener_text     text default null,
  p_listener_version  text default null,
  p_listener_language text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash        text;
  v_ministry_id uuid;
  v_status      text;
  v_settings    public.ministry_scripture_settings%rowtype;
begin
  select speaker_token_hash, ministry_id, status into v_hash, v_ministry_id, v_status
    from public.translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_hash is null or v_hash <> encode(digest(coalesce(p_speaker_token, ''), 'sha256'), 'hex') then
    raise exception 'Invalid speaker token';
  end if;
  if v_status in ('ended', 'error') then
    return;
  end if;
  if coalesce(length(trim(p_reference)), 0) = 0 or coalesce(length(trim(p_text)), 0) = 0
     or length(p_reference) > 100 or length(coalesce(p_version, '')) > 40 or length(p_text) > 20000
     or length(coalesce(p_attribution, '')) > 2000
     or length(coalesce(p_listener_text, '')) > 20000 or length(coalesce(p_listener_version, '')) > 40
     or length(coalesce(p_listener_language, '')) > 16 then
    raise exception 'invalid scripture';
  end if;

  select * into v_settings from public.ministry_scripture_settings where ministry_id = v_ministry_id;
  if not coalesce(v_settings.auto_detect, true) or not coalesce(v_settings.auto_show, true) then
    return;
  end if;

  insert into public.translation_scripture_events
    (session_id, ministry_id, status, reference, version, text, attribution, is_licensed, display_seconds, created_by,
     listener_text, listener_version, listener_language)
  values
    (p_session_id, v_ministry_id, 'shown', trim(p_reference), coalesce(nullif(trim(p_version), ''), 'KJV'),
     p_text, p_attribution, coalesce(p_is_licensed, false), coalesce(v_settings.display_seconds, 30), null,
     nullif(p_listener_text, ''), nullif(trim(p_listener_version), ''), nullif(trim(p_listener_language), ''));
end;
$$;

grant execute on function public.speaker_show_scripture(uuid, text, text, text, text, text, boolean, text, text, text) to anon, authenticated;

commit;
