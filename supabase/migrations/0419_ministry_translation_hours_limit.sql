-- 0419_ministry_translation_hours_limit.sql
-- =====================================================================
-- Live Translation hours are now enforced for ministries (agreed with the
-- user 2026-10-24). Until now the hours a ministry bought as a Live
-- Translation add-on were only displayed: nothing stopped translation once
-- they ran out, and the voice it speaks is the expensive part.
--
-- Same shape as the Rekindle Translate product's limits (0413c/0413d),
-- applied to every ministry that is NOT a Translate organisation:
--
--   - Hours available = the sum of the ministry's active live_translation
--     add-ons, per calendar month (add-ons bill monthly).
--   - Hours used = 'translate' sessions only. Meeting captions and AI notes
--     ('captions'/'notes') don't speak a voice and aren't part of the
--     add-on, so they no longer count, and are never blocked. Each language
--     is its own session, so hours count per language.
--   - A session counts at most 6 hours. Sessions have been seen left
--     'active' for a day after the speaker left; without the cap one of
--     those would use up a month of hours by itself.
--   - Starting a translation when the hours are used up is refused.
--   - A once-a-minute job stops running translations that use up the last
--     of the hours, and tells the ministry's admins at 80% and at 100%
--     (once each per month).
--   - Add-ons can now expire (expires_at). The three churches that were
--     already translating without an add-on get a free 15-hour pack until
--     30 November so they aren't cut off without warning (user's choice).
-- =====================================================================

begin;

set local lock_timeout = '5s';

alter table public.ministry_addons add column if not exists expires_at timestamptz;

-- Free 15-hour packs to 30 November for the churches already using
-- translation with no add-on: RCCG Cabo Verde, RCCG Cornerstone Parish,
-- RCCG Vietnam.
insert into public.ministry_addons (ministry_id, addon_type, quantity, unit_hours, price_usd, price_ngn, status, expires_at)
select m.id, 'live_translation', 1, 15, 0, 0, 'active', '2026-12-01 00:00:00+00'
  from public.ministry_groups m
 where m.id in ('f3366ee1-04b1-4384-9e2e-7f7635ab5ffc',
                'eee779a3-5d9e-4542-94b7-3cd04caa3ef9',
                'a17204e6-1a36-4afa-9e15-e6c5b0613a7e')
   and not exists (
     select 1 from public.ministry_addons a
      where a.ministry_id = m.id and a.addon_type = 'live_translation' and a.price_usd = 0
   );

-- Hours bought this month (sum of active add-ons).
create or replace function public.ministry_translation_minutes_allowed(p_ministry_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(quantity, 1) * coalesce(unit_hours, 0)), 0) * 60
    from public.ministry_addons
   where ministry_id = p_ministry_id
     and addon_type = 'live_translation'
     and status = 'active'
     and (expires_at is null or expires_at > now());
$$;

-- Minutes used this calendar month. Replaces 0343's version, which also
-- counted captions and AI notes and had no per-session cap. Time more than
-- 60 minutes after the last speech isn't counted: a session left open with
-- nobody speaking is ended by 0420, but the bot stamps its own end time
-- when it leaves, so ended_at alone would still bill the idle hours.
create or replace function public.get_ministry_translation_minutes_used(p_ministry_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(greatest(least(
           extract(epoch from (
             least(coalesce(ended_at, now()), coalesce(interim_updated_at, started_at) + interval '60 minutes')
             - greatest(started_at, date_trunc('month', now())))) / 60,
           360), 0)), 0)
    from public.translation_sessions
   where ministry_id = p_ministry_id
     and session_kind = 'translate'
     and started_at is not null
     and coalesce(ended_at, now()) > date_trunc('month', now());
$$;

grant execute on function public.get_ministry_translation_minutes_used(uuid) to authenticated;
revoke execute on function public.ministry_translation_minutes_allowed(uuid) from public, anon;
grant execute on function public.ministry_translation_minutes_allowed(uuid) to authenticated;

-- Refuse to start a translation once the month's hours are used up.
create or replace function public.enforce_ministry_translation_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed numeric;
begin
  if new.ministry_id is null or new.session_kind <> 'translate' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.session_kind is not distinct from new.session_kind then
    return new;
  end if;
  -- Translate organisations have their own plan limits (0413c).
  if exists (select 1 from public.ministry_groups where id = new.ministry_id and product = 'translate') then
    return new;
  end if;

  v_allowed := public.ministry_translation_minutes_allowed(new.ministry_id);
  if v_allowed <= 0 then
    raise exception 'Live Translation needs a Live Translation add-on. Buy hours in Settings › Billing › Add-ons.';
  end if;
  if public.get_ministry_translation_minutes_used(new.ministry_id) >= v_allowed then
    raise exception 'This ministry has used all % Live Translation hours for this month. Buy more hours in Settings › Billing › Add-ons.',
      round(v_allowed / 60);
  end if;
  return new;
end;
$$;

create or replace trigger trg_translation_sessions_ministry_hours
  before insert or update of session_kind on public.translation_sessions
  for each row execute function public.enforce_ministry_translation_hours();

-- One alert per ministry, level and month.
create table if not exists public.ministry_translation_usage_alerts (
  ministry_id uuid not null references public.ministry_groups(id) on delete cascade,
  period      date not null,
  level       integer not null check (level in (80, 100)),
  created_at  timestamptz not null default now(),
  primary key (ministry_id, period, level)
);
alter table public.ministry_translation_usage_alerts enable row level security;
-- No policies: written by the job below only.

create or replace function public.check_ministry_translation_hours()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     record;
  v_session record;
  v_allowed numeric;
  v_used    numeric;
  v_period  date := date_trunc('month', now())::date;
  v_count   integer := 0;
begin
  -- Expired free packs drop off the billing page.
  update public.ministry_addons
     set status = 'cancelled', cancelled_at = now()
   where status = 'active' and expires_at <= now();

  for v_org in
    select distinct t.ministry_id
      from public.translation_sessions t
      join public.ministry_groups g on g.id = t.ministry_id and coalesce(g.product, '') <> 'translate'
     where t.status in ('initialising', 'joining', 'active', 'paused')
       and t.session_kind = 'translate'
  loop
    v_allowed := public.ministry_translation_minutes_allowed(v_org.ministry_id);
    v_used := public.get_ministry_translation_minutes_used(v_org.ministry_id);

    if v_allowed > 0 and v_used >= v_allowed * 0.8 and v_used < v_allowed then
      insert into public.ministry_translation_usage_alerts (ministry_id, period, level)
      values (v_org.ministry_id, v_period, 80)
      on conflict do nothing;
      if found then
        perform public._notify_ministry_admins(
          v_org.ministry_id,
          'ministry_translation_hours_80',
          'Live Translation: 80% of this month''s hours used',
          'Your ministry has used ' || round(v_used / 60, 1) || ' of its ' || round(v_allowed / 60)
            || ' Live Translation hours this month. Translation stops when they run out. Buy more hours in Billing.',
          '/settings/billing'
        );
      end if;
    end if;

    if v_used < v_allowed then
      continue;
    end if;

    for v_session in
      update public.translation_sessions
         set status = 'ended',
             ended_at = now(),
             error_message = 'Stopped: this month''s Live Translation hours are used up.'
       where ministry_id = v_org.ministry_id
         and status in ('initialising', 'joining', 'active', 'paused')
         and session_kind = 'translate'
      returning id
    loop
      -- Same as 0420: close the bot instance too, or a bot restart would
      -- rejoin the stopped session (crash recovery).
      update public.translation_bot_instances
         set status = 'stopped'
       where session_id = v_session.id
         and status in ('active', 'joining');
      perform pg_notify('bot_dispatch', jsonb_build_object('action', 'stop', 'session_id', v_session.id)::text);
      v_count := v_count + 1;
    end loop;

    insert into public.ministry_translation_usage_alerts (ministry_id, period, level)
    values (v_org.ministry_id, v_period, 100)
    on conflict do nothing;
    if found then
      perform public._notify_ministry_admins(
        v_org.ministry_id,
        'ministry_translation_hours_100',
        'Live Translation stopped: this month''s hours are used up',
        'Your ministry has used all ' || round(v_allowed / 60) || ' of its Live Translation hours this month, so translation has stopped. Buy more hours in Billing to carry on.',
        '/settings/billing'
      );
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.check_ministry_translation_hours() from public, anon, authenticated;

select cron.schedule(
  'check-ministry-translation-hours',
  '* * * * *',
  'select public.check_ministry_translation_hours();'
);

commit;
