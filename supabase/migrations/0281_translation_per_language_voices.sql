-- 0281_translation_per_language_voices.sql
-- =====================================================================
-- RLT Phase 1 (per docs/rlt-voice-cloning-plan.md): per-language TTS voice
-- selection. Today, language_configs carries exactly ONE voice ID per
-- ministry, applied to every target language that ministry runs. This adds
-- an optional per-(ministry, target_language) override — a Vietnamese
-- broadcast and a Korean broadcast from the same ministry can now speak in
-- different voices.
--
-- language_configs' existing ministry-wide voice column is UNCHANGED and
-- becomes the fallback whenever a language has no row here — purely
-- additive, zero risk to what already works today.
--
-- Same mutation model as language_configs/translation_sessions elsewhere in
-- this file family: SELECT is open to ministry members under RLS, every
-- write goes through a SECURITY DEFINER RPC below.
-- =====================================================================

begin;

create table if not exists public.translation_voices (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references public.ministry_groups(id) on delete cascade,
  target_language text not null,
  voice_id        text not null,
  -- Human-readable label shown in the settings UI, e.g. "Pastor's voice
  -- (cloned)" — purely cosmetic, never read by the bot.
  voice_label     text,
  -- No behavioral difference to the pipeline (a cloned voice_id is used
  -- exactly like a stock one) — this is only so the UI can badge it
  -- distinctly. See docs/rlt-voice-cloning-plan.md Phase 2.
  is_cloned       boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  unique (ministry_id, target_language)
);

create index if not exists idx_translation_voices_ministry_id
  on public.translation_voices (ministry_id);

alter table public.translation_voices enable row level security;

create policy p_translation_voices_member_sel on public.translation_voices
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- No admin_all policy — same reasoning as language_configs: all writes go
-- through the RPCs below, which run as owner (SECURITY DEFINER).

create or replace function public.upsert_language_voice(
  p_ministry_id     uuid,
  p_target_language text,
  p_voice_id        text,
  p_voice_label     text default null,
  p_is_cloned       boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to edit translation voices for this ministry';
  end if;
  if p_target_language is null or p_target_language = '' then
    raise exception 'target_language is required';
  end if;
  if p_voice_id is null or p_voice_id = '' then
    raise exception 'voice_id is required';
  end if;

  insert into public.translation_voices (
    ministry_id, target_language, voice_id, voice_label, is_cloned, created_by
  )
  values (
    p_ministry_id, p_target_language, p_voice_id, p_voice_label, coalesce(p_is_cloned, false), auth.uid()
  )
  on conflict (ministry_id, target_language) do update
    set voice_id    = excluded.voice_id,
        voice_label = excluded.voice_label,
        is_cloned   = excluded.is_cloned;
end;
$$;

grant execute on function public.upsert_language_voice(uuid, text, text, text, boolean) to authenticated;

-- Reverts a language back to the ministry-wide default voice.
create or replace function public.remove_language_voice(
  p_ministry_id     uuid,
  p_target_language text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_admin(p_ministry_id, auth.uid()) then
    raise exception 'Not authorized to edit translation voices for this ministry';
  end if;

  delete from public.translation_voices
    where ministry_id = p_ministry_id and target_language = p_target_language;
end;
$$;

grant execute on function public.remove_language_voice(uuid, text) to authenticated;

commit;
