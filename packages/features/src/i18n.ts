// =====================================================
// INTERNATIONALIZATION (i18n) CONFIGURATION
// Complete language system with OpenAI translation
// =====================================================

import { supabase } from '@rekindle/supabase';
import type { SupportedLanguage } from '@rekindle/types';

// =====================================================
// SUPPORTED LANGUAGES
// Asian languages fully implemented, European extensible
// =====================================================

// The canonical SupportedLanguage union now lives in @rekindle/types; re-export it
// here so existing `import { SupportedLanguage } from './i18n'` call sites keep working.
export type { SupportedLanguage };

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  rtl?: boolean;
  region: 'asian' | 'european' | 'african' | 'middle-eastern';
  fontFamily?: string;
}

// Comprehensive list of supported languages
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  // Asian Languages (Primary Implementation)
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', region: 'asian', fontFamily: 'Noto Sans SC, sans-serif' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', region: 'asian', fontFamily: 'Noto Sans JP, sans-serif' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', region: 'asian', fontFamily: 'Noto Sans KR, sans-serif' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', region: 'asian' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', region: 'asian', fontFamily: 'Noto Sans Thai, sans-serif' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', region: 'asian' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', region: 'asian', fontFamily: 'Noto Sans Devanagari, sans-serif' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩', region: 'asian', fontFamily: 'Noto Sans Bengali, sans-serif' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', region: 'asian', fontFamily: 'Noto Sans Tamil, sans-serif' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳', region: 'asian', fontFamily: 'Noto Sans Telugu, sans-serif' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰', rtl: true, region: 'asian', fontFamily: 'Noto Nastaliq Urdu, sans-serif' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ', flag: '🇲🇲', region: 'asian', fontFamily: 'Noto Sans Myanmar, sans-serif' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ', flag: '🇰🇭', region: 'asian', fontFamily: 'Noto Sans Khmer, sans-serif' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ', flag: '🇱🇦', region: 'asian', fontFamily: 'Noto Sans Lao, sans-serif' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', flag: '🇳🇵', region: 'asian', fontFamily: 'Noto Sans Devanagari, sans-serif' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰', region: 'asian', fontFamily: 'Noto Sans Sinhala, sans-serif' },
  { code: 'tl', name: 'Filipino', nativeName: 'Tagalog', flag: '🇵🇭', region: 'asian' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾', region: 'asian' },
  
  // Middle Eastern Languages (RTL Support)
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true, region: 'middle-eastern', fontFamily: 'Noto Sans Arabic, sans-serif' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷', rtl: true, region: 'middle-eastern', fontFamily: 'Noto Sans Arabic, sans-serif' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', rtl: true, region: 'middle-eastern', fontFamily: 'Noto Sans Hebrew, sans-serif' },
  
  // European Languages (Extensible)
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', region: 'european' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', region: 'european' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', region: 'european' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', region: 'european' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', region: 'european' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', region: 'european', fontFamily: 'Noto Sans, sans-serif' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', region: 'european' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', region: 'european' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', region: 'european' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', region: 'european' },
  
  // African Languages
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪', region: 'african' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', flag: '🇳🇬', region: 'african' },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

// Content types for translation context
export type ContentType = 
  | 'devotional' 
  | 'prayer' 
  | 'scripture' 
  | 'teaching' 
  | 'announcement' 
  | 'ui' 
  | 'notification' 
  | 'error' 
  | 'general';

// Translation namespace structure
export type TranslationNamespace = 
  | 'common'
  | 'auth'
  | 'navigation'
  | 'devotionals'
  | 'prayers'
  | 'ministry'
  | 'livechannels'
  | 'announcements'
  | 'events'
  | 'profile'
  | 'settings'
  | 'errors'
  | 'validation'
  | 'counselling'
  | 'community';

// Translation keys interface (type-safe translations)
export interface Translations {
  common: {
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    confirm: string;
    back: string;
    next: string;
    submit: string;
    search: string;
    filter: string;
    sort: string;
    view: string;
    share: string;
    download: string;
    upload: string;
    close: string;
    open: string;
    yes: string;
    no: string;
    ok: string;
    error: string;
    success: string;
    warning: string;
    info: string;
    refresh: string;
    retry: string;
    continue: string;
    start: string;
    stop: string;
    pause: string;
    resume: string;
    complete: string;
    incomplete: string;
    all: string;
    none: string;
    select: string;
    selected: string;
    required: string;
    optional: string;
    more: string;
    less: string;
    show: string;
    hide: string;
    expand: string;
    collapse: string;
    copy: string;
    copied: string;
    send: string;
    sent: string;
    receive: string;
    received: string;
    today: string;
    yesterday: string;
    tomorrow: string;
    now: string;
    later: string;
    never: string;
    always: string;
    sometimes: string;
    daily: string;
    weekly: string;
    monthly: string;
    yearly: string;
    saved: string;
  };
  auth: {
    login: string;
    logout: string;
    signup: string;
    forgotPassword: string;
    resetPassword: string;
    email: string;
    password: string;
    confirmPassword: string;
    rememberMe: string;
    welcomeBack: string;
    createAccount: string;
    signInRequired: string;
    signInToAccess: string;
    accountCreated: string;
    passwordChanged: string;
    emailVerified: string;
    verifyEmail: string;
  };
  navigation: {
    home: string;
    devotionals: string;
    prayers: string;
    ministry: string;
    liveChannels: string;
    community: string;
    profile: string;
    settings: string;
    admin: string;
    counselling: string;
    library: string;
    challenges: string;
    groups: string;
    devotionalLibrary: string;
    prayerLibrary: string;
    prayerJournal: string;
    revelations: string;
    communityFeed: string;
    readingPlan: string;
    books: string;
    analytics: string;
    reminders: string;
    notifications: string;
    prayerWall: string;
    scriptureMemory: string;
    counsellors: string;
    myBookings: string;
    aiCompanion: string;
    musicLibrary: string;
    subscription: string;
    billing: string;
    donate: string;
    whatsapp: string;
    referral: string;
    rewards: string;
    systemHealth: string;
    myDashboard: string;
    ministries: string;
    theWord: string;
    discover: string;
    myMinistries: string;
    manage: string;
    events: string;
    following: string;
    myChannels: string;
    meetings: string;
    feed: string;
    music: string;
    module: string;
  };
  devotionals: {
    title: string;
    daily: string;
    series: string;
    library: string;
    bookmarks: string;
    progress: string;
    readMore: string;
    completed: string;
    startReading: string;
    devotionalSeries: string;
    growDeeper: string;
    featured: string;
    featuredSeries: string;
    allSeries: string;
    allCategories: string;
    searchSeries: string;
    days: string;
    day: string;
    daysCompleted: string;
    yourProgress: string;
    of: string;
    startSeries: string;
    readAgain: string;
    continue: string;
    dailyDevotionals: string;
    current: string;
    complete: string;
    dayLocked: string;
    completeDay: string;
    toUnlock: string;
    first: string;
    unlocksTomorrow: string;
    unlocksTomorrowDesc: string;
    startFirst: string;
    startFirstDesc: string;
    startToUnlock: string;
    seriesComplete: string;
    congratulations: string;
    dayComplete: string;
    loadError: string;
    startError: string;
    completeError: string;
    untitled: string;
    noSeriesFound: string;
    noSeriesAvailable: string;
    tryAdjusting: string;
    checkBack: string;
    completedAll: string;
    daysOf: string;
    viewSeries: string;
    todaysDevotional: string;
    dailyScriptureReflection: string;
    reflectionQuestions: string;
    readTime: string;
    previewAudio: string;
    audioPreview: string;
    experienceAgain: string;
    startTodaysDevotional: string;
    startMinistryDevotional: string;
    ministryDevotional: string;
    shareDevotional: string;
    noMinistryDevotional: string;
    noDevotionalToday: string;
    copiedToShare: string;
    copiedToShareDesc: string;
    readerScripturePassage: string;
    readerBiblePassage: string;
    readerReadSlowly: string;
    readerDevotional: string;
    readerReflectionQuestions: string;
    readerReflectionContent: string;
    readerGuidedPrayer: string;
    readerPrayInSpirit: string;
    readerPrayInSpiritContent: string;
    readerGoInPeace: string;
    readerGoInPeaceContent: string;
    readerWelcome: string;
    readerWrittenBy: string;
    readerAdditionalScripture: string;
    failedLoadDevotionals: string;
    seriesNotFound: string;
    seriesNotFoundDesc: string;
    contentErrorTitle: string;
    contentErrorDesc: string;
    noContentAvailable: string;
    noContentAvailableDesc: string;
    progressSaved: string;
    failedSaveProgress: string;
    seriesCompleteExcl: string;
    seriesCompleteExclDesc: string;
    couldNotLoadNextDay: string;
    contentNotAvailable: string;
    dayNotAvailableYet: string;
    couldNotLoadPrevDay: string;
    dayNotAvailable: string;
    pleaseSignInBookmark: string;
    removedTitle: string;
    bookmarkRemoved: string;
    savedTitle: string;
    addedToBookmarks: string;
    failedUpdateBookmark: string;
    enterEmailAddress: string;
    sharedExcl: string;
    devotionalSharedSuccess: string;
    failedShareDevotional: string;
    devotionalCompleteExcl: string;
    progressBeenSaved: string;
    shareThisDevotional: string;
    emailAddress: string;
    personalMessageOptional: string;
    addPersonalNote: string;
    signInToBookmark: string;
    bookmarkAdded: string;
    notesSaved: string;
    completedDay: string;
    joinJourney: string;
    minRead: string;
    time: string;
    listen: string;
    watchVideo: string;
    prayer: string;
    personalNotes: string;
    writeThoughts: string;
    saveNotes: string;
    bookmarkToSave: string;
    previousDay: string;
    markComplete: string;
    nextDay: string;
    signInToStart: string;
  };
  prayers: {
    title: string;
    library: string;
    series: string;
    journal: string;
    challenges: string;
    groups: string;
    timer: string;
    addPrayer: string;
    prayNow: string;
    prayerPoints: string;
    prayerTime: string;
    prayerRequest: string;
    answered: string;
    pending: string;
    intercession: string;
    newEntry: string;
    savePrayer: string;
    prayerTitlePlaceholder: string;
    selectCategory: string;
    pourHeartPlaceholder: string;
    searchPrayers: string;
    allCategories: string;
    allStatus: string;
    noPrayersFound: string;
    fillAllFields: string;
    prayerAdded: string;
    prayerAddedDesc: string;
    praiseGod: string;
    prayerMarkedAnswered: string;
    catThanksgiving: string;
    catPetition: string;
    catIntercession: string;
    catConfession: string;
    catWorship: string;
    catGuidance: string;
    linkCopied: string;
    linkCopiedDesc: string;
    failedLoadSeries: string;
    prayerCompleted: string;
    prayerCompletedDesc: string;
    prayerWatchCompleted: string;
    prayerWatchCompletedDesc: string;
    joinedPrayerWatch: string;
    joinedPrayerWatchDesc: string;
    noPrayerContent: string;
    noPrayerContentDesc: string;
    signInBookmarkSeries: string;
    removed: string;
    seriesRemovedBookmarks: string;
    bookmarked: string;
    seriesAddedBookmarks: string;
    notSupported: string;
    notificationsNotSupported: string;
    notificationsEnabled: string;
    notificationsEnabledDesc: string;
    enableNotificationsSettings: string;
    signInReminders: string;
    reminderSet: string;
    reminderSetDesc: string;
    reminderRemoved: string;
    reminderRemovedDesc: string;
    prayerTopics: string;
    prayerWatch: string;
    choosePrayerDuration: string;
  };
  ministry: {
    title: string;
    spaces: string;
    events: string;
    announcements: string;
    members: string;
    donations: string;
    join: string;
    leave: string;
    manage: string;
    createMinistry: string;
    ministrySettings: string;
    ministryMembers: string;
  };
  livechannels: {
    title: string;
    live: string;
    upcoming: string;
    replays: string;
    schedule: string;
    join: string;
    watch: string;
    broadcast: string;
    startBroadcast: string;
    endBroadcast: string;
    viewers: string;
    followers: string;
  };
  announcements: {
    title: string;
    new: string;
    read: string;
    unread: string;
    markAsRead: string;
    viewAll: string;
  };
  events: {
    title: string;
    upcoming: string;
    past: string;
    calendar: string;
    register: string;
    details: string;
    location: string;
    time: string;
    date: string;
    attendees: string;
  };
  profile: {
    title: string;
    edit: string;
    settings: string;
    preferences: string;
    notifications: string;
    privacy: string;
    account: string;
    language: string;
    avatar: string;
    bio: string;
  };
  settings: {
    title: string;
    general: string;
    language: string;
    notifications: string;
    privacy: string;
    security: string;
    theme: string;
    appearance: string;
    darkMode: string;
    lightMode: string;
    systemDefault: string;
  };
  errors: {
    generic: string;
    networkError: string;
    notFound: string;
    unauthorized: string;
    serverError: string;
    validationError: string;
    saveFailed: string;
    loadFailed: string;
    deleteFailed: string;
    updateFailed: string;
    permissionDenied: string;
    sessionExpired: string;
    tryAgain: string;
  };
  validation: {
    required: string;
    invalidEmail: string;
    passwordTooShort: string;
    passwordMismatch: string;
    invalidFormat: string;
    tooLong: string;
    tooShort: string;
    invalidNumber: string;
    invalidDate: string;
    invalidUrl: string;
  };
  counselling: {
    title: string;
    bookSession: string;
    mySessions: string;
    counsellors: string;
    availability: string;
    sessionNotes: string;
    confidential: string;
  };
  community: {
    title: string;
    feed: string;
    posts: string;
    comments: string;
    likes: string;
    shares: string;
    followers: string;
    following: string;
    testimonies: string;
    revelations: string;
  };
  // Per-page hero title/subtitle, keyed by "<tab>.title" / "<tab>.subtitle".
  hero: Record<string, string>;
  // Faithfulness streak widget. Flat key map.
  streak: Record<string, string>;
  cards: {
    copiedToClipboard: string;
    shareWithOthers: string;
    removedFromSaved: string;
    saved: string;
    dailyAffirmation: string;
    affirmation: string;
    dailyDeclaration: string;
    declaration: string;
    listenToAffirmation: string;
    listenToDeclaration: string;
  };
  // Marketing landing page (logged-out). Flat key map.
  landing: Record<string, string>;
  // GraceCounsel AI chat. Flat key map.
  grace: Record<string, string>;
  // Live Channels feature. Flat key map.
  live: Record<string, string>;
  communityPrayerManager: Record<string, string>;
  communityPrayerWall: Record<string, string>;
  communityRevelations: Record<string, string>;
  communityRevelationsManager: Record<string, string>;
  counsellorDashboard: Record<string, string>;
  enhancedPrayerChallenges: Record<string, string>;
  ministriesHub: Record<string, string>;
  ministryGroupsManager: Record<string, string>;
  prayerChallengeBackendManager: Record<string, string>;
  prayerSeriesViewer: Record<string, string>;
  profileSettings: Record<string, string>;
  scriptureMemory: Record<string, string>;
  sponsorshipSystem: Record<string, string>;
  subscriptionManager: Record<string, string>;
  channelStreamConfig: Record<string, string>;
  devotionalSeriesViewer: Record<string, string>;
  evangelismChannelsPanel: Record<string, string>;
  giftAidClaimsManager: Record<string, string>;
  giftAidDeclarationsManager: Record<string, string>;
  liveChannelBroadcast: Record<string, string>;
  liveChannelViewer: Record<string, string>;
  ministryDevotionalCreator: Record<string, string>;
  ministryDevotionalsManager: Record<string, string>;
  ministryDevotionalsManager2: Record<string, string>;
  ministryEventsManager: Record<string, string>;
  ministryMembersManager: Record<string, string>;
  ministryPrayerLibraryManager: Record<string, string>;
  ministryPrayerRequestsManager: Record<string, string>;
  ministryRegistrations: Record<string, string>;
  ministryRegistrationSettings: Record<string, string>;
  ministrySpace: Record<string, string>;
  ministryTestimoniesManager: Record<string, string>;
  ministryWhatsAppConnect: Record<string, string>;
  mLiveChannel: Record<string, string>;
  paymentSettingsDialog: Record<string, string>;
  aiSpiritualCompanionChat: Record<string, string>;
  bookSummaries: Record<string, string>;
  broadcastMessaging: Record<string, string>;
  bulkTtsUploader: Record<string, string>;
  emailNotificationManager: Record<string, string>;
  liveChannelEventScheduler: Record<string, string>;
  ministryAnnouncementsManager: Record<string, string>;
  ministryDonationForm: Record<string, string>;
  ministryDonationsManager: Record<string, string>;
  ministryWhatsAppBroadcast: Record<string, string>;
  paymentHistory: Record<string, string>;
  pushNotificationSettings: Record<string, string>;
  readingPlanManager: Record<string, string>;
  skeleton: Record<string, string>;
  whatsAppOptIn: Record<string, string>;
  aiPrayerGenerator: Record<string, string>;
  aiScriptureGuidance: Record<string, string>;
  counsellingVideoSession: Record<string, string>;
  counsellorApplicationForm: Record<string, string>;
  coverImageField: Record<string, string>;
  dailyVideoCall: Record<string, string>;
  donationForm: Record<string, string>;
  evangelismInbox: Record<string, string>;
  liveChannelEventDetails: Record<string, string>;
  memberMinistryProfile: Record<string, string>;
  ministryBirthdayWishes: Record<string, string>;
  ministryGiftAidDashboard: Record<string, string>;
  ministryMemberRegistration: Record<string, string>;
  ministrySettingsManager: Record<string, string>;
  myBookings: Record<string, string>;
  partnerDonationPage: Record<string, string>;
  translateNowButton: Record<string, string>;
  bibleReadingPlan: Record<string, string>;
  broadcastWallet: Record<string, string>;
  communityActivityFeed: Record<string, string>;
  counsellorBookingModal: Record<string, string>;
  createChallengeModal: Record<string, string>;
  dailyaudio: Record<string, string>;
  dataExportButton: Record<string, string>;
  devotionalBookmarks: Record<string, string>;
  devotionalProgress: Record<string, string>;
  devotionalSourceSettings: Record<string, string>;
  instrumentalPlayer: Record<string, string>;
  liveChannelChat: Record<string, string>;
  ministryDuplicates: Record<string, string>;
  ministryGiftAidSettings: Record<string, string>;
  ministryPaymentSettings: Record<string, string>;
  musicLibrary: Record<string, string>;
  sessionRatingModal: Record<string, string>;
  universalTtsExportButton: Record<string, string>;
  analyticsDashboard: Record<string, string>;
  chatSidebar: Record<string, string>;
  communityLeaderboard: Record<string, string>;
  counsellingChatSidebar: Record<string, string>;
  counsellorCard: Record<string, string>;
  dailyReminders: Record<string, string>;
  devotionalProgressTracker: Record<string, string>;
  donationsManagement: Record<string, string>;
  giftAidReports: Record<string, string>;
  globalSearch: Record<string, string>;
  liveChannelCard: Record<string, string>;
  liveChannelEventCard: Record<string, string>;
  liveChannelInteractiveMeetings: Record<string, string>;
  ministryInteractiveMeetings: Record<string, string>;
  ministryManagement: Record<string, string>;
  ministrySmallGroupsManager: Record<string, string>;
  smallGroupDetailManager: Record<string, string>;
  smallGroupsMember: Record<string, string>;
  ministryWhatsAppUsage: Record<string, string>;
  realTimeChat: Record<string, string>;
  shareChallengeModal: Record<string, string>;
  shareGroupModal: Record<string, string>;
  socialShareModal: Record<string, string>;
  userActivityDashboard: Record<string, string>;
  adminBookManager: Record<string, string>;
  adminCounsellorManager: Record<string, string>;
  adminDashboard: Record<string, string>;
  adminDeclarationManager: Record<string, string>;
  adminDevotionalLibraryManager: Record<string, string>;
  adminLiveChannelManager: Record<string, string>;
  adminMinistryGroups: Record<string, string>;
  adminPrayerLibrary: Record<string, string>;
  adminPrayerSeriesManager: Record<string, string>;
  adminSeriesManager: Record<string, string>;
  adminSubscriptionManager: Record<string, string>;
  adminTranslationDashboard: Record<string, string>;
  aiCompanionAdminSettings: Record<string, string>;
  ministryTenantManager: Record<string, string>;
  platformAnnouncementsManager: Record<string, string>;
  adminAffirmationManager: Record<string, string>;
  adminLeaderboard: Record<string, string>;
  adminPreTranslationTool: Record<string, string>;
  adminWhatsAppManager: Record<string, string>;
  auditLogsViewer: Record<string, string>;
  billingOverview: Record<string, string>;
  flaggedContentManager: Record<string, string>;
  platformAdminDashboard: Record<string, string>;
  platformAdminMinistries: Record<string, string>;
  platformAnalytics: Record<string, string>;
  referralAdminManager: Record<string, string>;
  subscriptionPlansManager: Record<string, string>;
  supportTicketsManager: Record<string, string>;
  prayerLibrary: Record<string, string>;
  prayerSession: Record<string, string>;
  viewers: Record<string, string>;
  // @i18n-ns-interface (merge anchor — do not remove)
}


// The default English dictionary lives in ./i18n-en.ts (its own chunk) —
// add new namespaces/keys there. Load it with loadEnglishTranslations().
let englishTranslationsPromise: Promise<Translations> | null = null;
export function loadEnglishTranslations(): Promise<Translations> {
  if (!englishTranslationsPromise) {
    englishTranslationsPromise = import('./i18n-en')
      .then((m) => m.DEFAULT_TRANSLATIONS)
      .catch((err) => {
        englishTranslationsPromise = null; // allow a retry (e.g. flaky network)
        throw err;
      });
  }
  return englishTranslationsPromise;
}

// Used while the English dictionary is still loading: every lookup misses, so
// t() returns the call site's inline fallback.
export const EMPTY_TRANSLATIONS = {} as Translations;

// =====================================================
// TRANSLATION SERVICE
// Centralized OpenAI-powered translation with caching
// =====================================================

export interface TranslationResult {
  original: string;
  translated: string;
  translatedText?: string; // alt field name returned by some deployed revisions
  sourceLanguage?: string;
  targetLanguage?: string;
  cached: boolean;
  unchanged?: boolean;
}

export interface BatchTranslationResult {
  translations: TranslationResult[];
  sourceLanguage: string;
  targetLanguage: string;
  totalTexts: number;
  cachedCount: number;
}

class TranslationService {
  private memoryCache: Map<string, string> = new Map();
  private pendingTranslations: Map<string, Promise<string>> = new Map();

  // Generate cache key
  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text.substring(0, 100)}`;
  }

  // Translate single text
  async translate(
    text: string,
    targetLanguage: SupportedLanguage,
    options: {
      sourceLanguage?: SupportedLanguage;
      contentType?: ContentType;
      skipCache?: boolean;
    } = {}
  ): Promise<string> {
    const { sourceLanguage = 'en', contentType = 'general', skipCache = false } = options;

    // Return original if same language or empty
    if (sourceLanguage === targetLanguage || !text || !text.trim()) {
      return text;
    }

    // Check memory cache first
    const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage);
    if (!skipCache && this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    // Check if already pending
    if (this.pendingTranslations.has(cacheKey)) {
      return this.pendingTranslations.get(cacheKey)!;
    }

    // Create pending promise
    const translationPromise = this.executeTranslation(text, targetLanguage, sourceLanguage, contentType, skipCache);
    this.pendingTranslations.set(cacheKey, translationPromise);

    try {
      const result = await translationPromise;
      this.memoryCache.set(cacheKey, result);
      return result;
    } finally {
      this.pendingTranslations.delete(cacheKey);
    }
  }
  // Execute translation via edge function (OpenAI-powered)
  private async executeTranslation(
    text: string,
    targetLanguage: string,
    sourceLanguage: string,
    contentType: string,
    skipCache: boolean
  ): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke('translate-content', {
        // Send BOTH parameter conventions so this works whether the deployed
        // function reads sourceLang/targetLang/cacheResult (repo version) or
        // sourceLanguage/targetLanguage/skipCache. See docs/multilingual-architecture-plan.md §Phase 0.
        body: {
          text,
          sourceLang: sourceLanguage,
          targetLang: targetLanguage,
          sourceLanguage,
          targetLanguage,
          contentType,
          cacheResult: !skipCache,
          skipCache
        }
      });

      if (error) {
        console.error('Translation error:', error);
        return text; // Fallback to original
      }

      // Check if translation was successful or if there was an API key issue
      if (data?.error && data?.code === 'OPENAI_KEY_MISSING') {
        console.warn('OpenAI API key not configured. Translation service unavailable.');
        return text; // Fallback to original
      }

      // Read BOTH response shapes: translatedText (repo function) or translated.
      return data?.translatedText || data?.translated || text;
    } catch (err) {
      console.error('Translation service error:', err);
      return text; // Fallback to original
    }
  }


  // Batch translate multiple texts
  async translateBatch(
    texts: string[],
    targetLanguage: SupportedLanguage,
    options: {
      sourceLanguage?: SupportedLanguage;
      contentType?: ContentType;
      skipCache?: boolean;
    } = {}
  ): Promise<string[]> {
    const { sourceLanguage = 'en', contentType = 'general', skipCache = false } = options;

    if (sourceLanguage === targetLanguage || !texts.length) {
      return texts;
    }

    // Filter out empty texts and check memory cache
    const results: (string | null)[] = texts.map(text => {
      if (!text || !text.trim()) return text;
      const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage);
      return !skipCache && this.memoryCache.has(cacheKey) ? this.memoryCache.get(cacheKey)! : null;
    });

    // Find texts that need translation
    const textsToTranslate: { index: number; text: string }[] = [];
    texts.forEach((text, index) => {
      if (results[index] === null && text && text.trim()) {
        textsToTranslate.push({ index, text });
      }
    });

    if (textsToTranslate.length === 0) {
      return results as string[];
    }

    // Call batch translation
    try {
      const { data, error } = await supabase.functions.invoke('translate-content', {
        // Send BOTH parameter conventions (see executeTranslation above).
        body: {
          texts: textsToTranslate.map(t => t.text),
          sourceLang: sourceLanguage,
          targetLang: targetLanguage,
          sourceLanguage,
          targetLanguage,
          contentType,
          cacheResult: !skipCache,
          skipCache
        }
      });

      if (error) {
        console.error('Batch translation error:', error);
        // Return originals for failed translations
        textsToTranslate.forEach(({ index, text }) => {
          results[index] = text;
        });
      } else if (data?.translations) {
        data.translations.forEach((translation: TranslationResult | string, i: number) => {
          const { index, text } = textsToTranslate[i];
          // Handle BOTH element shapes: a plain string (repo function returns
          // string[]) or an object with translated/translatedText.
          const translated = typeof translation === 'string'
            ? (translation || text)
            : (translation?.translated || translation?.translatedText || text);
          results[index] = translated;
          
          // Cache result
          const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage);
          this.memoryCache.set(cacheKey, translated);
        });
      }
    } catch (err) {
      console.error('Batch translation service error:', err);
      textsToTranslate.forEach(({ index, text }) => {
        results[index] = text;
      });
    }

    return results as string[];
  }

  // Translate UI translations object
  async translateUIStrings(
    translations: Translations,
    targetLanguage: SupportedLanguage
  ): Promise<Translations> {
    if (targetLanguage === 'en') {
      return translations;
    }

    // Flatten translations to array
    const flatTexts: { namespace: string; key: string; text: string }[] = [];
    
    Object.entries(translations).forEach(([namespace, values]) => {
      Object.entries(values as Record<string, string>).forEach(([key, text]) => {
        flatTexts.push({ namespace, key, text });
      });
    });

    // Batch translate in chunks to avoid timeout
    const CHUNK_SIZE = 50;
    const translatedTexts: string[] = [];
    
    for (let i = 0; i < flatTexts.length; i += CHUNK_SIZE) {
      const chunk = flatTexts.slice(i, i + CHUNK_SIZE);
      const chunkTranslations = await this.translateBatch(
        chunk.map(t => t.text),
        targetLanguage,
        { contentType: 'ui' }
      );
      translatedTexts.push(...chunkTranslations);
    }

    // Reconstruct translations object
    const result = JSON.parse(JSON.stringify(translations)) as Translations;
    
    flatTexts.forEach((item, index) => {
      (result as any)[item.namespace][item.key] = translatedTexts[index];
    });

    return result;
  }

  // Clear memory cache
  clearCache(): void {
    this.memoryCache.clear();
  }

  // Get cache stats
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.memoryCache.size,
      keys: Array.from(this.memoryCache.keys())
    };
  }
}

// Singleton instance
export const translationService = new TranslationService();

// =====================================================
// TRANSLATION LOADER
// Loads and caches translations with fallback
// =====================================================

export class TranslationLoader {
  private static cache: Map<string, Translations> = new Map();
  private static translatingLanguages: Set<string> = new Set();
  private static translationPromises: Map<string, Promise<Translations>> = new Map();

  static async loadTranslations(language: SupportedLanguage): Promise<Translations> {
    // Check cache first
    if (this.cache.has(language)) {
      return this.cache.get(language)!;
    }

    // For default language, return immediately
    if (language === DEFAULT_LANGUAGE) {
      const english = await loadEnglishTranslations();
      this.cache.set(language, english);
      return english;
    }

    // Check if already translating this language
    if (this.translationPromises.has(language)) {
      return this.translationPromises.get(language)!;
    }

    // Create translation promise
    const translationPromise = this.doLoadTranslations(language);
    this.translationPromises.set(language, translationPromise);

    try {
      const result = await translationPromise;
      return result;
    } finally {
      this.translationPromises.delete(language);
    }
  }

  private static async doLoadTranslations(language: SupportedLanguage): Promise<Translations> {
    // Phase 1: load curated, reviewed strings from the `ui_translations` table
    // and merge them over the in-code English dictionary. Any key missing for
    // this language gracefully falls back to English (not a broken machine
    // translation). English itself is served from code (handled by the caller).
    try {
      console.log(`Loading translations for ${language} from ui_translations...`);

      // Deep clone the English base so unresolved keys fall back to English.
      const merged = JSON.parse(JSON.stringify(await loadEnglishTranslations())) as Translations;

      // ui_translations far exceeds Supabase's default 1000-row API cap
      // (the vi dictionary alone is ~8k rows). A single un-paged query returns
      // only ~1000 arbitrary rows, so most namespaces would silently fall back
      // to English. Page through with .range() until every row is fetched.
      const PAGE_SIZE = 1000;
      let applied = 0;
      let firstPageError: { message: string } | null = null;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('ui_translations')
          .select('namespace, key, value')
          .eq('language_code', language)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          // First-page failure => table missing/transient; fall back to English.
          // Later-page failure => keep whatever we already merged.
          if (from === 0) firstPageError = error;
          else console.warn(`ui_translations page @${from} failed (${error.message}); using ${applied} strings loaded so far.`);
          break;
        }

        for (const row of data ?? []) {
          if (typeof row.value !== 'string' || row.value.length === 0) continue;
          // Create the namespace if the compiled English base doesn't have it yet,
          // so translations for newly-added modules aren't silently dropped.
          const ns = ((merged as any)[row.namespace] ??= {});
          ns[row.key] = row.value;
          applied++;
        }

        if (!data || data.length < PAGE_SIZE) break; // last page
      }

      if (firstPageError) {
        console.warn(`ui_translations unavailable for ${language} (${firstPageError.message}); using English.`);
        this.cache.set(language, merged);
        return merged;
      }

      console.log(`✅ Loaded ${applied} ${language} UI strings (paged); rest fall back to English.`);
      this.cache.set(language, merged);
      return merged;
    } catch (error) {
      console.error(`❌ Failed to load translations for ${language}:`, error);
      console.warn(`Falling back to ${FALLBACK_LANGUAGE} (English)`);

      // Cache the fallback to prevent repeated failed attempts. If even the
      // English chunk can't load, t()'s inline fallbacks still render English.
      const english = await loadEnglishTranslations().catch(() => EMPTY_TRANSLATIONS);
      this.cache.set(language, english);
      return english;
    }
  }

  static clearCache(): void {
    this.cache.clear();
  }

  static clearLanguageCache(language: SupportedLanguage): void {
    this.cache.delete(language);
  }

  static getCachedLanguages(): SupportedLanguage[] {
    return Array.from(this.cache.keys()) as SupportedLanguage[];
  }

  static isLanguageCached(language: SupportedLanguage): boolean {
    return this.cache.has(language);
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Get language info by code
export function getLanguageInfo(code: SupportedLanguage): LanguageInfo | undefined {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code);
}

// Detect browser language
export function detectBrowserLanguage(): SupportedLanguage {
  const browserLang = navigator.language.split('-')[0] as SupportedLanguage;
  const isSupported = SUPPORTED_LANGUAGES.some(lang => lang.code === browserLang);
  return isSupported ? browserLang : DEFAULT_LANGUAGE;
}

// Check if language is RTL
export function isRTLLanguage(code: SupportedLanguage): boolean {
  const langInfo = getLanguageInfo(code);
  return langInfo?.rtl || false;
}

// Get font family for language
export function getLanguageFontFamily(code: SupportedLanguage): string {
  const langInfo = getLanguageInfo(code);
  return langInfo?.fontFamily || 'system-ui, -apple-system, sans-serif';
}

// Get languages by region
export function getLanguagesByRegion(region: LanguageInfo['region']): LanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.region === region);
}

// Get Asian languages (primary implementation)
export function getAsianLanguages(): LanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.region === 'asian' || lang.region === 'middle-eastern');
}

// Get European languages
export function getEuropeanLanguages(): LanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.region === 'european');
}

// Format date according to language
export function formatDate(date: Date, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

// Format time according to language
export function formatTime(date: Date, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Format number according to language
export function formatNumber(num: number, language: SupportedLanguage): string {
  return new Intl.NumberFormat(language).format(num);
}

// Format currency according to language
export function formatCurrency(amount: number, currency: string, language: SupportedLanguage): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency,
  }).format(amount);
}

// Format relative time
export function formatRelativeTime(date: Date, language: SupportedLanguage): string {
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const now = new Date();
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);
  
  if (Math.abs(diffInSeconds) < 60) {
    return rtf.format(diffInSeconds, 'second');
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (Math.abs(diffInMinutes) < 60) {
    return rtf.format(diffInMinutes, 'minute');
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (Math.abs(diffInHours) < 24) {
    return rtf.format(diffInHours, 'hour');
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (Math.abs(diffInDays) < 30) {
    return rtf.format(diffInDays, 'day');
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (Math.abs(diffInMonths) < 12) {
    return rtf.format(diffInMonths, 'month');
  }
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return rtf.format(diffInYears, 'year');
}