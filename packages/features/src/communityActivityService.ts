import { supabase } from '@rekindle/supabase';

export type CommunityActivityType = 
  | 'prayer_series_started'
  | 'prayer_series_completed'
  | 'prayer_series_day_completed'
  | 'prayer_watch_joined'
  | 'prayer_watch_completed'
  | 'prayer_topic_completed'
  | 'devotional_started'
  | 'devotional_completed'
  | 'devotional_day_completed'
  | 'book_started'
  | 'book_completed'
  | 'live_channel_joined'
  | 'live_channel_event_attended'
  | 'prayer_milestone'
  | 'streak_milestone';

interface ActivityMetadata {
  seriesId?: string;
  seriesTitle?: string;
  dayNumber?: number;
  totalDays?: number;
  prayerWatchId?: string;
  prayerWatchTopic?: string;
  devotionalId?: string;
  devotionalTitle?: string;
  bookId?: string;
  bookTitle?: string;
  channelId?: string;
  channelName?: string;
  eventId?: string;
  eventTitle?: string;
  streakCount?: number;
  milestoneType?: string;
  [key: string]: any;
}

interface CreateActivityParams {
  userId: string;
  userName: string;
  userAvatar?: string;
  activityType: CommunityActivityType;
  title: string;
  description?: string;
  content?: string;
  metadata?: ActivityMetadata;
}

/** Metadata keys that name what someone prayed, read or watched. The feed
 *  only says what a person did, so these are never stored on an activity. */
const PRIVATE_METADATA_KEY = /(Title|Topic|Name)$/;

const publicMetadata = (kind: CommunityActivityType, metadata?: ActivityMetadata): ActivityMetadata => {
  const out: ActivityMetadata = { kind };
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (!PRIVATE_METADATA_KEY.test(key)) out[key] = value;
  }
  return out;
};

/**
 * Post a new activity to the community feed. Only what the person did is
 * stored (e.g. "Prayed in the Prayer Library") — never the prayer, topic,
 * series, devotional or book — so params.title/description/content stay on
 * this device.
 */
export const postCommunityActivity = async (params: CreateActivityParams): Promise<void> => {
  try {
    const summary = describeCommunityActivity({
      activity_type: mapActivityType(params.activityType),
      metadata: { kind: params.activityType, streakCount: params.metadata?.streakCount },
    });
    const { data, error } = await supabase
      .from('community_activities')
      .insert({
        user_id: params.userId,
        user_name: params.userName,
        user_avatar: params.userAvatar,
        activity_type: mapActivityType(params.activityType),
        title: summary.text,
        description: null,
        content: null,
        metadata: publicMetadata(params.activityType, params.metadata),
        reaction_count: 0
      });

    if (error) {
      console.error('Error posting community activity:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to post community activity:', error);
  }
};

export interface ActivitySummary {
  /** communityActivityFeed translation key */
  key: string;
  /** English text, used when there's no translation */
  text: string;
}

const SUMMARIES: Record<CommunityActivityType, ActivitySummary> = {
  prayer_topic_completed: { key: 'didPrayLibrary', text: 'Prayed in the Prayer Library' },
  prayer_series_started: { key: 'didStartPrayerSeries', text: 'Started a prayer series' },
  prayer_series_day_completed: { key: 'didPrayerSeriesDay', text: 'Prayed through a day of a prayer series' },
  prayer_series_completed: { key: 'didCompletePrayerSeries', text: 'Completed a prayer series 🎉' },
  prayer_watch_joined: { key: 'didJoinPrayerWatch', text: 'Joined a prayer watch' },
  prayer_watch_completed: { key: 'didCompletePrayerWatch', text: 'Completed a prayer watch session' },
  devotional_started: { key: 'didStartDevotional', text: 'Started a devotional' },
  devotional_day_completed: { key: 'didDevotionalDay', text: 'Completed a day of a devotional' },
  devotional_completed: { key: 'didCompleteDevotional', text: 'Completed a devotional 🙏' },
  book_started: { key: 'didStartBook', text: 'Started reading a book' },
  book_completed: { key: 'didFinishBook', text: 'Finished reading a book 📚' },
  live_channel_joined: { key: 'didJoinLiveChannel', text: 'Joined a live channel' },
  live_channel_event_attended: { key: 'didAttendLiveEvent', text: 'Attended a live event' },
  prayer_milestone: { key: 'didPrayerMilestone', text: 'Reached a prayer milestone' },
  streak_milestone: { key: 'didStreak', text: 'Reached a prayer streak 🔥' },
};

/** Older rows predate metadata.kind; work it out from what they did store. */
const inferKind = (title: string, m: ActivityMetadata): CommunityActivityType | null => {
  const started = /^started/i.test(title);
  if (m.streakCount) return 'streak_milestone';
  if (m.topicId) return 'prayer_topic_completed';
  if (m.prayerWatchId || m.prayerWatchTopic) return /^joined/i.test(title) ? 'prayer_watch_joined' : 'prayer_watch_completed';
  if (m.seriesId) return started ? 'prayer_series_started' : /day \d/i.test(title) ? 'prayer_series_day_completed' : 'prayer_series_completed';
  if (m.devotionalId) return started ? 'devotional_started' : /day \d/i.test(title) ? 'devotional_day_completed' : 'devotional_completed';
  if (m.bookId) return started ? 'book_started' : 'book_completed';
  if (m.eventId || m.eventTitle) return 'live_channel_event_attended';
  if (m.channelId) return 'live_channel_joined';
  return null;
};

const GENERIC_SUMMARIES: Record<string, ActivitySummary> = {
  prayer: { key: 'didPray', text: 'Spent time in prayer' },
  devotional_completed: { key: 'didDevotional', text: 'Spent time in a devotional' },
  milestone: { key: 'didMilestone', text: 'Reached a milestone 🎉' },
  streak: { key: 'didStreak', text: 'Reached a prayer streak 🔥' },
  challenge_completed: { key: 'didChallenge', text: 'Completed a challenge' },
};

/**
 * What a community activity says in the feed: only what the person did,
 * never what they prayed, read or watched.
 */
export const describeCommunityActivity = (activity: {
  activity_type: string;
  title?: string | null;
  metadata?: ActivityMetadata | null;
}): ActivitySummary => {
  const m = activity.metadata ?? {};
  const kind = (m.kind as CommunityActivityType | undefined) ?? inferKind(activity.title ?? '', m);
  if (kind === 'streak_milestone' && m.streakCount) {
    return { key: 'didStreakDays', text: `Reached a ${m.streakCount}-day prayer streak 🔥` };
  }
  return (kind && SUMMARIES[kind]) || GENERIC_SUMMARIES[activity.activity_type] || GENERIC_SUMMARIES.prayer;
};

/**
 * Map specific activity types to general categories for the community feed
 */
const mapActivityType = (type: CommunityActivityType): string => {
  const typeMap: Record<CommunityActivityType, string> = {
    'prayer_series_started': 'prayer',
    'prayer_series_completed': 'milestone',
    'prayer_series_day_completed': 'prayer',
    'prayer_watch_joined': 'prayer',
    'prayer_watch_completed': 'prayer',
    'prayer_topic_completed': 'prayer',
    'devotional_started': 'devotional_completed',
    'devotional_completed': 'milestone',
    'devotional_day_completed': 'devotional_completed',
    'book_started': 'devotional_completed',
    'book_completed': 'milestone',
    'live_channel_joined': 'prayer',
    'live_channel_event_attended': 'prayer',
    'prayer_milestone': 'milestone',
    'streak_milestone': 'streak'
  };

  return typeMap[type] || 'prayer';
};

/**
 * Create activity for starting a prayer series
 */
export const postPrayerSeriesStarted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  seriesId: string,
  seriesTitle: string,
  totalDays: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'prayer_series_started',
    title: `Started "${seriesTitle}" prayer series`,
    description: `Embarking on a ${totalDays}-day prayer journey`,
    metadata: {
      seriesId,
      seriesTitle,
      totalDays,
      dayNumber: 1
    }
  });
};

/**
 * Create activity for completing a prayer series
 */
export const postPrayerSeriesCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  seriesId: string,
  seriesTitle: string,
  totalDays: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'prayer_series_completed',
    title: `Completed "${seriesTitle}" prayer series! 🎉`,
    description: `Finished all ${totalDays} days of prayer`,
    content: `Praise God! Completed the ${seriesTitle} prayer series`,
    metadata: {
      seriesId,
      seriesTitle,
      totalDays,
      milestoneType: 'series_completion'
    }
  });
};

/**
 * Create activity for completing a prayer series day
 */
export const postPrayerSeriesDayCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  seriesId: string,
  seriesTitle: string,
  dayNumber: number,
  totalDays: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'prayer_series_day_completed',
    title: `Completed Day ${dayNumber} of "${seriesTitle}"`,
    description: `Prayer journey progress: ${dayNumber}/${totalDays} days`,
    metadata: {
      seriesId,
      seriesTitle,
      dayNumber,
      totalDays
    }
  });
};

/**
 * Create activity for joining a prayer watch
 */
export const postPrayerWatchJoined = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  prayerWatchId: string,
  prayerWatchTopic: string,
  timeSlot: string
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'prayer_watch_joined',
    title: `Joined prayer watch: ${prayerWatchTopic}`,
    description: `Committed to pray at ${timeSlot}`,
    metadata: {
      prayerWatchId,
      prayerWatchTopic,
      timeSlot
    }
  });
};

/**
 * Create activity for completing a prayer watch session
 */
export const postPrayerWatchCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  prayerWatchId: string,
  prayerWatchTopic: string,
  duration: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'prayer_watch_completed',
    title: `Completed prayer watch session`,
    description: `Prayed over ${prayerWatchTopic}`,
    metadata: {
      prayerWatchId,
      prayerWatchTopic,
      duration
    }
  });
};

/**
 * Create activity for completing a prayer topic
 */
export const postPrayerTopicCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  topicId: string,
  topicTitle: string,
  duration: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'prayer_topic_completed',
    title: `Prayed for ${topicTitle}`,
    description: `Lifted this up in prayer`,
    metadata: {
      topicId,
      topicTitle,
      duration
    }
  });
};

/**
 * Create activity for starting a devotional
 */
export const postDevotionalStarted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  devotionalId: string,
  devotionalTitle: string,
  totalDays: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'devotional_started',
    title: `Started "${devotionalTitle}" devotional`,
    description: `Beginning a ${totalDays}-day devotional journey`,
    metadata: {
      devotionalId,
      devotionalTitle,
      totalDays,
      dayNumber: 1
    }
  });
};

/**
 * Create activity for completing a devotional
 */
export const postDevotionalCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  devotionalId: string,
  devotionalTitle: string,
  totalDays: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'devotional_completed',
    title: `Completed "${devotionalTitle}" devotional! 🙏`,
    description: `Finished all ${totalDays} days`,
    content: `Completed the ${devotionalTitle} devotional series`,
    metadata: {
      devotionalId,
      devotionalTitle,
      totalDays,
      milestoneType: 'devotional_completion'
    }
  });
};

/**
 * Create activity for completing a devotional day
 */
export const postDevotionalDayCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  devotionalId: string,
  devotionalTitle: string,
  dayNumber: number,
  totalDays: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'devotional_day_completed',
    title: `Completed Day ${dayNumber} of "${devotionalTitle}"`,
    description: `Devotional progress: ${dayNumber}/${totalDays} days`,
    metadata: {
      devotionalId,
      devotionalTitle,
      dayNumber,
      totalDays
    }
  });
};

/**
 * Create activity for starting a book
 */
export const postBookStarted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  bookId: string,
  bookTitle: string,
  author: string
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'book_started',
    title: `Started reading "${bookTitle}"`,
    description: `By ${author}`,
    metadata: {
      bookId,
      bookTitle,
      author
    }
  });
};

/**
 * Create activity for completing a book
 */
export const postBookCompleted = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  bookId: string,
  bookTitle: string,
  author: string
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'book_completed',
    title: `Finished reading "${bookTitle}" 📚`,
    description: `By ${author}`,
    content: `Completed reading ${bookTitle}`,
    metadata: {
      bookId,
      bookTitle,
      author,
      milestoneType: 'book_completion'
    }
  });
};

/**
 * Create activity for joining a live channel
 */
export const postLiveChannelJoined = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  channelId: string,
  channelName: string
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'live_channel_joined',
    title: `Joined live channel: ${channelName}`,
    description: 'Joining the community in live worship',
    metadata: {
      channelId,
      channelName
    }
  });
};

/**
 * Create activity for attending a live channel event
 */
export const postLiveChannelEventAttended = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  eventId: string,
  eventTitle: string,
  channelName: string
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'live_channel_event_attended',
    title: `Attended "${eventTitle}"`,
    description: `Live event on ${channelName}`,
    metadata: {
      eventId,
      eventTitle,
      channelName
    }
  });
};

/**
 * Create activity for prayer streak milestone
 */
export const postStreakMilestone = async (
  userId: string,
  userName: string,
  userAvatar: string | undefined,
  streakCount: number
) => {
  await postCommunityActivity({
    userId,
    userName,
    userAvatar,
    activityType: 'streak_milestone',
    title: `${streakCount}-day prayer streak! 🔥`,
    description: `Maintaining consistent prayer for ${streakCount} days`,
    content: `Achieved a ${streakCount}-day prayer streak!`,
    metadata: {
      streakCount,
      milestoneType: 'streak'
    }
  });
};

/**
 * Batch update for tracking multiple day completions (silent updates)
 */
export const trackProgressSilently = async (
  userId: string,
  activityType: 'prayer' | 'devotional',
  itemId: string,
  dayNumber: number
) => {
  try {
    await supabase
      .from('user_progress_tracking')
      .upsert({
        user_id: userId,
        activity_type: activityType,
        item_id: itemId,
        current_day: dayNumber,
        last_updated: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error tracking progress:', error);
  }
};