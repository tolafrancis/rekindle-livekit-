-- 0283_update_custom_voice.sql
-- =====================================================================
-- RLT Phase 3 (docs/rlt-voice-cloning-plan.md): replace/re-record an
-- existing cloned voice's sample, instead of the only option being
-- clone-a-new-one + delete-the-old-one. Confirmed against the TTS
-- provider's own "edit voice" endpoint: it keeps the same external
-- voice_id in place when new samples are submitted, so every language
-- currently assigned to this voice (translation_voices) stays correctly
-- assigned — nothing to clear/reassign, unlike a delete.
-- =====================================================================

begin;

create or replace function public.update_custom_voice(
  p_id           uuid,
  p_label        text default null,
  p_sample_path  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry_id uuid;
begin
  select ministry_id into v_ministry_id from public.translation_custom_voices where id = p_id;
  if v_ministry_id is null then
    raise exception 'Unknown custom voice';
  end if;
  if auth.uid() is null or not public.is_group_admin(v_ministry_id, auth.uid()) then
    raise exception 'Not authorized to edit this custom voice';
  end if;

  update public.translation_custom_voices
    set label       = coalesce(p_label, label),
        sample_path = coalesce(p_sample_path, sample_path)
    where id = p_id;
end;
$$;

grant execute on function public.update_custom_voice(uuid, text, text) to authenticated;

commit;
