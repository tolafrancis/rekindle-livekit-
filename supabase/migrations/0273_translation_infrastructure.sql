-- 0273_translation_infrastructure.sql
-- =====================================================================
-- ReKindle Live Translation (RLT) — Phase 1: Database, Auth & Control
-- Plane. See docs/rlt-build-checklist.md for the full build plan this
-- implements (§ Phase 1).
--
-- "Option A" migration: every table for BOTH pipelines is created in one
-- shot. translation_devices / translation_device_tokens /
-- translation_device_commands belong to the edge-agent (PA system)
-- pipeline and sit idle — created now, first used in Phase 4 — so Phase 4
-- has zero schema work left when it starts.
--
-- Renumbered from the build doc's placeholder "0260/0261" — both of those
-- numbers are already taken in this repo (0260_increment_ministry_usage_fn,
-- 0261_background_music_ministry_usage). Latest migration at the time this
-- was written is 0272, so this is 0273.
--
-- Tenancy: uses is_group_member()/is_group_admin() from
-- 0150_rls_hardening_phase4.sql (ministry_group_members + ministry_groups
-- owner/leader — the canonical membership tables per that migration's own
-- note). NOT the older ministry_members table.
--
-- Mutation model: translation_sessions, translation_logs,
-- translation_bot_instances, translation_devices, translation_device_tokens
-- and translation_device_commands are SELECT-only under RLS for
-- authenticated users — every write goes through a SECURITY DEFINER RPC
-- below (register_translation_device, start_bot_session, device_insert_log,
-- etc.), which runs as the function owner and bypasses RLS. This isn't
-- just belt-and-braces: several of these writes have a side effect
-- (pg_notify to the bot service, bcrypt hashing a key) that a raw
-- PostgREST insert/update would silently skip. translation_services and
-- language_configs have no such side effects, so those two keep a normal
-- admin-write RLS policy alongside their own RPCs for the sensitive
-- columns (pin_hash).
--
-- Public /display access: translation_sessions and translation_logs also
-- carry an anon-readable policy gated on language_configs.is_public. This
-- matches the build plan's stated model — the session UUID in the
-- /display/:sessionId URL is the real access control for PUBLIC sessions,
-- same as a Zoom link. For PRIVATE sessions (is_public = false) this
-- migration deliberately returns zero rows to anon — verify_display_pin()
-- below only gates the *UI*, it does not yet mint any credential that
-- would let an anon client read the row. That means "private" fully
-- blocks reads (safe) but a verified visitor cannot see live data either
-- until Phase 2 wires a real mechanism (e.g. a short-lived signed token
-- returned by verify_display_pin). Fine for Phase 1 — no live data exists
-- yet — but flag it before Phase 2 ships /display for real.
-- =====================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.translation_services (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  name        text not null,
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create index if not exists idx_translation_services_ministry_id
  on public.translation_services (ministry_id);

create table if not exists public.translation_sessions (
  id                  uuid primary key default gen_random_uuid(),
  ministry_id         uuid not null references public.ministry_groups(id) on delete cascade,
  service_id          uuid references public.translation_services(id) on delete set null,
  -- Which pipeline produced this session. Set explicitly by the RPC that
  -- creates the row (start_bot_session -> 'livekit_room'; the Phase 4 edge
  -- agent path -> 'pa_mixer') — no default, both pipelines always know
  -- which one they are.
  source_type         text not null check (source_type in ('livekit_room', 'pa_mixer')),
  livekit_room_name   text,
  bot_participant_id  text,
  source_language     text not null,
  target_language     text not null,
  -- LiveKit participant identity the bot should subscribe to for THIS
  -- session; language_configs.speaker_identity is only the ministry-wide
  -- default that seeds this at session start.
  speaker_identity    text,
  status              text not null default 'initialising'
                        check (status in ('initialising', 'joining', 'active', 'paused', 'ended', 'error')),
  hls_stream_url      text,
  error_message       text,
  started_at          timestamptz,
  ended_at            timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id)
);

create index if not exists idx_translation_sessions_ministry_id
  on public.translation_sessions (ministry_id);
create index if not exists idx_translation_sessions_service_id
  on public.translation_sessions (service_id);
create index if not exists idx_translation_sessions_status
  on public.translation_sessions (status);

create table if not exists public.translation_logs (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.translation_sessions(id) on delete cascade,
  -- Denormalized from session_id, set by device_insert_log() only — there
  -- is no direct-insert path for this table, so no sync trigger is needed
  -- (compare ministry_volunteer_assignments in 0254, which does allow
  -- direct client inserts and therefore needs one).
  ministry_id       uuid not null references public.ministry_groups(id) on delete cascade,
  source_text       text not null,
  translated_text   text not null,
  stt_ms            integer,
  translate_ms      integer,
  tts_ms            integer,
  created_at        timestamptz not null default now()
);

create index if not exists idx_translation_logs_session_id
  on public.translation_logs (session_id);
create index if not exists idx_translation_logs_ministry_id
  on public.translation_logs (ministry_id);
create index if not exists idx_translation_logs_created_at
  on public.translation_logs (created_at);

create table if not exists public.translation_bot_instances (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.translation_sessions(id) on delete cascade,
  ministry_id   uuid not null references public.ministry_groups(id) on delete cascade,
  bot_server_id text,
  status        text not null default 'idle'
                  check (status in ('idle', 'joining', 'active', 'stopped', 'error')),
  started_at    timestamptz,
  ended_at      timestamptz,
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_translation_bot_instances_session_id
  on public.translation_bot_instances (session_id);
create index if not exists idx_translation_bot_instances_ministry_id
  on public.translation_bot_instances (ministry_id);
create index if not exists idx_translation_bot_instances_status
  on public.translation_bot_instances (status);

-- Idle until Phase 4 (edge agent). device_key is never stored raw — only
-- its bcrypt hash, plus a short indexed key_id prefix so authenticate_device
-- can look a device up without a full-table bcrypt scan (bcrypt hashes
-- can't be indexed/compared with equality on their own).
create table if not exists public.translation_devices (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references public.ministry_groups(id) on delete cascade,
  name            text not null,
  device_key_id   text not null unique,
  device_key_hash text not null,
  status          text not null default 'active' check (status in ('active', 'revoked')),
  firmware        text,
  last_ping       timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  revoked_at      timestamptz
);

create index if not exists idx_translation_devices_ministry_id
  on public.translation_devices (ministry_id);

-- Idle until Phase 4. Bearer tokens are stored as a sha256 hash (fast,
-- indexable equality lookup) — deliberately NOT bcrypt like device_key_hash,
-- since these are already high-entropy random tokens, not passwords, and
-- device_heartbeat/device_insert_log need an efficient lookup on every call.
create table if not exists public.translation_device_tokens (
  id         uuid primary key default gen_random_uuid(),
  device_id  uuid not null references public.translation_devices(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_translation_device_tokens_token_hash
  on public.translation_device_tokens (token_hash);
create index if not exists idx_translation_device_tokens_device_id
  on public.translation_device_tokens (device_id);

-- Idle until Phase 4.
create table if not exists public.translation_device_commands (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references public.translation_devices(id) on delete cascade,
  session_id      uuid references public.translation_sessions(id) on delete cascade,
  command         text not null check (command in ('start', 'stop', 'pause', 'ping')),
  status          text not null default 'pending' check (status in ('pending', 'acknowledged')),
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index if not exists idx_translation_device_commands_device_id
  on public.translation_device_commands (device_id);
create index if not exists idx_translation_device_commands_session_id
  on public.translation_device_commands (session_id);

create table if not exists public.language_configs (
  ministry_id                 uuid primary key references public.ministry_groups(id) on delete cascade,
  source_language             text not null default 'en',
  target_language             text,
  supported_target_languages  text[] not null default '{}',
  elevenlabs_voice_id         text,
  bot_enabled                 boolean not null default false,
  is_public                   boolean not null default true,
  pin_hash                    text,
  speaker_identity            text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.translation_services enable row level security;

create policy p_translation_services_member_sel on public.translation_services
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

create policy p_translation_services_admin_all on public.translation_services
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

alter table public.translation_sessions enable row level security;

create policy p_translation_sessions_member_sel on public.translation_sessions
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- Public /display access — see the header comment for the threat model.
-- NOT EXISTS(...is_public = false), not EXISTS(...is_public = true): a
-- ministry that hasn't saved language_configs yet has no row at all, and
-- must still default to public (matches "new ministries default to
-- Public" elsewhere in the build plan) — EXISTS(is_public = true) would
-- get that backwards and lock out every brand-new ministry's /display.
create policy p_translation_sessions_public_sel on public.translation_sessions
  for select to anon, authenticated
  using (
    not exists (
      select 1 from public.language_configs lc
      where lc.ministry_id = translation_sessions.ministry_id
        and lc.is_public = false
    )
  );

alter table public.translation_logs enable row level security;

create policy p_translation_logs_member_sel on public.translation_logs
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- Same NOT EXISTS(...is_public = false) shape as the sessions policy above,
-- and for the same reason: default open until a ministry explicitly opts
-- into private.
create policy p_translation_logs_public_sel on public.translation_logs
  for select to anon, authenticated
  using (
    not exists (
      select 1 from public.language_configs lc
      where lc.ministry_id = translation_logs.ministry_id
        and lc.is_public = false
    )
  );

alter table public.translation_bot_instances enable row level security;

create policy p_translation_bot_instances_member_sel on public.translation_bot_instances
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

alter table public.translation_devices enable row level security;

create policy p_translation_devices_member_sel on public.translation_devices
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- translation_device_tokens: RLS enabled, intentionally ZERO policies.
-- Nothing but a SECURITY DEFINER function (running as owner, bypasses RLS)
-- ever touches this table. Even ministry admins get no direct access —
-- there's no legitimate reason for a dashboard query to read a token hash.
alter table public.translation_device_tokens enable row level security;

alter table public.translation_device_commands enable row level security;

create policy p_translation_device_commands_member_sel on public.translation_device_commands
  for select to authenticated
  using (
    exists (
      select 1 from public.translation_devices d
      where d.id = translation_device_commands.device_id
        and public.is_group_member(d.ministry_id, auth.uid())
    )
  );

alter table public.language_configs enable row level security;

create policy p_language_configs_member_sel on public.language_configs
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- No admin_all policy here on purpose — see header comment. All writes
-- (including pin_hash) go through upsert_language_config()/set_display_pin()
-- below so pin_hash can never be set to plaintext via a raw PostgREST call.

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.translation_logs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.translation_sessions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.translation_device_commands;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.translation_bot_instances;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Internal helper (not granted to anon/authenticated — only called from
-- inside the SECURITY DEFINER functions below, which run as owner).
-- ---------------------------------------------------------------------

create or replace function public._translation_device_from_token(p_token text)
returns table (device_id uuid, ministry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select d.id, d.ministry_id
    from public.translation_device_tokens t
    join public.translation_devices d on d.id = t.device_id
    where t.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and t.expires_at > now()
      and d.status = 'active';
end;
$$;

-- ---------------------------------------------------------------------
-- 1.2 Device key auth RPCs (idle until Phase 4)
-- ---------------------------------------------------------------------

create or replace function public.register_translation_device(
  p_ministry_id uuid,
  p_name        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_id    text;
  v_secret    text;
  v_raw_key   text;
  v_device_id uuid;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to register a translation device for this ministry';
  end if;

  v_key_id  := encode(gen_random_bytes(6), 'hex');
  v_secret  := encode(gen_random_bytes(24), 'hex');
  v_raw_key := 'rlt_' || v_key_id || '_' || v_secret;

  insert into public.translation_devices (ministry_id, name, device_key_id, device_key_hash, created_by)
  values (p_ministry_id, p_name, v_key_id, crypt(v_secret, gen_salt('bf')), auth.uid())
  returning id into v_device_id;

  -- Raw key is returned exactly once. Only the bcrypt hash is ever stored.
  return jsonb_build_object('device_id', v_device_id, 'device_key', v_raw_key);
end;
$$;

grant execute on function public.register_translation_device(uuid, text) to authenticated;

create or replace function public.authenticate_device(p_device_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_id  text;
  v_secret  text;
  v_device  record;
  v_token   text;
  v_expires timestamptz;
begin
  if p_device_key is null or split_part(p_device_key, '_', 1) <> 'rlt' then
    raise exception 'Invalid device key';
  end if;

  v_key_id := split_part(p_device_key, '_', 2);
  v_secret := split_part(p_device_key, '_', 3);

  select * into v_device
  from public.translation_devices
  where device_key_id = v_key_id and status = 'active';

  if not found or crypt(v_secret, v_device.device_key_hash) <> v_device.device_key_hash then
    raise exception 'Invalid or revoked device key';
  end if;

  v_token   := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '24 hours';

  insert into public.translation_device_tokens (device_id, token_hash, expires_at)
  values (v_device.id, encode(digest(v_token, 'sha256'), 'hex'), v_expires);

  update public.translation_devices set last_ping = now() where id = v_device.id;

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'device_id', v_device.id,
    'ministry_id', v_device.ministry_id
  );
end;
$$;

grant execute on function public.authenticate_device(text) to anon, authenticated, service_role;

create or replace function public.device_heartbeat(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  select device_id into v_device_id from public._translation_device_from_token(p_token);
  if v_device_id is null then
    raise exception 'Invalid or expired device token';
  end if;

  update public.translation_device_tokens
    set expires_at = now() + interval '24 hours'
    where device_id = v_device_id
      and token_hash = encode(digest(p_token, 'sha256'), 'hex');

  update public.translation_devices set last_ping = now() where id = v_device_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.device_heartbeat(text) to anon, authenticated, service_role;

-- Reused by both pipelines: edge agent passes p_token (Phase 4); the bot
-- service calls this with its Supabase service-role key and no token at
-- all (auth.role() = 'service_role' short-circuits the token check).
create or replace function public.device_update_session(
  p_session_id      uuid,
  p_status          text default null,
  p_hls_stream_url  text default null,
  p_error_message   text default null,
  p_token           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id       uuid;
  v_device_ministry uuid;
  v_session_ministry uuid;
begin
  select ministry_id into v_session_ministry
    from public.translation_sessions where id = p_session_id;
  if v_session_ministry is null then
    raise exception 'Unknown translation session';
  end if;

  if auth.role() <> 'service_role' then
    select device_id, ministry_id into v_device_id, v_device_ministry
      from public._translation_device_from_token(p_token);
    if v_device_id is null then
      raise exception 'Invalid or expired device token';
    end if;
    if v_device_ministry <> v_session_ministry then
      raise exception 'Device is not authorized for this session';
    end if;
  end if;

  update public.translation_sessions
    set status          = coalesce(p_status, status),
        hls_stream_url  = coalesce(p_hls_stream_url, hls_stream_url),
        error_message   = coalesce(p_error_message, error_message),
        started_at      = case when p_status = 'active' and started_at is null then now() else started_at end,
        ended_at        = case when p_status = 'ended' then now() else ended_at end
    where id = p_session_id;
end;
$$;

grant execute on function public.device_update_session(uuid, text, text, text, text) to anon, authenticated, service_role;

-- Reused by both pipelines, same dual-auth shape as device_update_session.
create or replace function public.device_insert_log(
  p_session_id       uuid,
  p_source_text      text,
  p_translated_text  text,
  p_stt_ms           integer default null,
  p_translate_ms     integer default null,
  p_tts_ms           integer default null,
  p_token            text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id        uuid;
  v_device_ministry  uuid;
  v_session_ministry uuid;
  v_log_id           uuid;
begin
  select ministry_id into v_session_ministry
    from public.translation_sessions where id = p_session_id;
  if v_session_ministry is null then
    raise exception 'Unknown translation session';
  end if;

  if auth.role() <> 'service_role' then
    select device_id, ministry_id into v_device_id, v_device_ministry
      from public._translation_device_from_token(p_token);
    if v_device_id is null then
      raise exception 'Invalid or expired device token';
    end if;
    if v_device_ministry <> v_session_ministry then
      raise exception 'Device is not authorized for this session';
    end if;
  end if;

  insert into public.translation_logs (session_id, ministry_id, source_text, translated_text, stt_ms, translate_ms, tts_ms)
  values (p_session_id, v_session_ministry, p_source_text, p_translated_text, p_stt_ms, p_translate_ms, p_tts_ms)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.device_insert_log(uuid, text, text, integer, integer, integer, text) to anon, authenticated, service_role;

create or replace function public.device_ack_command(p_token text, p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  select device_id into v_device_id from public._translation_device_from_token(p_token);
  if v_device_id is null then
    raise exception 'Invalid or expired device token';
  end if;

  update public.translation_device_commands
    set status = 'acknowledged', acknowledged_at = now()
    where id = p_command_id and device_id = v_device_id;
end;
$$;

grant execute on function public.device_ack_command(text, uuid) to anon, authenticated, service_role;

create or replace function public.revoke_translation_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
begin
  select ministry_id into v_ministry_id from public.translation_devices where id = p_device_id;
  if v_ministry_id is null then
    raise exception 'Unknown device';
  end if;
  if auth.uid() is null or not public.is_group_admin(v_ministry_id, auth.uid()) then
    raise exception 'Not authorized to revoke this device';
  end if;

  update public.translation_devices
    set status = 'revoked', revoked_at = now()
    where id = p_device_id;

  -- Cascades immediately: delete any live tokens so the key stops working
  -- right away rather than waiting out its 24h expiry.
  delete from public.translation_device_tokens where device_id = p_device_id;
end;
$$;

grant execute on function public.revoke_translation_device(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1.3 Bot session RPCs (used from Phase 2)
-- ---------------------------------------------------------------------

create or replace function public.start_bot_session(
  p_ministry_id       uuid,
  p_room_name         text,
  p_source_language   text,
  p_target_language   text,
  p_speaker_identity  text default null,
  p_service_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to start a translation session for this ministry';
  end if;

  insert into public.translation_sessions (
    ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status, created_by
  )
  values (
    p_ministry_id, p_service_id, 'livekit_room', p_room_name,
    p_source_language, p_target_language, p_speaker_identity, 'initialising', auth.uid()
  )
  returning id into v_session_id;

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', p_ministry_id,
    'room_name', p_room_name,
    'source_language', p_source_language,
    'target_language', p_target_language,
    'speaker_identity', p_speaker_identity
  )::text);

  return jsonb_build_object('session_id', v_session_id);
end;
$$;

grant execute on function public.start_bot_session(uuid, text, text, text, text, uuid) to authenticated;

create or replace function public.stop_bot_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
begin
  select ministry_id into v_ministry_id from public.translation_sessions where id = p_session_id;
  if v_ministry_id is null then
    raise exception 'Unknown translation session';
  end if;
  if auth.uid() is null or not public.is_group_admin(v_ministry_id, auth.uid()) then
    raise exception 'Not authorized to stop this session';
  end if;

  update public.translation_sessions
    set status = 'ended', ended_at = now()
    where id = p_session_id;

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'stop',
    'session_id', p_session_id
  )::text);
end;
$$;

grant execute on function public.stop_bot_session(uuid) to authenticated;

-- p_pin default null so the /display route can call verify_display_pin(id)
-- with no pin yet, just to learn whether a PIN screen needs to be shown at
-- all (returns true immediately for public sessions).
create or replace function public.verify_display_pin(p_session_id uuid, p_pin text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
  v_pin_hash    text;
  v_is_public   boolean;
begin
  select ministry_id into v_ministry_id from public.translation_sessions where id = p_session_id;
  if v_ministry_id is null then
    return false;
  end if;

  select is_public, pin_hash into v_is_public, v_pin_hash
    from public.language_configs where ministry_id = v_ministry_id;

  if coalesce(v_is_public, true) then
    return true;
  end if;

  if v_pin_hash is null or p_pin is null then
    return false;
  end if;

  return crypt(p_pin, v_pin_hash) = v_pin_hash;
end;
$$;

grant execute on function public.verify_display_pin(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Settings writes — kept out of language_configs' RLS entirely (see
-- header comment) so pin_hash can never be set to plaintext via a raw
-- PostgREST request.
-- ---------------------------------------------------------------------

create or replace function public.set_display_pin(p_ministry_id uuid, p_pin text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to set the display PIN for this ministry';
  end if;

  insert into public.language_configs (ministry_id, pin_hash, updated_at)
  values (
    p_ministry_id,
    case when p_pin is null or p_pin = '' then null else crypt(p_pin, gen_salt('bf')) end,
    now()
  )
  on conflict (ministry_id) do update
    set pin_hash   = excluded.pin_hash,
        updated_at = now();
end;
$$;

grant execute on function public.set_display_pin(uuid, text) to authenticated;

create or replace function public.upsert_language_config(
  p_ministry_id                  uuid,
  p_source_language              text default null,
  p_target_language              text default null,
  p_supported_target_languages   text[] default null,
  p_elevenlabs_voice_id          text default null,
  p_bot_enabled                  boolean default null,
  p_is_public                    boolean default null,
  p_speaker_identity             text default null
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
    elevenlabs_voice_id, bot_enabled, is_public, speaker_identity, updated_at
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
        updated_at                  = now();
end;
$$;

grant execute on function public.upsert_language_config(uuid, text, text, text[], text, boolean, boolean, text) to authenticated;

commit;
