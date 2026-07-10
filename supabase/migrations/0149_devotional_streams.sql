-- 0149_devotional_streams.sql
-- Daily-devotional STREAMS: admin-authored, named feeds of the main-app daily
-- devotional (the `devotionals` table). A ministry can point its homepage at one
-- stream (replacing its own devotional), and a user can pick one in the source
-- picker. Streams are always admin-authored — ministries/users only consume.
--
-- Nothing about how "today's devotional" is chosen changes: the widget still
-- resolves by schedule_date. Streams only scope WHICH devotionals are in play.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

begin;

-- ── The catalog of streams ────────────────────────────────────────────────
create table if not exists public.devotional_streams (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  cover_image_url text,
  is_public       boolean not null default true,   -- listed in ministry/user pickers
  is_default      boolean not null default false,  -- the original "ReKindle BC" feed
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- Each daily devotional belongs to a stream. on delete set null so removing a
-- stream never destroys the devotional content — the rows just fall back to the
-- default stream via the widget's resolver.
alter table public.devotionals
  add column if not exists stream_id uuid references public.devotional_streams (id) on delete set null;
create index if not exists idx_devotionals_stream on public.devotionals (stream_id);

-- ── Per-ministry choice (null = the ministry writes its own devotional) ────
-- Keyed by ministry_groups.id, the same id used everywhere in the ministry space
-- (ministry_devotionals.ministry_id, MinistrySpace, MinistryDevotionalsManager).
create table if not exists public.ministry_devotional_settings (
  ministry_id                uuid primary key,
  daily_devotional_stream_id uuid references public.devotional_streams (id) on delete set null,
  updated_at                 timestamptz not null default now()
);

-- ── Per-user choice for the source picker ──────────────────────────────────
alter table public.user_profiles
  add column if not exists devotional_stream_id uuid references public.devotional_streams (id) on delete set null;

-- ── Seed the default stream + backfill existing devotionals into it ────────
insert into public.devotional_streams (name, description, is_public, is_default, sort_order)
select 'ReKindle BC', 'Daily devotionals curated by the ReKindle BC team', true, true, 0
where not exists (select 1 from public.devotional_streams where is_default = true);

update public.devotionals
   set stream_id = (select id from public.devotional_streams where is_default = true limit 1)
 where stream_id is null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.devotional_streams enable row level security;

-- Anyone (incl. anon) may read public streams — needed so a ministry homepage or
-- the picker can list them without auth. Admins can read all (published or not).
drop policy if exists "read public devotional streams" on public.devotional_streams;
create policy "read public devotional streams"
  on public.devotional_streams
  for select
  using (
    is_public = true
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')
    )
  );

-- Only admins/moderators create, edit, or delete streams.
drop policy if exists "admin writes devotional streams" on public.devotional_streams;
create policy "admin writes devotional streams"
  on public.devotional_streams
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')
    )
  );

alter table public.ministry_devotional_settings enable row level security;

-- Read is open: an anon visitor to a ministry homepage must resolve which stream
-- (if any) the ministry chose. The row holds no secret — just a stream pointer.
drop policy if exists "read ministry devotional settings" on public.ministry_devotional_settings;
create policy "read ministry devotional settings"
  on public.ministry_devotional_settings
  for select
  using (true);

-- Writes: the ministry's owner/leader, or an admin.
drop policy if exists "ministry leader writes devotional settings" on public.ministry_devotional_settings;
create policy "ministry leader writes devotional settings"
  on public.ministry_devotional_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.ministry_groups g
      where g.id = ministry_devotional_settings.ministry_id
        and (g.owner_id = auth.uid() or g.leader_id = auth.uid())
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')
    )
  )
  with check (
    exists (
      select 1 from public.ministry_groups g
      where g.id = ministry_devotional_settings.ministry_id
        and (g.owner_id = auth.uid() or g.leader_id = auth.uid())
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and up.role in ('admin','super_admin','moderator')
    )
  );

commit;
