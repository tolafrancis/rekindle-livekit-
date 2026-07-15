-- 0159_notify_followers_on_channel_live.sql
-- =====================================================================
-- When a live channel goes live (is_live false -> true), drop an IN-APP notification
-- to every follower who has notifications enabled (channel_followers.notifications_enabled),
-- except the broadcaster. The bell/NotificationFeed reads public.notifications live.
-- (Push is fired separately from the client via send-push-notification.)
-- =====================================================================

begin;

create or replace function public.notify_followers_on_channel_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_live = true and coalesce(old.is_live, false) = false then
    insert into public.notifications (user_id, type, title, message, link, is_read)
    select cf.user_id,
           'channel_live',
           '🔴 ' || new.name || ' is live',
           new.name || ' just went live — tap to watch now.',
           '/live-channels',
           false
    from public.channel_followers cf
    where cf.channel_id = new.id
      and cf.user_id is not null
      and coalesce(cf.notifications_enabled, true) = true
      and cf.user_id <> new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_channel_live on public.live_channels;
create trigger trg_notify_followers_on_channel_live
  after update of is_live on public.live_channels
  for each row
  execute function public.notify_followers_on_channel_live();

commit;
