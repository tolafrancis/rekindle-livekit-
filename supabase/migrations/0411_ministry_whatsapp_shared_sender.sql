-- 0411_ministry_whatsapp_shared_sender.sql
--
-- "Send via Rekindle": a ministry can broadcast WhatsApp messages from
-- Rekindle's own shared number, paid per message from wallet credits,
-- without connecting a WhatsApp Business Account of its own.
--
--   - ministry_whatsapp_configs.shared_sender_enabled: the leader turned
--     this on, so members see the "WhatsApp Updates" opt-in card in the
--     ministry space even though no WABA is connected.
--   - ministry_whatsapp_broadcasts.sender: which number a broadcast went
--     out from, so shared-number sends don't eat into a plan's included
--     monthly messages and the daily shared-number limit can be counted.
--   - ministry_whatsapp_optin_info(): what the member opt-in card needs.
--     Members can't read ministry_whatsapp_configs (leaders only, by RLS),
--     so the card used to read nothing and stayed hidden for every member:
--     no ministry has a single opted-in subscriber. This returns only
--     whether opting in is possible and the public sender number.

begin;

alter table public.ministry_whatsapp_configs
  add column if not exists shared_sender_enabled boolean not null default false;

alter table public.ministry_whatsapp_broadcasts
  add column if not exists sender text not null default 'ministry';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ministry_whatsapp_broadcasts_sender_check'
  ) then
    alter table public.ministry_whatsapp_broadcasts
      add constraint ministry_whatsapp_broadcasts_sender_check
      check (sender in ('ministry', 'rekindle'));
  end if;
end $$;

create index if not exists ministry_whatsapp_broadcasts_ministry_sender_sent_idx
  on public.ministry_whatsapp_broadcasts (ministry_id, sender, sent_at);

create or replace function public.ministry_whatsapp_optin_info(p_ministry_id uuid)
returns table (available boolean, sender_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select
    (c.connection_status = 'connected' or c.shared_sender_enabled) as available,
    case when c.connection_status = 'connected'
         then nullif(coalesce(nullif(c.phone_number_display, ''), replace(c.twilio_from_number, 'whatsapp:', '')), '')
    end as sender_phone
  from public.ministry_whatsapp_configs c
  where c.ministry_id = p_ministry_id;
$$;

revoke all on function public.ministry_whatsapp_optin_info(uuid) from public;
grant execute on function public.ministry_whatsapp_optin_info(uuid) to authenticated;

-- Wallet credits now pay for real messages on Rekindle's number, so a user
-- must not be able to write their own balance. The old "users_own_wallet"
-- / "users_own_wallet_transactions" policies allowed ALL on your own row,
-- i.e. `update broadcast_wallets set balance_credits = 1000000` straight
-- from the browser. Users keep read access and may create their own empty
-- wallet (BroadcastWallet.tsx does that on first load); balances change only
-- through the service role (top-up webhook, broadcast deductions) or a
-- platform admin (AdminWhatsAppManager's "grant credits").
--
-- The old policies are narrowed to service_role (which bypasses RLS anyway)
-- rather than dropped: this is exactly what production was given on
-- 2026-10-13, where DROP POLICY stalled behind a confirmation prompt.
alter policy users_own_wallet on public.broadcast_wallets to service_role;
drop policy if exists users_read_own_wallet on public.broadcast_wallets;
drop policy if exists users_create_own_empty_wallet on public.broadcast_wallets;
drop policy if exists platform_admins_manage_wallets on public.broadcast_wallets;

create policy users_read_own_wallet on public.broadcast_wallets
  for select to authenticated
  using (user_id = auth.uid());

create policy users_create_own_empty_wallet on public.broadcast_wallets
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and coalesce(balance_credits, 0) = 0
    and coalesce(total_purchased, 0) = 0
    and coalesce(total_used, 0) = 0
  );

create policy platform_admins_manage_wallets on public.broadcast_wallets
  for all to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.user_id = auth.uid()
                   and p.role in ('super_admin', 'platform_admin', 'admin')))
  with check (exists (select 1 from public.user_profiles p
                      where p.user_id = auth.uid()
                        and p.role in ('super_admin', 'platform_admin', 'admin')));

alter policy users_own_wallet_transactions on public.broadcast_wallet_transactions to service_role;
drop policy if exists users_read_own_wallet_transactions on public.broadcast_wallet_transactions;
drop policy if exists platform_admins_manage_wallet_transactions on public.broadcast_wallet_transactions;

create policy users_read_own_wallet_transactions on public.broadcast_wallet_transactions
  for select to authenticated
  using (user_id = auth.uid());

create policy platform_admins_manage_wallet_transactions on public.broadcast_wallet_transactions
  for all to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.user_id = auth.uid()
                   and p.role in ('super_admin', 'platform_admin', 'admin')))
  with check (exists (select 1 from public.user_profiles p
                      where p.user_id = auth.uid()
                        and p.role in ('super_admin', 'platform_admin', 'admin')));

commit;
