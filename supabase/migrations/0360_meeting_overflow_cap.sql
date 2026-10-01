-- 0360_meeting_overflow_cap.sql
-- Dynamic meeting overflow: a single Interactive Meeting now gracefully
-- degrades past a fixed real-participant ("staged") ceiling instead of
-- requiring a separate Webinar to be created up front. Agreed design
-- (2026-09-20):
--   - 100 staged seats is a fixed, platform-wide constant (STAGED_SEAT_CAP
--     in livekit-token/index.ts and livekit-egress/index.ts) — NOT stored
--     per-tier, since it's a technical ceiling, not a priced lever.
--   - meeting_participant_cap (this column) is the per-tier TOTAL attendance
--     ceiling for one meeting (staged + HLS-overflow combined). Starter/
--     Growth never exceed 100 staged seats, so they never trigger overflow.
--     Ministry Partner/Plus can: the first 100 joiners get real seats,
--     everyone from #101 up to this cap becomes an automatic HLS viewer via
--     reactive Egress (starts only when the 101st person actually joins).
--   - The separate, dedicated Webinar meeting type (ministry_webinars) is
--     UNCHANGED and coexists — this is for meetings that didn't plan to be
--     a broadcast from the start.

begin;

alter table public.ministry_partner_plans
  add column if not exists meeting_participant_cap integer;

update public.ministry_partner_plans set meeting_participant_cap = 50  where slug = 'starter';
update public.ministry_partner_plans set meeting_participant_cap = 100 where slug = 'growth_partner';
update public.ministry_partner_plans set meeting_participant_cap = 200 where slug = 'ministry_partner';
update public.ministry_partner_plans set meeting_participant_cap = 500 where slug = 'ministry_plus';

commit;
