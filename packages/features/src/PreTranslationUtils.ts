// =====================================================
// PRE-TRANSLATION AUTOMATION UTILITIES
// Helper functions for scheduled and bulk pre-translation
// =====================================================

import { supabase } from '@rekindle/supabase';
import { 
  ASIAN_LANGUAGE_CODES, 
  DEFAULT_TRANSLATIONS,
  type SupportedLanguage,
  type Translations 
} from './i18n';

// =====================================================
// PRE-TRANSLATION CONFIGURATION
// =====================================================

export interface PreTranslationConfig {
  batchSize: number;
  delayBetweenBatches: number;
  maxConcurrent: number;
  targetLanguages: SupportedLanguage[];
  contentTypes: string[];
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: PreTranslationConfig = {
  batchSize: 10,
  delayBetweenBatches: 1000, // 1 second
  maxConcurrent: 3,
  targetLanguages: ASIAN_LANGUAGE_CODES,
  contentTypes: ['ui', 'content'],
  retryAttempts: 3,
  retryDelay: 2000
};

// =====================================================
// TRANSLATION QUEUE MANAGER
// =====================================================

export class PreTranslationManager {
  private config: PreTranslationConfig;
  private activeTranslations: Set<string> = new Set();
  private failedTranslations: Map<string, number> = new Map();

  constructor(config?: Partial<PreTranslationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // =====================================================
  // PRE-TRANSLATE ALL UI STRINGS
  // =====================================================

  async preTranslateUIStrings(
    progressCallback?: (progress: number, total: number) => void
  ): Promise<{
    success: number;
    failed: number;
    cached: number;
    totalCost: number;
  }> {
    console.log('🚀 Starting UI strings pre-translation...');
    
    const results = {
      success: 0,
      failed: 0,
      cached: 0,
      totalCost: 0
    };

    // Flatten all translations into array of strings
    const allStrings = this.flattenTranslations(DEFAULT_TRANSLATIONS);
    const total = allStrings.length * this.config.targetLanguages.length;
    let processed = 0;

    console.log(`📊 Total items to translate: ${total}`);

    // Process in batches
    for (let i = 0; i < allStrings.length; i += this.config.batchSize) {
      const batch = allStrings.slice(i, i + this.config.batchSize);
      
      for (const targetLang of this.config.targetLanguages) {
        const batchResults = await this.translateBatch(
          batch.map(s => s.text),
          'en',
          targetLang,
          'ui'
        );

        results.success += batchResults.success;
        results.failed += batchResults.failed;
        results.cached += batchResults.cached;
        results.totalCost += batchResults.cost;

        processed += batch.length;
        if (progressCallback) {
          progressCallback(processed, total);
        }
      }

      // Delay between batches to avoid rate limits
      if (i + this.config.batchSize < allStrings.length) {
        await this.delay(this.config.delayBetweenBatches);
      }
    }

    console.log('✅ UI strings pre-translation completed', results);
    return results;
  }

  // =====================================================
  // PRE-TRANSLATE COMMON CONTENT TEMPLATES
  // =====================================================

  async preTranslateContentTemplates(
    templates: { id: string; text: string; category: string }[],
    progressCallback?: (progress: number, total: number) => void
  ): Promise<{
    success: number;
    failed: number;
    cached: number;
    totalCost: number;
  }> {
    console.log('🚀 Starting content templates pre-translation...');
    
    const results = {
      success: 0,
      failed: 0,
      cached: 0,
      totalCost: 0
    };

    const total = templates.length * this.config.targetLanguages.length;
    let processed = 0;

    console.log(`📊 Total items to translate: ${total}`);

    // Process each template
    for (const template of templates) {
      for (const targetLang of this.config.targetLanguages) {
        const result = await this.translateSingle(
          template.text,
          'en',
          targetLang,
          'content'
        );

        if (result.success) {
          if (result.cached) results.cached++;
          else results.success++;
          results.totalCost += result.cost;
        } else {
          results.failed++;
        }

        processed++;
        if (progressCallback) {
          progressCallback(processed, total);
        }
      }

      // Small delay between templates
      await this.delay(100);
    }

    console.log('✅ Content templates pre-translation completed', results);
    return results;
  }

  // =====================================================
  // PRE-TRANSLATE SPECIFIC CATEGORY
  // =====================================================

  async preTranslateCategory(
    category: string,
    items: string[],
    targetLanguages?: SupportedLanguage[]
  ): Promise<{
    success: number;
    failed: number;
    cached: number;
    totalCost: number;
  }> {
    const langs = targetLanguages || this.config.targetLanguages;
    console.log(`🚀 Pre-translating category: ${category} (${items.length} items × ${langs.length} languages)`);

    const results = {
      success: 0,
      failed: 0,
      cached: 0,
      totalCost: 0
    };

    for (const targetLang of langs) {
      const batchResults = await this.translateBatch(
        items,
        'en',
        targetLang,
        category
      );

      results.success += batchResults.success;
      results.failed += batchResults.failed;
      results.cached += batchResults.cached;
      results.totalCost += batchResults.cost;
    }

    return results;
  }

  // =====================================================
  // CORE TRANSLATION METHODS
  // =====================================================

  private async translateSingle(
    text: string,
    sourceLang: string,
    targetLang: SupportedLanguage,
    contentType: string
  ): Promise<{
    success: boolean;
    cached: boolean;
    cost: number;
  }> {
    const key = `${text}-${sourceLang}-${targetLang}-${contentType}`;

    // Check if already processing
    if (this.activeTranslations.has(key)) {
      await this.waitForTranslation(key);
      return { success: true, cached: true, cost: 0 };
    }

    this.activeTranslations.add(key);

    try {
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: {
          text,
          sourceLang,
          targetLang,
          contentType,
          cacheResult: true
        }
      });

      if (error) throw error;

      const estimatedTokens = (text.length + (data.translatedText?.length || 0)) / 3.5;
      const cost = (estimatedTokens / 1000000) * 0.375;

      return {
        success: true,
        cached: data.cached || false,
        cost: data.cached ? 0 : cost
      };
    } catch (error) {
      console.error(`Translation failed for "${text.substring(0, 50)}..." to ${targetLang}:`, error);
      
      // Retry logic
      const attempts = this.failedTranslations.get(key) || 0;
      if (attempts < this.config.retryAttempts) {
        this.failedTranslations.set(key, attempts + 1);
        await this.delay(this.config.retryDelay);
        return this.translateSingle(text, sourceLang, targetLang, contentType);
      }

      return { success: false, cached: false, cost: 0 };
    } finally {
      this.activeTranslations.delete(key);
    }
  }

  private async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: SupportedLanguage,
    contentType: string
  ): Promise<{
    success: number;
    failed: number;
    cached: number;
    cost: number;
  }> {
    const results = {
      success: 0,
      failed: 0,
      cached: 0,
      cost: 0
    };

    // Process items concurrently with max concurrent limit
    const promises = texts.map(async (text) => {
      const result = await this.translateSingle(text, sourceLang, targetLang, contentType);
      return result;
    });

    // Process in chunks to respect max concurrent limit
    for (let i = 0; i < promises.length; i += this.config.maxConcurrent) {
      const chunk = promises.slice(i, i + this.config.maxConcurrent);
      const chunkResults = await Promise.all(chunk);

      chunkResults.forEach(result => {
        if (result.success) {
          if (result.cached) results.cached++;
          else results.success++;
          results.cost += result.cost;
        } else {
          results.failed++;
        }
      });
    }

    return results;
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  private flattenTranslations(translations: Translations): { key: string; text: string }[] {
    const result: { key: string; text: string }[] = [];

    Object.entries(translations).forEach(([namespace, values]) => {
      Object.entries(values as Record<string, string>).forEach(([key, text]) => {
        result.push({ key: `${namespace}.${key}`, text });
      });
    });

    return result;
  }

  private async waitForTranslation(key: string): Promise<void> {
    let attempts = 0;
    while (this.activeTranslations.has(key) && attempts < 60) {
      await this.delay(500);
      attempts++;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =====================================================
  // STATUS AND ANALYTICS
  // =====================================================

  async getCacheStatistics(): Promise<{
    totalCached: number;
    byLanguage: Record<string, number>;
    byContentType: Record<string, number>;
    hitRate: number;
    estimatedSavings: number;
  }> {
    // Page through — translation_cache can exceed Supabase's 1000-row API cap,
    // which would under-report every statistic below.
    const PAGE = 1000;
    const MAX_ROWS = 50000;
    const data: any[] = [];
    try {
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data: page, error } = await supabase
          .from('translation_cache')
          .select('*')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!page || page.length === 0) break;
        data.push(...page);
        if (page.length < PAGE) break;
      }
    } catch {
      return {
        totalCached: 0,
        byLanguage: {},
        byContentType: {},
        hitRate: 0,
        estimatedSavings: 0
      };
    }

    const byLanguage: Record<string, number> = {};
    const byContentType: Record<string, number> = {};
    let totalAccesses = 0;

    data.forEach(entry => {
      byLanguage[entry.target_language] = (byLanguage[entry.target_language] || 0) + 1;
      byContentType[entry.content_type] = (byContentType[entry.content_type] || 0) + 1;
      totalAccesses += entry.access_count;
    });

    const hitRate = data.length > 0 ? (totalAccesses / data.length) : 0;
    const estimatedTokens = data.reduce((sum, e) => 
      sum + (e.source_text.length + e.translated_text.length) / 3.5, 0
    );
    const estimatedSavings = (estimatedTokens / 1000000) * 0.375;

    return {
      totalCached: data.length,
      byLanguage,
      byContentType,
      hitRate: Math.round(hitRate * 100) / 100,
      estimatedSavings
    };
  }

  async cleanupOldCache(daysOld: number = 90): Promise<number> {
    const { data, error } = await supabase
      .from('translation_cache')
      .delete()
      .lt('created_at', new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString())
      .eq('access_count', 1)
      .select('id');

    if (error) {
      console.error('Failed to cleanup cache:', error);
      return 0;
    }

    return data?.length || 0;
  }
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const preTranslationManager = new PreTranslationManager();

// =====================================================
// SCHEDULED TASK HELPERS
// =====================================================

export async function runDailyPreTranslation(): Promise<void> {
  console.log('📅 Running daily pre-translation task...');
  
  const manager = new PreTranslationManager({
    batchSize: 20,
    delayBetweenBatches: 2000
  });

  try {
    // Pre-translate UI strings
    const uiResults = await manager.preTranslateUIStrings((progress, total) => {
      console.log(`Progress: ${progress}/${total} (${Math.round(progress/total*100)}%)`);
    });

    console.log('UI Translation Results:', uiResults);

    // Cleanup old cache entries
    const cleaned = await manager.cleanupOldCache(90);
    console.log(`🧹 Cleaned up ${cleaned} old cache entries`);

    // Log statistics
    const stats = await manager.getCacheStatistics();
    console.log('📊 Cache Statistics:', stats);

  } catch (error) {
    console.error('❌ Daily pre-translation failed:', error);
  }
}

// =====================================================
// EXAMPLE USAGE
// =====================================================

/*
// Run pre-translation for UI strings
const manager = new PreTranslationManager();
const results = await manager.preTranslateUIStrings();
console.log('Results:', results);

// Pre-translate specific category
await manager.preTranslateCategory('prayer', [
  'Morning Prayer',
  'Evening Prayer',
  'Prayer for Guidance'
]);

// Get cache statistics
const stats = await manager.getCacheStatistics();
console.log('Cache Stats:', stats);

// Cleanup old entries
const cleaned = await manager.cleanupOldCache(90);
console.log(`Cleaned ${cleaned} entries`);
*/