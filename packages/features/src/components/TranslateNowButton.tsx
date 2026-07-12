// =====================================================
// TRANSLATE NOW BUTTON
// Button component for triggering content translation
// =====================================================

import React, { useState } from 'react';
import { Globe, Loader2, Check, ChevronDown, Languages } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@rekindle/ui/dialog';
import { Checkbox } from '@rekindle/ui/checkbox';
import { Label } from '@rekindle/ui/label';
import { ScrollArea } from '@rekindle/ui/scroll-area';
import { Badge } from '@rekindle/ui/badge';
import { useToast } from '@rekindle/ui/use-toast';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { 
  translationQueueService, 
  ASIAN_LANGUAGE_CODES 
} from '../translationQueueService';
import { 
  SUPPORTED_LANGUAGES, 
  getAsianLanguages, 
  getLanguagesByRegion,
  SupportedLanguage 
} from '../i18n';

interface TranslateNowButtonProps {
  contentType: string;
  contentId: string;
  ministryId?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showDropdown?: boolean;
  onTranslationQueued?: (languages: string[]) => void;
  className?: string;
  disabled?: boolean;
}

export function TranslateNowButton({
  contentType,
  contentId,
  ministryId,
  variant = 'outline',
  size = 'sm',
  showDropdown = true,
  onTranslationQueued,
  className = '',
  disabled = false
}: TranslateNowButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  const asianLanguages = getAsianLanguages();
  const europeanLanguages = getLanguagesByRegion('european').filter(l => l.code !== 'en');
  const africanLanguages = getLanguagesByRegion('african');

  const handleQuickTranslate = async () => {
    try {
      setLoading(true);
      const result = await translationQueueService.queueForAsianLanguages(
        contentType,
        contentId,
        {
          createdBy: user?.id,
          ministryId,
          priority: 7
        }
      );

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);

      toast(result.queued === 0
        ? {
            title: t('translateNowButton', 'alreadyTranslated', 'Already Translated'),
            description: t('translateNowButton', 'alreadyTranslatedDesc', 'This content is already translated or in progress for those languages — nothing new to queue.')
          }
        : {
            title: t('translateNowButton', 'translationQueued', 'Translation Queued'),
            description: t('translateNowButton', 'queuedAsianDesc', 'Content queued for translation to {count} Asian languages.').replace('{count}', String(result.queued))
          });

      onTranslationQueued?.(result.languages);
    } catch (error: any) {
      toast({
        title: t('translateNowButton', 'translationFailed', 'Translation Failed'),
        description: error.message || t('translateNowButton', 'failedQueue', 'Failed to queue translation'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomTranslate = async () => {
    if (selectedLanguages.length === 0) {
      toast({
        title: t('translateNowButton', 'noLanguagesSelected', 'No Languages Selected'),
        description: t('translateNowButton', 'selectAtLeastOne', 'Please select at least one language to translate to.'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);
      const result = await translationQueueService.queueForLanguages(
        contentType,
        contentId,
        selectedLanguages,
        {
          createdBy: user?.id,
          ministryId,
          priority: 8
        }
      );

      setShowDialog(false);
      setSelectedLanguages([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);

      toast(result.queued === 0
        ? {
            title: t('translateNowButton', 'alreadyTranslated', 'Already Translated'),
            description: t('translateNowButton', 'alreadyTranslatedDesc', 'This content is already translated or in progress for those languages — nothing new to queue.')
          }
        : {
            title: t('translateNowButton', 'translationQueued', 'Translation Queued'),
            description: t('translateNowButton', 'queuedLangsDesc', 'Content queued for translation to {count} languages.').replace('{count}', String(result.queued))
          });

      onTranslationQueued?.(result.languages);
    } catch (error: any) {
      toast({
        title: t('translateNowButton', 'translationFailed', 'Translation Failed'),
        description: error.message || t('translateNowButton', 'failedQueue', 'Failed to queue translation'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev => 
      prev.includes(code) 
        ? prev.filter(l => l !== code)
        : [...prev, code]
    );
  };

  const selectAllAsian = () => {
    setSelectedLanguages(prev => {
      const asianCodes = asianLanguages.map(l => l.code);
      const hasAll = asianCodes.every(c => prev.includes(c));
      if (hasAll) {
        return prev.filter(c => !asianCodes.includes(c as SupportedLanguage));
      }
      return [...new Set([...prev, ...asianCodes])];
    });
  };

  const selectAllEuropean = () => {
    setSelectedLanguages(prev => {
      const euroCodes = europeanLanguages.map(l => l.code);
      const hasAll = euroCodes.every(c => prev.includes(c));
      if (hasAll) {
        return prev.filter(c => !euroCodes.includes(c as SupportedLanguage));
      }
      return [...new Set([...prev, ...euroCodes])];
    });
  };

  if (!showDropdown) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={handleQuickTranslate}
        disabled={disabled || loading}
        className={className}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : success ? (
          <Check className="h-4 w-4 mr-2 text-green-500" />
        ) : (
          <Globe className="h-4 w-4 mr-2" />
        )}
        {t('translateNowButton', 'translateNow', 'Translate Now')}
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={disabled || loading}
            className={className}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : success ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Globe className="h-4 w-4 mr-2" />
            )}
            {t('translateNowButton', 'translate', 'Translate')}
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t('translateNowButton', 'translationOptions', 'Translation Options')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleQuickTranslate}>
            <Languages className="h-4 w-4 mr-2" />
            {t('translateNowButton', 'allAsianLanguages', 'All Asian Languages')}
            <Badge variant="secondary" className="ml-auto text-xs">
              {ASIAN_LANGUAGE_CODES.length}
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDialog(true)}>
            <Globe className="h-4 w-4 mr-2" />
            {t('translateNowButton', 'selectLanguagesEllipsis', 'Select Languages...')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('translateNowButton', 'selectLanguages', 'Select Languages')}</DialogTitle>
            <DialogDescription>
              {t('translateNowButton', 'chooseLanguagesDesc', 'Choose which languages to translate this content to.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={selectAllAsian}
                className="flex-1"
              >
                {asianLanguages.every(l => selectedLanguages.includes(l.code))
                  ? t('translateNowButton', 'deselectAllAsian', 'Deselect All Asian')
                  : t('translateNowButton', 'selectAllAsian', 'Select All Asian')}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={selectAllEuropean}
                className="flex-1"
              >
                {europeanLanguages.every(l => selectedLanguages.includes(l.code))
                  ? t('translateNowButton', 'deselectAllEuropean', 'Deselect All European')
                  : t('translateNowButton', 'selectAllEuropean', 'Select All European')}
              </Button>
            </div>

            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {/* Asian Languages */}
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    {t('translateNowButton', 'asianLanguages', 'Asian Languages')}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {asianLanguages.map(lang => (
                      <div key={lang.code} className="flex items-center space-x-2">
                        <Checkbox
                          id={`lang-${lang.code}`}
                          checked={selectedLanguages.includes(lang.code)}
                          onCheckedChange={() => toggleLanguage(lang.code)}
                        />
                        <Label 
                          htmlFor={`lang-${lang.code}`}
                          className="text-sm cursor-pointer flex items-center gap-1"
                        >
                          <span>{lang.flag}</span>
                          <span className="truncate">{lang.nativeName}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* European Languages */}
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    {t('translateNowButton', 'europeanLanguages', 'European Languages')}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {europeanLanguages.map(lang => (
                      <div key={lang.code} className="flex items-center space-x-2">
                        <Checkbox
                          id={`lang-${lang.code}`}
                          checked={selectedLanguages.includes(lang.code)}
                          onCheckedChange={() => toggleLanguage(lang.code)}
                        />
                        <Label 
                          htmlFor={`lang-${lang.code}`}
                          className="text-sm cursor-pointer flex items-center gap-1"
                        >
                          <span>{lang.flag}</span>
                          <span className="truncate">{lang.nativeName}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* African Languages */}
                {africanLanguages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                      {t('translateNowButton', 'africanLanguages', 'African Languages')}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {africanLanguages.map(lang => (
                        <div key={lang.code} className="flex items-center space-x-2">
                          <Checkbox
                            id={`lang-${lang.code}`}
                            checked={selectedLanguages.includes(lang.code)}
                            onCheckedChange={() => toggleLanguage(lang.code)}
                          />
                          <Label 
                            htmlFor={`lang-${lang.code}`}
                            className="text-sm cursor-pointer flex items-center gap-1"
                          >
                            <span>{lang.flag}</span>
                            <span className="truncate">{lang.nativeName}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {selectedLanguages.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {(selectedLanguages.length !== 1
                  ? t('translateNowButton', 'languagesSelectedPlural', '{count} languages selected')
                  : t('translateNowButton', 'languageSelectedSingular', '{count} language selected')
                ).replace('{count}', String(selectedLanguages.length))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('translateNowButton', 'cancel', 'Cancel')}
            </Button>
            <Button 
              onClick={handleCustomTranslate} 
              disabled={loading || selectedLanguages.length === 0}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {t('translateNowButton', 'translateCount', 'Translate ({count})').replace('{count}', String(selectedLanguages.length))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Simplified button for inline use
export function QuickTranslateButton({
  contentType,
  contentId,
  ministryId,
  size = 'icon',
  className = ''
}: {
  contentType: string;
  contentId: string;
  ministryId?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    try {
      setLoading(true);
      await translationQueueService.queueForAsianLanguages(
        contentType,
        contentId,
        { createdBy: user?.id, ministryId }
      );
      toast({
        title: t('translateNowButton', 'queuedForTranslation', 'Queued for Translation'),
        description: t('translateNowButton', 'willTranslateAsian', 'Content will be translated to all Asian languages.')
      });
    } catch (error: any) {
      toast({
        title: t('translateNowButton', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleTranslate}
      disabled={loading}
      className={className}
      title={t('translateNowButton', 'translateToAllAsian', 'Translate to all Asian languages')}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Globe className="h-4 w-4" />
      )}
    </Button>
  );
}

export default TranslateNowButton;
