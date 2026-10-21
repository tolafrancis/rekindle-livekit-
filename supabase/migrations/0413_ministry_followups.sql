-- 0413_ministry_followups.sql
-- =====================================================================
-- "New people" follow-up for ministry leaders (Settings › Members › New
-- people). A row means someone on the team has contacted that new person.
--
-- person_key matches how MinistryMembersManager identifies people: the
-- user id for members with an account (ministry_group_members, and
-- registrants who have one), otherwise the ministry_member_profiles id.
--
-- Every Monday, ministry leaders and admins get one in-app notification
-- if anyone who joined in the last 30 days hasn't been contacted yet.
-- =====================================================================

create table if not exists public.ministry_followups (
  ministry_id uuid not null references public.ministry_groups (id) on delete cascade,
  person_key text not null,
  contacted_at timestamptz not null default now(),
  contacted_by uuid default auth.uid(),
  note text check (note is null or char_length(note) <= 500),
  primary key (ministry_id, person_key)
);

alter table public.ministry_followups enable row level security;

-- Same people who manage members: owner, leader, admins and moderators.
drop policy if exists p_ministry_followups_leaders on public.ministry_followups;
create policy p_ministry_followups_leaders on public.ministry_followups
  for all to authenticated
  using (public.is_ministry_leader(ministry_id) or public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_ministry_leader(ministry_id) or public.is_group_admin(ministry_id, auth.uid()));

grant select, insert, update, delete on public.ministry_followups to authenticated;

-- People who joined in the last 30 days and haven't been contacted, per
-- ministry. Leaders, admins, moderators and the owner are not "new people".
create or replace function public.send_new_people_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    with new_people as (
      select m.ministry_id, m.user_id::text as person_key
        from public.ministry_group_members m
        join public.ministry_groups g on g.id = m.ministry_id
       where m.joined_at > now() - interval '30 days'
         and m.user_id is not null
         and coalesce(m.is_leader, false) = false
         and coalesce(m.role, 'member') not in ('admin', 'moderator')
         and m.user_id is distinct from g.owner_id
         and m.user_id is distinct from g.leader_id
      union
      select p.ministry_id, coalesce(p.user_id::text, p.id::text)
        from public.ministry_member_profiles p
       where p.registration_status = 'active'
         and coalesce(p.approved_at, p.created_at) > now() - interval '30 days'
    )
    select n.ministry_id, count(*) as waiting
      from new_people n
     where not exists (
       select 1 from public.ministry_followups f
        where f.ministry_id = n.ministry_id and f.person_key = n.person_key
     )
     group by n.ministry_id
  loop
    perform public._notify_ministry_admins(
      r.ministry_id,
      'ministry_new_people',
      case when r.waiting = 1 then '👋 1 new person to welcome'
           else '👋 ' || r.waiting || ' new people to welcome' end,
      'They joined in the last 30 days and nobody has been in touch yet. Open New people to call, message or mark them as contacted.',
      '/home?tab=settings&section=members&tool=new-people'
    );
  end loop;
end;
$$;

revoke all on function public.send_new_people_reminders() from public, anon, authenticated;

select cron.unschedule('new-people-reminders') where exists (select 1 from cron.job where jobname = 'new-people-reminders');
-- Mondays 08:00 UTC.
select cron.schedule('new-people-reminders', '0 8 * * 1', $$ select public.send_new_people_reminders(); $$);
