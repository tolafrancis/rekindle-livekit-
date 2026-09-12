-- 0343_translation_billing_phase1.sql
-- =====================================================================
-- Phase 1 of Live Translation billing (2026-09-13) — schema + paid-plan
-- gate + real usage tracking. Deliberately NOT Stripe metered billing yet
-- (Phase 2/3, not built here) — this phase moves no money, it only stops
-- giving the feature away for free and makes actual usage visible.
--
-- Real AI cost measured this session: ~$3.34/hr (Rekindle AI engine),
-- ~$2.21/hr (Realtime Live engine) — Live Translation had ZERO billing
-- gate before this migration, available to any ministry regardless of
-- plan. Policy decision (explicit, not inferred): paid-plan-only from now
-- on, no free allotment — a real product change removing something free
-- ministries currently have, done on instruction.
--
-- Included hours are scaffolding for Phase 2's overage billing
-- (translation_hours_included is read but not yet enforced past the
-- allotment — Phase 1 only enforces "has SOME paid plan", not the hour
-- count). Values scaled proportionally to each tier's existing
-- meeting_hours_included: starter 3h, growth_partner 10h, ministry_partner
-- 25h, ministry_plus unlimited (null).
--
-- Scope note: the gate below covers start_speaker_session (Speaker Link —
-- always real translation) and start_bot_session ONLY when
-- session_kind = 'translate' (real cross-language translation — Meetings/
-- Live Broadcast/PA "+ Add language", self-service reverse-translate).
-- Deliberately NOT applied to session_kind IN ('captions','notes') —
-- "Show Captions" (same-language, near-zero AI cost: no translate/TTS
-- call at all, see AudioPipeline.ts's sameLanguage branch) and "AI Notes"
-- are different features with their own pricing story, not what was
-- priced in this conversation. Also NOT YET applied to device_start_session
-- (PA edge agent hardware path) — a known, disclosed gap, not an
-- oversight; that file family wasn't reviewed in this pass.
-- =====================================================================

begin;

-- ── Schema ────────────────────────────────────────────────────────────

alter table public.ministry_partner_plans
  add column if not exists translation_hours_included integer; -- null = unlimited

update public.ministry_partner_plans set translation_hours_included = 3  where slug = 'starter';
update public.ministry_partner_plans set translation_hours_included = 10 where slug = 'growth_partner';
update public.ministry_partner_plans set translation_hours_included = 25 where slug = 'ministry_partner';
update public.ministry_partner_plans set translation_hours_included = null where slug = 'ministry_plus'; -- unlimited, matches meeting_hours_included's null convention

-- ── Real usage (actual elapsed time, not a planned-duration proxy) ──────
-- Meetings' free-tier check (checkMinistryMeetingQuota, packages/auth/src/
-- ministryEntitlements.ts) sums duration_minutes — the ALLOTTED length set
-- at creation, not measured time. translation_sessions already has real
-- started_at/ended_at timestamps every session sets (BotSession.ts's
-- start()/end()), so this can be genuinely accurate instead of a proxy.
-- A still-running session (ended_at is null) counts up to now().
create or replace function public.get_ministry_translation_minutes_used(p_ministry_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60), 0)
  from public.translation_sessions
  where ministry_id = p_ministry_id
    and started_at is not null
    and started_at >= date_trunc('month', now());
$$;

grant execute on function public.get_ministry_translation_minutes_used(uuid) to authenticated;

-- ── Paid-plan gate ────────────────────────────────────────────────────

create or replace function public.ministry_has_active_translation_plan(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ministry_subscriptions
    where ministry_id = p_ministry_id
      and status = 'active'
      and plan_type in ('starter', 'growth_partner', 'ministry_partner', 'ministry_plus')
    order by created_at desc
    limit 1
  );
$$;

grant execute on function public.ministry_has_active_translation_plan(uuid) to authenticated;

-- start_speaker_session: every session this creates is a real translation
-- (no session_kind param — always 'translate' by the column default), so
-- the gate applies unconditionally. Also drops the old 4-arg overload from
-- migration 0288 -- 0342 added p_engine as a 5th param via create or
-- replace, which in Postgres creates a SEPARATE overload rather than
-- replacing it (different arg count = different function), leaving both
-- versions callable side by side since 0342. Not a functional bug (callers
-- passing p_engine already resolve to the new one) but worth cleaning up
-- now rather than leaving two versions of this function around.
drop function if exists public.start_speaker_session(uuid, text, text, uuid);

create or replace function public.start_speaker_session(
  p_ministry_id      uuid,
  p_source_language  text,
  p_target_language  text,
  p_service_id       uuid default null,
  p_engine           text default 'rekindle_ai'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_id       uuid := gen_random_uuid();
  v_room_name        text;
  v_raw_token        text;
  v_speaker_identity text;
  v_engine           text;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to start a speaker session for this ministry';
  end if;
  if not public.ministry_has_active_translation_plan(p_ministry_id) then
    raise exception 'Live Translation requires a paid ministry plan. Upgrade in Billing settings to use this feature.';
  end if;
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;
  if p_engine not in ('rekindle_ai', 'realtime_live', 'auto') then
    raise exception 'Invalid engine: %', p_engine;
  end if;

  v_engine := case when p_engine = 'auto' then 'realtime_live' else p_engine end;

  v_room_name        := 'speaker-' || v_session_id::text;
  v_speaker_identity := 'speaker-' || v_session_id::text;
  v_raw_token         := encode(gen_random_bytes(24), 'hex');

  insert into public.translation_sessions (
    id, ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status,
    speaker_token_hash, created_by, engine
  )
  values (
    v_session_id, p_ministry_id, p_service_id, 'browser_speaker', v_room_name,
    p_source_language, p_target_language, v_speaker_identity, 'initialising',
    encode(digest(v_raw_token, 'sha256'), 'hex'), auth.uid(), v_engine
  );

  perform pg_notify('bot_dispatch', jsonb_build_object(
    'action', 'start',
    'session_id', v_session_id,
    'ministry_id', p_ministry_id,
    'room_name', v_room_name,
    'source_language', p_source_language,
    'target_language', p_target_language,
    'speaker_identity', v_speaker_identity,
    'engine', v_engine
  )::text);

  return jsonb_build_object('session_id', v_session_id, 'speaker_token', v_raw_token);
end;
$$;

grant execute on function public.start_speaker_session(uuid, text, text, uuid, text) to authenticated;

-- start_bot_session: gate ONLY session_kind = 'translate' — see this
-- migration's header comment for why captions/notes are excluded.
create or replace function public.start_bot_session(
  p_ministry_id       uuid,
  p_room_name         text,
  p_source_language   text,
  p_target_language   text,
  p_speaker_identity  text default null,
  p_service_id        uuid default null,
  p_session_kind      text default 'translate'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id      uuid;
  v_existing        uuid;
  v_active_count    integer;
  v_is_admin        boolean;
  v_is_self_service boolean;
begin
  if p_session_kind not in ('translate', 'captions', 'notes') then
    raise exception 'Invalid session kind: %', p_session_kind;
  end if;

  v_is_admin := auth.uid() is not null and public.is_group_admin(p_ministry_id, auth.uid());

  v_is_self_service := auth.uid() is not null
    and p_speaker_identity = auth.uid()::text
    and public.is_group_member(p_ministry_id, auth.uid());

  if not (v_is_admin or v_is_self_service) then
    raise exception 'Not authorized to start a translation session for this ministry';
  end if;

  if p_session_kind = 'translate' and not public.ministry_has_active_translation_plan(p_ministry_id) then
    raise exception 'Live Translation requires a paid ministry plan. Upgrade in Billing settings to use this feature.';
  end if;

  if v_is_self_service and not v_is_admin then
    select count(*) into v_active_count
      from public.translation_sessions
      where ministry_id = p_ministry_id
        and status in ('initialising', 'joining', 'active', 'paused');
    if v_active_count >= 5 then
      raise exception 'Too many live translations running for this ministry right now — try again shortly';
    end if;
  end if;

  select id into v_existing
    from public.translation_sessions
    where ministry_id = p_ministry_id
      and livekit_room_name = p_room_name
      and target_language = p_target_language
      and status in ('initialising', 'joining', 'active', 'paused')
    order by created_at desc
    limit 1;

  if v_existing is not null then
    return jsonb_build_object('session_id', v_existing, 'reused', true);
  end if;

  insert into public.translation_sessions (
    ministry_id, service_id, source_type, livekit_room_name,
    source_language, target_language, speaker_identity, status, created_by,
    session_kind
  )
  values (
    p_ministry_id, p_service_id, 'livekit_room', p_room_name,
    p_source_language, p_target_language, p_speaker_identity, 'initialising', auth.uid(),
    p_session_kind
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

  return jsonb_build_object('session_id', v_session_id, 'reused', false);
end;
$$;

grant execute on function public.start_bot_session(uuid, text, text, text, text, uuid, text) to authenticated;

commit;
