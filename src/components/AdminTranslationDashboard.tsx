import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Languages, Database, DollarSign, TrendingUp, RefreshCw, Search,
  Trash2, RotateCcw, AlertTriangle, CheckCircle, Clock, Eye,
  BarChart3, Globe, Zap, Server, FileText, Filter, Download,
  ChevronLeft, ChevronRight, Loader2, Settings, Key, Shield
} from 'lucide-react';

// Language display names
const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt': 'Portuguese',
  'zh': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)', 'ja': 'Japanese',
  'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi', 'ru': 'Russian', 'it': 'Italian',
  'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish', 'vi': 'Vietnamese', 'th': 'Thai',
  'id': 'Indonesian', 'sw': 'Swahili', 'yo': 'Yoruba', 'bn': 'Bengali', 'ta': 'Tamil',
  'te': 'Telugu', 'ur': 'Urdu', 'fa': 'Persian', 'he': 'Hebrew', 'my': 'Burmese',
  'km': 'Khmer', 'lo': 'Lao', 'ne': 'Nepali', 'si': 'Sinhala', 'tl': 'Filipino',
  'ms': 'Malay', 'am': 'Amharic', 'ha': 'Hausa', 'ig': 'Igbo', 'zu': 'Zulu'
};

// OpenAI pricing (per 1M tokens) - GPT-4o-mini
const OPENAI_PRICING = {
  input: 0.15, // $0.15 per 1M input tokens
  output: 0.60  // $0.60 per 1M output tokens
};

// Estimate tokens from character count (rough approximation)
const estimateTokens = (text: string): number => {
  // Average ~4 characters per token for English, ~2-3 for other languages
  return Math.ceil(text.length / 3.5);
};

interface TranslationCacheEntry {
  id: string;
  content_hash: string;
  source_text: string;
  source_language: string;
  target_language: string;
  translated_text: string;
  content_type: string | null;
  created_at: string;
  updated_at: string;
  access_count: number;
  last_accessed_at: string | null;
  provider: string | null;
  model: string | null;
}

interface TranslationStats {
  totalEntries: number;
  totalAccessCount: number;
  uniqueSourceLanguages: string[];
  uniqueTargetLanguages: string[];
  contentTypes: Record<string, number>;
  languagePairs: Record<string, number>;
  estimatedCost: number;
  estimatedTokens: number;
  cacheHitRate: number;
  recentTranslations: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export const AdminTranslationDashboard: React.FC = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TranslationStats | null>(null);
  const [cacheEntries, setCacheEntries] = useState<TranslationCacheEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<TranslationCacheEntry[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSourceLang, setFilterSourceLang] = useState<string>('all');
  const [filterTargetLang, setFilterTargetLang] = useState<string>('all');
  const [filterContentType, setFilterContentType] = useState<string>('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  
  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  // Modals
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showRetranslateModal, setShowRetranslateModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TranslationCacheEntry | null>(null);
  const [clearCacheType, setClearCacheType] = useState<'all' | 'language' | 'old'>('all');
  const [clearCacheLanguage, setClearCacheLanguage] = useState('');
  const [clearCacheDays, setClearCacheDays] = useState(30);
  
  // Processing state
  const [processing, setProcessing] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'checking' | 'configured' | 'missing'>('checking');

  // Load data on mount
  useEffect(() => {
    loadData();
    checkApiKeyStatus();
  }, []);

  // Apply filters when data or filters change
  useEffect(() => {
    applyFilters();
  }, [cacheEntries, searchTerm, filterSourceLang, filterTargetLang, filterContentType]);

  const checkApiKeyStatus = async () => {
    try {
      // Health probe. No skipCache: the first probe caches the 'test'→'es'
      // result, so this makes at most ONE real OpenAI call ever — instead of a
      // fresh billed translation on every mount/refresh.
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: { text: 'test', targetLanguage: 'es' }
      });
      
      if (error || data?.code === 'OPENAI_KEY_MISSING') {
        setApiKeyStatus('missing');
      } else {
        setApiKeyStatus('configured');
      }
    } catch (err) {
      setApiKeyStatus('missing');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all cache entries. translation_cache can exceed Supabase's default
      // 1000-row API cap, and a client `.limit()` cannot raise the server cap —
      // so page through with `.range()` (bounded by a safety cap) to keep every
      // stat below (counts, cost, hit-rate, language pairs) accurate.
      const PAGE = 1000;
      const MAX_ROWS = 50000; // safety bound against a runaway table
      const allEntries: TranslationCacheEntry[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data: page, error } = await supabase
          .from('translation_cache')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!page || page.length === 0) break;
        allEntries.push(...(page as TranslationCacheEntry[]));
        if (page.length < PAGE) break;
      }
      setCacheEntries(allEntries);

      // Calculate statistics
      const stats = calculateStats(allEntries);
      setStats(stats);

    } catch (err: any) {
      console.error('Error loading translation data:', err);
      toast({
        title: t('adminTranslationDashboard', 'errorTitle', 'Error'),
        description: t('adminTranslationDashboard', 'loadFailed', 'Failed to load translation data'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (entries: TranslationCacheEntry[]): TranslationStats => {
    const totalEntries = entries.length;
    const totalAccessCount = entries.reduce((sum, e) => sum + (e.access_count || 0), 0);
    
    const sourceLanguages = new Set<string>();
    const targetLanguages = new Set<string>();
    const contentTypes: Record<string, number> = {};
    const languagePairs: Record<string, number> = {};
    
    let totalInputChars = 0;
    let totalOutputChars = 0;
    let recentCount = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    entries.forEach(entry => {
      sourceLanguages.add(entry.source_language);
      targetLanguages.add(entry.target_language);
      
      const ct = entry.content_type || 'general';
      contentTypes[ct] = (contentTypes[ct] || 0) + 1;
      
      const pair = `${entry.source_language} → ${entry.target_language}`;
      languagePairs[pair] = (languagePairs[pair] || 0) + 1;
      
      totalInputChars += entry.source_text?.length || 0;
      totalOutputChars += entry.translated_text?.length || 0;
      
      if (new Date(entry.created_at) > sevenDaysAgo) {
        recentCount++;
      }
    });

    // Estimate tokens and cost. ~3.5 chars/token; the previous version ran
    // estimateTokens() on the *string form* of the char count and multiplied by
    // row count, producing a meaningless "Est. API Cost".
    const inputTokens = totalInputChars / 3.5;
    const outputTokens = totalOutputChars / 3.5;
    const estimatedTokens = Math.ceil((totalInputChars + totalOutputChars) / 3.5);
    
    // Cost calculation
    const inputCost = (inputTokens / 1000000) * OPENAI_PRICING.input;
    const outputCost = (outputTokens / 1000000) * OPENAI_PRICING.output;
    const estimatedCost = inputCost + outputCost;

    // Cache hit rate (access_count > 1 means cache was used)
    const cacheHits = entries.filter(e => (e.access_count || 0) > 1).length;
    const cacheHitRate = totalEntries > 0 ? (cacheHits / totalEntries) * 100 : 0;

    // Get oldest and newest entries
    const sortedByDate = [...entries].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return {
      totalEntries,
      totalAccessCount,
      uniqueSourceLanguages: Array.from(sourceLanguages),
      uniqueTargetLanguages: Array.from(targetLanguages),
      contentTypes,
      languagePairs,
      estimatedCost,
      estimatedTokens,
      cacheHitRate,
      recentTranslations: recentCount,
      oldestEntry: sortedByDate[0]?.created_at || null,
      newestEntry: sortedByDate[sortedByDate.length - 1]?.created_at || null
    };
  };

  const applyFilters = () => {
    let filtered = [...cacheEntries];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.source_text?.toLowerCase().includes(search) ||
        e.translated_text?.toLowerCase().includes(search)
      );
    }

    if (filterSourceLang !== 'all') {
      filtered = filtered.filter(e => e.source_language === filterSourceLang);
    }

    if (filterTargetLang !== 'all') {
      filtered = filtered.filter(e => e.target_language === filterTargetLang);
    }

    if (filterContentType !== 'all') {
      filtered = filtered.filter(e => (e.content_type || 'general') === filterContentType);
    }

    setFilteredEntries(filtered);
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await checkApiKeyStatus();
    setRefreshing(false);
    toast({ title: t('adminTranslationDashboard', 'refreshedTitle', 'Refreshed'), description: t('adminTranslationDashboard', 'refreshedDesc', 'Translation data updated') });
  };

  const handleClearCache = async () => {
    setProcessing(true);
    try {
      let query = supabase.from('translation_cache').delete();

      if (clearCacheType === 'language' && clearCacheLanguage) {
        query = query.eq('target_language', clearCacheLanguage);
      } else if (clearCacheType === 'old') {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - clearCacheDays);
        query = query.lt('created_at', cutoffDate.toISOString());
      } else {
        // Clear all - need to add a condition that's always true
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { error } = await query;
      if (error) throw error;

      toast({ title: t('adminTranslationDashboard', 'successTitle', 'Success'), description: t('adminTranslationDashboard', 'cacheCleared', 'Cache cleared successfully') });
      setShowClearCacheModal(false);
      await loadData();
    } catch (err: any) {
      toast({ title: t('adminTranslationDashboard', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const { error } = await supabase
        .from('translation_cache')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: t('adminTranslationDashboard', 'deletedTitle', 'Deleted'), description: t('adminTranslationDashboard', 'entryRemoved', 'Cache entry removed') });
      setCacheEntries(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      toast({ title: t('adminTranslationDashboard', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('translation_cache')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({ title: t('adminTranslationDashboard', 'deletedTitle', 'Deleted'), description: t('adminTranslationDashboard', 'entriesRemoved', '{count} entries removed').replace('{count}', String(selectedIds.size)) });
      setCacheEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      setSelectAll(false);
    } catch (err: any) {
      toast({ title: t('adminTranslationDashboard', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleRetranslate = async (entry: TranslationCacheEntry) => {
    setProcessing(true);
    try {
      // Delete existing cache entry
      await supabase
        .from('translation_cache')
        .delete()
        .eq('id', entry.id);

      // Request new translation
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: {
          text: entry.source_text,
          sourceLanguage: entry.source_language,
          targetLanguage: entry.target_language,
          contentType: entry.content_type || 'general',
          skipCache: false
        }
      });

      if (error) throw error;

      toast({
        title: t('adminTranslationDashboard', 'retranslatedTitle', 'Re-translated'),
        description: t('adminTranslationDashboard', 'retranslatedDesc', 'Content has been re-translated and cached')
      });

      setShowRetranslateModal(false);
      await loadData();
    } catch (err: any) {
      toast({ title: t('adminTranslationDashboard', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleExportData = () => {
    const exportData = filteredEntries.map(e => ({
      source_language: e.source_language,
      target_language: e.target_language,
      source_text: e.source_text,
      translated_text: e.translated_text,
      content_type: e.content_type,
      access_count: e.access_count,
      created_at: e.created_at,
      provider: e.provider,
      model: e.model
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translation-cache-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: t('adminTranslationDashboard', 'exportedTitle', 'Exported'), description: t('adminTranslationDashboard', 'entriesExported', '{count} entries exported').replace('{count}', String(exportData.length)) });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      const pageEntries = paginatedEntries.map(e => e.id);
      setSelectedIds(new Set(pageEntries));
    }
    setSelectAll(!selectAll);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <span className="ml-3 text-gray-600">{t('adminTranslationDashboard', 'loadingData', 'Loading translation data...')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Languages className="h-7 w-7 text-purple-600" />
            {t('adminTranslationDashboard', 'dashboardTitle', 'Translation Dashboard')}
          </h2>
          <p className="text-gray-500 mt-1">{t('adminTranslationDashboard', 'dashboardSubtitle', 'Monitor usage, manage cache, and track API costs')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {t('adminTranslationDashboard', 'refresh', 'Refresh')}
          </Button>
          <Button variant="outline" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            {t('adminTranslationDashboard', 'export', 'Export')}
          </Button>
        </div>
      </div>

      {/* API Key Status Banner */}
      <Card className={apiKeyStatus === 'configured' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {apiKeyStatus === 'checking' ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              ) : apiKeyStatus === 'configured' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              <div>
                <p className={`font-medium ${apiKeyStatus === 'configured' ? 'text-green-800' : 'text-amber-800'}`}>
                  {apiKeyStatus === 'checking' ? t('adminTranslationDashboard', 'checkingApiKey', 'Checking API Key...') :
                   apiKeyStatus === 'configured' ? t('adminTranslationDashboard', 'apiKeyConfigured', 'OpenAI API Key Configured') :
                   t('adminTranslationDashboard', 'apiKeyNotConfigured', 'OpenAI API Key Not Configured')}
                </p>
                <p className={`text-sm ${apiKeyStatus === 'configured' ? 'text-green-600' : 'text-amber-600'}`}>
                  {apiKeyStatus === 'configured'
                    ? t('adminTranslationDashboard', 'apiKeyActiveDesc', 'Translation service is active and using your OpenAI API key')
                    : t('adminTranslationDashboard', 'apiKeyMissingDesc', 'Add OPENAI_API_KEY to Supabase Edge Function secrets to enable translations')}
                </p>
              </div>
            </div>
            <Badge variant={apiKeyStatus === 'configured' ? 'default' : 'secondary'} className={apiKeyStatus === 'configured' ? 'bg-green-600' : ''}>
              <Key className="h-3 w-3 mr-1" />
              {apiKeyStatus === 'configured' ? t('adminTranslationDashboard', 'active', 'Active') : t('adminTranslationDashboard', 'required', 'Required')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Database className="h-8 w-8 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">{stats.totalEntries.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{t('adminTranslationDashboard', 'cachedTranslations', 'Cached Translations')}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{stats.totalAccessCount.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{t('adminTranslationDashboard', 'totalCacheHits', 'Total Cache Hits')}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <Zap className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{stats.cacheHitRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">{t('adminTranslationDashboard', 'cacheHitRate', 'Cache Hit Rate')}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <Globe className="h-8 w-8 mx-auto mb-2 text-indigo-500" />
              <p className="text-2xl font-bold">{stats.uniqueTargetLanguages.length}</p>
              <p className="text-xs text-gray-500">{t('adminTranslationDashboard', 'languagesSupported', 'Languages Supported')}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <DollarSign className="h-8 w-8 mx-auto mb-2 text-amber-500" />
              <p className="text-2xl font-bold">${stats.estimatedCost.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{t('adminTranslationDashboard', 'estApiCost', 'Est. API Cost')}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-pink-500" />
              <p className="text-2xl font-bold">{stats.recentTranslations}</p>
              <p className="text-xs text-gray-500">{t('adminTranslationDashboard', 'last7Days', 'Last 7 Days')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="cache" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cache">
            <Database className="h-4 w-4 mr-2" />
            {t('adminTranslationDashboard', 'cacheBrowser', 'Cache Browser')}
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('adminTranslationDashboard', 'analytics', 'Analytics')}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            {t('adminTranslationDashboard', 'settings', 'Settings')}
          </TabsTrigger>
        </TabsList>

        {/* Cache Browser Tab */}
        <TabsContent value="cache" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'searchLabel', 'Search')}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={t('adminTranslationDashboard', 'searchPlaceholder', 'Search translations...')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="w-40">
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'sourceLanguage', 'Source Language')}</Label>
                  <Select value={filterSourceLang} onValueChange={setFilterSourceLang}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('adminTranslationDashboard', 'allSources', 'All Sources')}</SelectItem>
                      {stats?.uniqueSourceLanguages.map(lang => (
                        <SelectItem key={lang} value={lang}>
                          {LANGUAGE_NAMES[lang] || lang}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-40">
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'targetLanguage', 'Target Language')}</Label>
                  <Select value={filterTargetLang} onValueChange={setFilterTargetLang}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('adminTranslationDashboard', 'allTargets', 'All Targets')}</SelectItem>
                      {stats?.uniqueTargetLanguages.map(lang => (
                        <SelectItem key={lang} value={lang}>
                          {LANGUAGE_NAMES[lang] || lang}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-40">
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'contentType', 'Content Type')}</Label>
                  <Select value={filterContentType} onValueChange={setFilterContentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('adminTranslationDashboard', 'allTypes', 'All Types')}</SelectItem>
                      <SelectItem value="devotional">{t('adminTranslationDashboard', 'devotional', 'Devotional')}</SelectItem>
                      <SelectItem value="prayer">{t('adminTranslationDashboard', 'prayer', 'Prayer')}</SelectItem>
                      <SelectItem value="scripture">{t('adminTranslationDashboard', 'scripture', 'Scripture')}</SelectItem>
                      <SelectItem value="ui">{t('adminTranslationDashboard', 'ui', 'UI')}</SelectItem>
                      <SelectItem value="general">{t('adminTranslationDashboard', 'general', 'General')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterSourceLang('all');
                    setFilterTargetLang('all');
                    setFilterContentType('all');
                  }}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {t('adminTranslationDashboard', 'clearFilters', 'Clear Filters')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-purple-700">
                    {t('adminTranslationDashboard', 'itemsSelected', '{count} item(s) selected').replace('{count}', String(selectedIds.size))}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      {t('adminTranslationDashboard', 'clearSelection', 'Clear Selection')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleBulkDelete}
                      disabled={processing}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('adminTranslationDashboard', 'deleteSelected', 'Delete Selected')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cache Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'source', 'Source')}</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'target', 'Target')}</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'textPreview', 'Text Preview')}</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'type', 'Type')}</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'hits', 'Hits')}</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'created', 'Created')}</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-500">{t('adminTranslationDashboard', 'actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.map(entry => (
                      <tr key={entry.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={() => toggleSelect(entry.id)}
                          />
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {entry.source_language}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className="text-xs">
                            {entry.target_language}
                          </Badge>
                        </td>
                        <td className="p-3 max-w-xs">
                          <p className="text-sm truncate" title={entry.source_text}>
                            {entry.source_text.substring(0, 60)}
                            {entry.source_text.length > 60 ? '...' : ''}
                          </p>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {entry.content_type || 'general'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className="text-sm font-medium">{entry.access_count || 0}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-xs text-gray-500">
                            {new Date(entry.created_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setShowViewModal(true);
                              }}
                              title={t('adminTranslationDashboard', 'viewDetails', 'View Details')}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setShowRetranslateModal(true);
                              }}
                              title={t('adminTranslationDashboard', 'retranslate', 'Re-translate')}
                            >
                              <RotateCcw className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteEntry(entry.id)}
                              title={t('adminTranslationDashboard', 'delete', 'Delete')}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <span className="text-sm text-gray-500">
                    {t('adminTranslationDashboard', 'showingRange', 'Showing {start} - {end} of {total}')
                      .replace('{start}', String(((currentPage - 1) * pageSize) + 1))
                      .replace('{end}', String(Math.min(currentPage * pageSize, filteredEntries.length)))
                      .replace('{total}', String(filteredEntries.length))}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-3 py-1 text-sm">
                      {t('adminTranslationDashboard', 'pageOf', 'Page {current} of {total}')
                        .replace('{current}', String(currentPage))
                        .replace('{total}', String(totalPages))}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          {stats && (
            <>
              {/* Language Pairs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="h-5 w-5 text-indigo-500" />
                    {t('adminTranslationDashboard', 'mostTranslatedPairs', 'Most Translated Language Pairs')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.languagePairs)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([pair, count]) => {
                        const percentage = (count / stats.totalEntries) * 100;
                        return (
                          <div key={pair} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{pair}</span>
                              <span className="text-gray-500">{count} ({percentage.toFixed(1)}%)</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              {/* Content Types */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-purple-500" />
                      {t('adminTranslationDashboard', 'contentTypesTitle', 'Content Types')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(stats.contentTypes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => {
                          const percentage = (count / stats.totalEntries) * 100;
                          return (
                            <div key={type} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize">{type}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{count}</span>
                                <span className="text-xs text-gray-500">({percentage.toFixed(1)}%)</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-500" />
                      {t('adminTranslationDashboard', 'costBreakdown', 'Cost Breakdown')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">{t('adminTranslationDashboard', 'estimatedTotalCost', 'Estimated Total Cost')}</p>
                        <p className="text-3xl font-bold text-green-600">${stats.estimatedCost.toFixed(4)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">{t('adminTranslationDashboard', 'estTokensUsed', 'Est. Tokens Used')}</p>
                          <p className="font-medium">{stats.estimatedTokens.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">{t('adminTranslationDashboard', 'costPerTranslation', 'Cost per Translation')}</p>
                          <p className="font-medium">
                            ${stats.totalEntries > 0 ? (stats.estimatedCost / stats.totalEntries).toFixed(6) : '0.00'}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 border-t pt-3">
                        <p>Pricing: GPT-4o-mini</p>
                        <p>Input: ${OPENAI_PRICING.input}/1M tokens</p>
                        <p>Output: ${OPENAI_PRICING.output}/1M tokens</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-500" />
                {t('adminTranslationDashboard', 'apiConfiguration', 'API Configuration')}
              </CardTitle>
              <CardDescription>
                {t('adminTranslationDashboard', 'apiConfigDesc', 'Translation service uses your own OpenAI API key')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">{t('adminTranslationDashboard', 'apiKeyManagement', 'OpenAI API Key Management')}</h4>
                <p className="text-sm text-blue-600 mb-3">
                  {t('adminTranslationDashboard', 'apiKeyStoredDesc', 'Your OpenAI API key is stored securely in Supabase Edge Function secrets. To update or rotate your key:')}
                </p>
                <ol className="text-sm text-blue-600 list-decimal list-inside space-y-1">
                  <li>{t('adminTranslationDashboard', 'apiKeyStep1', 'Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets')}</li>
                  <li>{t('adminTranslationDashboard', 'apiKeyStep2', 'Find or add the secret named')} <code className="bg-blue-100 px-1 rounded">OPENAI_API_KEY</code></li>
                  <li>{t('adminTranslationDashboard', 'apiKeyStep3', 'Update the value with your new API key')}</li>
                  <li>{t('adminTranslationDashboard', 'apiKeyStep4', 'Changes take effect immediately - no code changes required')}</li>
                </ol>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{t('adminTranslationDashboard', 'currentStatus', 'Current Status')}</p>
                  <p className="text-sm text-gray-500">{t('adminTranslationDashboard', 'apiKeyStatusDesc', 'API key configuration status')}</p>
                </div>
                <Badge
                  variant={apiKeyStatus === 'configured' ? 'default' : 'destructive'}
                  className={apiKeyStatus === 'configured' ? 'bg-green-600' : ''}
                >
                  {apiKeyStatus === 'configured' ? t('adminTranslationDashboard', 'configured', 'Configured') : t('adminTranslationDashboard', 'notConfigured', 'Not Configured')}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{t('adminTranslationDashboard', 'translationProvider', 'Translation Provider')}</p>
                  <p className="text-sm text-gray-500">{t('adminTranslationDashboard', 'allTranslationsOpenAI', 'All translations use OpenAI exclusively')}</p>
                </div>
                <Badge variant="outline">OpenAI GPT-4o-mini</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                {t('adminTranslationDashboard', 'cacheManagement', 'Cache Management')}
              </CardTitle>
              <CardDescription>
                {t('adminTranslationDashboard', 'cacheManagementDesc', 'Clear cached translations to force re-translation')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="destructive"
                onClick={() => setShowClearCacheModal(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('adminTranslationDashboard', 'clearTranslationCache', 'Clear Translation Cache')}
              </Button>

              <p className="text-sm text-gray-500">
                {t('adminTranslationDashboard', 'clearCacheHint', 'Clearing the cache will remove stored translations. New translations will be generated on-demand using your OpenAI API key.')}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Entry Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('adminTranslationDashboard', 'translationDetails', 'Translation Details')}</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'sourceLanguage', 'Source Language')}</Label>
                  <p className="font-medium">{LANGUAGE_NAMES[selectedEntry.source_language] || selectedEntry.source_language}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'targetLanguage', 'Target Language')}</Label>
                  <p className="font-medium">{LANGUAGE_NAMES[selectedEntry.target_language] || selectedEntry.target_language}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'originalText', 'Original Text')}</Label>
                <div className="p-3 bg-gray-50 rounded-lg mt-1">
                  <p className="text-sm whitespace-pre-wrap">{selectedEntry.source_text}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'translatedText', 'Translated Text')}</Label>
                <div className="p-3 bg-blue-50 rounded-lg mt-1">
                  <p className="text-sm whitespace-pre-wrap">{selectedEntry.translated_text}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'contentType', 'Content Type')}</Label>
                  <p className="capitalize">{selectedEntry.content_type || 'general'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'accessCount', 'Access Count')}</Label>
                  <p>{selectedEntry.access_count || 0}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'provider', 'Provider')}</Label>
                  <p>{selectedEntry.provider || t('adminTranslationDashboard', 'unknown', 'unknown')}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'created', 'Created')}</Label>
                  <p>{new Date(selectedEntry.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'lastAccessed', 'Last Accessed')}</Label>
                  <p>{selectedEntry.last_accessed_at ? new Date(selectedEntry.last_accessed_at).toLocaleString() : t('adminTranslationDashboard', 'never', 'Never')}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewModal(false)}>{t('adminTranslationDashboard', 'close', 'Close')}</Button>
            <Button
              onClick={() => {
                setShowViewModal(false);
                setShowRetranslateModal(true);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('adminTranslationDashboard', 'retranslate', 'Re-translate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-translate Confirmation Modal */}
      <Dialog open={showRetranslateModal} onOpenChange={setShowRetranslateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('adminTranslationDashboard', 'retranslateContent', 'Re-translate Content')}</DialogTitle>
            <DialogDescription>
              {t('adminTranslationDashboard', 'retranslateDesc', 'This will delete the cached translation and generate a new one using OpenAI.')}
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">
                  <strong>{t('adminTranslationDashboard', 'noteLabel', 'Note:')}</strong> {t('adminTranslationDashboard', 'retranslateCreditsNote', 'This will use your OpenAI API credits to generate a new translation.')}
                </p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">{t('adminTranslationDashboard', 'textToRetranslate', 'Text to re-translate')}</Label>
                <p className="text-sm mt-1 p-2 bg-gray-50 rounded">
                  {selectedEntry.source_text.substring(0, 200)}
                  {selectedEntry.source_text.length > 200 ? '...' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{selectedEntry.source_language}</Badge>
                <span>→</span>
                <Badge variant="secondary">{selectedEntry.target_language}</Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRetranslateModal(false)}>{t('adminTranslationDashboard', 'cancel', 'Cancel')}</Button>
            <Button
              onClick={() => selectedEntry && handleRetranslate(selectedEntry)}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminTranslationDashboard', 'translating', 'Translating...')}
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('adminTranslationDashboard', 'retranslate', 'Re-translate')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Cache Modal */}
      <Dialog open={showClearCacheModal} onOpenChange={setShowClearCacheModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t('adminTranslationDashboard', 'clearTranslationCache', 'Clear Translation Cache')}
            </DialogTitle>
            <DialogDescription>
              {t('adminTranslationDashboard', 'clearCacheWarning', 'This action cannot be undone. Cleared translations will need to be regenerated.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('adminTranslationDashboard', 'clearType', 'Clear Type')}</Label>
              <Select value={clearCacheType} onValueChange={(v: any) => setClearCacheType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminTranslationDashboard', 'clearAllCache', 'Clear All Cache')}</SelectItem>
                  <SelectItem value="language">{t('adminTranslationDashboard', 'clearByLanguage', 'Clear by Language')}</SelectItem>
                  <SelectItem value="old">{t('adminTranslationDashboard', 'clearOldEntries', 'Clear Old Entries')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {clearCacheType === 'language' && (
              <div>
                <Label>{t('adminTranslationDashboard', 'targetLanguage', 'Target Language')}</Label>
                <Select value={clearCacheLanguage} onValueChange={setClearCacheLanguage}>
                  <SelectTrigger><SelectValue placeholder={t('adminTranslationDashboard', 'selectLanguage', 'Select language')} /></SelectTrigger>
                  <SelectContent>
                    {stats?.uniqueTargetLanguages.map(lang => (
                      <SelectItem key={lang} value={lang}>
                        {LANGUAGE_NAMES[lang] || lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {clearCacheType === 'old' && (
              <div>
                <Label>{t('adminTranslationDashboard', 'olderThanDays', 'Older than (days)')}</Label>
                <Input
                  type="number"
                  value={clearCacheDays}
                  onChange={(e) => setClearCacheDays(parseInt(e.target.value) || 30)}
                  min={1}
                />
              </div>
            )}

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                {clearCacheType === 'all' && t('adminTranslationDashboard', 'deleteAllWarning', 'This will delete ALL {count} cached translations.').replace('{count}', String(stats?.totalEntries || 0))}
                {clearCacheType === 'language' && clearCacheLanguage &&
                  t('adminTranslationDashboard', 'deleteLangWarning', 'This will delete all translations to {language}.').replace('{language}', String(LANGUAGE_NAMES[clearCacheLanguage] || clearCacheLanguage))}
                {clearCacheType === 'old' &&
                  t('adminTranslationDashboard', 'deleteOldWarning', 'This will delete translations older than {days} days.').replace('{days}', String(clearCacheDays))}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearCacheModal(false)}>{t('adminTranslationDashboard', 'cancel', 'Cancel')}</Button>
            <Button
              variant="destructive"
              onClick={handleClearCache}
              disabled={processing || (clearCacheType === 'language' && !clearCacheLanguage)}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminTranslationDashboard', 'clearing', 'Clearing...')}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('adminTranslationDashboard', 'clearCache', 'Clear Cache')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTranslationDashboard;
