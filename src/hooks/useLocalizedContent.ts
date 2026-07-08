// =====================================================
// USE LOCALIZED CONTENT HOOK
// Filter and retrieve content based on user's language
// With dynamic translation support via OpenAI
// =====================================================

import { useMemo, useCallback, useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SupportedLanguage, ContentType, translationService } from '@/lib/i18n';

// Base interface for content with language support
export interface LocalizableContent {
  id: string;
  language?: SupportedLanguage;
  title?: string;
  description?: string;
  content?: string;
  translations?: {
    [key in SupportedLanguage]?: {
      title?: string;
      description?: string;
      content?: string;
      [key: string]: any;
    };
  };
}

// Multi-language content schema interface
export interface MultiLanguageContent {
  id: string;
  default_language: SupportedLanguage;
  languages: SupportedLanguage[];
  content: {
    [key in SupportedLanguage]?: {
      title: string;
      description?: string;
      content: string;
      [key: string]: any;
    };
  };
}

interface LocalizedContentOptions {
  showFallback?: boolean;
  fallbackLanguage?: SupportedLanguage;
  strict?: boolean; // If true, don't show content if not available in user's language
  autoTranslate?: boolean; // If true, automatically translate content not in user's language
  contentType?: ContentType; // Type of content for translation context
}

export function useLocalizedContent<T extends LocalizableContent>(
  options: LocalizedContentOptions = {}
) {
  const { language, translate, translateBatch } = useLanguage();
  const {
    showFallback = true,
    fallbackLanguage = 'en',
    strict = false,
    autoTranslate = false,
    contentType = 'general',
  } = options;

  // Filter content array by language
  const filterContentByLanguage = useCallback(
    (contentArray: T[]): T[] => {
      return contentArray.filter((item) => {
        // If content has explicit language field
        if (item.language) {
          if (strict) {
            return item.language === language;
          }
          return item.language === language || (showFallback && item.language === fallbackLanguage);
        }

        // If content has translations object
        if (item.translations) {
          if (strict) {
            return !!item.translations[language];
          }
          return !!item.translations[language] || (showFallback && !!item.translations[fallbackLanguage]);
        }

        // If no language info, include in non-strict mode
        return !strict;
      });
    },
    [language, showFallback, fallbackLanguage, strict]
  );

  // Get localized version of a single content item
  const getLocalizedContent = useCallback(
    <K extends LocalizableContent>(item: K): K & { isFallback: boolean } => {
      let localizedItem = { ...item, isFallback: false };

      // If content has translations object
      if (item.translations) {
        const translation = item.translations[language] || (showFallback ? item.translations[fallbackLanguage] : null);
        
        if (translation) {
          localizedItem = {
            ...localizedItem,
            ...translation,
            isFallback: !item.translations[language] && showFallback,
          };
        }
      }

      return localizedItem;
    },
    [language, showFallback, fallbackLanguage]
  );

  // Check if content is available in user's language
  const isContentAvailable = useCallback(
    (item: LocalizableContent): boolean => {
      if (item.language) {
        return item.language === language;
      }

      if (item.translations) {
        return !!item.translations[language];
      }

      return true; // Default to available if no language info
    },
    [language]
  );

  // Get available languages for a content item
  const getAvailableLanguages = useCallback(
    (item: LocalizableContent): SupportedLanguage[] => {
      if (item.translations) {
        return Object.keys(item.translations) as SupportedLanguage[];
      }

      if (item.language) {
        return [item.language];
      }

      return [];
    },
    []
  );

  // Multi-language content handler
  const getMultiLanguageContent = useCallback(
    (item: MultiLanguageContent): (typeof item.content)[SupportedLanguage] | null => {
      // Try to get content in user's language
      if (item.content[language]) {
        return item.content[language]!;
      }

      // Fallback to default language
      if (showFallback && item.content[item.default_language]) {
        return item.content[item.default_language]!;
      }

      // Fallback to first available language
      if (showFallback && item.languages.length > 0) {
        const firstLang = item.languages[0];
        return item.content[firstLang] || null;
      }

      return null;
    },
    [language, showFallback]
  );

  // Sort content with user's language first
  const sortByLanguagePreference = useCallback(
    <K extends LocalizableContent>(contentArray: K[]): K[] => {
      return [...contentArray].sort((a, b) => {
        const aInUserLang = isContentAvailable(a);
        const bInUserLang = isContentAvailable(b);

        if (aInUserLang && !bInUserLang) return -1;
        if (!aInUserLang && bInUserLang) return 1;
        return 0;
      });
    },
    [isContentAvailable]
  );

  // Translate content dynamically
  const translateContent = useCallback(
    async <K extends LocalizableContent>(
      item: K,
      fields: (keyof K)[] = ['title', 'description', 'content'] as (keyof K)[]
    ): Promise<K> => {
      if (!autoTranslate || language === 'en') {
        return item;
      }

      // Check if already has translation
      if (item.translations?.[language]) {
        return getLocalizedContent(item) as unknown as K;
      }

      // Collect texts to translate
      const textsToTranslate: string[] = [];
      const fieldMapping: { field: keyof K; index: number }[] = [];

      fields.forEach(field => {
        const value = item[field];
        if (typeof value === 'string' && value.length > 0) {
          textsToTranslate.push(value);
          fieldMapping.push({ field, index: textsToTranslate.length - 1 });
        }
      });

      if (textsToTranslate.length === 0) {
        return item;
      }

      try {
        const translated = await translateBatch(textsToTranslate, { contentType });
        
        const result = { ...item };
        fieldMapping.forEach(({ field, index }) => {
          (result as any)[field] = translated[index];
        });

        return result;
      } catch (error) {
        console.error('Translation error:', error);
        return item;
      }
    },
    [language, autoTranslate, contentType, translateBatch, getLocalizedContent]
  );

  // Batch translate content array
  const translateContentArray = useCallback(
    async <K extends LocalizableContent>(
      items: K[],
      fields: (keyof K)[] = ['title', 'description'] as (keyof K)[]
    ): Promise<K[]> => {
      if (!autoTranslate || language === 'en' || items.length === 0) {
        return items;
      }

      // Filter items that need translation
      const itemsNeedingTranslation = items.filter(item => 
        !item.translations?.[language] && item.language !== language
      );

      if (itemsNeedingTranslation.length === 0) {
        return items.map(item => getLocalizedContent(item) as unknown as K);
      }

      // Collect all texts to translate
      const allTexts: string[] = [];
      const textMapping: { itemIndex: number; field: keyof K; textIndex: number }[] = [];

      itemsNeedingTranslation.forEach((item, itemIndex) => {
        fields.forEach(field => {
          const value = item[field];
          if (typeof value === 'string' && value.length > 0) {
            textMapping.push({ itemIndex, field, textIndex: allTexts.length });
            allTexts.push(value);
          }
        });
      });

      if (allTexts.length === 0) {
        return items.map(item => getLocalizedContent(item) as unknown as K);
      }

      try {
        const translated = await translateBatch(allTexts, { contentType });
        
        // Apply translations
        const translatedItems = [...itemsNeedingTranslation];
        textMapping.forEach(({ itemIndex, field, textIndex }) => {
          (translatedItems[itemIndex] as any)[field] = translated[textIndex];
        });

        // Merge with items that didn't need translation
        return items.map(item => {
          const needsTranslation = itemsNeedingTranslation.includes(item);
          if (needsTranslation) {
            const index = itemsNeedingTranslation.indexOf(item);
            return translatedItems[index];
          }
          return getLocalizedContent(item) as unknown as K;
        });
      } catch (error) {
        console.error('Batch translation error:', error);
        return items.map(item => getLocalizedContent(item) as unknown as K);
      }
    },
    [language, autoTranslate, contentType, translateBatch, getLocalizedContent]
  );

  return {
    filterContentByLanguage,
    getLocalizedContent,
    isContentAvailable,
    getAvailableLanguages,
    getMultiLanguageContent,
    sortByLanguagePreference,
    translateContent,
    translateContentArray,
    currentLanguage: language,
  };
}

// =====================================================
// SPECIFIC HOOKS FOR DIFFERENT CONTENT TYPES
// =====================================================

export function useLocalizedDevotionals<T extends LocalizableContent>(
  devotionals: T[],
  options?: LocalizedContentOptions
) {
  const { filterContentByLanguage, getLocalizedContent, translateContentArray } = 
    useLocalizedContent<T>({ ...options, contentType: 'devotional' });
  
  const [translatedDevotionals, setTranslatedDevotionals] = useState<T[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  const localizedDevotionals = useMemo(
    () => filterContentByLanguage(devotionals),
    [devotionals, filterContentByLanguage]
  );

  // Auto-translate if enabled
  useEffect(() => {
    if (options?.autoTranslate && localizedDevotionals.length > 0) {
      setIsTranslating(true);
      translateContentArray(localizedDevotionals, ['title', 'description'])
        .then(setTranslatedDevotionals)
        .finally(() => setIsTranslating(false));
    } else {
      setTranslatedDevotionals(localizedDevotionals);
    }
  }, [localizedDevotionals, options?.autoTranslate, translateContentArray]);

  return {
    devotionals: translatedDevotionals.length > 0 ? translatedDevotionals : localizedDevotionals,
    isTranslating,
    getLocalized: getLocalizedContent,
  };
}

export function useLocalizedPrayers<T extends LocalizableContent>(
  prayers: T[],
  options?: LocalizedContentOptions
) {
  const { filterContentByLanguage, getLocalizedContent, translateContentArray } = 
    useLocalizedContent<T>({ ...options, contentType: 'prayer' });
  
  const [translatedPrayers, setTranslatedPrayers] = useState<T[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  const localizedPrayers = useMemo(
    () => filterContentByLanguage(prayers),
    [prayers, filterContentByLanguage]
  );

  useEffect(() => {
    if (options?.autoTranslate && localizedPrayers.length > 0) {
      setIsTranslating(true);
      translateContentArray(localizedPrayers, ['title', 'description', 'content'])
        .then(setTranslatedPrayers)
        .finally(() => setIsTranslating(false));
    } else {
      setTranslatedPrayers(localizedPrayers);
    }
  }, [localizedPrayers, options?.autoTranslate, translateContentArray]);

  return {
    prayers: translatedPrayers.length > 0 ? translatedPrayers : localizedPrayers,
    isTranslating,
    getLocalized: getLocalizedContent,
  };
}

export function useLocalizedAnnouncements<T extends LocalizableContent>(
  announcements: T[],
  options?: LocalizedContentOptions
) {
  const { filterContentByLanguage, getLocalizedContent, sortByLanguagePreference, translateContentArray } = 
    useLocalizedContent<T>({ ...options, contentType: 'announcement' });
  
  const [translatedAnnouncements, setTranslatedAnnouncements] = useState<T[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  const localizedAnnouncements = useMemo(
    () => sortByLanguagePreference(filterContentByLanguage(announcements)),
    [announcements, filterContentByLanguage, sortByLanguagePreference]
  );

  useEffect(() => {
    if (options?.autoTranslate && localizedAnnouncements.length > 0) {
      setIsTranslating(true);
      translateContentArray(localizedAnnouncements, ['title', 'description', 'content'])
        .then(setTranslatedAnnouncements)
        .finally(() => setIsTranslating(false));
    } else {
      setTranslatedAnnouncements(localizedAnnouncements);
    }
  }, [localizedAnnouncements, options?.autoTranslate, translateContentArray]);

  return {
    announcements: translatedAnnouncements.length > 0 ? translatedAnnouncements : localizedAnnouncements,
    isTranslating,
    getLocalized: getLocalizedContent,
  };
}

export function useLocalizedEvents<T extends LocalizableContent>(
  events: T[],
  options?: LocalizedContentOptions
) {
  const { filterContentByLanguage, getLocalizedContent, translateContentArray } = 
    useLocalizedContent<T>({ ...options, contentType: 'general' });
  
  const [translatedEvents, setTranslatedEvents] = useState<T[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  const localizedEvents = useMemo(
    () => filterContentByLanguage(events),
    [events, filterContentByLanguage]
  );

  useEffect(() => {
    if (options?.autoTranslate && localizedEvents.length > 0) {
      setIsTranslating(true);
      translateContentArray(localizedEvents, ['title', 'description'])
        .then(setTranslatedEvents)
        .finally(() => setIsTranslating(false));
    } else {
      setTranslatedEvents(localizedEvents);
    }
  }, [localizedEvents, options?.autoTranslate, translateContentArray]);

  return {
    events: translatedEvents.length > 0 ? translatedEvents : localizedEvents,
    isTranslating,
    getLocalized: getLocalizedContent,
  };
}

export function useLocalizedMinistryContent<T extends LocalizableContent>(
  content: T[],
  options?: LocalizedContentOptions
) {
  const { filterContentByLanguage, getLocalizedContent, translateContentArray } = 
    useLocalizedContent<T>({ ...options, contentType: 'teaching' });
  
  const [translatedContent, setTranslatedContent] = useState<T[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  const localizedContent = useMemo(
    () => filterContentByLanguage(content),
    [content, filterContentByLanguage]
  );

  useEffect(() => {
    if (options?.autoTranslate && localizedContent.length > 0) {
      setIsTranslating(true);
      translateContentArray(localizedContent, ['title', 'description', 'content'])
        .then(setTranslatedContent)
        .finally(() => setIsTranslating(false));
    } else {
      setTranslatedContent(localizedContent);
    }
  }, [localizedContent, options?.autoTranslate, translateContentArray]);

  return {
    content: translatedContent.length > 0 ? translatedContent : localizedContent,
    isTranslating,
    getLocalized: getLocalizedContent,
  };
}
