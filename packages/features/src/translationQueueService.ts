// =====================================================
// TRANSLATION QUEUE SERVICE
// Client-side service for managing translation queue
// =====================================================

import { supabase } from '@rekindle/supabase';
import { SupportedLanguage } from './i18n';


// Asian language codes for auto-translation
export const ASIAN_LANGUAGE_CODES: SupportedLanguage[] = [
  'zh', 'ja', 'ko', 'vi', 'th', 'id', 'hi', 'ar', 'bn', 'ta', 
  'te', 'ur', 'fa', 'he', 'my', 'km', 'lo', 'ne', 'si', 'tl', 'ms'
];

// Content type to table mapping
export const CONTENT_TABLE_MAP: Record<string, string> = {
  'devotional': 'devotionals',
  'ministry_devotional': 'ministry_devotionals',
  'prayer': 'prayer_points',
  'prayer_library': 'prayer_library',
  'announcement': 'ministry_announcements',
  'teaching': 'book_summaries',
  'prayer_series': 'prayer_series',
  'devotional_series': 'devotional_series',
  'affirmation': 'affirmations',
  'declaration': 'declarations',
  'devotional_entry': 'devotional_entries',
  'devotional_stream': 'devotional_streams',
  'prayer_topic': 'prayer_topics'
};

// Fields to translate for each content type
export const CONTENT_FIELDS_MAP: Record<string, string[]> = {
  'devotional': ['title', 'content', 'message', 'scripture_reference', 'scripture_text', 'reflection', 'reflection_questions', 'prayer', 'prayer_focus'],
  'ministry_devotional': ['title', 'content', 'message', 'scripture_reference', 'scripture_text', 'reflection', 'reflection_questions', 'prayer', 'prayer_focus'],
  'prayer': ['title', 'content', 'description', 'prayer_text'],
  'prayer_library': ['title', 'content', 'scripture'],
  'announcement': ['title', 'content', 'description'],
  'teaching': ['title', 'summary', 'key_takeaways'],
  'prayer_series': ['title', 'description'],
  'devotional_series': ['title', 'description'],
  'affirmation': ['title', 'text', 'scripture_reference'],
  'declaration': ['title', 'text', 'scripture_reference'],
  // Superset of every string field the reader renders (DevotionalSeriesViewer.localizeDay).
  'devotional_entry': [
    'title', 'subtitle', 'scripture_reference', 'scripture_text',
    'main_content', 'content', 'devotional_text', 'body',
    'introduction', 'reflection', 'reflection_questions',
    'guided_prayer', 'prayer', 'action_step', 'action_steps',
    'additional_thoughts'
  ],
  'prayer_topic': ['title', 'description', 'scripture_reference', 'scripture_text', 'prayer_points']
};

export interface TranslationQueueItem {
  id: string;
  content_type: string;
  content_id: string;
  content_table: string;
  source_language: string;
  target_language: string;
  fields_to_translate: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  error_message?: string;
  retry_count: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  created_by?: string;
  ministry_id?: string;
  is_auto_triggered: boolean;
}

export interface ContentTranslationStatus {
  id: string;
  content_type: string;
  content_id: string;
  content_table: string;
  total_languages: number;
  completed_languages: number;
  pending_languages: string[];
  completed_language_codes: string[];
  failed_languages: string[];
  last_translation_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TranslationQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

class TranslationQueueService {
  // Queue content for translation to all Asian languages
  async queueForAsianLanguages(
    contentType: string,
    contentId: string,
    options: {
      sourceLanguage?: string;
      priority?: number;
      createdBy?: string;
      ministryId?: string;
    } = {}
  ): Promise<{ success: boolean; queued: number; skipped?: number; languages: string[] }> {
    const contentTable = CONTENT_TABLE_MAP[contentType];
    if (!contentTable) {
      throw new Error(`Unknown content type: ${contentType}`);
    }

    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: {
        action: 'queue_asian_languages',
        contentType,
        contentId,
        contentTable,
        sourceLanguage: options.sourceLanguage || 'en',
        priority: options.priority || 5,
        createdBy: options.createdBy,
        ministryId: options.ministryId
      }
    });

    if (error) throw error;
    return data;
  }

  // Queue content for specific languages
  async queueForLanguages(
    contentType: string,
    contentId: string,
    targetLanguages: string[],
    options: {
      sourceLanguage?: string;
      priority?: number;
      createdBy?: string;
      ministryId?: string;
      isAutoTriggered?: boolean;
    } = {}
  ): Promise<{ success: boolean; queued: number; skipped?: number; languages: string[] }> {
    const contentTable = CONTENT_TABLE_MAP[contentType];
    if (!contentTable) {
      throw new Error(`Unknown content type: ${contentType}`);
    }

    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: {
        action: 'queue_content',
        contentType,
        contentId,
        contentTable,
        targetLanguages,
        sourceLanguage: options.sourceLanguage || 'en',
        priority: options.priority || 5,
        createdBy: options.createdBy,
        ministryId: options.ministryId,
        isAutoTriggered: options.isAutoTriggered || false
      }
    });

    if (error) throw error;
    return data;
  }

  // Get translation status for content
  async getContentStatus(
    contentType: string,
    contentId: string
  ): Promise<{ status: ContentTranslationStatus | null; queueItems: TranslationQueueItem[] }> {
    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: {
        action: 'get_status',
        contentType,
        contentId
      }
    });

    if (error) throw error;
    return data;
  }

  // Get queue statistics
  async getQueueStats(): Promise<TranslationQueueStats> {
    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: { action: 'get_queue_stats' }
    });

    if (error) throw error;
    return data;
  }

  // Process pending queue items (admin only)
  async processQueue(limit: number = 10): Promise<{ processed: number; failed: number; total: number; reclaimed?: { requeued: number; failed: number } }> {
    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: { action: 'process_queue', limit }
    });

    if (error) throw error;
    return data;
  }

  // Bulk-enqueue whole content types (e.g. all devotional series / prayer library
  // / books) for the given languages. Skips pairs already completed or in flight,
  // so it's safe to re-run. Returns per-type counts.
  async queueAll(
    contentTypes: string[],
    targetLanguages: string[],
    options: { sourceLanguage?: string; priority?: number; createdBy?: string; force?: boolean } = {}
  ): Promise<{
    success: boolean;
    totalItems: number;
    totalQueued: number;
    skipped: number;
    perType: Record<string, { items: number; queued: number; skipped: number }>;
  }> {
    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: {
        action: 'queue_all',
        contentTypes,
        targetLanguages,
        sourceLanguage: options.sourceLanguage || 'en',
        priority: options.priority || 4,
        createdBy: options.createdBy,
        force: options.force || false
      }
    });

    if (error) throw error;
    return data;
  }

  // Process popular content for demand-based translation
  async processPopularContent(): Promise<{ queued: number }> {
    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: { action: 'process_popular' }
    });

    if (error) throw error;
    return data;
  }

  // Track content view for popularity tracking
  async trackContentView(
    contentType: string,
    contentId: string,
    languageCode: string,
    userId?: string
  ): Promise<void> {
    await supabase.functions.invoke('process-translation-queue', {
      body: {
        action: 'track_view',
        contentType,
        contentId,
        languageCode,
        userId
      }
    });
  }

  // Get pending queue items for a ministry
  async getMinistryQueue(ministryId: string): Promise<TranslationQueueItem[]> {
    const { data, error } = await supabase
      .from('translation_queue')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  }

  // Get all queue items (admin)
  async getAllQueueItems(
    filters: {
      status?: string;
      contentType?: string;
      limit?: number;
    } = {}
  ): Promise<TranslationQueueItem[]> {
    let query = supabase
      .from('translation_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filters.limit || 100);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.contentType) {
      query = query.eq('content_type', filters.contentType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // Cancel a queue item
  async cancelQueueItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('translation_queue')
      .delete()
      .eq('id', itemId)
      .eq('status', 'pending');

    if (error) throw error;
  }

  // Requeue ALL failed items back to pending (optionally scoped). Dedupes
  // against in-flight rows server-side so it can't create duplicates.
  async retryAllFailed(
    filters: { contentType?: string; targetLanguage?: string } = {}
  ): Promise<{ retried: number; removedDuplicates: number; message?: string }> {
    const { data, error } = await supabase.functions.invoke('process-translation-queue', {
      body: { action: 'retry_failed', ...filters }
    });
    if (error) throw error;
    return data;
  }

  // Retry a failed queue item
  async retryQueueItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('translation_queue')
      .update({ 
        status: 'pending', 
        error_message: null,
        retry_count: 0 
      })
      .eq('id', itemId)
      .eq('status', 'failed');

    if (error) throw error;
  }

  // Subscribe to queue updates for a content item
  subscribeToContentStatus(
    contentType: string,
    contentId: string,
    callback: (status: ContentTranslationStatus) => void
  ): () => void {
    const channel = supabase
      .channel(`translation-status-${contentType}-${contentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_translation_status',
          filter: `content_type=eq.${contentType},content_id=eq.${contentId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as ContentTranslationStatus);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  // Get translation progress percentage
  getProgressPercentage(status: ContentTranslationStatus | null): number {
    if (!status || status.total_languages === 0) return 0;
    return Math.round((status.completed_languages / status.total_languages) * 100);
  }

  // Check if content is fully translated
  isFullyTranslated(status: ContentTranslationStatus | null): boolean {
    if (!status) return false;
    return status.completed_languages >= status.total_languages;
  }

  // Get human-readable status
  getStatusLabel(status: ContentTranslationStatus | null): string {
    if (!status) return 'Not queued';
    if (status.completed_languages === 0 && status.pending_languages.length > 0) {
      return 'Queued for translation';
    }
    if (status.completed_languages < status.total_languages) {
      return `Translating (${status.completed_languages}/${status.total_languages})`;
    }
    if (status.failed_languages.length > 0) {
      return `Completed with ${status.failed_languages.length} failures`;
    }
    return 'Fully translated';
  }
}

export const translationQueueService = new TranslationQueueService();
