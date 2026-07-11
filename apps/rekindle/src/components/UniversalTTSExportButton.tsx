// components/UniversalTTSExportButton.tsx
// Universal export button for all content types: devotionals, prayers, declarations, affirmations, daily devotionals

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Loader2, FileText, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

type ContentType = 
  | 'devotional_series'
  | 'daily_devotional' 
  | 'prayer_series'
  | 'prayer_topic'
  | 'prayer_watch'
  | 'declaration'
  | 'affirmation';

interface UniversalTTSExportButtonProps {
  contentType: ContentType;
  contentId: string;
  contentTitle?: string;
  variant?: 'button' | 'dropdown-item';
  size?: 'sm' | 'default' | 'lg';
}

export const UniversalTTSExportButton: React.FC<UniversalTTSExportButtonProps> = ({ 
  contentType,
  contentId,
  contentTitle,
  variant = 'button',
  size = 'sm'
}) => {
  const { t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);

  const getTableName = (type: ContentType): string => {
    const tableMap: Record<ContentType, string> = {
      'devotional_series': 'devotional_series_days',
      'daily_devotional': 'daily_devotionals',
      'prayer_series': 'prayer_series_days',
      'prayer_topic': 'prayer_topics',
      'prayer_watch': 'prayer_watch_entries',
      'declaration': 'declarations',
      'affirmation': 'affirmations'
    };
    return tableMap[type];
  };
  
  const getFilterField = (type: ContentType): string => {
    if (type === 'devotional_series' || type === 'prayer_series') {
      return 'series_id';
    }
    return 'id';
  };
  
  const getContentFields = (type: ContentType): string[] => {
    // Different content types have different field names
    const fieldMap: Record<ContentType, string[]> = {
      'devotional_series': [
        'id', 'day_number', 'title', 'subtitle', 
        'scripture_reference', 'scripture_text', 'scripture_references',
        'main_content', 'content', 'devotional_text', 'body',
        'introduction', 'reflection', 'reflection_questions',
        'guided_prayer', 'prayer', 'action_step', 'action_steps',
        'additional_thoughts'
      ],
      'daily_devotional': [
        'id', 'date', 'title', 'subtitle',
        'scripture_reference', 'scripture_text',
        'main_content', 'content', 'devotional_text',
        'reflection', 'reflection_questions',
        'prayer', 'action_step'
      ],
      'prayer_series': [
        'id', 'day_number', 'title',
        'scripture_reference', 'scripture_text',
        'content', 'prayer_text', 'guided_prayer',
        'reflection_questions'
      ],
      'prayer_topic': [
        'id', 'title', 'description',
        'scripture_references', 'prayer_points',
        'guided_prayer', 'content'
      ],
      'prayer_watch': [
        'id', 'title', 'time_period',
        'scripture_focus', 'prayer_focus',
        'guided_prayers', 'content'
      ],
      'declaration': [
        'id', 'title', 'category',
        'declaration_text', 'scripture_reference',
        'content', 'affirmation_text'
      ],
      'affirmation': [
        'id', 'title', 'category',
        'affirmation_text', 'scripture_reference',
        'content', 'reflection'
      ]
    };
    
    return fieldMap[type] || ['id', 'title', 'content'];
  };
  
  const extractTextFromSlide = (slide: any, type: ContentType): string => {
    const parts: string[] = [];
    
    // Title
    if (slide.title) parts.push(slide.title);
    if (slide.subtitle) parts.push(slide.subtitle);
    
    // Scripture
    if (slide.scripture_reference) parts.push(slide.scripture_reference);
    if (slide.scripture_text) parts.push(slide.scripture_text);
    
    // Handle scripture_references (could be JSON)
    if (slide.scripture_references) {
      try {
        const refs = typeof slide.scripture_references === 'string' 
          ? JSON.parse(slide.scripture_references)
          : slide.scripture_references;
        
        if (Array.isArray(refs)) {
          refs.forEach((ref: any) => {
            if (ref.reference) parts.push(ref.reference);
            if (ref.text) parts.push(ref.text);
          });
        }
      } catch (e) {
        // If not JSON, treat as string
        if (typeof slide.scripture_references === 'string') {
          parts.push(slide.scripture_references);
        }
      }
    }
    
    // Main content (try multiple field names)
    const contentField = slide.main_content || slide.content || slide.devotional_text || 
                        slide.body || slide.prayer_text || slide.declaration_text ||
                        slide.affirmation_text || slide.description || '';
    if (contentField) parts.push(contentField);
    
    // Introduction
    if (slide.introduction) parts.push(slide.introduction);
    
    // Reflection
    if (slide.reflection) parts.push(slide.reflection);
    
    // Reflection questions (could be array or string)
    if (slide.reflection_questions) {
      if (Array.isArray(slide.reflection_questions)) {
        parts.push(slide.reflection_questions.join(' '));
      } else if (typeof slide.reflection_questions === 'string') {
        try {
          const parsed = JSON.parse(slide.reflection_questions);
          if (Array.isArray(parsed)) {
            parts.push(parsed.join(' '));
          } else {
            parts.push(slide.reflection_questions);
          }
        } catch {
          parts.push(slide.reflection_questions);
        }
      }
    }
    
    // Prayer
    if (slide.guided_prayer) parts.push(slide.guided_prayer);
    if (slide.prayer) parts.push(slide.prayer);
    
    // Prayer points
    if (slide.prayer_points) {
      if (Array.isArray(slide.prayer_points)) {
        parts.push(slide.prayer_points.join(' '));
      } else if (typeof slide.prayer_points === 'string') {
        parts.push(slide.prayer_points);
      }
    }
    
    // Action steps
    if (slide.action_step) parts.push(slide.action_step);
    if (slide.action_steps) {
      if (Array.isArray(slide.action_steps)) {
        parts.push(slide.action_steps.join(' '));
      } else if (typeof slide.action_steps === 'string') {
        parts.push(slide.action_steps);
      }
    }
    
    // Additional thoughts
    if (slide.additional_thoughts) parts.push(slide.additional_thoughts);
    
    // Prayer focus (for prayer watch)
    if (slide.prayer_focus) parts.push(slide.prayer_focus);
    if (slide.scripture_focus) parts.push(slide.scripture_focus);
    
    return parts.filter(Boolean).join(' ').trim();
  };
  
  const exportForTTS = async () => {
    setIsExporting(true);
    
    try {
      const tableName = getTableName(contentType);
      const filterField = getFilterField(contentType);
      const fields = getContentFields(contentType);
      
      // Build query
      let query = supabase
        .from(tableName)
        .select(fields.join(', '));
      
      // Apply filter based on content type
      if (contentType === 'devotional_series' || contentType === 'prayer_series') {
        // For series, get all days
        query = query.eq('series_id', contentId).order('day_number', { ascending: true });
      } else if (contentType === 'daily_devotional') {
        // For daily devotional, could be single or range
        query = query.eq('id', contentId);
      } else {
        // For topics, declarations, etc.
        query = query.eq('id', contentId);
      }
      
      const { data: items, error } = await query;
      
      if (error) throw error;
      
      if (!items || items.length === 0) {
        toast({
          title: t('universalTtsExportButton', 'noContentFoundTitle', 'No Content Found'),
          description: t('universalTtsExportButton', 'noContentFoundDesc', 'No slides or content found to export.'),
          variant: 'destructive'
        });
        return;
      }
      
      // Build CSV
      let csv = 'slide_id,day_number,text\n';
      
      items.forEach((item, index) => {
        const slideId = item.id;
        const dayNumber = item.day_number || item.date || (index + 1);
        const text = extractTextFromSlide(item, contentType);
        
        if (text) {
          // Escape quotes in text
          const escapedText = text.replace(/"/g, '""');
          csv += `"${slideId}","${dayNumber}","${escapedText}"\n`;
        }
      });
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const filename = contentTitle 
        ? `${contentTitle.replace(/[^a-z0-9]/gi, '_')}_tts_export.csv`
        : `${contentType}_${contentId}_tts_export.csv`;
      
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: t('universalTtsExportButton', 'csvExportedTitle', 'CSV Exported!'),
        description: t('universalTtsExportButton', 'csvExportedDesc', '{count} items exported. Use this in Bulk TTS Generator.').replace('{count}', String(items.length)),
      });
      
    } catch (err: any) {
      console.error('Error exporting for TTS:', err);
      toast({
        title: t('universalTtsExportButton', 'exportFailedTitle', 'Export Failed'),
        description: err.message || t('universalTtsExportButton', 'exportFailedDesc', 'Failed to export content'),
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  // Render as button
  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={exportForTTS}
        disabled={isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('universalTtsExportButton', 'exporting', 'Exporting...')}
          </>
        ) : (
          <>
            <Globe className="h-4 w-4 mr-2" />
            {t('universalTtsExportButton', 'exportForTts', 'Export for TTS')}
          </>
        )}
      </Button>
    );
  }
  
  // Render as dropdown menu item
  return (
    <DropdownMenuItem onClick={exportForTTS} disabled={isExporting}>
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t('universalTtsExportButton', 'exporting', 'Exporting...')}
        </>
      ) : (
        <>
          <Globe className="h-4 w-4 mr-2" />
          {t('universalTtsExportButton', 'exportForTts', 'Export for TTS')}
        </>
      )}
    </DropdownMenuItem>
  );
};

// Convenience wrapper for dropdown menus
export const TTSExportDropdown: React.FC<{
  contentType: ContentType;
  contentId: string;
  contentTitle?: string;
  triggerLabel?: string;
  children?: React.ReactNode;
}> = ({
  contentType,
  contentId,
  contentTitle,
  triggerLabel,
  children
}) => {
  const { t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel ?? t('universalTtsExportButton', 'actions', 'Actions')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('universalTtsExportButton', 'actions', 'Actions')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {children}
        
        <UniversalTTSExportButton
          contentType={contentType}
          contentId={contentId}
          contentTitle={contentTitle}
          variant="dropdown-item"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};