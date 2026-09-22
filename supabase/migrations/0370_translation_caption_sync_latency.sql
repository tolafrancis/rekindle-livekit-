-- 0370_translation_caption_sync_latency.sql
-- F-CAP-2 (captions pipeline review, 2026-09-23): HLS-viewer caption timing
-- held every translated caption line back by the live-measured HLS video
-- latency alone (delaySeconds), implicitly assuming the caption TEXT itself
-- had ~zero latency relative to when the words were actually spoken. True
-- for same-language ("Show Captions") sessions, but not for a real
-- translation — AudioPipeline.ts's own STT->translate->TTS relay already
-- measured 2.5-5s+ for the translate step alone, and that time was never
-- accounted for in the client's hold-back math, so translated captions
-- could show up later than they should relative to the (also-delayed) HLS
-- video, depending on how long that particular utterance took to translate.
--
-- Rather than guess a replacement constant (the actual bug this review
-- flagged), this adds a genuinely MEASURED per-utterance value: the bot now
-- times from the real moment each utterance ends (Deepgram's UtteranceEnd
-- event — see AudioPipeline.ts's flushUtteranceBuffer) to the moment its
-- translation_logs row is about to be written, covering STT-to-final +
-- translate + TTS + any queue wait, and stores that as pipeline_latency_ms.
-- The client (TranslationListenerButton.tsx) can then compute an accurate
-- per-line caption delay: video_delay_ms - pipeline_latency_ms, instead of
-- assuming pipeline_latency_ms is always ~0.

begin;

alter table public.translation_logs
  add column if not exists pipeline_latency_ms integer;

comment on column public.translation_logs.pipeline_latency_ms is
  'Milliseconds from the moment the source utterance actually ended (Deepgram UtteranceEnd) to when this row was about to be written — covers STT finalization + translate + TTS + any serial-queue wait. Null for engines/paths that don''t measure it (e.g. GeminiLiveEngine, not yet wired up). Used client-side to hold translated HLS captions back by (video latency - this value) instead of assuming zero pipeline latency.';

-- ── device_insert_log: widen with p_pipeline_latency_ms ─────────────────
-- New param appended at the end (default null) so any caller still on the
-- old 8-arg signature (post-0369) keeps working unchanged.
create or replace function public.device_insert_log(
  p_session_id           uuid,
  p_source_text          text,
  p_translated_text      text,
  p_stt_ms               integer default null,
  p_translate_ms         integer default null,
  p_tts_ms               integer default null,
  p_token                text default null,
  p_speaker_name         text default null,
  p_pipeline_latency_ms  integer default null
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

  insert into public.translation_logs (session_id, ministry_id, source_text, translated_text, stt_ms, translate_ms, tts_ms, speaker_name, pipeline_latency_ms)
  values (p_session_id, v_session_ministry, p_source_text, p_translated_text, p_stt_ms, p_translate_ms, p_tts_ms, p_speaker_name, p_pipeline_latency_ms)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.device_insert_log(uuid, text, text, integer, integer, integer, text, text, integer) to anon, authenticated, service_role;

commit;
