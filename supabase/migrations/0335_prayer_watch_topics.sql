-- 0335_prayer_watch_topics.sql
-- Makes Prayer Watch topics a real, admin-manageable table instead of a
-- hardcoded list in PrayerLibrary.tsx (DEFAULT_PRAYER_WATCH_TOPICS).
--
-- The consumer view (packages/features/src/components/PrayerLibrary.tsx,
-- loadPrayerWatchTopics) already queries this exact table first and only
-- falls back to the hardcoded list if the query errors or returns nothing
-- — so once this migration runs and is seeded, the app picks it up with
-- ZERO frontend changes needed on the consumer side.
--
-- Seeded with the SAME six ids the app has used until now (breakthrough,
-- healing, family, nation, wisdom, protection) so existing
-- prayer_library.prayer_watch_topic values (a plain text reference, not a
-- DB foreign key) keep matching exactly as before — nothing breaks.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

create table if not exists public.prayer_watch_topics (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  -- Must be one of ICON_MAP's keys in PrayerLibrary.tsx (Heart, Shield,
  -- Stethoscope, Users, Flag, Compass, ShieldCheck, Clock, BookOpen) or the
  -- icon silently fails to render. Not DB-enforced; the admin UI restricts
  -- the picker to these values.
  icon         text not null default 'Heart',
  -- Must be one of colorClasses' keys (purple, pink, blue, red, indigo,
  -- green) for the same reason.
  color        text not null default 'purple',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.prayer_watch_topics (id, name, description, icon, color, is_active) values
  ('breakthrough', 'Prayer for Breakthrough', 'Praying for breakthrough in spiritual, financial, and personal areas', 'Shield', 'purple', true),
  ('healing', 'Prayer for Healing', 'Interceding for physical, emotional, and spiritual healing', 'Heart', 'pink', true),
  ('family', 'Prayer for Family', 'Standing in the gap for your family members and loved ones', 'Users', 'blue', true),
  ('nation', 'Prayer for Nation', 'Interceding for your country, leaders, and national transformation', 'Flag', 'red', true),
  ('wisdom', 'Prayer for Wisdom', 'Seeking divine guidance and understanding for life decisions', 'Compass', 'indigo', true),
  ('protection', 'Prayer for Protection', 'Covering yourself and loved ones with God''s protection', 'Shield', 'green', true)
on conflict (id) do nothing;

alter table public.prayer_watch_topics enable row level security;

drop policy if exists p_prayer_watch_topics_read on public.prayer_watch_topics;
create policy p_prayer_watch_topics_read on public.prayer_watch_topics
  for select to authenticated, anon
  using (true);

-- Same admin/super_admin role check already used for platform prayer
-- content (generate-devotional-day, AdminPrayerLibrary.tsx's own gate).
drop policy if exists p_prayer_watch_topics_admin_write on public.prayer_watch_topics;
create policy p_prayer_watch_topics_admin_write on public.prayer_watch_topics
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'super_admin')
  ))
  with check (exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role in ('admin', 'super_admin')
  ));

grant select on public.prayer_watch_topics to anon, authenticated;
grant insert, update, delete on public.prayer_watch_topics to authenticated;

commit;
