-- =====================================================================
-- Live Translation Q&A ("Conversation" tab)
--
-- Adds a two-way channel on top of the existing translation_sessions/
-- translation_services infrastructure Start Service already creates:
-- a /display listener can type or speak a question in their own
-- language, it's translated for the speaker, and the speaker (or the
-- ministry admin managing the service) can pin one for every listener —
-- across every language session under the same service — to see.
--
-- Anonymous by default (asker_name optional), rate-limited to one
-- question per 20 seconds per anonymous browser fingerprint, and
-- switched on by default via language_configs.questions_enabled.
--
-- The actual translation (original language -> speaker's language, and
-- at pin time, -> every other language a listener might be viewing in)
-- needs an external OpenAI call, which a Postgres function can't make —
-- that happens in two new edge functions (translation-submit-question,
-- translation-pin-question), both using the service-role client, so
-- INSERT on this table is intentionally not opened to anon/authenticated
-- roles at all: every question must go through the edge function that
-- also rate-limits and translates it.
-- =====================================================================

begin;

alter table language_configs
  add column if not exists questions_enabled boolean not null default true;

create table if not exists translation_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references translation_sessions(id) on delete cascade,
  service_id uuid references translation_services(id) on delete cascade,
  ministry_id uuid not null,
  asker_name text,
  original_text text not null,
  -- The asker's own language — their session's target_language, i.e. what
  -- they typed/spoke in (not necessarily what the SESSION's target_language
  -- still is by the time this is read back, since a session row can in
  -- principle be retargeted — stored explicitly rather than re-derived).
  original_language text not null,
  -- Translated into the SPEAKER's language (the session's source_language)
  -- at submit time — this is what the speaker actually reads.
  speaker_text text,
  status text not null default 'pending' check (status in ('pending', 'pinned', 'dismissed')),
  -- language code -> translated text, filled in once at pin time for every
  -- distinct language a listener could be viewing under this service
  -- (every sibling session's target_language, plus the speaker's source_
  -- language) — see translation-pin-question. Empty until pinned.
  pinned_translations jsonb not null default '{}'::jsonb,
  -- Anonymous per-browser identifier (localStorage-generated, not a real
  -- identity) — the only thing the 20s rate limit has to key on when
  -- asker_name is blank by design.
  fingerprint text not null,
  created_at timestamptz not null default now(),
  pinned_at timestamptz
);

create index if not exists idx_translation_questions_service_status on translation_questions(service_id, status);
create index if not exists idx_translation_questions_session on translation_questions(session_id, created_at);
create index if not exists idx_translation_questions_fingerprint on translation_questions(fingerprint, created_at);

alter table translation_questions enable row level security;

-- Public can only ever see a PINNED question — never the pending queue
-- (that would show every listener every question anyone's asked, not just
-- the one the speaker chose to surface).
drop policy if exists p_translation_questions_public_sel on translation_questions;
create policy p_translation_questions_public_sel on translation_questions
  for select
  to anon, authenticated
  using (status = 'pinned');

-- Ministry admins (dashboard use — MinistryTranslationServiceManager's
-- Questions panel) see and manage the full queue for their own ministry.
drop policy if exists p_translation_questions_admin_all on translation_questions;
create policy p_translation_questions_admin_all on translation_questions
  for all
  to authenticated
  using (is_group_admin(ministry_id, auth.uid()) or is_content_admin(auth.uid()))
  with check (is_group_admin(ministry_id, auth.uid()) or is_content_admin(auth.uid()));

-- No anon/authenticated INSERT policy at all, deliberately — see header
-- comment. Only the service-role edge function can create a row.

-- ---------------------------------------------------------------------
-- get_speaker_pending_questions — the browser_speaker-session equivalent
-- of the admin dashboard's direct table read above: a /speak page has no
-- Supabase auth session, only a speaker_token, so it needs a security-
-- definer path in instead of relying on RLS's authenticated-role checks.
-- ---------------------------------------------------------------------
create or replace function public.get_speaker_pending_questions(
  p_session_id uuid,
  p_speaker_token text
)
returns setof translation_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_service_id uuid;
begin
  select speaker_token_hash, service_id into v_hash, v_service_id
    from translation_sessions
    where id = p_session_id and source_type = 'browser_speaker';

  if v_hash is null or v_hash <> encode(digest(coalesce(p_speaker_token, ''), 'sha256'), 'hex') then
    raise exception 'Invalid speaker token';
  end if;
  if v_service_id is null then
    return;
  end if;

  return query
    select * from translation_questions
    where service_id = v_service_id and status = 'pending'
    order by created_at asc;
end;
$$;

-- ---------------------------------------------------------------------
-- dismiss_translation_question — no translation involved, so this (unlike
-- pin) doesn't need an edge function. Dual auth: speaker_token (matches
-- speaker_add_vocabulary_term's pattern) or an authenticated ministry/
-- platform admin.
-- ---------------------------------------------------------------------
create or replace function public.dismiss_translation_question(
  p_question_id uuid,
  p_speaker_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
  v_session_id uuid;
  v_hash text;
begin
  select ministry_id, session_id into v_ministry_id, v_session_id
    from translation_questions where id = p_question_id;
  if v_ministry_id is null then
    raise exception 'Question not found';
  end if;

  if p_speaker_token is not null then
    select speaker_token_hash into v_hash
      from translation_sessions where id = v_session_id and source_type = 'browser_speaker';
    if v_hash is null or v_hash <> encode(digest(p_speaker_token, 'sha256'), 'hex') then
      raise exception 'Invalid speaker token';
    end if;
  elsif auth.uid() is null or not (is_group_admin(v_ministry_id, auth.uid()) or is_content_admin(auth.uid())) then
    raise exception 'Not authorized';
  end if;

  update translation_questions set status = 'dismissed' where id = p_question_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------
-- upsert_language_config — new overload adding p_questions_enabled,
-- following this function's own established pattern (each setting it's
-- grown a new param per migration, coalesce-merged on conflict so a
-- caller can update just the fields it has). Defaults the same true the
-- column itself defaults to, not false like the other booleans here —
-- Q&A is meant to be on unless a ministry turns it off.
-- ---------------------------------------------------------------------
create or replace function public.upsert_language_config(
  p_ministry_id uuid,
  p_source_language text default null,
  p_target_language text default null,
  p_supported_target_languages text[] default null,
  p_elevenlabs_voice_id text default null,
  p_bot_enabled boolean default null,
  p_is_public boolean default null,
  p_speaker_identity text default null,
  p_questions_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to edit translation settings for this ministry';
  end if;

  insert into public.language_configs (
    ministry_id, source_language, target_language, supported_target_languages,
    elevenlabs_voice_id, bot_enabled, is_public, speaker_identity, questions_enabled, updated_at
  )
  values (
    p_ministry_id,
    coalesce(p_source_language, 'en'),
    p_target_language,
    coalesce(p_supported_target_languages, '{}'),
    p_elevenlabs_voice_id,
    coalesce(p_bot_enabled, false),
    coalesce(p_is_public, true),
    p_speaker_identity,
    coalesce(p_questions_enabled, true),
    now()
  )
  on conflict (ministry_id) do update
    set source_language             = coalesce(p_source_language, language_configs.source_language),
        target_language             = coalesce(p_target_language, language_configs.target_language),
        supported_target_languages  = coalesce(p_supported_target_languages, language_configs.supported_target_languages),
        elevenlabs_voice_id         = coalesce(p_elevenlabs_voice_id, language_configs.elevenlabs_voice_id),
        bot_enabled                 = coalesce(p_bot_enabled, language_configs.bot_enabled),
        is_public                   = coalesce(p_is_public, language_configs.is_public),
        speaker_identity            = coalesce(p_speaker_identity, language_configs.speaker_identity),
        questions_enabled           = coalesce(p_questions_enabled, language_configs.questions_enabled),
        updated_at                  = now();
end;
$$;

-- ---------------------------------------------------------------------
-- get_questions_enabled — language_configs has no public SELECT policy
-- at all (member-only), so an anonymous /display visitor can't read
-- questions_enabled directly to decide whether to show the Conversation
-- tab. Narrow, single-boolean RPC instead of widening RLS on a row that
-- also carries pin_hash/speaker_identity.
-- ---------------------------------------------------------------------
create or replace function public.get_questions_enabled(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select questions_enabled from language_configs where ministry_id = p_ministry_id),
    true
  );
$$;

commit;
