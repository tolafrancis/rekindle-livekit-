-- =====================================================================
-- Live Translation usage & cost tracking
--
-- The bot pipeline (Deepgram STT -> GPT-5 translate -> ElevenLabs TTS,
-- rekindle-translation-bot's AudioPipeline.ts) had zero usage
-- instrumentation — no character/token/audio-duration counts were ever
-- captured, so there was no way to know what a session actually cost to
-- run against any of the three providers, only what ReKindle charges
-- ministries for translation hours (ministry_addon_catalog/ministry_addons
-- — a completely separate, decoupled number).
--
-- This adds raw usage columns (tokens/characters/audio-seconds — cheap,
-- harmless to expose on the same tables that are already publicly
-- readable for /display), a small admin-editable provider-rate table, and
-- an admin-only RPC that turns usage into an actual dollar figure. Rates
-- are seeded at 0 deliberately — real per-provider pricing depends on your
-- actual plan/tier with each vendor and changes over time; a guessed
-- number presented as a real cost would be worse than an honest $0 until
-- you fill in your real rates (see the UPDATE statement at the bottom of
-- this file's comment for how).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Raw usage columns — per-utterance (translation_logs) and per-session
--    (translation_sessions, since Deepgram bills by streamed connection
--    duration, not per utterance).
-- ---------------------------------------------------------------------
alter table translation_logs
  add column if not exists translate_input_tokens integer,
  add column if not exists translate_output_tokens integer,
  add column if not exists tts_characters integer;

alter table translation_sessions
  add column if not exists stt_audio_seconds numeric;

-- ---------------------------------------------------------------------
-- 2. Provider rate table — what YOU pay each vendor, not what you charge
--    ministries. Seeded at 0; update with your real rates, e.g.:
--      update translation_provider_rates set rate_usd = 0.0000167
--        where provider = 'elevenlabs' and unit = 'character';
--    Admin-only (platform admin via is_content_admin, matching the
--    helper already used on ministry_groups' own SELECT policy) — this
--    is internal cost config, not ministry-facing data.
-- ---------------------------------------------------------------------
create table if not exists translation_provider_rates (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  unit text not null,
  rate_usd numeric not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  unique (provider, unit)
);

insert into translation_provider_rates (provider, unit, rate_usd, notes)
values
  ('deepgram', 'audio_second', 0, 'Nova-2/Nova-3 streaming STT — placeholder, set to your actual $/min plan rate divided by 60'),
  ('openai_translate', 'token_input', 0, 'gpt-5 translate call, prompt tokens — placeholder, set to your actual $/1M input tokens divided by 1,000,000'),
  ('openai_translate', 'token_output', 0, 'gpt-5 translate call, completion tokens — placeholder, set to your actual $/1M output tokens divided by 1,000,000'),
  ('elevenlabs', 'character', 0, 'Turbo v2.5 TTS — placeholder, set to your actual plan''s $/character rate')
on conflict (provider, unit) do nothing;

alter table translation_provider_rates enable row level security;

drop policy if exists p_translation_provider_rates_admin_all on translation_provider_rates;
create policy p_translation_provider_rates_admin_all on translation_provider_rates
  for all
  using (is_content_admin(auth.uid()))
  with check (is_content_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3. device_insert_log — new overload accepting the three usage fields,
--    following this function's existing pattern of adding a new overload
--    per migration rather than changing an existing signature (0273,
--    0369, 0370 all did this the same way).
-- ---------------------------------------------------------------------
create or replace function public.device_insert_log(
  p_session_id uuid,
  p_source_text text,
  p_translated_text text,
  p_stt_ms integer default null,
  p_translate_ms integer default null,
  p_tts_ms integer default null,
  p_token text default null,
  p_speaker_name text default null,
  p_pipeline_latency_ms integer default null,
  p_translate_input_tokens integer default null,
  p_translate_output_tokens integer default null,
  p_tts_characters integer default null
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

  insert into public.translation_logs (
    session_id, ministry_id, source_text, translated_text, stt_ms, translate_ms, tts_ms,
    speaker_name, pipeline_latency_ms, translate_input_tokens, translate_output_tokens, tts_characters
  )
  values (
    p_session_id, v_session_ministry, p_source_text, p_translated_text, p_stt_ms, p_translate_ms, p_tts_ms,
    p_speaker_name, p_pipeline_latency_ms, p_translate_input_tokens, p_translate_output_tokens, p_tts_characters
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. device_update_stt_usage — sets the session-total audio-seconds sent
--    to Deepgram. Same auth shape as device_update_session/device_insert_log.
-- ---------------------------------------------------------------------
create or replace function public.device_update_stt_usage(
  p_session_id uuid,
  p_stt_audio_seconds numeric,
  p_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id        uuid;
  v_device_ministry  uuid;
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
    set stt_audio_seconds = p_stt_audio_seconds
    where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. get_translation_usage_report — admin-only aggregate: hours, languages,
--    usage, and $ cost (computed live from translation_provider_rates, so
--    updating a rate immediately changes future report output without a
--    backfill). Grouped per session so a caller can further roll it up by
--    ministry/day/language/whatever it needs.
-- ---------------------------------------------------------------------
create or replace function public.get_translation_usage_report(
  p_ministry_id uuid default null,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
)
returns table (
  session_id uuid,
  ministry_id uuid,
  source_language text,
  target_language text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_hours numeric,
  stt_audio_seconds numeric,
  stt_cost_usd numeric,
  translate_input_tokens bigint,
  translate_output_tokens bigint,
  translate_cost_usd numeric,
  tts_characters bigint,
  tts_cost_usd numeric,
  total_cost_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_content_admin(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    s.id,
    s.ministry_id,
    s.source_language,
    s.target_language,
    s.started_at,
    s.ended_at,
    round(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 3600.0, 2) as duration_hours,
    s.stt_audio_seconds,
    round(coalesce(s.stt_audio_seconds, 0) * coalesce(
      (select rate_usd from translation_provider_rates where provider = 'deepgram' and unit = 'audio_second'), 0
    ), 4) as stt_cost_usd,
    coalesce(sum(l.translate_input_tokens), 0)::bigint as translate_input_tokens,
    coalesce(sum(l.translate_output_tokens), 0)::bigint as translate_output_tokens,
    round(
      coalesce(sum(l.translate_input_tokens), 0) * coalesce(
        (select rate_usd from translation_provider_rates where provider = 'openai_translate' and unit = 'token_input'), 0
      )
      + coalesce(sum(l.translate_output_tokens), 0) * coalesce(
        (select rate_usd from translation_provider_rates where provider = 'openai_translate' and unit = 'token_output'), 0
      ),
    4) as translate_cost_usd,
    coalesce(sum(l.tts_characters), 0)::bigint as tts_characters,
    round(coalesce(sum(l.tts_characters), 0) * coalesce(
      (select rate_usd from translation_provider_rates where provider = 'elevenlabs' and unit = 'character'), 0
    ), 4) as tts_cost_usd,
    round(
      coalesce(s.stt_audio_seconds, 0) * coalesce(
        (select rate_usd from translation_provider_rates where provider = 'deepgram' and unit = 'audio_second'), 0
      )
      + coalesce(sum(l.translate_input_tokens), 0) * coalesce(
        (select rate_usd from translation_provider_rates where provider = 'openai_translate' and unit = 'token_input'), 0
      )
      + coalesce(sum(l.translate_output_tokens), 0) * coalesce(
        (select rate_usd from translation_provider_rates where provider = 'openai_translate' and unit = 'token_output'), 0
      )
      + coalesce(sum(l.tts_characters), 0) * coalesce(
        (select rate_usd from translation_provider_rates where provider = 'elevenlabs' and unit = 'character'), 0
      ),
    4) as total_cost_usd
  from translation_sessions s
  left join translation_logs l on l.session_id = s.id
  where (p_ministry_id is null or s.ministry_id = p_ministry_id)
    and (p_start_date is null or s.started_at >= p_start_date)
    and (p_end_date is null or s.started_at <= p_end_date)
  group by s.id, s.ministry_id, s.source_language, s.target_language, s.started_at, s.ended_at, s.stt_audio_seconds
  order by s.started_at desc;
end;
$$;

commit;
