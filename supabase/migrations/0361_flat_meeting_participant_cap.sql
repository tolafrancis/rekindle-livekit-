-- 0361_flat_meeting_participant_cap.sql
-- Product decision (2026-09-21): the dynamic per-meeting overflow-to-HLS
-- feature (migration 0360's tier-varying 50/100/200/500 meeting_participant_cap,
-- and the livekit-token/livekit-egress code that enforced + reactively
-- streamed past it) is removed entirely. Replaced with a much simpler model:
-- every meeting, on every tier, has the same flat 100-participant ceiling
-- (enforced as a code constant, MEETING_PARTICIPANT_CAP in livekit-token/
-- index.ts — no per-tier variation, so nothing to store per-row for this).
-- A host expecting 100+ attendees must create a Webinar instead (its own,
-- separate audience-cap column, webinar_audience_cap, is unaffected by this).
--
-- This migration just normalizes the now-stale tier-varying values (50/100/
-- 200/500) to a flat 100, so the stored data doesn't contradict the actual
-- enforced policy if anyone reads this table later.

begin;

update public.ministry_partner_plans set meeting_participant_cap = 100;

commit;
