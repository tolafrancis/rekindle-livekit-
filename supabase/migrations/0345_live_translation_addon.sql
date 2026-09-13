-- 0345_live_translation_addon.sql
-- =====================================================================
-- Live Translation billing, decision reversal (2026-09-13, same day as
-- 0343/0344): NOT tier-bundled after all. Analysis showed the Phase 1
-- included-hours allotments (scaled proportionally to meeting_hours_included)
-- could already exceed a tier's own price in raw AI cost alone (e.g.
-- Starter's 3h included ≈ $10.02 raw cost against a $10/mo plan) --
-- meeting/broadcast hours are cheap self-hosted LiveKit infra, translation
-- is real, expensive third-party API metering (Deepgram/GPT-5/ElevenLabs),
-- the wrong reference point to scale from.
--
-- Decided instead: a standalone add-on, same shape as the existing
-- storage_pack/member_block/gift_aid add-ons (flat recurring purchase of a
-- fixed hours block, not real-time metered overage -- that's still a
-- separate, unbuilt "Phase 2" if ever wanted, see the
-- project-live-translation-billing-phase2 memory). Chosen specifically to
-- reuse ministry_addon_catalog/ministry_addons/purchase-addon as-is rather
-- than building a whole separate subscription flow (WhatsApp's shape) --
-- "displayed as addons in billing" was the explicit ask.
--
-- Real constraint inherited from the existing add-on mechanism, not
-- introduced here: purchase-addon's Stripe path attaches the add-on as a
-- subscription item on the ministry's EXISTING subscription (see that
-- function's "Subscribe to a Ministry Partner plan with a card before
-- buying add-ons" check) -- so this isn't purchasable by a ministry with
-- zero paid plan at all. "Decoupled from tier" means not bundled into a
-- SPECIFIC tier's price / not gated to a specific tier, not "works with no
-- subscription whatsoever" -- that would need a bigger change (a dedicated
-- subscription flow, closer to WhatsApp's shape) if ever wanted.
--
-- ministry_has_active_translation_plan() now checks for the add-on
-- specifically, not just "any active plan" -- a paid ministry that hasn't
-- bought this add-on no longer gets free translation just for being on a
-- paid tier, which was the whole point of moving off the tier-bundled
-- model. ministry_partner_plans.translation_hours_included (0343) is now
-- vestigial -- not dropped here (no code path still enforces it, safe to
-- leave), but should be removed in a later cleanup migration.
-- =====================================================================

begin;

-- ── Schema: widen both add-on tables for the new type + hours unit ──────

alter table public.ministry_addon_catalog drop constraint if exists ministry_addon_catalog_addon_type_check;
alter table public.ministry_addon_catalog
  add constraint ministry_addon_catalog_addon_type_check
  check (addon_type in ('storage_pack', 'member_block', 'gift_aid', 'live_translation'));
alter table public.ministry_addon_catalog add column if not exists unit_hours integer;

alter table public.ministry_addons drop constraint if exists ministry_addons_addon_type_check;
alter table public.ministry_addons
  add constraint ministry_addons_addon_type_check
  check (addon_type in ('storage_pack', 'member_block', 'gift_aid', 'live_translation'));
alter table public.ministry_addons add column if not exists unit_hours integer;

-- Starter catalog packages -- $6.99/hr baseline (this session's agreed
-- overage rate, ~2x Rekindle AI's real cost, ~3.2x Realtime Live's — that
-- engine is currently paused, see GeminiLiveEngine.ts), rounded to clean
-- price points. Purely a starting point: admin-editable via this same
-- table like every other add-on, not hardcoded anywhere in application code.
insert into public.ministry_addon_catalog (addon_type, label, unit_hours, price_usd, is_active, display_order)
values
  ('live_translation', 'Live Translation — 5 hours/month', 5, 35, true, 100),
  ('live_translation', 'Live Translation — 15 hours/month', 15, 100, true, 101),
  ('live_translation', 'Live Translation — 40 hours/month', 40, 260, true, 102)
on conflict do nothing;

-- ── Real usage vs. hours actually purchased (add-on based, not tier) ────

create or replace function public.get_ministry_translation_hours_purchased(p_ministry_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity * unit_hours), 0)
  from public.ministry_addons
  where ministry_id = p_ministry_id
    and addon_type = 'live_translation'
    and status = 'active';
$$;

grant execute on function public.get_ministry_translation_hours_purchased(uuid) to authenticated;

-- ── Gate: requires the add-on itself, not just "any active paid plan" ───

create or replace function public.ministry_has_active_translation_plan(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ministry_addons
    where ministry_id = p_ministry_id
      and addon_type = 'live_translation'
      and status = 'active'
  );
$$;

grant execute on function public.ministry_has_active_translation_plan(uuid) to authenticated;

-- Both callers' error message said "requires a paid ministry plan" (0343's
-- original tier-bundled wording) -- now inaccurate, since a ministry can be
-- on any paid tier and still lack the add-on. Re-declaring both with the
-- corrected message only; logic is otherwise identical to 0344.
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
    raise exception 'Live Translation requires the Live Translation add-on. Buy hours in Billing settings to use this feature.';
  end if;
  if p_source_language is null or p_target_language is null then
    raise exception 'source_language and target_language are required';
  end if;
  if p_engine not in ('rekindle_ai', 'realtime_live', 'auto') then
    raise exception 'Invalid engine: %', p_engine;
  end if;

  v_engine := case when p_engine = 'auto' then 'rekindle_ai' else p_engine end;

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
    raise exception 'Live Translation requires the Live Translation add-on. Buy hours in Billing settings to use this feature.';
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
