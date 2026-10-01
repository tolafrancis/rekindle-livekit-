-- 0355_webinar_cohost_permissions.sql
-- Bug found during a post-deploy review of 0354: WebinarStage.tsx treats a
-- confirmed co-host exactly like the host (isHost = role === 'host' ||
-- role === 'co-host' — invite/revoke stage speakers, end the webinar), but
-- all three write policies from 0354 ("manage ministry webinars", "host
-- manages webinar_speakers", "host manages all requests") only checked
-- host_id = auth.uid(). A co-host's writes would silently fail RLS. This
-- widens those three policies via one shared predicate rather than
-- repeating the subquery, so a confirmed co-host has the same write access
-- as the host, matching the role's spec'd permissions.

begin;

create or replace function public.is_webinar_manager(p_webinar_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ministry_webinars w
    where w.id = p_webinar_id and w.host_id = p_user_id
  ) or exists (
    select 1 from public.webinar_speakers s
    where s.webinar_id = p_webinar_id and s.user_id = p_user_id
      and s.role = 'co-host' and s.status = 'confirmed'
  );
$$;

grant execute on function public.is_webinar_manager(uuid, uuid) to authenticated;

drop policy if exists "manage ministry webinars" on public.ministry_webinars;
create policy "manage ministry webinars"
  on public.ministry_webinars for all using (
    public.is_webinar_manager(id, auth.uid()) or public.is_group_admin(ministry_id, auth.uid())
  ) with check (
    public.is_webinar_manager(id, auth.uid()) or public.is_group_admin(ministry_id, auth.uid())
  );

drop policy if exists "host manages webinar_speakers" on public.webinar_speakers;
create policy "host manages webinar_speakers"
  on public.webinar_speakers for all using (
    public.is_webinar_manager(webinar_id, auth.uid())
  ) with check (
    public.is_webinar_manager(webinar_id, auth.uid())
  );

drop policy if exists "host manages all requests" on public.webinar_speaker_requests;
create policy "host manages all requests"
  on public.webinar_speaker_requests for all using (
    public.is_webinar_manager(webinar_id, auth.uid())
  ) with check (
    public.is_webinar_manager(webinar_id, auth.uid())
  );

commit;
