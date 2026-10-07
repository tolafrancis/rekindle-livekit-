-- private.call_edge_fn called public.get_cron_secret(), which 0258 dropped, so
-- every cron job using it (process-scheduled-broadcasts, onboarding-tips,
-- process-translation-queue x2, process-prayer-reminders) failed before
-- reaching its edge function. It now signs in with the vault's service role
-- key, like the 0399 prewarm job. process-scheduled-broadcasts and
-- process-prayer-reminders accept a service-role JWT (verify_jwt = true).
-- x-cron-secret is still sent when the vault has cron_shared_secret.
begin;

create or replace function private.call_edge_fn(p_fn text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text;
  v_secret text;
  v_req    bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'service_role_key';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_key is null then
    raise exception 'call_edge_fn: missing vault secret service_role_key';
  end if;

  select net.http_post(
    url     := 'https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/' || p_fn,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-cron-secret', coalesce(v_secret, '')),
    body    := p_body
  ) into v_req;

  return v_req;
end;
$function$;

-- The group broadcast composer (MinistryGroupsManager) saves an audience
-- ('all' | 'leaders' | 'active') and process-scheduled-broadcasts reads it,
-- but the column never existed, so both the save and the job's claim failed.
alter table public.ministry_group_broadcasts
  add column if not exists audience text not null default 'all';

-- Prayer reminders had been switched off while the helper was broken.
select cron.alter_job(job_id := jobid, active := true)
from cron.job where jobname = 'process-prayer-reminders';

commit;
