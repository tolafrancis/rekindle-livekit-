// =====================================================
// LANGUAGE CONTEXT - UPDATED VERSION
// Handles missing preferred_language column gracefully
// =====================================================

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { supabase } from '@rekindle/supabase';
import { 
  SupportedLanguage, 
  DEFAULT_LANGUAGE, 
  FALLBACK_LANGUAGE,
  Translations, 
  TranslationLoader,
  ContentType,
  detectBrowserLanguage,
  getLanguageInfo,
  isRTLLanguage,
  getLanguageFontFamily,
  SUPPORTED_LANGUAGES,
  DEFAULT_TRANSLATIONS,
  translationService,
  formatDate as i18nFormatDate,
  formatTime as i18nFormatTime,
  formatNumber as i18nFormatNumber,
  formatCurrency as i18nFormatCurrency,
  formatRelativeTime as i18nFormatRelativeTime
} from './i18n';
import { useAuth } from './AuthContext';

// =====================================================
// TYPES
// =====================================================

interface TranslationOptions {
  contentType?: ContentType;
  skipCache?: boolean;
}

interface LanguageContextType {
  // Current state
  language: SupportedLanguage;
  translations: Translations;
  isLoading: boolean;
  isTranslating: boolean;
  isRTL: boolean;
  fontFamily: string;
  
  // Language management
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  availableLanguages: typeof SUPPORTED_LANGUAGES;
  
  // Translation functions
  t: (namespace: keyof Translations, key: string, fallback?: string, vars?: Record<string, string | number>) => string;
  translate: (text: string, options?: TranslationOptions) => Promise<string>;
  translateBatch: (texts: string[], options?: TranslationOptions) => Promise<string[]>;
  translateContent: (content: any, fields: string[], options?: TranslationOptions) => Promise<any>;
  
  // Formatting functions
  formatDate: (date: Date | string) => string;
  formatTime: (date: Date | string) => string;
  formatNumber: (num: number) => string;
  formatCurrency: (amount: number, currency?: string) => string;
  formatRelativeTime: (date: Date | string) => string;
  
  // Utilities
  getLocalizedContent: <T extends { translations?: Record<string, any>; language?: string }>(
    content: T,
    fields: string[]
  ) => T;
  isContentInCurrentLanguage: (content: { language?: string }) => boolean;
  detectLanguage: (text: string) => SupportedLanguage;
}

// =====================================================
// CONTEXT
// =====================================================

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'app_language_preference';

interface LanguageProviderProps {
  children: ReactNode;
}

// =====================================================
// PROVIDER
// =====================================================

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    // Initialize from localStorage synchronously
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage;
    if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
      console.log(`[Language] Initialized from localStorage: ${stored}`);
      return stored;
    }
    console.log(`[Language] Initialized with default: ${DEFAULT_LANGUAGE}`);
    return DEFAULT_LANGUAGE;
  });
  const [translations, setTranslations] = useState<Translations>(DEFAULT_TRANSLATIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Which languages appear in the switcher — driven by the app_languages registry
  // (Phase 3.5). Falls back to English + Vietnamese if the table is absent/empty,
  // so the switcher degrades safely before the registry is deployed.
  const [availableLanguages, setAvailableLanguages] = useState<typeof SUPPORTED_LANGUAGES>(
    () => SUPPORTED_LANGUAGES.filter(l => l.code === 'en' || l.code === 'vi')
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('app_languages')
          .select('code')
          .eq('enabled', true)
          .eq('ui_status', 'published')
          .order('sort_order', { ascending: true });
        if (error || !data || data.length === 0) return; // keep the en+vi fallback
        const codes = new Set(data.map((r: any) => r.code));
        const langs = SUPPORTED_LANGUAGES.filter(l => codes.has(l.code));
        if (!cancelled && langs.length > 0) setAvailableLanguages(langs);
      } catch { /* keep the fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadingRef = useRef(false);
  const lastLoadedLanguage = useRef<string>('en');
  
  // Derived state
  const isRTL = useMemo(() => isRTLLanguage(language), [language]);
  const fontFamily = useMemo(() => getLanguageFontFamily(language), [language]);

  // =====================================================
  // LOAD TRANSLATIONS
  // =====================================================

  const loadLanguageTranslations = useCallback(async (lang: SupportedLanguage) => {
    // Skip if already loading or same language
    if (loadingRef.current || lastLoadedLanguage.current === lang) {
      console.log(`[Language] Skipping load for ${lang} (already loaded or loading)`);
      return;
    }

    // For English, use defaults immediately
    if (lang === 'en') {
      console.log('[Language] Using English defaults (no translation needed)');
      setTranslations(DEFAULT_TRANSLATIONS);
      lastLoadedLanguage.current = 'en';
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    setIsTranslating(true);

    try {
      console.log(`[Language] Loading translations for ${lang}...`);
      const loadedTranslations = await TranslationLoader.loadTranslations(lang);
      setTranslations(loadedTranslations);
      lastLoadedLanguage.current = lang;
      console.log(`[Language] ✅ Translations loaded successfully for ${lang}`);
    } catch (error) {
      console.error(`[Language] ❌ Error loading translations for ${lang}:`, error);
      // Fallback to default translations
      setTranslations(DEFAULT_TRANSLATIONS);
      console.warn('[Language] Using English fallback translations');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      setIsTranslating(false);
    }
  }, []);

  // =====================================================
  // INITIALIZATION
  // =====================================================

  // Initialize language on mount
  useEffect(() => {
    const initLanguage = async () => {
      // Check localStorage first
      const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage;
      
      if (storedLanguage && SUPPORTED_LANGUAGES.some(l => l.code === storedLanguage)) {
        if (storedLanguage !== language) {
          console.log(`[Language] Restoring from localStorage: ${storedLanguage}`);
          setLanguageState(storedLanguage);
        }
        await loadLanguageTranslations(storedLanguage);
      } else {
        // Detect browser language
        const browserLanguage = detectBrowserLanguage();
        console.log(`[Language] Browser language detected: ${browserLanguage}`);
        setLanguageState(browserLanguage);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, browserLanguage);
        await loadLanguageTranslations(browserLanguage);
      }
    };

    initLanguage();
  }, []);

  // Sync language with user profile when user changes
  useEffect(() => {
    const syncLanguageWithProfile = async () => {
      if (!user) {
        console.log('[Language] No user, skipping profile sync');
        return;
      }

      try {
        console.log('[Language] Syncing language preference with user profile...');
        
        // Try user_metadata first (fastest, no database query)
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        if (authUser?.user_metadata?.preferred_language) {
          const metaLanguage = authUser.user_metadata.preferred_language as SupportedLanguage;
          if (SUPPORTED_LANGUAGES.some(l => l.code === metaLanguage) && metaLanguage !== language) {
            console.log(`[Language] Found in user_metadata: ${metaLanguage}`);
            setLanguageState(metaLanguage);
            localStorage.setItem(LANGUAGE_STORAGE_KEY, metaLanguage);
            await loadLanguageTranslations(metaLanguage);
            return;
          }
        }

        // Try querying user_profiles table
        // This might fail if the column doesn't exist yet
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('preferred_language')
            .eq('id', user.id)
            .maybeSingle();

          if (error) {
            // Check if it's a "column does not exist" error
            if (error.code === '42703') {
              console.warn('[Language] ⚠️ preferred_language column does not exist in user_profiles table');
              console.warn('[Language] Please run the migration SQL to add the column');
              console.warn('[Language] Continuing with localStorage preference');
              return;
            }
            
            console.warn('[Language] Could not fetch language preference:', error.message);
            return;
          }

          if (data?.preferred_language && 
              SUPPORTED_LANGUAGES.some(l => l.code === data.preferred_language)) {
            const profileLanguage = data.preferred_language as SupportedLanguage;
            
            if (profileLanguage !== language) {
              console.log(`[Language] Found in user_profiles: ${profileLanguage}`);
              setLanguageState(profileLanguage);
              localStorage.setItem(LANGUAGE_STORAGE_KEY, profileLanguage);
              await loadLanguageTranslations(profileLanguage);
            }
          }
        } catch (dbError) {
          console.warn('[Language] Database query error (will use localStorage):', dbError);
        }
      } catch (error) {
        console.error('[Language] Error syncing language with profile:', error);
      }
    };

    syncLanguageWithProfile();
  }, [user]);

  // Update document attributes when language changes
  useEffect(() => {
    // Update HTML dir attribute for RTL support
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    
    // Update font family
    document.documentElement.style.fontFamily = fontFamily;
    
    // Add language-specific class for CSS targeting
    document.documentElement.className = document.documentElement.className
      .replace(/lang-\w+/g, '')
      .trim();
    document.documentElement.classList.add(`lang-${language}`);
    
    // Add RTL class if needed
    if (isRTL) {
      document.documentElement.classList.add('rtl');
    } else {
      document.documentElement.classList.remove('rtl');
    }
    
    console.log(`[Language] Document updated for ${language} (RTL: ${isRTL})`);
  }, [language, isRTL, fontFamily]);

  // =====================================================
  // LANGUAGE MANAGEMENT
  // =====================================================

  const setLanguage = useCallback(async (newLanguage: SupportedLanguage) => {
    try {
      // Validate language is supported
      if (!SUPPORTED_LANGUAGES.some(l => l.code === newLanguage)) {
        throw new Error(`Unsupported language: ${newLanguage}`);
      }

      // Skip if same language
      if (newLanguage === language) {
        console.log(`[Language] Already using ${newLanguage}, skipping change`);
        return;
      }

      console.log(`[Language] 🔄 Changing language from ${language} to ${newLanguage}`);

      // Update state immediately for responsive UI
      setLanguageState(newLanguage);

      // Save to localStorage
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);

      // Clear dynamic-content translation cache
      translationService.clearCache();

      // Clear any stale UI-string merge cached earlier this session, so the
      // switch always re-fetches the latest rows from ui_translations instead
      // of reusing a partial/English-fallback merge from before the DB was seeded.
      TranslationLoader.clearLanguageCache(newLanguage);

      // Load new translations
      await loadLanguageTranslations(newLanguage);

      // Update user profile if logged in (try but don't fail)
      if (user) {
        try {
          // First update user_metadata (always works)
          await supabase.auth.updateUser({
            data: { preferred_language: newLanguage }
          });
          console.log('[Language] Updated user_metadata');

          // Then try to update user_profiles table (might fail if column doesn't exist)
          try {
            await supabase
              .from('user_profiles')
              .update({ preferred_language: newLanguage })
              .eq('id', user.id);
            console.log('[Language] Updated user_profiles table');
          } catch (dbError) {
            console.warn('[Language] Could not update user_profiles (column may not exist)');
          }
        } catch (updateError) {
          console.warn('[Language] Could not update user preference in database:', updateError);
        }
      }
    } catch (error) {
      console.error('[Language] Error changing language:', error);
      throw error;
    }
  }, [language, user, loadLanguageTranslations]);

  // =====================================================
  // TRANSLATION FUNCTIONS
  // =====================================================

  // Get static UI translation
  const t = useCallback((
    namespace: keyof Translations,
    key: string,
    fallback?: string,
    vars?: Record<string, string | number>
  ): string => {
    // Interpolate {var} placeholders, e.g. t('common','greeting','Hi {name}',{name})
    const interpolate = (str: string): string =>
      vars ? str.replace(/\{(\w+)\}/g, (m, name) =>
        name in vars ? String(vars[name]) : m) : str;

    try {
      const namespaceTranslations = translations[namespace];
      if (!namespaceTranslations) {
        return interpolate(fallback || key);
      }

      const translation = (namespaceTranslations as any)[key];
      if (!translation) {
        return interpolate(fallback || key);
      }

      return interpolate(translation);
    } catch (error) {
      return interpolate(fallback || key);
    }
  }, [translations]);

  // Translate dynamic content
  const translate = useCallback(async (
    text: string, 
    options: TranslationOptions = {}
  ): Promise<string> => {
    if (language === 'en' || !text) {
      return text;
    }

    try {
      return await translationService.translate(text, language, {
        sourceLanguage: 'en',
        contentType: options.contentType || 'general',
        skipCache: options.skipCache
      });
    } catch (error) {
      console.error('[Language] Dynamic translation error:', error);
      return text; // Fallback to original
    }
  }, [language]);

  // Batch translate multiple texts
  const translateBatch = useCallback(async (
    texts: string[],
    options: TranslationOptions = {}
  ): Promise<string[]> => {
    if (language === 'en' || !texts.length) {
      return texts;
    }

    try {
      return await translationService.translateBatch(texts, language, {
        sourceLanguage: 'en',
        contentType: options.contentType || 'general',
        skipCache: options.skipCache
      });
    } catch (error) {
      console.error('[Language] Batch translation error:', error);
      return texts; // Fallback to originals
    }
  }, [language]);

  // Translate content object fields
  const translateContent = useCallback(async <T extends Record<string, any>>(
    content: T,
    fields: string[],
    options: TranslationOptions = {}
  ): Promise<T> => {
    if (language === 'en' || !content) {
      return content;
    }

    try {
      const textsToTranslate = fields
        .map(field => content[field])
        .filter(text => typeof text === 'string' && text.length > 0);

      if (textsToTranslate.length === 0) {
        return content;
      }

      const translatedTexts = await translateBatch(textsToTranslate, options);
      
      const result = { ...content };
      let translatedIndex = 0;
      
      fields.forEach(field => {
        if (typeof content[field] === 'string' && content[field].length > 0) {
          (result as any)[field] = translatedTexts[translatedIndex++];
        }
      });

      return result;
    } catch (error) {
      console.error('[Language] Content translation error:', error);
      return content;
    }
  }, [language, translateBatch]);

  // =====================================================
  // FORMATTING FUNCTIONS
  // =====================================================

  const formatDate = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return i18nFormatDate(d, language);
  }, [language]);

  const formatTime = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return i18nFormatTime(d, language);
  }, [language]);

  const formatNumber = useCallback((num: number): string => {
    return i18nFormatNumber(num, language);
  }, [language]);

  const formatCurrency = useCallback((amount: number, currency: string = 'USD'): string => {
    return i18nFormatCurrency(amount, currency, language);
  }, [language]);

  const formatRelativeTime = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return i18nFormatRelativeTime(d, language);
  }, [language]);

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================

  // Get localized content from object with translations
  const getLocalizedContent = useCallback(<T extends { translations?: Record<string, any>; language?: string }>(
    content: T,
    fields: string[]
  ): T => {
    if (!content) return content;
    
    // If content has translations for current language, use them
    if (content.translations && content.translations[language]) {
      const localizedContent = { ...content };
      const translation = content.translations[language];
      
      fields.forEach(field => {
        if (translation[field]) {
          (localizedContent as any)[field] = translation[field];
        }
      });
      
      return localizedContent;
    }
    
    return content;
  }, [language]);

  // Check if content is in current language
  const isContentInCurrentLanguage = useCallback((content: { language?: string }): boolean => {
    if (!content.language) return true; // Assume default language
    return content.language === language;
  }, [language]);

  // Detect language of text
  const detectLanguage = useCallback((text: string): SupportedLanguage => {
    // Simple detection based on character ranges
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    if (/[\u3040-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0900-\u097f]/.test(text)) return 'hi';
    if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) return 'vi';
    return 'en';
  }, []);

  // =====================================================
  // CONTEXT VALUE
  // =====================================================

  const value: LanguageContextType = useMemo(() => ({
    // Current state
    language,
    translations,
    isLoading,
    isTranslating,
    isRTL,
    fontFamily,
    
    // Language management
    setLanguage,
    availableLanguages,
    
    // Translation functions
    t,
    translate,
    translateBatch,
    translateContent,
    
    // Formatting functions
    formatDate,
    formatTime,
    formatNumber,
    formatCurrency,
    formatRelativeTime,
    
    // Utilities
    getLocalizedContent,
    isContentInCurrentLanguage,
    detectLanguage,
  }), [
    language,
    translations,
    isLoading,
    isTranslating,
    isRTL,
    fontFamily,
    availableLanguages,
    setLanguage,
    t,
    translate,
    translateBatch,
    translateContent,
    formatDate,
    formatTime,
    formatNumber,
    formatCurrency,
    formatRelativeTime,
    getLocalizedContent,
    isContentInCurrentLanguage,
    detectLanguage,
  ]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// =====================================================
// HOOKS
// =====================================================

// Main language hook
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  
  return context;
}

// Export type for convenience
export { type SupportedLanguage };