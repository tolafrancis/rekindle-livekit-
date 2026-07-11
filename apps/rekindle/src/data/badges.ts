export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  tier: BadgeTier;
  earned: boolean;
  progress?: number;
  target?: number;
  rarity: BadgeRarity;
  points: number;
  unlockDate?: string;
  nextTier?: string;
}

export type BadgeCategory = 
  | 'prayer'
  | 'devotional'
  | 'live_channel'
  | 'community'
  | 'mentorship'
  | 'referral'
  | 'scripture'
  | 'streak'
  | 'ai_companion'
  | 'counselling'
  | 'special';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const badges: Badge[] = [
  // PRAYER LIBRARY BADGES
  {
    id: 'prayer_warrior_1',
    name: 'Prayer Warrior I',
    description: 'Complete 10 prayer sessions',
    icon: '🙏',
    category: 'prayer',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'common',
    points: 10,
    nextTier: 'prayer_warrior_2'
  },
  {
    id: 'prayer_warrior_2',
    name: 'Prayer Warrior II',
    description: 'Complete 50 prayer sessions',
    icon: '🙏',
    category: 'prayer',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'uncommon',
    points: 25,
    nextTier: 'prayer_warrior_3'
  },
  {
    id: 'prayer_warrior_3',
    name: 'Prayer Warrior III',
    description: 'Complete 100 prayer sessions',
    icon: '🙏',
    category: 'prayer',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 100,
    rarity: 'rare',
    points: 50,
    nextTier: 'prayer_warrior_4'
  },
  {
    id: 'prayer_warrior_4',
    name: 'Prayer Warrior IV',
    description: 'Complete 250 prayer sessions',
    icon: '🙏',
    category: 'prayer',
    tier: 'platinum',
    earned: false,
    progress: 0,
    target: 250,
    rarity: 'epic',
    points: 100,
    nextTier: 'prayer_warrior_5'
  },
  {
    id: 'prayer_warrior_5',
    name: 'Prayer Warrior Master',
    description: 'Complete 500 prayer sessions',
    icon: '👑',
    category: 'prayer',
    tier: 'diamond',
    earned: false,
    progress: 0,
    target: 500,
    rarity: 'legendary',
    points: 250
  },
  {
    id: 'prayer_series_starter',
    name: 'Series Starter',
    description: 'Start 3 different prayer series',
    icon: '📿',
    category: 'prayer',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 3,
    rarity: 'common',
    points: 15
  },
  {
    id: 'prayer_series_completer',
    name: 'Series Completer',
    description: 'Complete 5 full prayer series',
    icon: '✅',
    category: 'prayer',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'rare',
    points: 75
  },
  {
    id: 'watchman',
    name: 'Watchman',
    description: 'Complete 10 Biblical prayer watches',
    icon: '⏰',
    category: 'prayer',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'uncommon',
    points: 30
  },
  {
    id: 'midnight_intercessor',
    name: 'Midnight Intercessor',
    description: 'Complete 5 midnight prayer watches',
    icon: '🌙',
    category: 'prayer',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'rare',
    points: 60
  },
  {
    id: 'prayer_explorer',
    name: 'Prayer Explorer',
    description: 'Try 15 different prayer topics',
    icon: '🧭',
    category: 'prayer',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 15,
    rarity: 'uncommon',
    points: 25
  },

  // DEVOTIONAL LIBRARY BADGES
  {
    id: 'devotional_disciple_1',
    name: 'Devotional Disciple I',
    description: 'Complete 7 daily devotionals',
    icon: '📖',
    category: 'devotional',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 7,
    rarity: 'common',
    points: 10,
    nextTier: 'devotional_disciple_2'
  },
  {
    id: 'devotional_disciple_2',
    name: 'Devotional Disciple II',
    description: 'Complete 30 daily devotionals',
    icon: '📖',
    category: 'devotional',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 30,
    rarity: 'uncommon',
    points: 30,
    nextTier: 'devotional_disciple_3'
  },
  {
    id: 'devotional_disciple_3',
    name: 'Devotional Disciple III',
    description: 'Complete 90 daily devotionals',
    icon: '📖',
    category: 'devotional',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 90,
    rarity: 'rare',
    points: 75,
    nextTier: 'devotional_disciple_4'
  },
  {
    id: 'devotional_disciple_4',
    name: 'Devotional Master',
    description: 'Complete 365 daily devotionals',
    icon: '📚',
    category: 'devotional',
    tier: 'diamond',
    earned: false,
    progress: 0,
    target: 365,
    rarity: 'legendary',
    points: 200
  },
  {
    id: 'devotional_series_finisher',
    name: 'Series Finisher',
    description: 'Complete 3 full devotional series',
    icon: '🎯',
    category: 'devotional',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 3,
    rarity: 'rare',
    points: 50
  },
  {
    id: 'devotional_bookworm',
    name: 'Devotional Bookworm',
    description: 'Bookmark 20 devotionals',
    icon: '🔖',
    category: 'devotional',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 20,
    rarity: 'common',
    points: 15
  },
  {
    id: 'reflection_master',
    name: 'Reflection Master',
    description: 'Add reflections to 25 devotionals',
    icon: '💭',
    category: 'devotional',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 25,
    rarity: 'uncommon',
    points: 30
  },

  // LIVE CHANNEL BADGES
  {
    id: 'channel_viewer_1',
    name: 'Channel Viewer I',
    description: 'Watch 5 live channel broadcasts',
    icon: '📺',
    category: 'live_channel',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'common',
    points: 10,
    nextTier: 'channel_viewer_2'
  },
  {
    id: 'channel_viewer_2',
    name: 'Channel Viewer II',
    description: 'Watch 25 live channel broadcasts',
    icon: '📺',
    category: 'live_channel',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 25,
    rarity: 'uncommon',
    points: 25,
    nextTier: 'channel_viewer_3'
  },
  {
    id: 'channel_viewer_3',
    name: 'Channel Viewer III',
    description: 'Watch 100 live channel broadcasts',
    icon: '📺',
    category: 'live_channel',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 100,
    rarity: 'rare',
    points: 75
  },
  {
    id: 'channel_creator',
    name: 'Channel Creator',
    description: 'Create your first live channel',
    icon: '🎬',
    category: 'live_channel',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'uncommon',
    points: 40
  },
  {
    id: 'broadcaster_1',
    name: 'Broadcaster I',
    description: 'Host 5 live broadcasts',
    icon: '🎙️',
    category: 'live_channel',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'uncommon',
    points: 30,
    nextTier: 'broadcaster_2'
  },
  {
    id: 'broadcaster_2',
    name: 'Broadcaster II',
    description: 'Host 20 live broadcasts',
    icon: '🎙️',
    category: 'live_channel',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 20,
    rarity: 'rare',
    points: 80,
    nextTier: 'broadcaster_3'
  },
  {
    id: 'broadcaster_3',
    name: 'Master Broadcaster',
    description: 'Host 50 live broadcasts',
    icon: '👑',
    category: 'live_channel',
    tier: 'diamond',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'legendary',
    points: 200
  },
  {
    id: 'channel_supporter',
    name: 'Channel Supporter',
    description: 'Follow 10 live channels',
    icon: '💙',
    category: 'live_channel',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'common',
    points: 15
  },
  {
    id: 'event_attendee',
    name: 'Event Attendee',
    description: 'Attend 10 scheduled live events',
    icon: '📅',
    category: 'live_channel',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'uncommon',
    points: 25
  },
  {
    id: 'chat_engager',
    name: 'Chat Engager',
    description: 'Send 100 messages in live channel chats',
    icon: '💬',
    category: 'live_channel',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 100,
    rarity: 'common',
    points: 20
  },

  // COMMUNITY BADGES
  {
    id: 'community_starter',
    name: 'Community Starter',
    description: 'Make your first post',
    icon: '✨',
    category: 'community',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'common',
    points: 5
  },
  {
    id: 'active_member',
    name: 'Active Member',
    description: 'Post 25 times in the community',
    icon: '🌟',
    category: 'community',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 25,
    rarity: 'uncommon',
    points: 30
  },
  {
    id: 'community_leader',
    name: 'Community Leader',
    description: 'Post 100 times in the community',
    icon: '👥',
    category: 'community',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 100,
    rarity: 'rare',
    points: 75
  },
  {
    id: 'prayer_request_supporter',
    name: 'Prayer Supporter',
    description: 'Pray for 50 community prayer requests',
    icon: '🤝',
    category: 'community',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'uncommon',
    points: 35
  },
  {
    id: 'encourager',
    name: 'Encourager',
    description: 'React to 100 community posts',
    icon: '❤️',
    category: 'community',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 100,
    rarity: 'common',
    points: 20
  },
  {
    id: 'testimony_sharer',
    name: 'Testimony Sharer',
    description: 'Share 5 testimonies',
    icon: '🙌',
    category: 'community',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'uncommon',
    points: 40
  },
  {
    id: 'group_founder',
    name: 'Group Founder',
    description: 'Create a prayer group',
    icon: '👥',
    category: 'community',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'uncommon',
    points: 35
  },
  {
    id: 'group_leader',
    name: 'Group Leader',
    description: 'Lead 20 group prayer sessions',
    icon: '🎯',
    category: 'community',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 20,
    rarity: 'rare',
    points: 60
  },

  // STREAK BADGES
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: '🔥',
    category: 'streak',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 7,
    rarity: 'common',
    points: 15,
    nextTier: 'month_champion'
  },
  {
    id: 'month_champion',
    name: 'Month Champion',
    description: 'Maintain a 30-day streak',
    icon: '🔥',
    category: 'streak',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 30,
    rarity: 'uncommon',
    points: 50,
    nextTier: 'quarter_master'
  },
  {
    id: 'quarter_master',
    name: 'Quarter Master',
    description: 'Maintain a 90-day streak',
    icon: '🔥',
    category: 'streak',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 90,
    rarity: 'rare',
    points: 125,
    nextTier: 'year_legend'
  },
  {
    id: 'year_legend',
    name: 'Year Legend',
    description: 'Maintain a 365-day streak',
    icon: '🏆',
    category: 'streak',
    tier: 'diamond',
    earned: false,
    progress: 0,
    target: 365,
    rarity: 'legendary',
    points: 500
  },

  // REFERRAL BADGES
  {
    id: 'soul_winner_1',
    name: 'Soul Winner I',
    description: 'Refer 5 new believers',
    icon: '⭐',
    category: 'referral',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'common',
    points: 25,
    nextTier: 'soul_winner_2'
  },
  {
    id: 'soul_winner_2',
    name: 'Soul Winner II',
    description: 'Refer 10 new believers',
    icon: '🌟',
    category: 'referral',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'uncommon',
    points: 50,
    nextTier: 'soul_winner_3'
  },
  {
    id: 'soul_winner_3',
    name: 'Soul Winner III',
    description: 'Refer 25 new believers',
    icon: '👑',
    category: 'referral',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 25,
    rarity: 'rare',
    points: 125,
    nextTier: 'soul_winner_4'
  },
  {
    id: 'soul_winner_4',
    name: 'Evangelist',
    description: 'Refer 50 new believers',
    icon: '🎺',
    category: 'referral',
    tier: 'platinum',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'epic',
    points: 250,
    nextTier: 'soul_winner_5'
  },
  {
    id: 'soul_winner_5',
    name: 'Apostle of Referrals',
    description: 'Refer 100 new believers',
    icon: '✨',
    category: 'referral',
    tier: 'diamond',
    earned: false,
    progress: 0,
    target: 100,
    rarity: 'legendary',
    points: 500
  },

  // MENTORSHIP BADGES
  {
    id: 'mentor_starter',
    name: 'Mentor Starter',
    description: 'Become a verified mentor',
    icon: '🎓',
    category: 'mentorship',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'uncommon',
    points: 50
  },
  {
    id: 'counsellor',
    name: 'Grace Counsellor',
    description: 'Become a verified counsellor',
    icon: '💼',
    category: 'counselling',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'rare',
    points: 75
  },
  {
    id: 'mentor_helper',
    name: 'Mentor Helper',
    description: 'Complete 10 mentorship sessions',
    icon: '🤝',
    category: 'mentorship',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'common',
    points: 40
  },
  {
    id: 'mentor_guide',
    name: 'Mentor Guide',
    description: 'Complete 50 mentorship sessions',
    icon: '🌟',
    category: 'mentorship',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'rare',
    points: 150
  },
  {
    id: 'counselling_helper',
    name: 'Counselling Helper',
    description: 'Complete 20 counselling sessions',
    icon: '💚',
    category: 'counselling',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 20,
    rarity: 'uncommon',
    points: 80
  },

  // SCRIPTURE BADGES
  {
    id: 'scripture_memorizer',
    name: 'Scripture Memorizer',
    description: 'Memorize 10 Bible verses',
    icon: '📜',
    category: 'scripture',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'common',
    points: 20
  },
  {
    id: 'scripture_master',
    name: 'Scripture Master',
    description: 'Memorize 50 Bible verses',
    icon: '📖',
    category: 'scripture',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'rare',
    points: 100
  },
  {
    id: 'bible_reader',
    name: 'Bible Reader',
    description: 'Complete a Bible reading plan',
    icon: '📚',
    category: 'scripture',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'uncommon',
    points: 50
  },
  {
    id: 'bible_scholar',
    name: 'Bible Scholar',
    description: 'Complete 5 Bible reading plans',
    icon: '🎓',
    category: 'scripture',
    tier: 'platinum',
    earned: false,
    progress: 0,
    target: 5,
    rarity: 'epic',
    points: 200
  },

  // AI COMPANION BADGES
  {
    id: 'ai_seeker',
    name: 'AI Seeker',
    description: 'Have 10 conversations with AI Spiritual Companion',
    icon: '🤖',
    category: 'ai_companion',
    tier: 'bronze',
    earned: false,
    progress: 0,
    target: 10,
    rarity: 'common',
    points: 15
  },
  {
    id: 'ai_wisdom_seeker',
    name: 'Wisdom Seeker',
    description: 'Generate 25 AI-guided prayers',
    icon: '🔮',
    category: 'ai_companion',
    tier: 'silver',
    earned: false,
    progress: 0,
    target: 25,
    rarity: 'uncommon',
    points: 30
  },
  {
    id: 'ai_scripture_explorer',
    name: 'Scripture Explorer',
    description: 'Request AI scripture guidance 50 times',
    icon: '🧭',
    category: 'ai_companion',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 50,
    rarity: 'rare',
    points: 50
  },

  // SPECIAL BADGES
  {
    id: 'generous_giver',
    name: 'Generous Giver',
    description: 'Sponsor 3 believers',
    icon: '💝',
    category: 'special',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 3,
    rarity: 'rare',
    points: 100
  },
  {
    id: 'early_adopter',
    name: 'Early Adopter',
    description: 'Join Rekindle in its first month',
    icon: '🚀',
    category: 'special',
    tier: 'platinum',
    earned: false,
    progress: 0,
    target: 1,
    rarity: 'epic',
    points: 150
  },
  {
    id: 'intercessor',
    name: 'Intercessor',
    description: 'Join 25 prayer rooms',
    icon: '🕊️',
    category: 'special',
    tier: 'gold',
    earned: false,
    progress: 0,
    target: 25,
    rarity: 'rare',
    points: 60
  },
  
];

export const getBadgesByCategory = (category: BadgeCategory): Badge[] => {
  return badges.filter(badge => badge.category === category);
};

export const getBadgesByTier = (tier: BadgeTier): Badge[] => {
  return badges.filter(badge => badge.tier === tier);
};

export const getBadgesByRarity = (rarity: BadgeRarity): Badge[] => {
  return badges.filter(badge => badge.rarity === rarity);
};

export const getEarnedBadges = (): Badge[] => {
  return badges.filter(badge => badge.earned);
};

export const getTotalBadgePoints = (): number => {
  return badges.filter(badge => badge.earned).reduce((sum, badge) => sum + badge.points, 0);
};

export const getCategoryProgress = (category: BadgeCategory): {
  earned: number;
  total: number;
  percentage: number;
} => {
  const categoryBadges = getBadgesByCategory(category);
  const earnedCount = categoryBadges.filter(b => b.earned).length;
  return {
    earned: earnedCount,
    total: categoryBadges.length,
    percentage: categoryBadges.length > 0 ? (earnedCount / categoryBadges.length) * 100 : 0
  };
};