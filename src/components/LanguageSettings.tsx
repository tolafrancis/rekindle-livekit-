// =====================================================
// LANGUAGE SETTINGS COMPONENT
// Comprehensive language selection with region grouping
// =====================================================

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { useLanguage, SupportedLanguage } from '@/contexts/LanguageContext';
import { 
  getAsianLanguages, 
  getEuropeanLanguages, 
  getLanguagesByRegion,
  SUPPORTED_LANGUAGES,
  LanguageInfo 
} from '@/lib/i18n';
import { 
  Globe, 
  Check, 
  Search, 
  Languages, 
  ChevronRight,
  Loader2,
  Star,
  MapPin
} from 'lucide-react';

interface LanguageSettingsProps {
  variant?: 'full' | 'compact' | 'modal';
  onLanguageChange?: (language: SupportedLanguage) => void;
}

export const LanguageSettings: React.FC<LanguageSettingsProps> = ({
  variant = 'full',
  onLanguageChange
}) => {
  const { language, setLanguage, isLoading, isTranslating, t, isRTL } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [isChanging, setIsChanging] = useState(false);

  // Group languages by region
  const languagesByRegion = useMemo(() => ({
    asian: getAsianLanguages(),
    'middle-eastern': getLanguagesByRegion('middle-eastern'),
    european: getEuropeanLanguages(),
    african: getLanguagesByRegion('african'),
  }), []);

  // Filter languages based on search and region
  const filteredLanguages = useMemo(() => {
    let languages = SUPPORTED_LANGUAGES;

    if (selectedRegion !== 'all') {
      languages = languages.filter(lang => lang.region === selectedRegion);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      languages = languages.filter(lang => 
        lang.name.toLowerCase().includes(search) ||
        lang.nativeName.toLowerCase().includes(search) ||
        lang.code.toLowerCase().includes(search)
      );
    }

    return languages;
  }, [selectedRegion, searchTerm]);

  // Handle language selection
  const handleSelectLanguage = async (langCode: SupportedLanguage) => {
    if (langCode === language || isChanging) return;

    setIsChanging(true);
    try {
      await setLanguage(langCode);
      onLanguageChange?.(langCode);
    } catch (error) {
      console.error('Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  // Get current language info
  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === language);

  // Render language item
  const renderLanguageItem = (lang: LanguageInfo, showRegion: boolean = false) => {
    const isSelected = lang.code === language;
    const isRTLLang = lang.rtl;

    return (
      <button
        key={lang.code}
        onClick={() => handleSelectLanguage(lang.code)}
        disabled={isChanging || isTranslating}
        className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
          isSelected 
            ? 'bg-purple-100 border-2 border-purple-500' 
            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
        } ${(isChanging || isTranslating) ? 'opacity-50 cursor-not-allowed' : ''}`}
        dir={isRTLLang ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{lang.flag}</span>
          <div className="text-left">
            <div className="font-medium">{lang.nativeName}</div>
            <div className="text-sm text-gray-500">{lang.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRTLLang && (
            <Badge variant="outline" className="text-xs">RTL</Badge>
          )}
          {showRegion && (
            <Badge variant="secondary" className="text-xs capitalize">
              {lang.region}
            </Badge>
          )}
          {isSelected && (
            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
              <Check className="h-4 w-4 text-white" />
            </div>
          )}
        </div>
      </button>
    );
  };

  // Loading indicator
  const LoadingOverlay = () => (
    <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <span className="text-sm text-gray-600">Translating...</span>
      </div>
    </div>
  );

  // Compact variant - just a button that opens modal
  if (variant === 'compact') {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="text-lg">{currentLanguage?.flag}</span>
            <span>{currentLanguage?.nativeName}</span>
            {isTranslating && <Loader2 className="h-4 w-4 animate-spin" />}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5" />
              {t('settings', 'language')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 relative">
            {(isChanging || isTranslating) && <LoadingOverlay />}
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('common', 'search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Region tabs */}
            <Tabs value={selectedRegion} onValueChange={setSelectedRegion}>
              <TabsList className="grid h-auto grid-cols-3 sm:h-10 sm:grid-cols-5 w-full">
                <TabsTrigger value="all" className="text-xs sm:text-sm">{t('common', 'all')}</TabsTrigger>
                <TabsTrigger value="asian" className="text-xs sm:text-sm">Asian</TabsTrigger>
                <TabsTrigger value="middle-eastern" className="text-xs sm:text-sm">Middle East</TabsTrigger>
                <TabsTrigger value="european" className="text-xs sm:text-sm">European</TabsTrigger>
                <TabsTrigger value="african" className="text-xs sm:text-sm">African</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Language list */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {filteredLanguages.map(lang => renderLanguageItem(lang, selectedRegion === 'all'))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Full variant - complete settings panel
  return (
    <div className="space-y-6">
      {/* Current Language Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-purple-600" />
            {t('settings', 'language')}
          </CardTitle>
          <CardDescription>
            Choose your preferred language for the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg relative">
            {isTranslating && (
              <div className="absolute inset-0 bg-purple-50/80 flex items-center justify-center rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-3xl">{currentLanguage?.flag}</span>
              <div>
                <div className="font-semibold text-lg">{currentLanguage?.nativeName}</div>
                <div className="text-sm text-gray-600">{currentLanguage?.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentLanguage?.rtl && (
                <Badge variant="outline">RTL</Badge>
              )}
              <Badge className="bg-purple-600">
                <Check className="h-3 w-3 mr-1" />
                {t('common', 'selected')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Available Languages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 relative">
          {(isChanging || isTranslating) && <LoadingOverlay />}
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search languages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Region Tabs */}
          <Tabs value={selectedRegion} onValueChange={setSelectedRegion}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
              <TabsTrigger value="asian" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Asian</span>
                <span className="sm:hidden">Asia</span>
              </TabsTrigger>
              <TabsTrigger value="middle-eastern" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Middle East</span>
                <span className="sm:hidden">M.East</span>
              </TabsTrigger>
              <TabsTrigger value="european" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">European</span>
                <span className="sm:hidden">Europe</span>
              </TabsTrigger>
              <TabsTrigger value="african" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">African</span>
                <span className="sm:hidden">Africa</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedRegion} className="mt-4">
              <ScrollArea className="h-[400px]">
                <div className="grid gap-2 pr-4">
                  {filteredLanguages.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No languages found matching "{searchTerm}"
                    </div>
                  ) : (
                    filteredLanguages.map(lang => renderLanguageItem(lang, selectedRegion === 'all'))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Language stats */}
          <div className="flex flex-wrap gap-4 pt-4 border-t text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{SUPPORTED_LANGUAGES.length} languages supported</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 text-amber-500" />
              <span>{getAsianLanguages().length} Asian languages</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RTL Information */}
      {isRTL && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Languages className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium text-amber-900">Right-to-Left Language</h4>
                <p className="text-sm text-amber-700 mt-1">
                  You've selected a right-to-left language. The interface will automatically 
                  adjust to display content from right to left for optimal reading experience.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Quick language selector for header/navbar
export const QuickLanguageSelector: React.FC<{
  onLanguageChange?: (language: SupportedLanguage) => void;
}> = ({ onLanguageChange }) => {
  const { language, setLanguage, availableLanguages, isTranslating } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const currentLanguage = availableLanguages.find(l => l.code === language);

  const handleSelect = async (langCode: SupportedLanguage) => {
    if (langCode === language || isChanging) return;
    
    setIsChanging(true);
    try {
      await setLanguage(langCode);
      onLanguageChange?.(langCode);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  // Popular languages for quick access
  const popularLanguages = ['en', 'zh', 'ja', 'ko', 'es', 'ar', 'hi', 'vi', 'th'];
  const quickLanguages = availableLanguages.filter(l => popularLanguages.includes(l.code));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <span className="text-lg">{currentLanguage?.flag}</span>
          <span className="hidden sm:inline text-sm">{currentLanguage?.code.toUpperCase()}</span>
          {(isTranslating || isChanging) ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Select Language
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 relative">
          {(isChanging || isTranslating) && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                <span className="text-sm text-gray-600">Translating...</span>
              </div>
            </div>
          )}
          
          {/* Quick access languages */}
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-2">Popular Languages</h4>
            <div className="grid grid-cols-3 gap-2">
              {quickLanguages.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  disabled={isChanging || isTranslating}
                  className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                    lang.code === language
                      ? 'bg-purple-100 border-2 border-purple-500'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  } ${(isChanging || isTranslating) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="text-sm font-medium truncate">{lang.nativeName}</span>
                </button>
              ))}
            </div>
          </div>

          {/* View all link */}
          <div className="text-center pt-2 border-t">
            <LanguageSettings variant="compact" onLanguageChange={onLanguageChange} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LanguageSettings;
