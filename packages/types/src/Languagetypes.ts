// =====================================================
// LANGUAGE SYSTEM TYPE DEFINITIONS
// Complete TypeScript types reference
// =====================================================

import { SupportedLanguage } from './language';

/**
 * User Profile with Language Preference
 */
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  preferred_language: SupportedLanguage;
  language_updated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Base Content with Language Support (Schema A)
 * Use this for simple content with translations object
 */
export interface LocalizableContent<T = any> {
  id: string;
  created_at: string;
  updated_at: string;
  
  // Primary content fields
  title: string;
  description?: string;
  content?: string;
  
  // Language information
  language: SupportedLanguage;
  
  // Translations object
  translations?: {
    [K in SupportedLanguage]?: T;
  };
}

/**
 * Devotional with Language Support
 */
export interface Devotional extends LocalizableContent<DevotionalTranslation> {
  author_id: string;
  category: string;
  scripture_references: string[];
  is_published: boolean;
  views: number;
  translations?: {
    [K in SupportedLanguage]?: DevotionalTranslation;
  };
}

export interface DevotionalTranslation {
  title: string;
  description: string;
  content: string;
  scripture_references?: string[];
}

/**
 * Prayer with Language Support
 */
export interface Prayer extends LocalizableContent<PrayerTranslation> {
  prayer_type: 'personal' | 'corporate' | 'intercession';
  category: string;
  duration_minutes?: number;
  translations?: {
    [K in SupportedLanguage]?: PrayerTranslation;
  };
}

export interface PrayerTranslation {
  title: string;
  description: string;
  content: string;
  category?: string;
}

/**
 * Prayer Series with Language Support
 */
export interface PrayerSeries extends LocalizableContent<PrayerSeriesTranslation> {
  total_days: number;
  prayers: Prayer[];
  translations?: {
    [K in SupportedLanguage]?: PrayerSeriesTranslation;
  };
}

export interface PrayerSeriesTranslation {
  title: string;
  description: string;
  overview?: string;
}

/**
 * Announcement with Language Support
 */
export interface Announcement extends LocalizableContent<AnnouncementTranslation> {
  ministry_id?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_active: boolean;
  expires_at?: string;
  translations?: {
    [K in SupportedLanguage]?: AnnouncementTranslation;
  };
}

export interface AnnouncementTranslation {
  title: string;
  description: string;
  content: string;
}

/**
 * Event with Language Support
 */
export interface Event extends LocalizableContent<EventTranslation> {
  ministry_id?: string;
  event_date: string;
  event_time: string;
  location: string;
  capacity?: number;
  is_online: boolean;
  meeting_link?: string;
  translations?: {
    [K in SupportedLanguage]?: EventTranslation;
  };
}

export interface EventTranslation {
  title: string;
  description: string;
  location?: string;
}

/**
 * Ministry Content with Language Support
 */
export interface MinistryContent extends LocalizableContent<MinistryContentTranslation> {
  ministry_id: string;
  content_type: 'announcement' | 'teaching' | 'event' | 'resource';
  is_published: boolean;
  translations?: {
    [K in SupportedLanguage]?: MinistryContentTranslation;
  };
}

export interface MinistryContentTranslation {
  title: string;
  description: string;
  content: string;
}

/**
 * Live Channel with Language Support
 */
export interface LiveChannel extends LocalizableContent<LiveChannelTranslation> {
  ministry_id?: string;
  channel_type: 'service' | 'prayer' | 'teaching' | 'worship';
  is_live: boolean;
  scheduled_time?: string;
  stream_url?: string;
  translations?: {
    [K in SupportedLanguage]?: LiveChannelTranslation;
  };
}

export interface LiveChannelTranslation {
  title: string;
  description: string;
  schedule_info?: string;
}

/**
 * Multi-Language Content (Schema B)
 * Use this for content designed from the start with multiple languages
 */
export interface MultiLanguageContent<T = any> {
  id: string;
  created_at: string;
  updated_at: string;
  
  // Language metadata
  default_language: SupportedLanguage;
  available_languages: SupportedLanguage[];
  
  // Content in all languages
  content: {
    [K in SupportedLanguage]?: T;
  };
}

/**
 * Multi-Language Devotional Series
 */
export interface MultiLanguageDevotionalSeries extends MultiLanguageContent<DevotionalSeriesContent> {
  total_devotionals: number;
  is_published: boolean;
}

export interface DevotionalSeriesContent {
  title: string;
  description: string;
  overview: string;
  devotionals: {
    day: number;
    title: string;
    content: string;
    scripture: string;
  }[];
}

/**
 * Language Usage Analytics
 */
export interface LanguageUsageAnalytics {
  id: string;
  user_id: string;
  language: SupportedLanguage;
  content_type?: string;
  content_id?: string;
  event_type: 'view' | 'interaction' | 'change';
  created_at: string;
}

/**
 * Localized Content Result
 * Returned by useLocalizedContent hooks
 */
export interface LocalizedContentResult<T> {
  content: T;
  isFallback: boolean;
  originalLanguage: SupportedLanguage;
  displayedLanguage: SupportedLanguage;
}

/**
 * Language Preference Update Payload
 */
export interface LanguagePreferenceUpdate {
  user_id: string;
  preferred_language: SupportedLanguage;
  updated_at: string;
}

/**
 * Translation Creation Payload
 */
export interface TranslationPayload<T = any> {
  content_id: string;
  language: SupportedLanguage;
  translations: T;
  created_by: string;
}

/**
 * Content Filter Options
 */
export interface ContentFilterOptions {
  language?: SupportedLanguage;
  includeTranslations?: boolean;
  strictLanguageMatch?: boolean;
  sortByLanguagePreference?: boolean;
}

/**
 * Language Detection Result
 */
export interface LanguageDetectionResult {
  detected: SupportedLanguage;
  confidence: number;
  browserLanguages: string[];
  fallback: SupportedLanguage;
}

/**
 * Translation Stats
 */
export interface TranslationStats {
  content_id: string;
  total_languages: number;
  languages: SupportedLanguage[];
  completion_percentage: Record<SupportedLanguage, number>;
  last_updated: Record<SupportedLanguage, string>;
}

/**
 * Language Context Type (from LanguageContext)
 */
export interface LanguageContextType {
  language: SupportedLanguage;
  translations: Record<string, any>;
  isLoading: boolean;
  isRTL: boolean;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (namespace: string, key: string) => string;
  availableLanguages: Array<{
    code: SupportedLanguage;
    name: string;
    nativeName: string;
    flag: string;
    rtl?: boolean;
  }>;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatNumber: (num: number) => string;
}

/**
 * Localized Content Hook Options
 */
export interface LocalizedContentHookOptions {
  showFallback?: boolean;
  fallbackLanguage?: SupportedLanguage;
  strict?: boolean;
}

/**
 * Localized Content Hook Return
 */
export interface LocalizedContentHookReturn<T> {
  filterContentByLanguage: (content: T[]) => T[];
  getLocalizedContent: (item: T) => T & { isFallback: boolean };
  isContentAvailable: (item: T) => boolean;
  getAvailableLanguages: (item: T) => SupportedLanguage[];
  sortByLanguagePreference: (content: T[]) => T[];
  currentLanguage: SupportedLanguage;
}

/**
 * Database Query Helpers
 */
export interface LanguageQuery {
  language?: SupportedLanguage;
  includeTranslations?: boolean;
  fallbackToDefault?: boolean;
}

/**
 * Supabase Query Builder Extension
 */
export interface SupabaseLanguageQueryBuilder {
  filterByLanguage(language: SupportedLanguage): this;
  withTranslations(languages: SupportedLanguage[]): this;
  selectLocalized(userLanguage: SupportedLanguage): this;
}

/**
 * Translation Validation
 */
export interface TranslationValidation {
  isValid: boolean;
  errors: Array<{
    field: string;
    language: SupportedLanguage;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    language: SupportedLanguage;
    message: string;
  }>;
}

/**
 * Content Translation Status
 */
export type TranslationStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_review';

export interface ContentTranslationStatus {
  content_id: string;
  language: SupportedLanguage;
  status: TranslationStatus;
  translator_id?: string;
  completed_at?: string;
  reviewed_at?: string;
  reviewer_id?: string;
}

/**
 * Batch Translation Request
 */
export interface BatchTranslationRequest {
  content_ids: string[];
  source_language: SupportedLanguage;
  target_languages: SupportedLanguage[];
  translation_service?: 'manual' | 'machine' | 'hybrid';
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Language Analytics Summary
 */
export interface LanguageAnalyticsSummary {
  total_users: number;
  users_by_language: Record<SupportedLanguage, number>;
  content_by_language: Record<SupportedLanguage, number>;
  most_viewed_language: SupportedLanguage;
  translation_coverage: Record<SupportedLanguage, number>;
  active_translators: number;
}

/**
 * Export all types
 */
export type {
  SupportedLanguage,
  UserProfile,
  LocalizableContent,
  Devotional,
  Prayer,
  PrayerSeries,
  Announcement,
  Event,
  MinistryContent,
  LiveChannel,
  MultiLanguageContent,
  LanguageUsageAnalytics,
  LocalizedContentResult,
  LanguagePreferenceUpdate,
  TranslationPayload,
  ContentFilterOptions,
  LanguageDetectionResult,
  TranslationStats,
  LanguageContextType,
  LocalizedContentHookOptions,
  LocalizedContentHookReturn,
  LanguageQuery,
  SupabaseLanguageQueryBuilder,
  TranslationValidation,
  TranslationStatus,
  ContentTranslationStatus,
  BatchTranslationRequest,
  LanguageAnalyticsSummary,
};