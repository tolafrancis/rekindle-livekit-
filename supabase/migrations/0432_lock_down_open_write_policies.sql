-- 0432: lock down tables that let anyone edit or delete data.
--
-- The 0431 audit found many policies whose rule is just `true` (or "any
-- signed-in user"), often named as if they were admin-only. Postgres ORs
-- permissive policies together, so one `true` policy cancels every stricter
-- one on the same table. Today anyone with the public anon key could, for
-- example, delete any ministry's events, edit any prayer request, rewrite a
-- devotional series, or read and delete newsletter/volunteer sign-ups.
--
-- Rule after this migration:
--   * ministry data: owner / leader / active admin of that ministry
--     (is_ministry_manager, from 0431) or platform staff.
--   * personal data: the user who owns the row, or platform staff.
--   * platform content and form submissions: platform staff only.
--   * "service role" policies are scoped to the service_role (which bypasses
--     RLS anyway), so they stop applying to everyone else.
-- Members keep their existing insert/own-row policies (submit a prayer
-- request or testimony, register for an event, sign up to a form).
--
-- Members' "I prayed" / view counters used to be plain UPDATEs; they now go
-- through two small security-definer functions that only bump the counters.
--
-- Uses ALTER POLICY / CREATE POLICY only. No DROP statements (they hang the
-- Supabase connector).
--
-- Not changed here (need app changes first): app_testimonies and
-- community_revelations likes/comments, book_referrals and tts_audio_cache
-- counters, live meeting tables (participant_states, chat_messages,
-- channel_chat_messages, voice_rooms), background_music.

begin;

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

-- Same body as 0431, repeated so this migration does not depend on order.
create or replace function public.is_ministry_manager(p_ministry_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    exists (
      select 1 from public.ministry_groups g
      where g.id = p_ministry_id and (g.owner_id = p_uid or g.leader_id = p_uid)
    )
    or exists (
      select 1 from public.ministry_group_members m
      where (m.group_id = p_ministry_id or m.ministry_id = p_ministry_id)
        and m.user_id = p_uid
        and coalesce(m.status, 'active') = 'active'
        and (m.is_leader = true or m.role in ('admin', 'leader'))
    )
    or exists (
      select 1 from public.ministry_members mm
      where mm.ministry_id = p_ministry_id
        and mm.user_id = p_uid
        and coalesce(mm.status, 'active') = 'active'
        and (mm.is_leader = true or mm.role in ('admin', 'leader'))
    )
  );
$$;

-- Platform staff = whoever the app shows the Admin dashboard to
-- (role admin / super_admin / moderator, the is_admin flag, platform_admins).
create or replace function public.is_platform_staff(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_moderation_admin(p_uid);
$$;

-- Members tap "I prayed" on a ministry prayer request.
create or replace function public.ministry_prayer_request_prayed(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select ministry_id into v_ministry from public.ministry_prayer_requests where id = p_request_id;
  if v_ministry is null or not public.is_group_member(v_ministry, auth.uid()) then
    raise exception 'not a member of this ministry';
  end if;
  update public.ministry_prayer_requests
     set prayer_count = coalesce(prayer_count, 0) + 1
   where id = p_request_id
  returning prayer_count into v_count;
  return v_count;
end;
$$;

-- Members open (and optionally finish praying) a ministry prayer library item.
create or replace function public.ministry_prayer_library_bump(p_prayer_id uuid, p_prayed boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select ministry_id into v_ministry from public.ministry_prayer_library where id = p_prayer_id;
  if v_ministry is null or not public.is_group_member(v_ministry, auth.uid()) then
    raise exception 'not a member of this ministry';
  end if;
  update public.ministry_prayer_library
     set view_count   = coalesce(view_count, 0) + 1,
         prayer_count = coalesce(prayer_count, 0) + case when p_prayed then 1 else 0 end
   where id = p_prayer_id;
end;
$$;

revoke all on function public.ministry_prayer_request_prayed(uuid) from public, anon;
revoke all on function public.ministry_prayer_library_bump(uuid, boolean) from public, anon;
grant execute on function public.ministry_prayer_request_prayed(uuid) to authenticated;
grant execute on function public.ministry_prayer_library_bump(uuid, boolean) to authenticated;

-- Trigger on devotional_entries keeps devotional_series.total_days in sync;
-- run it as definer so it still works once series updates are staff-only.
alter function public.update_series_stats() security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Ministry tables
-- ---------------------------------------------------------------------------

-- ministry_events
alter policy "Ministry admins can update events" on public.ministry_events
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can delete events" on public.ministry_events
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can insert events" on public.ministry_events
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));

-- ministry_event_registrations: the registrant, or a manager of the event's ministry
alter policy "Ministry admins can update registrations" on public.ministry_event_registrations
  using (
    user_id = auth.uid()
    or exists (select 1 from public.ministry_events e
               where e.id = ministry_event_registrations.event_id and public.is_ministry_manager(e.ministry_id, auth.uid()))
    or public.is_platform_staff(auth.uid())
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.ministry_events e
               where e.id = ministry_event_registrations.event_id and public.is_ministry_manager(e.ministry_id, auth.uid()))
    or public.is_platform_staff(auth.uid())
  );
alter policy "Ministry admins can delete registrations" on public.ministry_event_registrations
  using (
    user_id = auth.uid()
    or exists (select 1 from public.ministry_events e
               where e.id = ministry_event_registrations.event_id and public.is_ministry_manager(e.ministry_id, auth.uid()))
    or public.is_platform_staff(auth.uid())
  );
alter policy "Ministry admins can insert registrations" on public.ministry_event_registrations
  with check (
    exists (select 1 from public.ministry_events e
            where e.id = ministry_event_registrations.event_id and public.is_ministry_manager(e.ministry_id, auth.uid()))
    or public.is_platform_staff(auth.uid())
  );

-- ministry_prayer_requests (authors keep "Users can update/delete their own requests")
alter policy "Ministry admins can update prayer requests" on public.ministry_prayer_requests
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can delete prayer requests" on public.ministry_prayer_requests
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can insert prayer requests" on public.ministry_prayer_requests
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));

-- ministry_testimonies (authors keep their own pending-testimony policies)
alter policy "Ministry admins can update testimonies" on public.ministry_testimonies
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can delete testimonies" on public.ministry_testimonies
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can insert testimonies" on public.ministry_testimonies
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));

-- ministry_prayer_library
alter policy "Ministry admins can update prayer library" on public.ministry_prayer_library
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can delete prayer library" on public.ministry_prayer_library
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can insert prayer library" on public.ministry_prayer_library
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));

-- ministry_verification: the ministry submits, platform staff approve
alter policy "Ministry admins can insert verification" on public.ministry_verification
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
alter policy "Ministry admins can update verification" on public.ministry_verification
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ministry_devotional_series: was "any signed-in user can do anything"
alter policy temp_authenticated_users_all_access_series on public.ministry_devotional_series
  using (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()) or public.is_platform_staff(auth.uid()));
create policy ministry_devotional_series_member_read on public.ministry_devotional_series
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- Evangelism inbox + channel configs (page tokens live here)
alter policy "Service role full access channel configs" on public.ministry_channel_configs
  to service_role using (true) with check (true);
alter policy "Leaders manage channel configs" on public.ministry_channel_configs
  using (public.is_ministry_manager(ministry_id, auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()));

alter policy "Service role full access contacts" on public.ministry_evangelism_contacts
  to service_role using (true) with check (true);
alter policy "Ministry leaders manage contacts" on public.ministry_evangelism_contacts
  using (public.is_ministry_manager(ministry_id, auth.uid()))
  with check (public.is_ministry_manager(ministry_id, auth.uid()));

alter policy "Service role full access messages" on public.ministry_evangelism_messages
  to service_role using (true) with check (true);
alter policy "Ministry members insert outbound" on public.ministry_evangelism_messages
  with check (direction = 'outbound' and public.is_ministry_manager(ministry_id, auth.uid()));
alter policy "Ministry members read messages" on public.ministry_evangelism_messages
  using (public.is_group_member(ministry_id, auth.uid()) or public.is_ministry_manager(ministry_id, auth.uid()));
alter policy "Ministry members read contacts" on public.ministry_evangelism_contacts
  using (public.is_group_member(ministry_id, auth.uid()) or public.is_ministry_manager(ministry_id, auth.uid()));

-- ministry_feature_flags: platform switches, staff only (read stays open)
alter policy "Admins can manage feature flags" on public.ministry_feature_flags
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Platform content (Admin dashboard)
-- ---------------------------------------------------------------------------

-- devotional_series: staff, or managers for their own ministry's series
alter policy "Admins can manage devotional series" on public.devotional_series
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));
alter policy "Enable update for authenticated users" on public.devotional_series
  using (public.is_platform_staff(auth.uid())
         or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid())))
  with check (public.is_platform_staff(auth.uid())
         or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid())));
alter policy "Enable delete for authenticated users" on public.devotional_series
  using (public.is_platform_staff(auth.uid())
         or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid())));
alter policy "Enable insert for authenticated users" on public.devotional_series
  with check (public.is_platform_staff(auth.uid())
         or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid())));

alter policy "Authenticated users can manage devotional days" on public.devotional_series_days
  using (
    public.is_platform_staff(auth.uid())
    or exists (select 1 from public.devotional_series s
               where s.id = devotional_series_days.series_id and s.ministry_id is not null
                 and public.is_ministry_manager(s.ministry_id, auth.uid()))
  )
  with check (
    public.is_platform_staff(auth.uid())
    or exists (select 1 from public.devotional_series s
               where s.id = devotional_series_days.series_id and s.ministry_id is not null
                 and public.is_ministry_manager(s.ministry_id, auth.uid()))
  );

-- enhanced_prayer_challenges: creator or staff
alter policy update_enhanced_challenges on public.enhanced_prayer_challenges
  using (created_by = auth.uid() or creator_id = auth.uid() or public.is_platform_staff(auth.uid()))
  with check (created_by = auth.uid() or creator_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy "Creators can delete their own challenges" on public.enhanced_prayer_challenges
  using (created_by = auth.uid() or creator_id = auth.uid() or public.is_platform_staff(auth.uid()));

-- Staff-managed lists
alter policy prayer_challenges_update on public.prayer_challenges using (public.is_platform_staff(auth.uid()));
alter policy prayer_challenges_delete on public.prayer_challenges using (public.is_platform_staff(auth.uid()));
alter policy prayer_challenges_insert on public.prayer_challenges with check (public.is_platform_staff(auth.uid()));

alter policy "Admins can manage categories" on public.prayer_categories
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));

alter policy public_write_scripture_memory on public.scripture_memory
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));

alter policy "Allow public update on spiritual_metrics" on public.spiritual_metrics
  using (public.is_platform_staff(auth.uid()));

alter policy "Allow service role to manage translations" on public.translation_cache
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));

alter policy "Admins can manage rooms" on public.chat_rooms
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));
alter policy chat_rooms_delete_all on public.chat_rooms
  using (public.is_platform_staff(auth.uid()) or created_by = auth.uid());

-- mentors / sponsors
alter policy public_write_mentors on public.mentors
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));
alter policy mentors_update on public.mentors using (public.is_platform_staff(auth.uid()) or user_id = auth.uid());
alter policy mentors_delete on public.mentors using (public.is_platform_staff(auth.uid()));
alter policy mentors_insert on public.mentors with check (public.is_platform_staff(auth.uid()));

alter policy sponsors_update on public.sponsors using (public.is_platform_staff(auth.uid()));
alter policy sponsors_delete on public.sponsors using (public.is_platform_staff(auth.uid()));
alter policy sponsors_insert on public.sponsors with check (public.is_platform_staff(auth.uid()));
alter policy sponsors_select on public.sponsors using (is_active = true or public.is_platform_staff(auth.uid()));

-- counsellor applications: applicant creates, staff review
alter policy "Admins can update applications" on public.counsellor_applications
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));
alter policy "Admins can manage applications" on public.counsellor_applications
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));
alter policy "Admins can view all applications" on public.counsellor_applications
  using (auth.uid() = user_id or public.is_platform_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Money, tiers, referrals (server-side only)
-- ---------------------------------------------------------------------------

alter policy donations_update on public.donations using (public.is_platform_staff(auth.uid()));
alter policy donations_delete on public.donations using (public.is_platform_staff(auth.uid()));
alter policy donations_select on public.donations using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy admin_all_donations on public.donations
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));

alter policy "Service role can update payment receipts" on public.payment_receipts
  to service_role using (true) with check (true);
alter policy "Service role can insert payment receipts" on public.payment_receipts
  to service_role with check (true);

alter policy "System can manage tiers" on public.user_tiers
  to service_role using (true) with check (true);
alter policy "Users can update own tier" on public.user_tiers
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));

alter policy "System can update referral status" on public.referrals
  using (public.is_platform_staff(auth.uid()));
alter policy "System can manage analytics" on public.referral_analytics
  to service_role using (true) with check (true);

-- mentor bookings: the person who booked, or staff
alter policy mentor_bookings_update on public.mentor_bookings using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy mentor_bookings_delete on public.mentor_bookings using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy mentor_bookings_select on public.mentor_bookings using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Form submissions: anyone can submit, only staff can read/edit/delete
-- ---------------------------------------------------------------------------

alter policy "Allow anon to update newsletter_subscribers" on public.newsletter_subscribers to service_role using (true);
alter policy "Allow anon to delete newsletter_subscribers" on public.newsletter_subscribers to service_role using (true);
alter policy "Allow anon to view newsletter_subscribers" on public.newsletter_subscribers to service_role using (true);
alter policy "Allow authenticated users to update newsletter_subscribers" on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));
alter policy newsletter_auth_update on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to delete newsletter_subscribers" on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));
alter policy newsletter_auth_delete on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to view newsletter_subscribers" on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));
alter policy newsletter_auth_select on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));
alter policy "Allow public select for own email on newsletter_subscribers" on public.newsletter_subscribers using (public.is_platform_staff(auth.uid()));

alter policy "Allow anon to update volunteer_signups" on public.volunteer_signups to service_role using (true);
alter policy "Allow anon to delete volunteer_signups" on public.volunteer_signups to service_role using (true);
alter policy "Allow anon to view volunteer_signups" on public.volunteer_signups to service_role using (true);
alter policy "Allow authenticated users to update volunteer_signups" on public.volunteer_signups using (public.is_platform_staff(auth.uid()));
alter policy volunteer_auth_update on public.volunteer_signups using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to delete volunteer_signups" on public.volunteer_signups using (public.is_platform_staff(auth.uid()));
alter policy volunteer_auth_delete on public.volunteer_signups using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to view volunteer_signups" on public.volunteer_signups using (public.is_platform_staff(auth.uid()));
alter policy volunteer_auth_select on public.volunteer_signups using (public.is_platform_staff(auth.uid()));
alter policy "Allow public select on volunteer_signups" on public.volunteer_signups using (public.is_platform_staff(auth.uid()));

alter policy "Allow anon to update partnership_inquiries" on public.partnership_inquiries to service_role using (true);
alter policy "Allow anon to delete partnership_inquiries" on public.partnership_inquiries to service_role using (true);
alter policy "Allow anon to view partnership_inquiries" on public.partnership_inquiries to service_role using (true);
alter policy "Allow authenticated users to update partnership_inquiries" on public.partnership_inquiries using (public.is_platform_staff(auth.uid()));
alter policy partnership_auth_update on public.partnership_inquiries using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to delete partnership_inquiries" on public.partnership_inquiries using (public.is_platform_staff(auth.uid()));
alter policy partnership_auth_delete on public.partnership_inquiries using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to view partnership_inquiries" on public.partnership_inquiries using (public.is_platform_staff(auth.uid()));
alter policy partnership_auth_select on public.partnership_inquiries using (public.is_platform_staff(auth.uid()));

alter policy "Allow anon to update missionary_applications" on public.missionary_applications to service_role using (true);
alter policy "Allow anon to delete missionary_applications" on public.missionary_applications to service_role using (true);
alter policy "Allow anon to view missionary_applications" on public.missionary_applications to service_role using (true);
alter policy "Allow authenticated updates" on public.missionary_applications using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to update missionary_applications" on public.missionary_applications using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated deletes" on public.missionary_applications using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to delete missionary_applications" on public.missionary_applications using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated reads" on public.missionary_applications using (public.is_platform_staff(auth.uid()));
alter policy "Allow authenticated users to view missionary_applications" on public.missionary_applications using (public.is_platform_staff(auth.uid()));

alter policy missionary_contacts_all on public.missionary_contacts
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));
alter policy missionary_events_all on public.missionary_events
  using (public.is_platform_staff(auth.uid())) with check (public.is_platform_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Personal data: only the owner (or staff) can read, edit or delete
-- ---------------------------------------------------------------------------

alter policy ai_chat_analytics_delete_all on public.ai_chat_analytics using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy ai_chat_analytics_read_all   on public.ai_chat_analytics using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy ai_chat_messages_delete_all  on public.ai_chat_messages  using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy ai_chat_messages_read_all    on public.ai_chat_messages  using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy ai_chat_sessions_delete_all  on public.ai_chat_sessions  using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy ai_chat_sessions_read_all    on public.ai_chat_sessions  using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

-- bookmarks: some inserts did not send user_id, so default it
alter table public.bookmarks alter column user_id set default auth.uid();
alter policy bookmarks_update on public.bookmarks using (user_id = auth.uid());
alter policy bookmarks_delete on public.bookmarks using (user_id = auth.uid());
alter policy bookmarks_select on public.bookmarks using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy bookmarks_insert on public.bookmarks with check (user_id = auth.uid());

alter policy comments_update on public.comments using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy comments_delete on public.comments using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

alter policy devotional_progress_update on public.devotional_progress using (user_id = auth.uid());
alter policy devotional_progress_delete on public.devotional_progress using (user_id = auth.uid());
alter policy devotional_progress_select on public.devotional_progress using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

alter policy user_devotional_progress_update on public.user_devotional_progress using (user_id = auth.uid());
alter policy user_devotional_progress_delete on public.user_devotional_progress using (user_id = auth.uid());
alter policy user_devotional_progress_select on public.user_devotional_progress using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

alter policy prayer_journal_update on public.prayer_journal using (user_id = auth.uid());
alter policy prayer_journal_delete on public.prayer_journal using (user_id = auth.uid());
alter policy prayer_journal_select on public.prayer_journal using (user_id = auth.uid());

alter policy user_reminders_update on public.user_reminders using (user_id = auth.uid());
alter policy user_reminders_delete on public.user_reminders using (user_id = auth.uid());
alter policy user_reminders_select on public.user_reminders using (user_id = auth.uid());

alter policy user_activity_log_update on public.user_activity_log using (public.is_platform_staff(auth.uid()));
alter policy user_activity_log_delete on public.user_activity_log using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy user_activity_log_select on public.user_activity_log using (user_id = auth.uid() or public.is_platform_staff(auth.uid()));

alter policy event_reminders_update_policy on public.event_reminders using (user_id = auth.uid());

alter policy discipleship_connections_update on public.discipleship_connections
  using (mentor_user_id = auth.uid() or disciple_user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy discipleship_connections_delete on public.discipleship_connections
  using (mentor_user_id = auth.uid() or disciple_user_id = auth.uid() or public.is_platform_staff(auth.uid()));
alter policy discipleship_connections_select on public.discipleship_connections
  using (mentor_user_id = auth.uid() or disciple_user_id = auth.uid() or public.is_platform_staff(auth.uid()));

commit;
