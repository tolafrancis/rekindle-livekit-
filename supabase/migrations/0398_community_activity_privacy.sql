-- 0398_community_activity_privacy.sql
--
-- The community feed now says only what someone did ("Prayed in the Prayer
-- Library"), never what they prayed, read or watched, and new activities no
-- longer store those details (communityActivityService.ts). This removes them
-- from existing rows too, since anyone with the app's public key could still
-- read them directly:
--
--   - description and content (the prayer text, "Prayed over <topic>", ...)
--     are cleared;
--   - title becomes the same plain sentence the app shows;
--   - metadata keeps ids and numbers but loses every *Title / *Topic / *Name
--     key, and gains "kind" (what the person did), which the app reads first.
--
-- The kind rules mirror inferKind() in communityActivityService.ts.
-- Irreversible: the removed text isn't kept anywhere.

begin;

with classified as (
  select
    a.id,
    coalesce(
      a.metadata->>'kind',
      case
        when a.metadata->>'streakCount' is not null then 'streak_milestone'
        when a.metadata ? 'topicId' then 'prayer_topic_completed'
        when a.metadata ? 'prayerWatchId' or a.metadata ? 'prayerWatchTopic' then
          case when a.title ~* '^joined' then 'prayer_watch_joined' else 'prayer_watch_completed' end
        when a.metadata ? 'seriesId' then
          case when a.title ~* '^started' then 'prayer_series_started'
               when a.title ~* 'day [0-9]' then 'prayer_series_day_completed'
               else 'prayer_series_completed' end
        when a.metadata ? 'devotionalId' then
          case when a.title ~* '^started' then 'devotional_started'
               when a.title ~* 'day [0-9]' then 'devotional_day_completed'
               else 'devotional_completed' end
        when a.metadata ? 'bookId' then
          case when a.title ~* '^started' then 'book_started' else 'book_completed' end
        when a.metadata ? 'eventId' or a.metadata ? 'eventTitle' then 'live_channel_event_attended'
        when a.metadata ? 'channelId' then 'live_channel_joined'
      end
    ) as kind,
    case when jsonb_typeof(a.metadata) = 'object' then
      coalesce((select jsonb_object_agg(e.key, e.value)
                  from jsonb_each(a.metadata) e
                 where e.key !~ '(Title|Topic|Name)$'), '{}'::jsonb)
    else '{}'::jsonb end as safe_metadata
  from public.community_activities a
)
update public.community_activities a
   set title = case c.kind
         when 'prayer_topic_completed'      then 'Prayed in the Prayer Library'
         when 'prayer_series_started'       then 'Started a prayer series'
         when 'prayer_series_day_completed' then 'Prayed through a day of a prayer series'
         when 'prayer_series_completed'     then 'Completed a prayer series 🎉'
         when 'prayer_watch_joined'         then 'Joined a prayer watch'
         when 'prayer_watch_completed'      then 'Completed a prayer watch session'
         when 'devotional_started'          then 'Started a devotional'
         when 'devotional_day_completed'    then 'Completed a day of a devotional'
         when 'devotional_completed'        then 'Completed a devotional 🙏'
         when 'book_started'                then 'Started reading a book'
         when 'book_completed'              then 'Finished reading a book 📚'
         when 'live_channel_joined'         then 'Joined a live channel'
         when 'live_channel_event_attended' then 'Attended a live event'
         when 'prayer_milestone'            then 'Reached a prayer milestone'
         when 'streak_milestone'            then
           coalesce('Reached a ' || (a.metadata->>'streakCount') || '-day prayer streak 🔥', 'Reached a prayer streak 🔥')
         else case a.activity_type
           when 'devotional_completed' then 'Spent time in a devotional'
           when 'milestone'            then 'Reached a milestone 🎉'
           when 'streak'               then 'Reached a prayer streak 🔥'
           when 'challenge_completed'  then 'Completed a challenge'
           else 'Spent time in prayer'
         end
       end,
       description = null,
       content = null,
       metadata = case when c.kind is null then c.safe_metadata
                       else c.safe_metadata || jsonb_build_object('kind', c.kind) end
  from classified c
 where c.id = a.id;

commit;
