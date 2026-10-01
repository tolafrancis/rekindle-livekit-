-- 0359_partner_plan_hours_and_webinar_cap.sql
-- Pricing revision (agreed with the user after a cost-of-production pass
-- against verified LiveKit Cloud rates, 2026-09-20): no ministry plan stays
-- unlimited on meeting/broadcast hours — Ministry Partner and Ministry Plus
-- previously had NULL (= unlimited) hours, an open-ended cost exposure
-- against a flat subscription price. Growth Partner's 150/150 hours were
-- underwater on LiveKit compute alone at realistic meeting sizes; all three
-- are recapped to keep gross margin positive.
--
-- Also adds webinar_audience_cap — the max attendee count a webinar (HLS,
-- audience never touches LiveKit — Cloudflare R2 delivery, zero egress) may
-- be created with. Deliberately generous and NOT a cost driver the way
-- meeting/broadcast hours are: audience size is free regardless, since only
-- the host+speakers hold a LiveKit connection in webinar mode. This is a
-- distinct cap from interactive-meeting participant counts, which stay
-- small (see FREE_TIER_MEETING_LIMITS.maxParticipants) since those DO cost
-- per participant.

begin;

alter table public.ministry_partner_plans
  add column if not exists webinar_audience_cap integer;

update public.ministry_partner_plans set webinar_audience_cap = 100 where slug = 'starter';

update public.ministry_partner_plans
  set meeting_hours_included = 20, broadcast_hours_included = 20, webinar_audience_cap = 200
  where slug = 'growth_partner';

update public.ministry_partner_plans
  set meeting_hours_included = 30, broadcast_hours_included = 30, webinar_audience_cap = 500
  where slug = 'ministry_partner';

update public.ministry_partner_plans
  set meeting_hours_included = 60, broadcast_hours_included = 60, webinar_audience_cap = 1000
  where slug = 'ministry_plus';

commit;
