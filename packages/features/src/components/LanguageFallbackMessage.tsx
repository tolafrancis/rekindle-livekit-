// Language Fallback Message Component
import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Loader2, Globe, Check } from 'lucide-react';

interface LanguageFallbackMessageProps {
  showStatus?: boolean;
}

export const LanguageFallbackMessage: React.FC<LanguageFallbackMessageProps> = ({ 
  showStatus = true 
}) => {
  const { language, isLoading, isTranslating } = useLanguage();

  if (!showStatus) return null;

  if (isLoading || isTranslating) {
    return (
      <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Translating to {language.toUpperCase()}...</span>
      </div>
    );
  }

  if (language !== 'en') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
        <Check className="h-4 w-4" />
        <span>Viewing in {language.toUpperCase()}</span>
      </div>
    );
  }

  return null;
};

// Translation status badge for content cards
export const TranslationStatusBadge: React.FC<{
  isTranslating?: boolean;
  isTranslated?: boolean;
  language?: string;
}> = ({ isTranslating, isTranslated, language }) => {
  if (isTranslating) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
        <Loader2 className="h-3 w-3 animate-spin" />
        Translating...
      </span>
    );
  }

  if (isTranslated && language && language !== 'en') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
        <Globe className="h-3 w-3" />
        {language.toUpperCase()}
      </span>
    );
  }

  return null;
};

// Alias for backward compatibility
export const LanguageFallbackBadge = TranslationStatusBadge;

export default LanguageFallbackMessage;
