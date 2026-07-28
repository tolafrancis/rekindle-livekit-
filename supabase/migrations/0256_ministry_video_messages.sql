-- 0256_ministry_video_messages.sql
-- =====================================================================
-- Pastor's Video Message — pastors/leaders/admins record or upload a
-- video message; the latest published one surfaces on the ministry
-- homepage, all members get notified, and engagement is tracked.
--
-- Video hosting is Cloudflare R2 (raw upload + transcode-worker output),
-- NOT Supabase Storage — this table only stores metadata/URLs. The
-- transcode worker (outside this repo's Supabase project) flips
-- status 'processing' -> 'ready' once the HLS ladder, thumbnail, and
-- WebVTT captions exist in R2.
--
-- RLS reuses is_group_member()/is_group_admin() from
-- 0150_rls_hardening_phase4.sql — the safe, audited pattern. Not
-- redefined here.
-- =====================================================================

begin;

create table if not exists public.ministry_video_messages (
  id                    uuid primary key default gen_random_uuid(),
  ministry_id           uuid not null references public.ministry_groups(id) on delete cascade,
  title                 text not null,
  description           text,
  speaker_name          text,
  category              text,
  status                text not null default 'draft'
    check (status in ('draft', 'processing', 'ready', 'scheduled', 'published', 'archived', 'error')),
  is_pinned             boolean not null default false,
  -- Only meaningful among pinned/featured videos; mirrors
  -- ministry_partner_plans.display_order's naming convention.
  display_order         int,
  scheduled_publish_at  timestamptz,
  published_at          timestamptz,
  created_by            uuid references auth.users(id),
  raw_storage_key       text,
  playback_url          text,
  thumbnail_url         text,
  captions_url          text,
  duration_seconds      int,
  processing_error      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_ministry_video_messages_ministry_id
  on public.ministry_video_messages (ministry_id);
create index if not exists idx_ministry_video_messages_status
  on public.ministry_video_messages (ministry_id, status);
create index if not exists idx_ministry_video_messages_pending
  on public.ministry_video_messages (status) where status = 'processing';

create table if not exists public.ministry_video_message_views (
  id                      uuid primary key default gen_random_uuid(),
  video_id                uuid not null references public.ministry_video_messages(id) on delete cascade,
  ministry_id             uuid not null references public.ministry_groups(id) on delete cascade,
  user_id                 uuid references auth.users(id) on delete set null,
  session_id              text,
  started_at              timestamptz not null default now(),
  ended_at                timestamptz,
  watch_duration_seconds  int not null default 0,
  completion_percentage   numeric(5,2) not null default 0,
  -- Powers "resume where you left off"; the one field beyond the
  -- channel_replay_views analog this mirrors.
  last_position_seconds   int not null default 0
);

create index if not exists idx_ministry_video_message_views_video_id
  on public.ministry_video_message_views (video_id);
create index if not exists idx_ministry_video_message_views_ministry_id
  on public.ministry_video_message_views (ministry_id);
create index if not exists idx_ministry_video_message_views_user_id
  on public.ministry_video_message_views (video_id, user_id);

create table if not exists public.ministry_video_message_reactions (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references public.ministry_video_messages(id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (video_id, user_id)
);

create index if not exists idx_ministry_video_message_reactions_video_id
  on public.ministry_video_message_reactions (video_id);

-- Keep ministry_id in lockstep with the parent video on the two child
-- tables; client never sets it directly (same pattern as volunteer
-- assignments in 0254).
create or replace function public.ministry_video_message_child_set_ministry_id()
returns trigger language plpgsql as $$
begin
  select ministry_id into new.ministry_id
  from public.ministry_video_messages
  where id = new.video_id;
  return new;
end;
$$;

drop trigger if exists trg_ministry_video_message_views_ministry_id
  on public.ministry_video_message_views;
create trigger trg_ministry_video_message_views_ministry_id
  before insert or update of video_id on public.ministry_video_message_views
  for each row execute function public.ministry_video_message_child_set_ministry_id();

drop trigger if exists trg_ministry_video_message_reactions_ministry_id
  on public.ministry_video_message_reactions;
create trigger trg_ministry_video_message_reactions_ministry_id
  before insert or update of video_id on public.ministry_video_message_reactions
  for each row execute function public.ministry_video_message_child_set_ministry_id();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.ministry_video_messages enable row level security;

-- Members see published (and their own ministry's archived, so admins
-- browsing "Archived" as a member-role viewer isn't blocked) videos;
-- full visibility (draft/processing/scheduled) is admin-only.
create policy p_ministry_video_messages_member_sel on public.ministry_video_messages
  for select to authenticated
  using (
    status in ('published', 'archived')
    and public.is_group_member(ministry_id, auth.uid())
  );

create policy p_ministry_video_messages_admin_all on public.ministry_video_messages
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

alter table public.ministry_video_message_views enable row level security;

-- A member can insert/see/update only their OWN view rows (watch tracking is
-- self-reported); admins can read all view rows for analytics.
create policy p_ministry_video_message_views_self on public.ministry_video_message_views
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(ministry_id, auth.uid()));

create policy p_ministry_video_message_views_insert on public.ministry_video_message_views
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_video_message_views_update on public.ministry_video_message_views
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.ministry_video_message_reactions enable row level security;

create policy p_ministry_video_message_reactions_sel on public.ministry_video_message_reactions
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_video_message_reactions_write on public.ministry_video_message_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(ministry_id, auth.uid()));

create policy p_ministry_video_message_reactions_update on public.ministry_video_message_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy p_ministry_video_message_reactions_delete on public.ministry_video_message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

commit;
