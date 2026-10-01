-- 0365_webinar_speaker_invite_accept.sql
-- The "Speakers & co-hosts" section of CreateWebinarWizard.tsx has inserted
-- webinar_speakers rows (status='invited', user_id=null) since 0354, but
-- nothing ever turned that into a real invite: no email, no link, no way
-- for the invitee to claim the row. seatConfirmedWebinarSpeakers only seats
-- rows where status='confirmed' AND user_id is set, so every pre-assigned
-- speaker was a permanent dead end. This adds a public, tokenized
-- lookup/accept pair so an emailed link can (a) show who's inviting them to
-- what, unauthenticated, and (b) claim the row once they're signed in.
--
-- NOTE on RLS: 0354's "invited speaker reads own row"/"responds" policies
-- key on user_id = auth.uid(), which can never match an unclaimed row
-- (user_id is null until claimed) — a real gap. Not widening RLS itself
-- here; both new functions are SECURITY DEFINER and do their own narrow
-- checks, which is the safer fix for a token-based flow (RLS would need to
-- trust a token passed as a query param, which doesn't fit the auth.uid()
-- shape those policies use).

begin;

alter table public.webinar_speakers
  add column if not exists invite_token uuid not null default gen_random_uuid();

create unique index if not exists uq_webinar_speakers_invite_token
  on public.webinar_speakers (invite_token);

-- Public-safe lookup: no auth required (the link is emailed, clicked before
-- sign-in), so this deliberately exposes only display fields, never emails/
-- ids of other speakers. Mirrors public_ministry_name's anon-grant pattern.
create or replace function public.get_webinar_speaker_invite(p_token uuid)
returns table (
  webinar_id     uuid,
  ministry_id    uuid,
  webinar_title  text,
  ministry_name  text,
  role           text,
  status         text,
  invited_name   text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id, w.ministry_id, w.title,
    public.public_ministry_name(w.ministry_id),
    s.role, s.status, s.invited_name
  from public.webinar_speakers s
  join public.ministry_webinars w on w.id = s.webinar_id
  where s.invite_token = p_token;
$$;

grant execute on function public.get_webinar_speaker_invite(uuid) to anon, authenticated;

-- Claims the row for the signed-in caller. Idempotent if they've already
-- claimed it themselves (double-click / re-visit); rejects a token that's
-- unknown, already declined/removed, or already claimed by a different user.
create or replace function public.accept_webinar_speaker_invite(p_token uuid)
returns table (webinar_id uuid, ministry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.webinar_speakers;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to accept an invite';
  end if;

  select * into v_row from public.webinar_speakers where invite_token = p_token;
  if v_row.id is null then
    raise exception 'Invite not found';
  end if;

  if v_row.user_id is not null and v_row.user_id != auth.uid() then
    raise exception 'This invite has already been claimed';
  end if;

  if v_row.status not in ('invited', 'confirmed') then
    raise exception 'This invite is no longer available';
  end if;

  update public.webinar_speakers
    set user_id = auth.uid(),
        status = 'confirmed',
        responded_at = coalesce(responded_at, now())
    where id = v_row.id;

  return query
    select w.id, w.ministry_id from public.ministry_webinars w where w.id = v_row.webinar_id;
end;
$$;

grant execute on function public.accept_webinar_speaker_invite(uuid) to authenticated;

commit;
