// components/BulkTTSUploader.tsx
// Bulk TTS generation interface with Asian language priority

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { 
  Upload, Loader2, CheckCircle, XCircle, AlertCircle,
  Download, FileText, Globe, Zap
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_PRESETS,
  estimateTTSCost,
  parseCSV,
  type LanguageOption,
  type BulkUploadInput,
  type CSVRow,
  type BulkTTSJob
} from '@/types/bulkTTS';

interface BulkTTSUploaderProps {
  seriesId?: string;
  onComplete?: (jobId: string) => void;
}

export const BulkTTSUploader: React.FC<BulkTTSUploaderProps> = ({
  seriesId,
  onComplete
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  // State
  const [csvText, setCsvText] = useState('');
  const [jobName, setJobName] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('asian_focus');
  const [parsedSlides, setParsedSlides] = useState<CSVRow[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<BulkTTSJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Load user's default preference
  useEffect(() => {
    loadUserPreference();
  }, [user]);
  
  const loadUserPreference = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_language_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single();
      
      if (data && !error) {
        setSelectedLanguages(data.languages);
        setSelectedPreset(data.preference_name);
      } else {
        // Set default Asian Focus preset
        setSelectedLanguages(LANGUAGE_PRESETS.asian_focus.languages);
      }
    } catch (err) {
      console.error('Error loading preference:', err);
      setSelectedLanguages(LANGUAGE_PRESETS.asian_focus.languages);
    }
  };
  
  // Parse CSV when text changes
  useEffect(() => {
    if (csvText.trim()) {
      try {
        const slides = parseCSV(csvText);
        setParsedSlides(slides);
        setError(null);
      } catch (err) {
        setError(t('bulkTtsUploader', 'invalidCsv', 'Invalid CSV format. Please check your input.'));
        setParsedSlides([]);
      }
    } else {
      setParsedSlides([]);
    }
  }, [csvText]);
  
  // Apply preset
  const applyPreset = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = LANGUAGE_PRESETS[presetName];
    if (preset) {
      setSelectedLanguages(preset.languages);
    }
  };
  
  // Toggle language selection
  const toggleLanguage = (langCode: string) => {
    setSelectedLanguages(prev => {
      if (prev.includes(langCode)) {
        // Don't allow deselecting English
        if (langCode === 'en') {
          toast({
            title: t('bulkTtsUploader', 'englishRequired', 'English Required'),
            description: t('bulkTtsUploader', 'englishMustBeIncluded', 'English must always be included'),
            variant: 'destructive'
          });
          return prev;
        }
        return prev.filter(l => l !== langCode);
      } else {
        return [...prev, langCode];
      }
    });
    setSelectedPreset('custom');
  };
  
  // Select all languages in a group
  const selectAllInGroup = (group: 'asian' | 'other') => {
    const groupLangs = SUPPORTED_LANGUAGES
      .filter(l => l.group === group)
      .map(l => l.code);
    
    setSelectedLanguages(prev => {
      const newSelection = new Set([...prev, ...groupLangs]);
      return Array.from(newSelection);
    });
  };
  
  // Calculate estimate
  const totalCharacters = parsedSlides.reduce((sum, slide) => sum + slide.text.length, 0);
  const estimatedCost = estimateTTSCost(totalCharacters, selectedLanguages.length);
  const totalGenerations = parsedSlides.length * selectedLanguages.length;
  
  // Start bulk generation
  const handleGenerate = async () => {
    if (!user) {
      toast({ title: t('bulkTtsUploader', 'error', 'Error'), description: t('bulkTtsUploader', 'mustBeLoggedIn', 'You must be logged in'), variant: 'destructive' });
      return;
    }

    if (parsedSlides.length === 0) {
      toast({ title: t('bulkTtsUploader', 'error', 'Error'), description: t('bulkTtsUploader', 'noSlidesToProcess', 'No slides to process'), variant: 'destructive' });
      return;
    }

    if (selectedLanguages.length === 0) {
      toast({ title: t('bulkTtsUploader', 'error', 'Error'), description: t('bulkTtsUploader', 'selectAtLeastOne', 'Select at least one language'), variant: 'destructive' });
      return;
    }
    
    if (!jobName.trim()) {
      setJobName(`Bulk TTS - ${new Date().toLocaleDateString()}`);
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // Create job
      const { data: job, error: jobError } = await supabase
        .from('bulk_tts_jobs')
        .insert({
          user_id: user.id,
          series_id: seriesId,
          job_name: jobName.trim() || `Bulk TTS - ${new Date().toLocaleDateString()}`,
          total_slides: parsedSlides.length,
          total_languages: selectedLanguages.length,
          total_generations: totalGenerations,
          languages: selectedLanguages,
          slides_data: parsedSlides,
          estimated_cost: estimatedCost,
          status: 'pending'
        })
        .select()
        .single();
      
      if (jobError) throw jobError;
      
      setCurrentJob(job);
      
      // Start processing (call Edge Function or process in batches)
      await processBulkTTS(job.id);
      
      toast({
        title: t('bulkTtsUploader', 'generationStarted', 'Generation Started'),
        description: t('bulkTtsUploader', 'generatingXFiles', 'Generating {count} audio files...').replace('{count}', String(totalGenerations))
      });
      
      if (onComplete) {
        onComplete(job.id);
      }
      
    } catch (err: any) {
      console.error('Error starting bulk generation:', err);
      setError(err.message || t('bulkTtsUploader', 'failedToStart', 'Failed to start generation'));
      toast({
        title: t('bulkTtsUploader', 'error', 'Error'),
        description: err.message || t('bulkTtsUploader', 'failedToStart', 'Failed to start generation'),
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Kick off the background worker (process-bulk-tts edge function).
  const processBulkTTS = async (jobId: string) => {
    // Mark the job processing.
    await supabase
      .from('bulk_tts_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', jobId);

    // NOTE: supabase.functions.invoke returns failures in `error` — it does NOT
    // throw. The previous version treated a failed/missing edge function by
    // calling an empty browser stub and returning normally, so the UI showed
    // "Generation Started" while nothing was produced and the job sat in
    // 'processing' forever. Treat `error` (and a logical success:false payload)
    // as a real failure: mark the job failed and throw so the caller surfaces it.
    const { data, error } = await supabase.functions.invoke('process-bulk-tts', {
      body: { job_id: jobId }
    });

    const failJob = async (message: string) => {
      await supabase
        .from('bulk_tts_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', jobId);
      throw new Error(message);
    };

    if (error) {
      console.error('process-bulk-tts invocation failed:', error);
      await failJob(
        error.message ||
        t('bulkTtsUploader', 'workerNotDeployed',
          'Bulk TTS worker failed to start. Confirm the process-bulk-tts edge function is deployed.')
      );
    }

    if (data && (data as any).success === false) {
      await failJob((data as any).error || t('bulkTtsUploader', 'workerFailed', 'Bulk TTS worker reported a failure.'));
    }
    // Success => the worker accepted the job; the JobMonitor drives live progress.
  };

  // Group languages by category
  const asianLanguages = SUPPORTED_LANGUAGES.filter(l => l.group === 'asian');
  const otherLanguages = SUPPORTED_LANGUAGES.filter(l => l.group === 'other');
  
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-6 w-6" />
          {t('bulkTtsUploader', 'title', 'Bulk TTS Generation')}
        </CardTitle>
        <CardDescription>
          {t('bulkTtsUploader', 'subtitle', 'Upload multiple slides and generate audio in multiple languages')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Quick Presets */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('bulkTtsUploader', 'quickPresets', 'Quick Presets')}</label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(LANGUAGE_PRESETS).map(([key, preset]) => (
              <Button
                key={key}
                variant={selectedPreset === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyPreset(key)}
              >
                <Zap className="h-3 w-3 mr-1" />
                {preset.name}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={loadUserPreference}
            >
              {t('bulkTtsUploader', 'lastUsed', 'Last Used')}
            </Button>
          </div>
        </div>
        
        {/* Job Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('bulkTtsUploader', 'jobNameOptional', 'Job Name (optional)')}</label>
          <Input
            placeholder={`Bulk TTS - ${new Date().toLocaleDateString()}`}
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
        </div>
        
        {/* CSV Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t('bulkTtsUploader', 'uploadCsvLabel', 'Upload CSV or Paste Text')}</label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const template = 'slide_id,day_number,text\n26_slide0,1,"Today we explore faith..."\n26_slide1,1,"Scripture reading: Romans 8:14-17"';
                navigator.clipboard.writeText(template);
                toast({ title: t('bulkTtsUploader', 'templateCopied', 'Template copied!'), description: t('bulkTtsUploader', 'pasteIntoSpreadsheet', 'Paste into a spreadsheet') });
              }}
            >
              <Download className="h-3 w-3 mr-1" />
              {t('bulkTtsUploader', 'csvTemplate', 'CSV Template')}
            </Button>
          </div>
          <Textarea
            placeholder="slide_id,day_number,text&#10;26_slide0,1,&quot;Today we explore faith...&quot;&#10;26_slide1,1,&quot;Scripture reading: Romans...&quot;"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          {parsedSlides.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              {t('bulkTtsUploader', 'slidesParsed', '{count} slides parsed successfully').replace('{count}', String(parsedSlides.length))}
            </div>
          )}
        </div>
        
        {/* Language Selection */}
        <div className="space-y-4">
          {/* Asian Languages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                🌏 {t('bulkTtsUploader', 'asianLanguages', 'Asian Languages (Priority)')}
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectAllInGroup('asian')}
              >
                {t('bulkTtsUploader', 'selectAll', 'Select All')}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {asianLanguages.map(lang => (
                <Button
                  key={lang.code}
                  variant={selectedLanguages.includes(lang.code) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleLanguage(lang.code)}
                  className="justify-start"
                >
                  <span className="mr-2">{lang.flag}</span>
                  {lang.name}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Other Languages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                🌍 {t('bulkTtsUploader', 'otherLanguages', 'Other Languages')}
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectAllInGroup('other')}
              >
                {t('bulkTtsUploader', 'selectAll', 'Select All')}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {otherLanguages.map(lang => (
                <Button
                  key={lang.code}
                  variant={selectedLanguages.includes(lang.code) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleLanguage(lang.code)}
                  className="justify-start"
                  disabled={lang.code === 'en'} // English always selected
                >
                  <span className="mr-2">{lang.flag}</span>
                  {lang.name}
                  {lang.code === 'en' && <span className="ml-auto text-xs">{t('bulkTtsUploader', 'requiredSuffix', '(Required)')}</span>}
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Summary */}
        {parsedSlides.length > 0 && selectedLanguages.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <div><strong>{selectedLanguages.length}</strong> {t('bulkTtsUploader', 'languagesSelected', 'languages selected')}</div>
                <div><strong>{parsedSlides.length}</strong> {t('bulkTtsUploader', 'slidesToProcess', 'slides to process')}</div>
                <div><strong>{totalGenerations}</strong> {t('bulkTtsUploader', 'totalFilesToGenerate', 'total audio files to generate')}</div>
                <div>{t('bulkTtsUploader', 'estimatedCost', 'Estimated cost:')} <strong>${estimatedCost.toFixed(2)}</strong></div>
                <div>{t('bulkTtsUploader', 'estimatedTime', 'Estimated time:')} <strong>~{Math.ceil(totalGenerations / 10)} {t('bulkTtsUploader', 'minutes', 'minutes')}</strong></div>
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setCsvText('');
              setParsedSlides([]);
              setJobName('');
            }}
          >
            {t('bulkTtsUploader', 'clear', 'Clear')}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || parsedSlides.length === 0 || selectedLanguages.length === 0}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('bulkTtsUploader', 'generating', 'Generating...')}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {t('bulkTtsUploader', 'generateTts', 'Generate TTS ({count} files)').replace('{count}', String(totalGenerations))}
              </>
            )}
          </Button>
        </div>
        
        {/* Job Progress (if active) */}
        {currentJob && (
          <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{currentJob.job_name}</span>
              <Badge>{currentJob.status}</Badge>
            </div>
            <Progress 
              value={(currentJob.completed_generations / currentJob.total_generations) * 100}
            />
            <div className="text-sm text-muted-foreground">
              {currentJob.completed_generations} / {currentJob.total_generations} {t('bulkTtsUploader', 'completed', 'completed')}
              {currentJob.failed_generations > 0 && (
                <span className="text-destructive ml-2">
                  {t('bulkTtsUploader', 'xFailed', '({count} failed)').replace('{count}', String(currentJob.failed_generations))}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};