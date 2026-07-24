import React, { useState, useEffect } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Languages, Zap, Database, DollarSign, CheckCircle, 
  AlertTriangle, Loader2, RefreshCw, Play, Pause,
  Globe, TrendingUp, FileText, Clock, ArrowRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  ASIAN_LANGUAGE_CODES, 
  SUPPORTED_LANGUAGES, 
  DEFAULT_TRANSLATIONS,
  type SupportedLanguage,
  type Translations 
} from '@/lib/i18n';

// =====================================================
// PRE-TRANSLATION CATEGORIES
// =====================================================

interface PreTranslationCategory {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedCost: number;
  items: string[];
}

const UI_STRING_CATEGORIES: PreTranslationCategory[] = [
  {
    id: 'common',
    name: 'Common UI Strings',
    description: 'Most frequently used buttons, labels, and actions',
    priority: 'high',
    estimatedCost: 2.50,
    items: [
      'loading', 'save', 'cancel', 'delete', 'edit', 'confirm', 'back', 'next',
      'submit', 'search', 'filter', 'sort', 'view', 'share', 'download', 'upload',
      'close', 'open', 'yes', 'no', 'ok', 'error', 'success', 'warning', 'info',
      'refresh', 'retry', 'continue', 'start', 'stop', 'pause', 'resume'
    ]
  },
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Login, signup, password reset strings',
    priority: 'high',
    estimatedCost: 1.80,
    items: [
      'login', 'logout', 'signup', 'forgotPassword', 'resetPassword',
      'email', 'password', 'confirmPassword', 'rememberMe', 'welcomeBack',
      'createAccount', 'signInRequired', 'accountCreated', 'passwordChanged'
    ]
  },
  {
    id: 'navigation',
    name: 'Navigation',
    description: 'Menu items and navigation labels',
    priority: 'high',
    estimatedCost: 2.20,
    items: [
      'home', 'devotionals', 'prayers', 'ministry', 'liveChannels', 'community',
      'profile', 'settings', 'admin', 'counselling', 'library', 'challenges'
    ]
  },
  {
    id: 'devotionals',
    name: 'Devotionals',
    description: 'Devotional-related UI strings',
    priority: 'medium',
    estimatedCost: 3.50,
    items: [
      'title', 'daily', 'series', 'library', 'today', 'completed', 'inProgress',
      'scripture', 'reflection', 'prayer', 'share', 'bookmark', 'notes'
    ]
  },
  {
    id: 'prayers',
    name: 'Prayers',
    description: 'Prayer-related UI strings',
    priority: 'medium',
    estimatedCost: 3.20,
    items: [
      'prayerRequest', 'prayFor', 'answered', 'pending', 'myPrayers',
      'communityPrayers', 'prayerWall', 'prayerJournal', 'prayerTime'
    ]
  },
  {
    id: 'errors',
    name: 'Error Messages',
    description: 'Common error and validation messages',
    priority: 'medium',
    estimatedCost: 2.80,
    items: [
      'requiredField', 'invalidEmail', 'passwordTooShort', 'networkError',
      'serverError', 'notFound', 'unauthorized', 'forbidden', 'tryAgain'
    ]
  }
];

const COMMON_CONTENT_TEMPLATES: PreTranslationCategory[] = [
  {
    id: 'prayer_templates',
    name: 'Prayer Templates',
    description: 'Common prayer structures and phrases',
    priority: 'high',
    estimatedCost: 5.00,
    items: [
      'Morning Prayer', 'Evening Prayer', 'Prayer of Thanksgiving',
      'Prayer for Guidance', 'Prayer for Healing', 'Prayer for Protection',
      'Prayer for Family', 'Prayer for Wisdom', 'Prayer of Repentance'
    ]
  },
  {
    id: 'devotional_themes',
    name: 'Devotional Themes',
    description: 'Common devotional topics and themes',
    priority: 'high',
    estimatedCost: 4.50,
    items: [
      'Faith', 'Hope', 'Love', 'Peace', 'Joy', 'Patience', 'Kindness',
      'Forgiveness', 'Grace', 'Mercy', 'Salvation', 'Redemption'
    ]
  },
  {
    id: 'scripture_categories',
    name: 'Scripture Categories',
    description: 'Common scripture categorizations',
    priority: 'medium',
    estimatedCost: 3.00,
    items: [
      'Promises', 'Comfort', 'Strength', 'Wisdom', 'Guidance', 'Protection',
      'Healing', 'Victory', 'Peace', 'Love', 'Hope', 'Faith'
    ]
  },
  {
    id: 'notifications',
    name: 'Notification Templates',
    description: 'Push notification and reminder templates',
    priority: 'medium',
    estimatedCost: 4.00,
    items: [
      'Time for your daily devotional',
      'You have a new prayer request',
      'Someone prayed for your request',
      'Reminder: Complete today\'s reading',
      'New message from your counsellor',
      'Live session starting in 15 minutes'
    ]
  }
];

// =====================================================
// TRANSLATION JOB TRACKING
// =====================================================

interface TranslationJob {
  id: string;
  categoryId: string;
  categoryName: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  targetLanguages: SupportedLanguage[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
  progress: number;
  estimatedCost: number;
  actualCost: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export const AdminPreTranslationTool: React.FC = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<SupportedLanguage>>(
    new Set(ASIAN_LANGUAGE_CODES)
  );
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [activeTab, setActiveTab] = useViewHistory<'ui-strings' | 'content'>("admin-pretranslate", 'ui-strings');
  const [processingJob, setProcessingJob] = useState<string | null>(null);
  
  // Statistics
  const [stats, setStats] = useState({
    totalPreTranslated: 0,
    totalCost: 0,
    cacheHitRate: 0,
    lastUpdate: null as Date | null
  });

  // =====================================================
  // LOAD STATISTICS
  // =====================================================
  
  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      // Page through — translation_cache can exceed Supabase's 1000-row API cap,
      // which would under-report the pre-translation coverage/cost stats.
      const PAGE = 1000;
      const MAX_ROWS = 50000;
      const data: any[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data: page, error } = await supabase
          .from('translation_cache')
          .select('*')
          .eq('content_type', 'ui')
          .order('updated_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!page || page.length === 0) break;
        data.push(...page);
        if (page.length < PAGE) break;
      }

      const totalEntries = data.length;
      const totalAccessCount = data.reduce((sum, entry) => sum + entry.access_count, 0);
      const cacheHitRate = totalEntries > 0 ? (totalAccessCount / totalEntries) * 100 : 0;

      setStats({
        totalPreTranslated: totalEntries,
        totalCost: estimateCost(data || []),
        cacheHitRate: Math.round(cacheHitRate),
        lastUpdate: data && data.length > 0 ? new Date(data[0].updated_at) : null
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const estimateCost = (entries: any[]): number => {
    // Rough estimate: $0.15 per 1M input tokens, $0.60 per 1M output tokens
    const avgChars = entries.reduce((sum, e) => sum + (e.source_text?.length || 0) + (e.translated_text?.length || 0), 0);
    const estimatedTokens = avgChars / 3.5; // ~3.5 chars per token
    return (estimatedTokens / 1000000) * 0.375; // Average of input and output costs
  };

  // =====================================================
  // CATEGORY SELECTION
  // =====================================================

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const toggleLanguage = (langCode: SupportedLanguage) => {
    setSelectedLanguages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(langCode)) {
        newSet.delete(langCode);
      } else {
        newSet.add(langCode);
      }
      return newSet;
    });
  };

  const selectAllAsianLanguages = () => {
    setSelectedLanguages(new Set(ASIAN_LANGUAGE_CODES));
  };

  const clearLanguageSelection = () => {
    setSelectedLanguages(new Set());
  };

  // =====================================================
  // PRE-TRANSLATION EXECUTION
  // =====================================================

  const startPreTranslation = async () => {
    if (selectedCategories.size === 0) {
      toast({
        title: t('adminPreTranslationTool', 'noCategoriesSelected', 'No categories selected'),
        description: t('adminPreTranslationTool', 'noCategoriesSelectedDesc', 'Please select at least one category to translate'),
        variant: 'destructive'
      });
      return;
    }

    if (selectedLanguages.size === 0) {
      toast({
        title: t('adminPreTranslationTool', 'noLanguagesSelected', 'No languages selected'),
        description: t('adminPreTranslationTool', 'noLanguagesSelectedDesc', 'Please select at least one target language'),
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      const categories = activeTab === 'ui-strings' 
        ? UI_STRING_CATEGORIES 
        : COMMON_CONTENT_TEMPLATES;

      const selectedCats = categories.filter(cat => selectedCategories.has(cat.id));
      const languageArray = Array.from(selectedLanguages);

      // Create jobs
      const newJobs: TranslationJob[] = selectedCats.map(cat => ({
        id: `${cat.id}-${Date.now()}`,
        categoryId: cat.id,
        categoryName: cat.name,
        totalItems: cat.items.length * languageArray.length,
        completedItems: 0,
        failedItems: 0,
        targetLanguages: languageArray,
        status: 'queued' as const,
        progress: 0,
        estimatedCost: cat.estimatedCost * (languageArray.length / ASIAN_LANGUAGE_CODES.length),
        actualCost: 0
      }));

      setJobs(prev => [...newJobs, ...prev]);

      // Process each job
      for (const job of newJobs) {
        await processTranslationJob(job);
      }

      toast({
        title: t('adminPreTranslationTool', 'preTranslationCompleted', 'Pre-translation completed'),
        description: t('adminPreTranslationTool', 'preTranslationCompletedDesc', 'Successfully pre-translated {count} categories into {langs} languages')
          .replace('{count}', String(selectedCats.length))
          .replace('{langs}', String(languageArray.length)),
      });

      await loadStatistics();
    } catch (error) {
      console.error('Pre-translation error:', error);
      toast({
        title: t('adminPreTranslationTool', 'preTranslationFailed', 'Pre-translation failed'),
        description: error instanceof Error ? error.message : t('adminPreTranslationTool', 'anErrorOccurred', 'An error occurred'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const processTranslationJob = async (job: TranslationJob) => {
    setProcessingJob(job.id);
    
    setJobs(prev => prev.map(j => 
      j.id === job.id 
        ? { ...j, status: 'processing' as const, startedAt: new Date().toISOString() }
        : j
    ));

    try {
      const categories = activeTab === 'ui-strings' 
        ? UI_STRING_CATEGORIES 
        : COMMON_CONTENT_TEMPLATES;
      
      const category = categories.find(c => c.id === job.categoryId);
      if (!category) throw new Error('Category not found');

      let completed = 0;
      let failed = 0;

      // Process each item for each language
      for (const item of category.items) {
        for (const targetLang of job.targetLanguages) {
          try {
            await preTranslateString(item, 'en', targetLang, activeTab);
            completed++;
          } catch (error) {
            console.error(`Failed to translate "${item}" to ${targetLang}:`, error);
            failed++;
          }

          // Update progress
          const progress = ((completed + failed) / job.totalItems) * 100;
          setJobs(prev => prev.map(j => 
            j.id === job.id 
              ? { ...j, completedItems: completed, failedItems: failed, progress }
              : j
          ));
        }
      }

      // Mark as completed
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { 
              ...j, 
              status: failed > 0 ? 'completed' as const : 'completed' as const,
              completedAt: new Date().toISOString(),
              progress: 100
            }
          : j
      ));

    } catch (error) {
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { 
              ...j, 
              status: 'failed' as const,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          : j
      ));
    } finally {
      setProcessingJob(null);
    }
  };

  const preTranslateString = async (
    text: string, 
    sourceLang: string, 
    targetLang: SupportedLanguage,
    contentType: string
  ): Promise<void> => {
    // Check if already cached
    const { data: existing } = await supabase
      .from('translation_cache')
      .select('id')
      .eq('source_text', text)
      .eq('source_language', sourceLang)
      .eq('target_language', targetLang)
      .eq('content_type', contentType)
      .single();

    if (existing) {
      // Already cached, skip
      return;
    }

    // Call translation edge function
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
    if (!data?.translatedText) throw new Error('No translation returned');
  };

  // =====================================================
  // RENDER
  // =====================================================

  const getTotalEstimatedCost = () => {
    const categories = activeTab === 'ui-strings' 
      ? UI_STRING_CATEGORIES 
      : COMMON_CONTENT_TEMPLATES;
    
    const selectedCats = categories.filter(cat => selectedCategories.has(cat.id));
    const totalBaseCost = selectedCats.reduce((sum, cat) => sum + cat.estimatedCost, 0);
    const languageMultiplier = selectedLanguages.size / ASIAN_LANGUAGE_CODES.length;
    return totalBaseCost * languageMultiplier;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Zap className="h-8 w-8 text-blue-500" />
            {t('adminPreTranslationTool', 'title', 'Pre-Translation Tool')}
          </h2>
          <p className="text-muted-foreground mt-2">
            {t('adminPreTranslationTool', 'subtitle', 'Pre-translate static UI strings and common content to reduce API costs and improve speed')}
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('adminPreTranslationTool', 'preTranslatedItems', 'Pre-Translated Items')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPreTranslated.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <Database className="h-3 w-3 inline mr-1" />
              {t('adminPreTranslationTool', 'cachedInDatabase', 'Cached in database')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('adminPreTranslationTool', 'estimatedCostSaved', 'Estimated Cost Saved')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <DollarSign className="h-3 w-3 inline mr-1" />
              {t('adminPreTranslationTool', 'openaiApiSavings', 'OpenAI API savings')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('adminPreTranslationTool', 'cacheHitRate', 'Cache Hit Rate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cacheHitRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              {t('adminPreTranslationTool', 'efficiencyMetric', 'Efficiency metric')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('adminPreTranslationTool', 'lastUpdate', 'Last Update')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lastUpdate ? stats.lastUpdate.toLocaleDateString() : t('adminPreTranslationTool', 'never', 'Never')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <Clock className="h-3 w-3 inline mr-1" />
              {t('adminPreTranslationTool', 'latestPreTranslation', 'Latest pre-translation')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ui-strings">
            <FileText className="h-4 w-4 mr-2" />
            {t('adminPreTranslationTool', 'uiStrings', 'UI Strings')}
          </TabsTrigger>
          <TabsTrigger value="content">
            <Globe className="h-4 w-4 mr-2" />
            {t('adminPreTranslationTool', 'commonContent', 'Common Content')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ui-strings" className="space-y-6">
          <PreTranslationPanel
            categories={UI_STRING_CATEGORIES}
            selectedCategories={selectedCategories}
            selectedLanguages={selectedLanguages}
            onToggleCategory={toggleCategory}
            onToggleLanguage={toggleLanguage}
            onSelectAllLanguages={selectAllAsianLanguages}
            onClearLanguages={clearLanguageSelection}
            onStart={startPreTranslation}
            loading={loading}
            estimatedCost={getTotalEstimatedCost()}
          />
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          <PreTranslationPanel
            categories={COMMON_CONTENT_TEMPLATES}
            selectedCategories={selectedCategories}
            selectedLanguages={selectedLanguages}
            onToggleCategory={toggleCategory}
            onToggleLanguage={toggleLanguage}
            onSelectAllLanguages={selectAllAsianLanguages}
            onClearLanguages={clearLanguageSelection}
            onStart={startPreTranslation}
            loading={loading}
            estimatedCost={getTotalEstimatedCost()}
          />
        </TabsContent>
      </Tabs>

      {/* Active Jobs */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t('adminPreTranslationTool', 'translationJobs', 'Translation Jobs')}
            </CardTitle>
            <CardDescription>
              {t('adminPreTranslationTool', 'translationJobsDesc', 'Active and recent pre-translation jobs')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {jobs.map((job) => (
              <JobStatus key={job.id} job={job} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// =====================================================
// SUB-COMPONENTS
// =====================================================

interface PreTranslationPanelProps {
  categories: PreTranslationCategory[];
  selectedCategories: Set<string>;
  selectedLanguages: Set<SupportedLanguage>;
  onToggleCategory: (id: string) => void;
  onToggleLanguage: (lang: SupportedLanguage) => void;
  onSelectAllLanguages: () => void;
  onClearLanguages: () => void;
  onStart: () => void;
  loading: boolean;
  estimatedCost: number;
}

const PreTranslationPanel: React.FC<PreTranslationPanelProps> = ({
  categories,
  selectedCategories,
  selectedLanguages,
  onToggleCategory,
  onToggleLanguage,
  onSelectAllLanguages,
  onClearLanguages,
  onStart,
  loading,
  estimatedCost
}) => {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Categories Selection */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('adminPreTranslationTool', 'selectCategories', 'Select Categories')}</CardTitle>
            <CardDescription>
              {t('adminPreTranslationTool', 'selectCategoriesDesc', 'Choose which categories to pre-translate')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedCategories.has(category.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onToggleCategory(category.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={selectedCategories.has(category.id)}
                      onCheckedChange={() => onToggleCategory(category.id)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{category.name}</h4>
                        <Badge variant={
                          category.priority === 'high' ? 'destructive' :
                          category.priority === 'medium' ? 'default' : 'secondary'
                        }>
                          {category.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {category.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{t('adminPreTranslationTool', 'itemsCount', '{count} items').replace('{count}', String(category.items.length))}</span>
                        <span>~${category.estimatedCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Languages & Action Panel */}
      <div className="space-y-6">
        {/* Language Selection */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminPreTranslationTool', 'targetLanguages', 'Target Languages')}</CardTitle>
            <CardDescription>
              {t('adminPreTranslationTool', 'asianLanguagesSelected', '{selected} of {total} Asian languages selected')
                .replace('{selected}', String(selectedLanguages.size))
                .replace('{total}', String(ASIAN_LANGUAGE_CODES.length))}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onSelectAllLanguages}
                className="flex-1"
              >
                {t('adminPreTranslationTool', 'selectAllAsian', 'Select All Asian')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClearLanguages}
                className="flex-1"
              >
                {t('adminPreTranslationTool', 'clear', 'Clear')}
              </Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {SUPPORTED_LANGUAGES
                .filter(lang => ASIAN_LANGUAGE_CODES.includes(lang.code))
                .map((lang) => (
                  <div
                    key={lang.code}
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                    onClick={() => onToggleLanguage(lang.code)}
                  >
                    <Checkbox
                      checked={selectedLanguages.has(lang.code)}
                      onCheckedChange={() => onToggleLanguage(lang.code)}
                    />
                    <span className="text-lg">{lang.flag}</span>
                    <span className="text-sm flex-1">{lang.name}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Panel */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminPreTranslationTool', 'executePreTranslation', 'Execute Pre-Translation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('adminPreTranslationTool', 'willTranslateSummary', 'This will translate {categories} categories into {languages} languages')
                  .replace('{categories}', String(selectedCategories.size))
                  .replace('{languages}', String(selectedLanguages.size))}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('adminPreTranslationTool', 'estimatedCostLabel', 'Estimated Cost:')}</span>
                <span className="font-semibold">${estimatedCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('adminPreTranslationTool', 'totalItemsLabel', 'Total Items:')}</span>
                <span className="font-semibold">
                  {Array.from(selectedCategories).reduce((sum, catId) => {
                    const cat = categories.find(c => c.id === catId);
                    return sum + (cat?.items.length || 0);
                  }, 0) * selectedLanguages.size}
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={onStart}
              disabled={loading || selectedCategories.size === 0 || selectedLanguages.size === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('adminPreTranslationTool', 'translating', 'Translating...')}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  {t('adminPreTranslationTool', 'startPreTranslation', 'Start Pre-Translation')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const JobStatus: React.FC<{ job: TranslationJob }> = ({ job }) => {
  const { t } = useLanguage();
  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h4 className="font-semibold">{job.categoryName}</h4>
            <p className="text-sm text-muted-foreground">
              {t('adminPreTranslationTool', 'jobLanguagesItems', '{languages} languages • {items} items')
                .replace('{languages}', String(job.targetLanguages.length))
                .replace('{items}', String(job.totalItems))}
            </p>
          </div>
        </div>
        <Badge variant={
          job.status === 'completed' ? 'default' :
          job.status === 'failed' ? 'destructive' :
          job.status === 'processing' ? 'secondary' : 'outline'
        }>
          {job.status}
        </Badge>
      </div>

      {job.status === 'processing' && (
        <div className="space-y-2">
          <Progress value={job.progress} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('adminPreTranslationTool', 'completedProgress', '{completed} / {total} completed')
              .replace('{completed}', String(job.completedItems))
              .replace('{total}', String(job.totalItems))}</span>
            <span>{Math.round(job.progress)}%</span>
          </div>
        </div>
      )}

      {job.status === 'completed' && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-green-600 dark:text-green-400">
            {t('adminPreTranslationTool', 'itemsTranslated', '✓ {count} items translated')
              .replace('{count}', String(job.completedItems))}
          </span>
          {job.failedItems > 0 && (
            <span className="text-orange-600 dark:text-orange-400">
              {t('adminPreTranslationTool', 'itemsFailed', '{count} failed')
                .replace('{count}', String(job.failedItems))}
            </span>
          )}
        </div>
      )}

      {job.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{job.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};