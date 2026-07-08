// =====================================================
// USE TRANSLATION HOOK
// Comprehensive translation utilities for components
// =====================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLanguage, SupportedLanguage } from '@/contexts/LanguageContext';
import { ContentType, translationService } from '@/lib/i18n';

// =====================================================
// TYPES
// =====================================================

interface TranslationState {
  isTranslating: boolean;
  error: string | null;
  translatedTexts: Map<string, string>;
}

interface UseTranslationOptions {
  contentType?: ContentType;
  autoTranslate?: boolean;
  cacheResults?: boolean;
}

interface UseContentTranslationOptions {
  fields: string[];
  contentType?: ContentType;
  autoTranslate?: boolean;
}

interface TranslatedContent<T> {
  content: T;
  isTranslating: boolean;
  isTranslated: boolean;
  originalLanguage: string;
  error: string | null;
  retranslate: () => Promise<void>;
}

// =====================================================
// MAIN TRANSLATION HOOK
// =====================================================

export function useTranslation(options: UseTranslationOptions = {}) {
  const { language, translate, translateBatch, t, isLoading, isTranslating: contextTranslating } = useLanguage();
  const { contentType = 'general', cacheResults = true } = options;
  
  const [state, setState] = useState<TranslationState>({
    isTranslating: false,
    error: null,
    translatedTexts: new Map()
  });
  
  const cacheRef = useRef<Map<string, string>>(new Map());

  // Translate single text
  const translateText = useCallback(async (text: string): Promise<string> => {
    if (!text || language === 'en') {
      return text;
    }

    // Check local cache
    const cacheKey = `${language}:${text}`;
    if (cacheResults && cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey)!;
    }

    setState(prev => ({ ...prev, isTranslating: true, error: null }));

    try {
      const translated = await translate(text, { contentType });
      
      if (cacheResults) {
        cacheRef.current.set(cacheKey, translated);
      }
      
      setState(prev => {
        const newTexts = new Map(prev.translatedTexts);
        newTexts.set(text, translated);
        return { ...prev, isTranslating: false, translatedTexts: newTexts };
      });
      
      return translated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      setState(prev => ({ ...prev, isTranslating: false, error: errorMessage }));
      return text; // Fallback to original
    }
  }, [language, translate, contentType, cacheResults]);

  // Translate multiple texts
  const translateTexts = useCallback(async (texts: string[]): Promise<string[]> => {
    if (!texts.length || language === 'en') {
      return texts;
    }

    setState(prev => ({ ...prev, isTranslating: true, error: null }));

    try {
      // Check cache for each text
      const results: (string | null)[] = texts.map(text => {
        const cacheKey = `${language}:${text}`;
        return cacheResults && cacheRef.current.has(cacheKey) 
          ? cacheRef.current.get(cacheKey)! 
          : null;
      });

      // Find texts that need translation
      const textsToTranslate: { index: number; text: string }[] = [];
      texts.forEach((text, index) => {
        if (results[index] === null) {
          textsToTranslate.push({ index, text });
        }
      });

      if (textsToTranslate.length > 0) {
        const translated = await translateBatch(
          textsToTranslate.map(t => t.text),
          { contentType }
        );

        textsToTranslate.forEach((item, i) => {
          results[item.index] = translated[i];
          if (cacheResults) {
            cacheRef.current.set(`${language}:${item.text}`, translated[i]);
          }
        });
      }

      setState(prev => {
        const newTexts = new Map(prev.translatedTexts);
        texts.forEach((text, i) => {
          if (results[i]) {
            newTexts.set(text, results[i]!);
          }
        });
        return { ...prev, isTranslating: false, translatedTexts: newTexts };
      });

      return results as string[];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      setState(prev => ({ ...prev, isTranslating: false, error: errorMessage }));
      return texts; // Fallback to originals
    }
  }, [language, translateBatch, contentType, cacheResults]);

  // Get cached translation
  const getCachedTranslation = useCallback((text: string): string | undefined => {
    const cacheKey = `${language}:${text}`;
    return cacheRef.current.get(cacheKey) || state.translatedTexts.get(text);
  }, [language, state.translatedTexts]);

  // Clear cache
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    setState(prev => ({ ...prev, translatedTexts: new Map() }));
  }, []);

  // Clear cache when language changes
  useEffect(() => {
    clearCache();
  }, [language, clearCache]);

  return {
    language,
    isTranslating: state.isTranslating || isLoading || contextTranslating,
    error: state.error,
    translateText,
    translateTexts,
    getCachedTranslation,
    clearCache,
    t, // Static UI translations
  };
}

// =====================================================
// CONTENT TRANSLATION HOOK
// For translating content objects with specific fields
// =====================================================

export function useContentTranslation<T extends Record<string, any>>(
  content: T | null | undefined,
  options: UseContentTranslationOptions
): TranslatedContent<T | null> {
  const { language, translateContent, getLocalizedContent, isTranslating: contextTranslating } = useLanguage();
  const { fields, contentType = 'general', autoTranslate = true } = options;
  
  const [translatedContent, setTranslatedContent] = useState<T | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const contentRef = useRef<T | null>(null);
  const languageRef = useRef<string>(language);

  // Get original language of content
  const originalLanguage = useMemo(() => {
    if (!content) return 'en';
    return (content as any).language || 'en';
  }, [content]);

  // Translate content
  const doTranslate = useCallback(async () => {
    if (!content) {
      setTranslatedContent(null);
      return;
    }

    // First, try to get localized content from translations object
    const localized = getLocalizedContent(content, fields);
    
    // Check if localization was successful (content has translations for current language)
    const hasTranslation = content.translations && content.translations[language];
    
    if (hasTranslation || language === 'en' || language === originalLanguage) {
      setTranslatedContent(localized);
      setIsTranslated(hasTranslation || language === originalLanguage);
      return;
    }

    // Need to translate dynamically
    setIsTranslating(true);
    setError(null);

    try {
      const translated = await translateContent(content, fields, { contentType });
      setTranslatedContent(translated);
      setIsTranslated(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      setTranslatedContent(content); // Fallback to original
      setIsTranslated(false);
    } finally {
      setIsTranslating(false);
    }
  }, [content, language, fields, contentType, translateContent, getLocalizedContent, originalLanguage]);

  // Auto-translate when content or language changes
  useEffect(() => {
    const contentChanged = content !== contentRef.current;
    const languageChanged = language !== languageRef.current;
    
    if (autoTranslate && (contentChanged || languageChanged)) {
      contentRef.current = content;
      languageRef.current = language;
      doTranslate();
    }
  }, [content, language, autoTranslate, doTranslate]);

  // Manual retranslate function
  const retranslate = useCallback(async () => {
    await doTranslate();
  }, [doTranslate]);

  return {
    content: translatedContent,
    isTranslating: isTranslating || contextTranslating,
    isTranslated,
    originalLanguage,
    error,
    retranslate,
  };
}

// =====================================================
// BATCH CONTENT TRANSLATION HOOK
// For translating arrays of content
// =====================================================

export function useBatchContentTranslation<T extends Record<string, any>>(
  contents: T[],
  options: UseContentTranslationOptions
): {
  contents: T[];
  isTranslating: boolean;
  translatedCount: number;
  error: string | null;
  retranslate: () => Promise<void>;
} {
  const { language, translateBatch, getLocalizedContent, isTranslating: contextTranslating } = useLanguage();
  const { fields, contentType = 'general', autoTranslate = true } = options;
  
  const [translatedContents, setTranslatedContents] = useState<T[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const contentsRef = useRef<T[]>([]);
  const languageRef = useRef<string>(language);

  const doTranslate = useCallback(async () => {
    if (!contents.length) {
      setTranslatedContents([]);
      return;
    }

    // For English, just return original contents
    if (language === 'en') {
      setTranslatedContents(contents);
      return;
    }

    // First, try to get localized content from translations objects
    const localizedContents = contents.map(content => getLocalizedContent(content, fields));
    
    // Check which contents need dynamic translation
    const needsTranslation = localizedContents.filter((content, index) => {
      const original = contents[index];
      const hasTranslation = original.translations && original.translations[language];
      const isOriginalLanguage = (original as any).language === language;
      return !hasTranslation && !isOriginalLanguage && language !== 'en';
    });

    if (needsTranslation.length === 0) {
      setTranslatedContents(localizedContents);
      return;
    }

    setIsTranslating(true);
    setError(null);

    try {
      // Collect all texts to translate
      const textsToTranslate: string[] = [];
      const textMapping: { contentIndex: number; field: string }[] = [];

      needsTranslation.forEach((content, i) => {
        const originalIndex = localizedContents.indexOf(content);
        fields.forEach(field => {
          const text = (content as any)[field];
          if (typeof text === 'string' && text.length > 0) {
            textsToTranslate.push(text);
            textMapping.push({ contentIndex: originalIndex, field });
          }
        });
      });

      if (textsToTranslate.length > 0) {
        const translated = await translateBatch(textsToTranslate, { contentType });

        // Apply translations
        const results = [...localizedContents];
        translated.forEach((translatedText, i) => {
          const { contentIndex, field } = textMapping[i];
          (results[contentIndex] as any)[field] = translatedText;
        });

        setTranslatedContents(results);
      } else {
        setTranslatedContents(localizedContents);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      setTranslatedContents(localizedContents); // Fallback to localized/original
    } finally {
      setIsTranslating(false);
    }
  }, [contents, language, fields, contentType, translateBatch, getLocalizedContent]);

  // Auto-translate when contents or language changes
  useEffect(() => {
    const contentsChanged = JSON.stringify(contents) !== JSON.stringify(contentsRef.current);
    const languageChanged = language !== languageRef.current;
    
    if (autoTranslate && (contentsChanged || languageChanged)) {
      contentsRef.current = contents;
      languageRef.current = language;
      doTranslate();
    }
  }, [contents, language, autoTranslate, doTranslate]);

  return {
    contents: translatedContents.length > 0 ? translatedContents : contents,
    isTranslating: isTranslating || contextTranslating,
    translatedCount: translatedContents.length,
    error,
    retranslate: doTranslate,
  };
}

// =====================================================
// LAZY TRANSLATION HOOK
// For on-demand translation (e.g., when content becomes visible)
// =====================================================

export function useLazyTranslation() {
  const { language, translate, translateBatch, isTranslating: contextTranslating } = useLanguage();
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Request translation for a text
  const requestTranslation = useCallback(async (
    text: string,
    contentType: ContentType = 'general'
  ): Promise<string> => {
    if (language === 'en' || !text) {
      return text;
    }

    // Check if already translated
    if (translations.has(text)) {
      return translations.get(text)!;
    }

    // Check if pending
    if (pending.has(text)) {
      // Wait for existing translation
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (translations.has(text)) {
            clearInterval(checkInterval);
            resolve(translations.get(text)!);
          }
        }, 100);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(text);
        }, 30000);
      });
    }

    // Mark as pending
    setPending(prev => new Set(prev).add(text));

    try {
      const translated = await translate(text, { contentType });
      setTranslations(prev => new Map(prev).set(text, translated));
      return translated;
    } finally {
      setPending(prev => {
        const newPending = new Set(prev);
        newPending.delete(text);
        return newPending;
      });
    }
  }, [language, translate, translations, pending]);

  // Request batch translations
  const requestBatchTranslation = useCallback(async (
    texts: string[],
    contentType: ContentType = 'general'
  ): Promise<string[]> => {
    if (language === 'en' || !texts.length) {
      return texts;
    }

    const results: (string | null)[] = texts.map(text => 
      translations.has(text) ? translations.get(text)! : null
    );

    const textsToTranslate = texts.filter((_, i) => results[i] === null);

    if (textsToTranslate.length > 0) {
      const translated = await translateBatch(textsToTranslate, { contentType });
      
      let translatedIndex = 0;
      const newTranslations = new Map(translations);
      
      texts.forEach((text, i) => {
        if (results[i] === null) {
          const translatedText = translated[translatedIndex++];
          results[i] = translatedText;
          newTranslations.set(text, translatedText);
        }
      });

      setTranslations(newTranslations);
    }

    return results as string[];
  }, [language, translateBatch, translations]);

  // Get translation if available
  const getTranslation = useCallback((text: string): string | undefined => {
    return translations.get(text);
  }, [translations]);

  // Clear translations when language changes
  useEffect(() => {
    setTranslations(new Map());
    setPending(new Set());
  }, [language]);

  return {
    language,
    requestTranslation,
    requestBatchTranslation,
    getTranslation,
    isPending: (text: string) => pending.has(text),
    isTranslated: (text: string) => translations.has(text),
    translationCount: translations.size,
    isTranslating: pending.size > 0 || contextTranslating,
  };
}

// =====================================================
// SIMPLE TEXT TRANSLATION HOOK
// For translating a single piece of text with automatic updates
// =====================================================

export function useTranslatedText(
  text: string,
  options: { contentType?: ContentType; enabled?: boolean } = {}
): { translatedText: string; isTranslating: boolean } {
  const { language, translate, isTranslating: contextTranslating } = useLanguage();
  const { contentType = 'general', enabled = true } = options;
  
  const [translatedText, setTranslatedText] = useState(text);
  const [isTranslating, setIsTranslating] = useState(false);
  
  useEffect(() => {
    if (!enabled || !text || language === 'en') {
      setTranslatedText(text);
      return;
    }

    let cancelled = false;
    setIsTranslating(true);

    translate(text, { contentType })
      .then(result => {
        if (!cancelled) {
          setTranslatedText(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTranslatedText(text);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsTranslating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [text, language, contentType, enabled, translate]);

  return {
    translatedText,
    isTranslating: isTranslating || contextTranslating,
  };
}

// =====================================================
// EXPORT
// =====================================================

export default useTranslation;
