// =====================================================
// REPLAY TYPES
// Type definitions for replay functionality
// =====================================================

import { SupportedLanguage } from '@/lib/i18n';

/**
 * Replay access levels
 */
export type ReplayAccessLevel = 'none' | 'stream' | 'download';

/**
 * Replay status
 */
export type ReplayStatus = 'processing' | 'ready' | 'failed' | 'deleted';

/**
 * Live replay record
 */
export interface LiveReplay {
  id: string;
  channel_id: string;
  event_id?: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  recording_url?: string;
  storage_key?: string;
  duration_seconds?: number;
  file_size_bytes?: number;
  replay_access_level: ReplayAccessLevel;
  status: ReplayStatus;
  view_count: number;
  download_count: number;
  language?: SupportedLanguage;
  created_at: string;
  updated_at?: string;
  expires_at?: string;
  metadata?: Record<string, any>;
}

/**
 * Replay with entitlements (for API responses)
 */
export interface ReplayWithEntitlements extends LiveReplay {
  can_stream: boolean;
  can_download: boolean;
}

/**
 * Replay list response
 */
export interface ReplayListResponse {
  replays: ReplayWithEntitlements[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
}

/**
 * Replay stream URL response
 */
export interface ReplayStreamResponse {
  url: string;
  expires_at: string;
  quality_options?: {
    label: string;
    url: string;
    resolution: string;
  }[];
}

/**
 * Replay download URL response
 */
export interface ReplayDownloadResponse {
  url: string;
  filename: string;
  expires_at: string;
  file_size_bytes: number;
}

/**
 * Replay analytics
 */
export interface ReplayAnalytics {
  replay_id: string;
  total_views: number;
  unique_viewers: number;
  total_watch_time_seconds: number;
  average_watch_time_seconds: number;
  completion_rate: number;
  downloads: number;
  views_by_date: {
    date: string;
    views: number;
  }[];
}

/**
 * User replay progress (for resuming playback)
 */
export interface UserReplayProgress {
  user_id: string;
  replay_id: string;
  progress_seconds: number;
  completed: boolean;
  last_watched_at: string;
}

/**
 * Replay filter options
 */
export interface ReplayFilters {
  channel_id?: string;
  status?: ReplayStatus;
  access_level?: ReplayAccessLevel;
  language?: SupportedLanguage;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort_by?: 'created_at' | 'view_count' | 'duration' | 'title';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

/**
 * Replay creation input
 */
export interface CreateReplayInput {
  channel_id: string;
  event_id?: string;
  title: string;
  description?: string;
  recording_url: string;
  storage_key: string;
  duration_seconds: number;
  file_size_bytes?: number;
  replay_access_level?: ReplayAccessLevel;
  thumbnail_url?: string;
  language?: SupportedLanguage;
  expires_at?: string;
  metadata?: Record<string, any>;
}

/**
 * Replay update input
 */
export interface UpdateReplayInput {
  title?: string;
  description?: string;
  thumbnail_url?: string;
  replay_access_level?: ReplayAccessLevel;
  expires_at?: string | null;
  metadata?: Record<string, any>;
}
