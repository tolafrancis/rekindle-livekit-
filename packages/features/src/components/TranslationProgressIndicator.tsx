// =====================================================
// TRANSLATION PROGRESS INDICATOR
// Shows translation status on content cards
// =====================================================

import React, { useState, useEffect } from 'react';
import { Globe, Check, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Progress } from '@rekindle/ui/progress';
import { Badge } from '@rekindle/ui/badge';
import { Button } from '@rekindle/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@rekindle/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@rekindle/ui/collapsible';
import { 
  translationQueueService, 
  ContentTranslationStatus 
} from '../translationQueueService';
import { SUPPORTED_LANGUAGES, getLanguageInfo } from '../i18n';

interface TranslationProgressIndicatorProps {
  contentType: string;
  contentId: string;
  variant?: 'compact' | 'detailed' | 'badge';
  showLanguages?: boolean;
  className?: string;
  onStatusChange?: (status: ContentTranslationStatus | null) => void;
}

export function TranslationProgressIndicator({
  contentType,
  contentId,
  variant = 'compact',
  showLanguages = false,
  className = '',
  onStatusChange
}: TranslationProgressIndicatorProps) {
  const [status, setStatus] = useState<ContentTranslationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadStatus();
    
    // Subscribe to real-time updates
    const unsubscribe = translationQueueService.subscribeToContentStatus(
      contentType,
      contentId,
      (newStatus) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [contentType, contentId]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const { status: fetchedStatus } = await translationQueueService.getContentStatus(
        contentType,
        contentId
      );
      setStatus(fetchedStatus);
      onStatusChange?.(fetchedStatus);
    } catch (error) {
      console.error('Failed to load translation status:', error);
    } finally {
      setLoading(false);
    }
  };

  const progress = translationQueueService.getProgressPercentage(status);
  const isFullyTranslated = translationQueueService.isFullyTranslated(status);
  const statusLabel = translationQueueService.getStatusLabel(status);

  if (loading) {
    return (
      <div className={`flex items-center gap-1 text-muted-foreground ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {variant !== 'badge' && <span className="text-xs">Loading...</span>}
      </div>
    );
  }

  if (!status) {
    return null; // Not queued for translation
  }

  // Badge variant - minimal display
  if (variant === 'badge') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={isFullyTranslated ? 'default' : 'secondary'}
              className={`gap-1 ${className}`}
            >
              {isFullyTranslated ? (
                <Check className="h-3 w-3" />
              ) : status.pending_languages.length > 0 ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Globe className="h-3 w-3" />
              )}
              {status.completed_languages}/{status.total_languages}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{statusLabel}</p>
            {status.failed_languages.length > 0 && (
              <p className="text-destructive text-xs">
                Failed: {status.failed_languages.join(', ')}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                {isFullyTranslated ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : status.pending_languages.length > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : status.failed_languages.length > 0 ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">
                  {status.completed_languages}/{status.total_languages} languages
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">{statusLabel}</p>
                {status.completed_language_codes.length > 0 && (
                  <p className="text-xs">
                    Completed: {status.completed_language_codes.map(code => 
                      getLanguageInfo(code as any)?.nativeName || code
                    ).join(', ')}
                  </p>
                )}
                {status.pending_languages.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Pending: {status.pending_languages.map(code => 
                      getLanguageInfo(code as any)?.nativeName || code
                    ).join(', ')}
                  </p>
                )}
                {status.failed_languages.length > 0 && (
                  <p className="text-xs text-destructive">
                    Failed: {status.failed_languages.join(', ')}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Progress value={progress} className="h-1.5 w-16" />
      </div>
    );
  }

  // Detailed variant
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className={className}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isFullyTranslated ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : status.pending_languages.length > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : status.failed_languages.length > 0 ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Globe className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{statusLabel}</span>
          </div>
          
          {showLanguages && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2">
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Progress value={progress} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {progress}%
          </span>
        </div>

        {showLanguages && (
          <CollapsibleContent className="space-y-2">
            {/* Completed languages */}
            {status.completed_language_codes.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-600">Completed</p>
                <div className="flex flex-wrap gap-1">
                  {status.completed_language_codes.map(code => {
                    const lang = getLanguageInfo(code as any);
                    return (
                      <Badge key={code} variant="outline" className="text-xs bg-green-50">
                        {lang?.flag} {lang?.nativeName || code}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pending languages */}
            {status.pending_languages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-blue-600">In Progress</p>
                <div className="flex flex-wrap gap-1">
                  {status.pending_languages.map(code => {
                    const lang = getLanguageInfo(code as any);
                    return (
                      <Badge key={code} variant="outline" className="text-xs bg-blue-50">
                        {lang?.flag} {lang?.nativeName || code}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Failed languages */}
            {status.failed_languages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">Failed</p>
                <div className="flex flex-wrap gap-1">
                  {status.failed_languages.map(code => {
                    const lang = getLanguageInfo(code as any);
                    return (
                      <Badge key={code} variant="destructive" className="text-xs">
                        {lang?.flag} {lang?.nativeName || code}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

// Mini indicator for use in lists/grids
export function TranslationStatusBadge({
  contentType,
  contentId,
  className = ''
}: {
  contentType: string;
  contentId: string;
  className?: string;
}) {
  return (
    <TranslationProgressIndicator
      contentType={contentType}
      contentId={contentId}
      variant="badge"
      className={className}
    />
  );
}

export default TranslationProgressIndicator;
