// The catalogue behind "Find a feature" (FeatureFinder.tsx): every place in
// the app a user might be looking for, with the words they'd likely type and
// where it lives. This searches the app itself, not content — devotionals,
// prayers and counsellors are GlobalSearch's job.
//
// When a screen is added, moved or renamed, add or update its entry here so
// people can still find it.

export type LiveChannelsTab = 'discover' | 'events' | 'following' | 'my-channels' | 'meetings' | 'analytics';
export type MinistryHubView = 'my-ministries' | 'manage';

export type FeatureAction =
  /** A top-level app tab (AppLayout's activeTab). */
  | { kind: 'tab'; tab: string }
  /** Ministries module, on one of its views. */
  | { kind: 'ministries'; view: MinistryHubView }
  /** Live Broadcast module, on one of its tabs. */
  | { kind: 'live'; tab: LiveChannelsTab }
  /** A screen inside a ministry's own space (MinistrySpace nav: group > child).
   *  Works directly when the user is inside a ministry; otherwise they land on
   *  My Ministries and are told where to go next. */
  | { kind: 'ministry'; group: string; child: string }
  /** The content search (devotionals, prayers, scripture, counsellors). */
  | { kind: 'content-search' };

export type FeatureAudience = 'everyone' | 'leader' | 'counsellor' | 'admin';

export interface FeatureEntry {
  id: string;
  title: string;
  /** One line on what it's for. */
  description: string;
  /** Where it lives, as the user would click through it. */
  path: string[];
  /** Other words people use for it. */
  keywords: string[];
  category: 'Spiritual growth' | 'Prayer' | 'Community' | 'Ministries' | 'Ministry leaders' | 'Live & meetings' | 'Account' | 'Help';
  audience?: FeatureAudience;
  action?: FeatureAction;
  /** For help entries: the answer, shown right in the results. */
  answer?: string;
}

export const FEATURES: FeatureEntry[] = [
  // ── Spiritual growth ────────────────────────────────────────────────────
  { id: 'devotionals', title: 'Devotionals', description: 'Daily devotional series to read and follow.', path: ['The Word', 'Devotionals'],
    keywords: ['devotion', 'daily reading', 'series', 'word of the day', 'quiet time'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'devotional-library' } },
  { id: 'reading-plan', title: 'Bible reading plan', description: 'Read through the Bible one day at a time and track progress.', path: ['The Word', 'Reading Plan'],
    keywords: ['bible', 'plan', 'read the bible', 'bible in a year', 'chapters'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'reading-plan' } },
  { id: 'scripture-memory', title: 'Scripture memory', description: 'Memorise verses with review practice.', path: ['The Word', 'Scripture Memory'],
    keywords: ['memorise', 'memorize', 'verses', 'memory verse', 'flashcards'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'scripture' } },
  { id: 'books', title: 'Books', description: 'Faith-building books and resources.', path: ['The Word', 'Books'],
    keywords: ['ebook', 'library', 'reading', 'resources'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'books' } },
  { id: 'music', title: 'Music library', description: 'Worship and instrumental soundtracks.', path: ['Community', 'Music'],
    keywords: ['songs', 'worship', 'audio', 'soaking', 'instrumental'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'music' } },
  { id: 'assistant', title: 'Pastoral Assistant', description: 'Ask faith questions and get thoughtful guidance.', path: ['Pastoral Assistant button'],
    keywords: ['ai', 'chat', 'ask', 'bot', 'questions', 'guidance', 'companion'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'ai' } },
  { id: 'challenges', title: 'Challenges', description: 'Faith challenges and streaks to grow consistency.', path: ['Community', 'Challenges'],
    keywords: ['streak', 'goals', 'fasting challenge', 'habit'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'challenges' } },
  { id: 'analytics', title: 'My growth analytics', description: 'See your reading, prayer and activity over time.', path: ['Avatar menu', 'Analytics'],
    keywords: ['stats', 'progress', 'insights', 'activity', 'history'], category: 'Spiritual growth', action: { kind: 'tab', tab: 'analytics' } },

  // ── Prayer ──────────────────────────────────────────────────────────────
  { id: 'prayer-library', title: 'Prayer library', description: 'Guided prayer sessions and prayer series.', path: ['Prayer', 'Prayer Library'],
    keywords: ['prayers', 'guided prayer', 'pray', 'declarations', 'intercession'], category: 'Prayer', action: { kind: 'tab', tab: 'prayer-library' } },
  { id: 'journal', title: 'Prayer journal', description: 'Write your prayers and mark the answered ones.', path: ['Prayer', 'Prayer Journal'],
    keywords: ['journal', 'diary', 'notes', 'answered prayer', 'write'], category: 'Prayer', action: { kind: 'tab', tab: 'journal' } },
  { id: 'prayer-wall', title: 'Prayer wall', description: 'Share prayer requests and pray for others.', path: ['Prayer', 'Prayer Wall'],
    keywords: ['prayer request', 'ask for prayer', 'pray for me', 'wall'], category: 'Prayer', action: { kind: 'tab', tab: 'wall' } },
  { id: 'reminders', title: 'Reminders', description: 'Daily nudges to pray, read and stay consistent.', path: ['Avatar menu', 'Reminders'],
    keywords: ['alarm', 'notification', 'daily reminder', 'schedule', 'nudge'], category: 'Prayer', action: { kind: 'tab', tab: 'reminders' } },

  // ── Community ───────────────────────────────────────────────────────────
  { id: 'feed', title: 'Community feed', description: 'See what other believers are sharing.', path: ['Community', 'Feed'],
    keywords: ['posts', 'social', 'timeline', 'share'], category: 'Community', action: { kind: 'tab', tab: 'community-feed' } },
  { id: 'revelations', title: 'Revelations', description: 'Capture and share insights from the Word.', path: ['Community', 'Revelations'],
    keywords: ['insight', 'rhema', 'share a word', 'testimony'], category: 'Community', action: { kind: 'tab', tab: 'revelations' } },
  { id: 'counsellors', title: 'Find a counsellor', description: 'Browse Christian counsellors and book a session.', path: ['Avatar menu', 'Counsellors'],
    keywords: ['counselling', 'counseling', 'therapy', 'talk to someone', 'book', 'pastor', 'support'], category: 'Community', action: { kind: 'tab', tab: 'counsellors' } },
  { id: 'bookings', title: 'My bookings', description: 'Your upcoming and past counselling sessions.', path: ['Avatar menu', 'My Bookings'],
    keywords: ['appointments', 'sessions', 'booked', 'cancel booking', 'reschedule'], category: 'Community', action: { kind: 'tab', tab: 'bookings' } },
  { id: 'counsellor-dashboard', title: 'Counsellor dashboard', description: 'Your counselling sessions, availability and earnings.', path: ['Avatar menu', 'My Dashboard'],
    keywords: ['availability', 'my clients', 'counsellor', 'earnings'], category: 'Community', audience: 'counsellor', action: { kind: 'tab', tab: 'my-dashboard' } },

  // ── Ministries (members) ────────────────────────────────────────────────
  { id: 'my-ministries', title: 'My ministries', description: 'The churches and ministries you belong to.', path: ['Ministries', 'My Ministries'],
    keywords: ['church', 'my church', 'ministry', 'congregation', 'fellowship'], category: 'Ministries', action: { kind: 'ministries', view: 'my-ministries' } },
  { id: 'join-ministry', title: 'Find and join a ministry', description: 'Discover churches and ministries to join.', path: ['Ministries', 'My Ministries'],
    keywords: ['join', 'find church', 'discover', 'search ministry', 'invite code'], category: 'Ministries', action: { kind: 'ministries', view: 'my-ministries' } },
  { id: 'small-groups-discover', title: 'Join a small group', description: 'Find a small group in your ministry and ask to join.', path: ['Ministries', 'your ministry', 'Small Groups', 'Discover'],
    keywords: ['small group', 'cell group', 'home group', 'bible study group', 'life group', 'join group'], category: 'Ministries', action: { kind: 'ministry', group: 'groups', child: 'discover-groups' } },
  { id: 'small-groups-mine', title: 'My small groups', description: 'Small groups you are part of.', path: ['Ministries', 'your ministry', 'Small Groups', 'My Groups'],
    keywords: ['small group', 'cell', 'home group', 'my group'], category: 'Ministries', action: { kind: 'ministry', group: 'groups', child: 'my-groups' } },
  { id: 'ministry-qa', title: 'Ministry Q&A', description: 'Ask your ministry questions and read answers.', path: ['Ministries', 'your ministry', 'Community', 'Q&A'],
    keywords: ['question', 'ask pastor', 'faq', 'answers'], category: 'Ministries', action: { kind: 'ministry', group: 'community', child: 'qa' } },
  { id: 'ministry-give', title: 'Give to your ministry', description: 'Donate or tithe to a ministry you belong to.', path: ['Ministries', 'your ministry', 'Ministry', 'Donations'],
    keywords: ['tithe', 'offering', 'donate', 'give', 'seed', 'pay'], category: 'Ministries', action: { kind: 'ministry', group: 'admin', child: 'donations' } },
  { id: 'ministry-meetings', title: 'Ministry meetings', description: 'Join or schedule video meetings in your ministry.', path: ['Ministries', 'your ministry', 'Ministry', 'Meetings'],
    keywords: ['video call', 'zoom', 'meeting', 'join meeting', 'online service'], category: 'Ministries', action: { kind: 'ministry', group: 'admin', child: 'meetings' } },
  { id: 'ministry-webinars', title: 'Webinars', description: 'Watch or host large webinars with a private backstage and Go live.', path: ['Ministries', 'your ministry', 'Live', 'Webinars'],
    keywords: ['webinar', 'conference', 'seminar', 'backstage', 'go live', 'register'], category: 'Ministries', action: { kind: 'ministry', group: 'live', child: 'webinars' } },
  { id: 'ministry-conversation', title: 'Translated conversation', description: 'Talk with someone in another language and both see the original and its translation, live.', path: ['Ministries', 'your ministry', 'Live', 'Live Translation', 'Conversation'],
    keywords: ['translate', 'translation', 'interpreter', 'bilingual', 'language', 'conversation', 'vietnamese'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'live', child: 'live-tech' } },
  { id: 'ministry-announcements', title: 'Ministry announcements', description: 'News and updates from your ministry.', path: ['Ministries', 'your ministry', 'Ministry', 'Announcements'],
    keywords: ['news', 'updates', 'notice', 'bulletin'], category: 'Ministries', action: { kind: 'ministry', group: 'admin', child: 'announcements' } },
  { id: 'ministry-prayer-requests', title: 'Send a prayer request to your ministry', description: 'Ask your ministry leaders to pray with you.', path: ['Ministries', 'your ministry', 'Ministry', 'Prayer Requests'],
    keywords: ['prayer request', 'pray for me', 'pastor pray'], category: 'Ministries', action: { kind: 'ministry', group: 'admin', child: 'requests' } },
  { id: 'ministry-testimonies', title: 'Share a testimony', description: 'Share what God has done with your ministry.', path: ['Ministries', 'your ministry', 'Ministry', 'Testimonies'],
    keywords: ['testimony', 'praise report', 'share'], category: 'Ministries', action: { kind: 'ministry', group: 'admin', child: 'testimonies' } },

  // ── Ministry leaders ────────────────────────────────────────────────────
  { id: 'manage-ministries', title: 'Manage my ministries', description: 'Create a ministry or open the ones you lead.', path: ['Ministries', 'Manage'],
    keywords: ['create ministry', 'start a church', 'new ministry', 'admin', 'leader'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministries', view: 'manage' } },
  { id: 'small-groups-manage', title: 'Create and manage small groups', description: 'Create groups, edit them and assign group leaders.', path: ['Ministries', 'your ministry', 'Small Groups', 'Manage Groups'],
    keywords: ['create small group', 'new group', 'cell leader', 'assign leader', 'manage groups', 'small group'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'groups', child: 'manage-groups' } },
  { id: 'ministry-members', title: 'Members and roles', description: 'See members, approve joins and set leader roles.', path: ['Ministries', 'your ministry', 'Settings', 'People'],
    keywords: ['members', 'approve', 'roles', 'leaders', 'volunteers', 'registrations', 'remove member'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'settings', child: 'people' } },
  { id: 'ministry-content', title: 'Publish ministry content', description: 'Add devotionals, prayers, video messages and rules.', path: ['Ministries', 'your ministry', 'Settings', 'Content'],
    keywords: ['upload', 'publish', 'devotional', 'sermon', 'video message', 'create content'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'settings', child: 'content' } },
  { id: 'ministry-engagement', title: 'Events, donations and WhatsApp', description: 'Manage events, giving, the inbox and WhatsApp.', path: ['Ministries', 'your ministry', 'Settings', 'Engagement'],
    keywords: ['events', 'whatsapp', 'inbox', 'donations', 'evangelism', 'messages'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'settings', child: 'engagement' } },
  { id: 'ministry-broadcast', title: 'Broadcast a message', description: 'Send a message to your members by email, SMS or WhatsApp.', path: ['Ministries', 'your ministry', 'Ministry', 'Broadcast'],
    keywords: ['broadcast', 'bulk message', 'sms', 'email members', 'send to all'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'admin', child: 'broadcast' } },
  { id: 'ministry-billing', title: 'Ministry plan and billing', description: 'Your ministry subscription, payouts and Gift Aid.', path: ['Ministries', 'your ministry', 'Settings', 'Finance & Billing'],
    keywords: ['plan', 'subscription', 'upgrade ministry', 'payouts', 'stripe', 'paystack', 'gift aid', 'invoice'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'settings', child: 'finance-billing' } },
  { id: 'ministry-general', title: 'Ministry profile and branding', description: 'Name, logo, colours and which modules are on.', path: ['Ministries', 'your ministry', 'Settings', 'General'],
    keywords: ['logo', 'name', 'colour', 'color', 'branding', 'modules', 'turn off', 'settings'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'settings', child: 'general' } },
  { id: 'ministry-live', title: 'Ministry live channel', description: 'Stream services live to your members.', path: ['Ministries', 'your ministry', 'Live', 'Live Channel'],
    keywords: ['livestream', 'stream', 'broadcast', 'go live', 'obs', 'service'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'live', child: 'live' } },
  { id: 'ministry-translation', title: 'Live translation and captions', description: 'Translate and caption your live services.', path: ['Ministries', 'your ministry', 'Live', 'Live Translation'],
    keywords: ['translate', 'translation', 'captions', 'subtitles', 'interpreter', 'language'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'live', child: 'live-tech' } },
  { id: 'ministry-live-scripture', title: 'Live Scripture', description: 'Show Bible verses on screen automatically when the preacher reads them out.', path: ['Ministries', 'your ministry', 'Live', 'Live Translation', 'Settings', 'Live Scripture'],
    keywords: ['bible verse', 'scripture on screen', 'verse display', 'obs', 'projector', 'reference'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'live', child: 'live-tech' } },
  { id: 'ministry-translation-conversation', title: 'Conversation (live Q&A)', description: 'Let listeners ask the speaker questions in their own language during a translated service.', path: ['Ministries', 'your ministry', 'Live', 'Live Translation', 'Settings'],
    keywords: ['questions', 'q&a', 'ask speaker', 'listener questions', 'pin question', 'conversation'], category: 'Ministry leaders', audience: 'leader', action: { kind: 'ministry', group: 'live', child: 'live-tech' } },

  // ── Live & meetings ─────────────────────────────────────────────────────
  { id: 'live-discover', title: 'Watch live broadcasts', description: 'Find channels streaming right now.', path: ['Live Broadcast', 'Discover'],
    keywords: ['live', 'watch', 'stream', 'service', 'tv', 'channel'], category: 'Live & meetings', action: { kind: 'live', tab: 'discover' } },
  { id: 'live-events', title: 'Upcoming live events', description: 'Scheduled broadcasts you can plan for.', path: ['Live Broadcast', 'Events'],
    keywords: ['schedule', 'upcoming', 'calendar', 'event'], category: 'Live & meetings', action: { kind: 'live', tab: 'events' } },
  { id: 'live-following', title: 'Channels I follow', description: 'Broadcast channels you follow.', path: ['Live Broadcast', 'Following'],
    keywords: ['follow', 'subscribed', 'favourites', 'favorites'], category: 'Live & meetings', action: { kind: 'live', tab: 'following' } },
  { id: 'live-my-channels', title: 'My broadcast channels', description: 'Create a channel and go live yourself.', path: ['Live Broadcast', 'My Channels'],
    keywords: ['create channel', 'go live', 'broadcast', 'stream', 'obs', 'restream'], category: 'Live & meetings', action: { kind: 'live', tab: 'my-channels' } },
  { id: 'live-meetings', title: 'Video meetings', description: 'Start or join interactive video meetings.', path: ['Live Broadcast', 'Meetings'],
    keywords: ['meeting', 'video call', 'zoom', 'join', 'host'], category: 'Live & meetings', action: { kind: 'live', tab: 'meetings' } },
  { id: 'live-analytics', title: 'Broadcast analytics', description: 'Views and engagement for your channels.', path: ['Live Broadcast', 'Analytics'],
    keywords: ['viewers', 'views', 'stats', 'audience'], category: 'Live & meetings', action: { kind: 'live', tab: 'analytics' } },

  // ── Account ─────────────────────────────────────────────────────────────
  { id: 'settings', title: 'Profile and settings', description: 'Your name, photo, password, notifications and data.', path: ['Avatar menu', 'Settings'],
    keywords: ['profile', 'account', 'password', 'photo', 'avatar', 'email', 'notifications', 'whatsapp', 'export data', 'delete account', 'language'], category: 'Account', action: { kind: 'tab', tab: 'profile' } },
  { id: 'billing', title: 'Billing and plan', description: 'Your subscription and payment details.', path: ['Avatar menu', 'Billing'],
    keywords: ['subscription', 'upgrade', 'premium', 'payment', 'card', 'cancel plan', 'invoice'], category: 'Account', action: { kind: 'tab', tab: 'billing' } },
  { id: 'give', title: 'Give to Rekindle', description: 'Support the mission or become a partner.', path: ['Avatar menu', 'Give'],
    keywords: ['donate', 'partner', 'sponsor', 'support', 'give'], category: 'Account', action: { kind: 'tab', tab: 'sponsor' } },
  { id: 'referral', title: 'Refer a friend', description: 'Invite others and track your referrals.', path: ['Avatar menu', 'Referral'],
    keywords: ['invite', 'share app', 'referral code', 'friends'], category: 'Account', action: { kind: 'tab', tab: 'referral' } },
  { id: 'admin', title: 'Admin dashboard', description: 'Manage the platform.', path: ['Avatar menu', 'Admin'],
    keywords: ['admin', 'moderation', 'users', 'platform'], category: 'Account', audience: 'admin', action: { kind: 'tab', tab: 'admin' } },

  // ── Help ────────────────────────────────────────────────────────────────
  { id: 'help-content-search', title: 'Search devotionals, prayers and scripture', description: 'Looking for specific content rather than a feature? Use the content search.', path: ['Search button at the top'],
    keywords: ['find devotional', 'find prayer', 'verse', 'search content', 'scripture search'], category: 'Help', action: { kind: 'content-search' } },
  { id: 'help-language', title: 'Change the app language', description: 'Switch the language the app is shown in.', path: ['Avatar menu', 'Settings', 'Language'],
    keywords: ['language', 'translate app', 'french', 'spanish', 'yoruba', 'change language'], category: 'Help',
    answer: 'Open Settings from your avatar menu and pick a language under Language. On the website you can also change it from the footer.', action: { kind: 'tab', tab: 'profile' } },
  { id: 'help-notifications', title: 'Turn notifications on or off', description: 'Choose which push, email and WhatsApp notifications you get.', path: ['Avatar menu', 'Settings', 'Notification Preferences'],
    keywords: ['notifications', 'push', 'stop emails', 'unsubscribe', 'mute', 'alerts'], category: 'Help',
    answer: 'Open Settings from your avatar menu. Notification Preferences, Email Communications and WhatsApp Notifications each have their own switches.', action: { kind: 'tab', tab: 'profile' } },
  { id: 'help-password', title: 'Change my password', description: 'Update your password or sign-in security.', path: ['Avatar menu', 'Settings', 'Security'],
    keywords: ['password', 'reset password', 'forgot password', 'security', 'login'], category: 'Help',
    answer: 'Open Settings from your avatar menu and use the Security section. If you are signed out, use "Forgot password" on the sign-in screen.', action: { kind: 'tab', tab: 'profile' } },
  { id: 'help-host-webinar', title: 'How do I host a webinar?', description: 'Create a webinar, rehearse backstage, then go live.', path: ['Ministries', 'your ministry', 'Live', 'Webinars'],
    keywords: ['host webinar', 'backstage', 'go live', 'speakers', 'co-host', 'mute attendee', 'spotlight'], category: 'Help', audience: 'leader',
    answer: 'In your ministry open Live, then Webinars, and create one. Opening it takes you and your speakers backstage, where attendees can\'t see you. Press Go live to let attendees in. Use Manage, then People, to mute, spotlight, make co-hosts or bring someone up to speak.',
    action: { kind: 'ministry', group: 'live', child: 'webinars' } },
  { id: 'help-join-meeting', title: 'How do I join a meeting?', description: 'Join a ministry or public video meeting.', path: ['Live Broadcast', 'Meetings'],
    keywords: ['join meeting', 'meeting link', 'meeting code', 'cant join'], category: 'Help',
    answer: 'Open the meeting link you were sent, or go to Live Broadcast, then Meetings. For a ministry meeting, open your ministry, then Ministry, then Meetings.', action: { kind: 'live', tab: 'meetings' } },
];

const normalize = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&\s-]/g, ' ');

/** Scores every entry against the query; best first. Title hits beat keyword
 *  hits beat description/path hits, and every word in the query has to
 *  appear somewhere for an entry to count. */
export function searchFeatures(query: string, entries: FeatureEntry[] = FEATURES): FeatureEntry[] {
  const q = normalize(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);

  const scored: Array<{ entry: FeatureEntry; score: number }> = [];
  for (const entry of entries) {
    const title = normalize(entry.title);
    const keywords = entry.keywords.map(normalize);
    const rest = normalize(`${entry.description} ${entry.path.join(' ')} ${entry.category} ${entry.answer ?? ''}`);

    let score = 0;
    let allFound = true;
    for (const w of words) {
      let best = 0;
      if (title.split(/\s+/).some((t) => t.startsWith(w))) best = 6;
      else if (title.includes(w)) best = 4;
      if (keywords.some((k) => k === w || k.split(/\s+/).some((t) => t.startsWith(w)))) best = Math.max(best, 5);
      else if (keywords.some((k) => k.includes(w))) best = Math.max(best, 3);
      if (!best && rest.includes(w)) best = 1;
      if (!best) { allFound = false; break; }
      score += best;
    }
    if (!allFound) continue;
    if (title.startsWith(q)) score += 5;
    if (keywords.includes(q)) score += 4;
    scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.entry);
}
