-- 0284_translation_library_voices.sql
-- =====================================================================
-- RLT Phase 3b (docs/rlt-voice-cloning-plan.md, 2026-08-21): voice
-- library search + add-to-account. Real gap found live: the picker's
-- catalog only ever showed voices already in the account's own
-- collection, and that collection had almost no non-English voices —
-- Vietnamese (and most other languages) had nothing to select. The
-- actual fix is a separate Edge Function pair
-- (translation-search-voice-library / translation-add-library-voice);
-- this migration is just the one small schema correction they need.
--
-- create_custom_voice never actually accepted an is_cloned value —
-- every row (Phase 2's real audio-sample clones included) has silently
-- defaulted to false since that migration shipped. Harmless so far
-- (nothing currently reads the column directly — the picker computes
-- its own is_cloned client-side from ministry ownership), but wrong,
-- and about to matter now that TWO different mechanisms
-- (clone-from-sample vs. add-from-library) write into this same table.
-- =====================================================================

begin;

-- Postgres treats a different parameter list as a DIFFERENT function, not
-- a replacement — drop the old 5-arg signature explicitly first so this
-- doesn't leave two overloads (which would make PostgREST's RPC dispatch
-- ambiguous for any caller that doesn't pass p_is_cloned).
drop function if exists public.create_custom_voice(uuid, text, text, text, text);

create or replace function public.create_custom_voice(
  p_ministry_id       uuid,
  p_external_voice_id text,
  p_label             text,
  p_sample_path       text default null,
  p_provider          text default 'elevenlabs',
  p_is_cloned         boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to add a custom voice for this ministry';
  end if;
  if p_external_voice_id is null or p_external_voice_id = '' then
    raise exception 'external_voice_id is required';
  end if;

  insert into public.translation_custom_voices (
    ministry_id, provider, external_voice_id, label, sample_path, is_cloned, created_by
  )
  values (
    p_ministry_id, coalesce(p_provider, 'elevenlabs'), p_external_voice_id,
    coalesce(p_label, 'Custom voice'), p_sample_path, coalesce(p_is_cloned, false), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_custom_voice(uuid, text, text, text, text, boolean) to authenticated;

commit;
