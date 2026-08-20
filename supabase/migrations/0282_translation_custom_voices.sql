-- 0282_translation_custom_voices.sql
-- =====================================================================
-- RLT Phase 2 (docs/rlt-voice-cloning-plan.md): voice cloning. Cloning is
-- just a different way of obtaining a voice_id — Phase 1's
-- translation_voices table and picker are reused completely unchanged
-- once a clone exists. What THIS migration adds is the missing piece:
-- where a ministry's own cloned voices are tracked (separately from
-- simply being ASSIGNED to a language), so they can be listed and
-- deleted independent of whatever they're currently assigned to, and so
-- other ministries sharing the same TTS provider account never see them.
--
-- Consent: handled outside the app entirely (explicit product decision,
-- 2026-08-21) — this migration does not add any consent-capture columns
-- or flow. It DOES still scope cloned voices to the ministry that created
-- them, since letting every tenant on a shared TTS account freely use a
-- voice cloned under a DIFFERENT ministry's (external) consent process
-- would undermine that consent regardless of how it was obtained.
-- =====================================================================

begin;

create table if not exists public.translation_custom_voices (
  id                uuid primary key default gen_random_uuid(),
  ministry_id       uuid not null references public.ministry_groups(id) on delete cascade,
  provider          text not null default 'elevenlabs',
  external_voice_id text not null,
  label             text not null,
  -- Storage object path the sample was uploaded to (translation-voice-
  -- samples bucket below) — kept for reference/re-cloning, not read by
  -- the live pipeline.
  sample_path       text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id)
);

create index if not exists idx_translation_custom_voices_ministry_id
  on public.translation_custom_voices (ministry_id);

alter table public.translation_custom_voices enable row level security;

create policy p_translation_custom_voices_member_sel on public.translation_custom_voices
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- No admin_all policy — writes go through the RPCs below / the cloning
-- Edge Function (which needs to make an external HTTP call to the
-- provider before/after touching this table, so full create/delete can't
-- be a pure SQL RPC on their own).

create or replace function public.create_custom_voice(
  p_ministry_id       uuid,
  p_external_voice_id text,
  p_label             text,
  p_sample_path       text default null,
  p_provider          text default 'elevenlabs'
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
    ministry_id, provider, external_voice_id, label, sample_path, created_by
  )
  values (
    p_ministry_id, coalesce(p_provider, 'elevenlabs'), p_external_voice_id,
    coalesce(p_label, 'Custom voice'), p_sample_path, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_custom_voice(uuid, text, text, text, text) to authenticated;

-- Row-only delete — the calling Edge Function deletes from the TTS
-- provider itself (an external HTTP call, so it can't happen inside a
-- SQL function) before calling this.
create or replace function public.delete_custom_voice_row(p_id uuid)
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
    raise exception 'Not authorized to delete this custom voice';
  end if;

  delete from public.translation_custom_voices where id = p_id;
end;
$$;

grant execute on function public.delete_custom_voice_row(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: where an uploaded sample lands before the cloning Edge
-- Function reads it and forwards it to the TTS provider.
-- ---------------------------------------------------------------------

-- PRIVATE — a voice sample is a personal audio recording, not public
-- content. No SELECT policy at all for authenticated/anon (below) — only
-- the cloning Edge Function's service-role client ever reads it back;
-- there's no product need to play the raw sample after the fact (the
-- resulting cloned voice IS the thing to preview, via the normal picker).
insert into storage.buckets (id, name, public)
values ('translation-voice-samples', 'translation-voice-samples', false)
on conflict (id) do nothing;

-- Path convention: {ministry_id}/{uuid}.{ext} — storage.foldername(name)
-- splits the object path into segments, [1] being the ministry_id one.
drop policy if exists "translation voice samples admin upload" on storage.objects;
create policy "translation voice samples admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'translation-voice-samples'
    and public.is_group_admin((storage.foldername(name))[1]::uuid, auth.uid())
  );

commit;
