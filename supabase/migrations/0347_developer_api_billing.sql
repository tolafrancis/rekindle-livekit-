-- 0347_developer_api_billing.sql
-- =====================================================================
-- "Option B" pay-as-you-go billing for the standalone Interactive
-- Meetings API (2026-09-14) — the free plan (10 hrs/month, see
-- meetings-api's FREE_TIER) stays exactly as-is; this adds a second,
-- opt-in plan with NO monthly base fee, metered purely on real
-- participant-minutes past that same free allotment.
--
-- Real cost basis this is priced against: production runs on LiveKit
-- Cloud's "Ship" plan ($50/mo, 150,000 WebRTC connection-minutes
-- included, $0.0005/min overage; 250GB data transfer included, then
-- $0.12/GB) — confirmed live 2026-09-14 (livekit.rekindlebc.com, the
-- self-hosted domain the repo's docs describe, doesn't even respond;
-- every real session actually connects to LiveKit Cloud). Marginal cost
-- past the included pools works out to roughly $0.07-0.15/participant-
-- hour depending on video bandwidth. See meetings-api's PAY_AS_YOU_GO
-- comment for the resulting price.
--
-- Why a new participants table, not just api_meetings.duration_minutes:
-- billing is per PARTICIPANT-minute (a 30-min meeting with 5 people is
-- 150 billable minutes), and duration_minutes is the room's BOOKED
-- length at creation time anyway (a quota estimate, not measured time —
-- see meetings-api's checkFreeTierQuota comment), not even real room
-- duration. Only LiveKit's own participant_joined/participant_left
-- webhook events (now handled in livekit-webhook/index.ts, scoped to
-- this API's "api-" room-name prefix only) can measure the real thing.
-- =====================================================================

begin;

create table if not exists public.api_meeting_participants (
  id                    uuid primary key default gen_random_uuid(),
  meeting_id            uuid not null references public.api_meetings(id) on delete cascade,
  -- Denormalized from api_meetings.owner_user_id — every usage/billing
  -- query below is "sum this account's minutes this month", not "this
  -- meeting's", so this avoids a join on the hot path.
  owner_user_id         uuid not null references auth.users(id) on delete cascade,
  participant_identity  text not null,
  joined_at             timestamptz not null,
  -- null while the participant is still connected. A reconnect (network
  -- blip, tab reload) opens a SECOND row rather than reusing this one —
  -- see livekit-webhook's participant_left handler for why that's fine
  -- (it closes only the latest open row for that identity).
  left_at               timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists api_meeting_participants_owner_month_idx
  on public.api_meeting_participants (owner_user_id, joined_at);
create index if not exists api_meeting_participants_open_idx
  on public.api_meeting_participants (meeting_id, participant_identity, left_at)
  where left_at is null;

alter table public.api_meeting_participants enable row level security;

create policy "Owner can view own api meeting participants"
  on public.api_meeting_participants for select
  using (auth.uid() = owner_user_id or auth.role() = 'service_role');

create policy "Service role manages api meeting participants"
  on public.api_meeting_participants for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Computed on the fly from api_meeting_participants — no running counter
-- to keep in sync, same philosophy as 0339's header comment for the free
-- plan's own quota check. A still-open row (left_at null — participant
-- never got a left event, e.g. the process died) is closed at the
-- meeting's own ended_at if that's set, else at now() — so a stuck-open
-- row undercounts nothing once the meeting itself has actually ended,
-- and merely keeps accruing (correctly) while a meeting is still live.
create or replace function public.get_developer_participant_minutes(p_owner_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    extract(epoch from (
      least(coalesce(p.left_at, m.ended_at, now()), now())
      - greatest(p.joined_at, date_trunc('month', now()))
    )) / 60.0
  ), 0)
  from public.api_meeting_participants p
  join public.api_meetings m on m.id = p.meeting_id
  where p.owner_user_id = p_owner_user_id
    and coalesce(p.left_at, m.ended_at, now()) >= date_trunc('month', now())
    and p.joined_at <= now();
$$;

grant execute on function public.get_developer_participant_minutes(uuid) to authenticated, service_role;

-- Billing fields for the new 'pay_as_you_go' plan. stripe_subscription_item_id
-- is the METERED line item (see developer-api-keys' 'enable-billing' action) —
-- its presence is what actually gates the higher limits in meetings-api, not
-- plan='pay_as_you_go' alone (a checkout session can complete without the
-- webhook having landed yet).
alter table public.developer_accounts drop constraint if exists developer_accounts_plan_check;
alter table public.developer_accounts
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_item_id text,
  add constraint developer_accounts_plan_check check (plan in ('free', 'pay_as_you_go'));

commit;
