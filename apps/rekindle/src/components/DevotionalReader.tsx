import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageFallbackMessage } from './LanguageFallbackMessage';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import { toast } from './ui/use-toast';
import {
  ChevronLeft, ChevronRight, BookmarkPlus, BookmarkCheck, Share2, 
  Heart, Volume2, Video, MessageSquare, CheckCircle, Clock,
  Pause, Play, X, Maximize2, Minimize2
} from 'lucide-react';
import { canNativeShare } from '@/lib/webShare';

interface DevotionalEntry {
  id: string;
  series_id: string;
  day_number: number;
  title: string;
  scripture_reference?: string;
  scripture_text?: string;
  bible_passage_reference?: string;
  bible_passage_text?: string;
  content: string;
  reflection_questions?: string[];
  prayer?: string;
  audio_url?: string;
  video_url?: string;
  estimated_reading_time: number;
  language?: string;
  translations?: any;
}

interface DevotionalReaderProps {
  entry: DevotionalEntry;
  seriesTitle: string;
  totalDays: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  onComplete: () => void;
  onClose: () => void;
  isCompleted?: boolean;
  isBookmarked?: boolean;
}

export const DevotionalReader: React.FC<DevotionalReaderProps> = ({
  entry,
  seriesTitle,
  totalDays,
  onNavigate,
  onComplete,
  onClose,
  isCompleted = false,
  isBookmarked = false
}) => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [completed, setCompleted] = useState(isCompleted);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [readingTime, setReadingTime] = useState(0);
  const [liked, setLiked] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Get localized content
  const localizedEntry = entry.translations?.[language] ? {
    ...entry,
    title: entry.translations[language].title || entry.title,
    content: entry.translations[language].content || entry.content,
    scripture_text: entry.translations[language].scripture_text || entry.scripture_text,
    bible_passage_text: entry.translations[language].bible_passage_text || entry.bible_passage_text,
    prayer: entry.translations[language].prayer || entry.prayer,
    reflection_questions: entry.translations[language].reflection_questions || entry.reflection_questions,
  } : entry;

  const showLanguageFallback = entry.language && entry.language !== language;

  useEffect(() => {
    // Start reading timer
    timerRef.current = setInterval(() => {
      setReadingTime(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [entry.id]);

  useEffect(() => {
    loadUserData();
  }, [entry.id, user]);

  const loadUserData = async () => {
    if (!user?.id) return;

    try {
      // Load bookmark status
      const { data: bookmark } = await supabase
        .from('devotional_bookmarks')
        .select('*')
        .eq('user_id', user.id)
        .eq('entry_id', entry.id)
        .maybeSingle();

      if (bookmark) {
        setBookmarked(true);
        setNotes(bookmark.notes || '');
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  };

  const handleToggleBookmark = async () => {
    if (!user?.id) {
      toast({ title: t('auth', 'signInRequired'), description: t('devotionals', 'signInToBookmark'), variant: 'destructive' });
      return;
    }

    try {
      if (bookmarked) {
        // Remove bookmark
        await supabase
          .from('devotional_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('entry_id', entry.id);

        setBookmarked(false);
        toast({ title: t('devotionals', 'bookmarkRemoved') });
      } else {
        // Add bookmark
        await supabase
          .from('devotional_bookmarks')
          .insert({
            user_id: user.id,
            series_id: entry.series_id,
            entry_id: entry.id,
            notes: notes
          });

        setBookmarked(true);
        toast({ title: t('common', 'saved'), description: t('devotionals', 'bookmarkAdded') });
      }
    } catch (err: any) {
      console.error('Error toggling bookmark:', err);
      toast({ title: t('errors', 'generic'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveNotes = async () => {
    if (!user?.id || !bookmarked) return;

    try {
      await supabase
        .from('devotional_bookmarks')
        .update({ notes })
        .eq('user_id', user.id)
        .eq('entry_id', entry.id);

      toast({ title: t('devotionals', 'notesSaved') });
    } catch (err: any) {
      console.error('Error saving notes:', err);
      toast({ title: t('errors', 'generic'), description: err.message, variant: 'destructive' });
    }
  };

  const handleComplete = async () => {
    setCompleted(true);
    onComplete();
    toast({ 
      title: t('devotionals', 'dayComplete'), 
      description: `${t('devotionals', 'completedDay')} ${entry.day_number} ${t('devotionals', 'of')} ${seriesTitle}` 
    });
  };

  const handleShare = async () => {
    const shareData = {
      title: `${seriesTitle} - ${t('devotionals', 'day')} ${entry.day_number}`,
      text: `${localizedEntry.title}\n\n${localizedEntry.scripture_reference || ''}\n\n${t('devotionals', 'joinJourney')}`,
      url: window.location.href
    };

    try {
      if (canNativeShare()) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        toast({ title: t('common', 'copied') });
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-white overflow-y-auto overflow-x-hidden' : ''}`}>
      {showLanguageFallback && (
        <LanguageFallbackMessage
          contentLanguage={entry.language || 'en'}
          variant="banner"
        />
      )}
      
      <div className={`${fullscreen ? 'max-w-4xl mx-auto' : ''} space-y-6 p-4 sm:p-6`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
              <X className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-gray-600 truncate">{seriesTitle}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge>{t('devotionals', 'day')} {entry.day_number} {t('devotionals', 'of')} {totalDays}</Badge>
                {completed && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {t('devotionals', 'completed')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setFullscreen(!fullscreen)}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleToggleBookmark}>
              {bookmarked ? (
                <BookmarkCheck className="h-4 w-4 text-purple-600" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Reading Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {localizedEntry.estimated_reading_time} {t('devotionals', 'minRead')}
          </span>
          <span>•</span>
          <span>{t('devotionals', 'time')}: {formatTime(readingTime)}</span>
        </div>

        {/* Main Content */}
        <Card>
          <CardContent className="p-6 md:p-8">
            <h1 className="text-3xl font-serif font-bold mb-6">{localizedEntry.title}</h1>

            {/* Scripture */}
            {localizedEntry.scripture_reference && (
              <div className="bg-purple-50 border-l-4 border-purple-500 p-6 mb-6 rounded-r-lg">
                <p className="font-semibold text-purple-900 mb-2">{localizedEntry.scripture_reference}</p>
                {localizedEntry.scripture_text && (
                  <p className="text-purple-800 italic leading-relaxed">
                    "{localizedEntry.scripture_text}"
                  </p>
                )}
              </div>
            )}

            {/* Bible passage (secondary, may be long → scrolls) */}
            {(localizedEntry.bible_passage_reference || localizedEntry.bible_passage_text) && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-6 mb-6 rounded-r-lg">
                {localizedEntry.bible_passage_reference && (
                  <p className="font-semibold text-amber-900 mb-2">{localizedEntry.bible_passage_reference}</p>
                )}
                {localizedEntry.bible_passage_text && (
                  <div className="max-h-72 overflow-y-auto pr-2">
                    <p className="text-amber-900 leading-relaxed whitespace-pre-wrap">
                      {localizedEntry.bible_passage_text}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* High-Quality Audio Player */}
            <div className="mb-6">
              <HighQualityAudioPlayer
                text={`${localizedEntry.title}\n\n${localizedEntry.scripture_reference ? localizedEntry.scripture_reference + '\n' : ''}${localizedEntry.scripture_text ? localizedEntry.scripture_text + '\n\n' : ''}${localizedEntry.content}${localizedEntry.prayer ? '\n\nPrayer:\n' + localizedEntry.prayer : ''}`}
                contentId={entry.id}
                contentType="devotional"
                title={t('devotionals', 'listen')}
                autoLoad={false}
              />
            </div>

            {/* Video Link */}
            {localizedEntry.video_url && (
              <div className="mb-6">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(localizedEntry.video_url, '_blank')}
                >
                  <Video className="h-4 w-4 mr-2" />
                  {t('devotionals', 'watchVideo')}
                </Button>
              </div>
            )}

            {/* Main Devotional Content */}
            <div className="prose max-w-none mb-6">
              <div className="text-gray-800 leading-relaxed whitespace-pre-wrap text-lg">
                {localizedEntry.content}
              </div>
            </div>

            {/* Reflection Questions */}
            {localizedEntry.reflection_questions && localizedEntry.reflection_questions.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t('devotionals', 'reflectionQuestions')}
                </h3>
                <ol className="list-decimal list-inside space-y-3 text-blue-800">
                  {localizedEntry.reflection_questions.map((q, idx) => (
                    <li key={idx} className="leading-relaxed">{q}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Prayer */}
            {localizedEntry.prayer && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-amber-900 mb-4 flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  {t('devotionals', 'prayer')}
                </h3>
                <p className="text-amber-800 italic leading-relaxed">{localizedEntry.prayer}</p>
              </div>
            )}

            {/* Personal Notes */}
            <div className="border-t pt-6">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3"
              >
                <MessageSquare className="h-4 w-4" />
                {t('devotionals', 'personalNotes')}
                {bookmarked && <Badge variant="outline" className="text-xs">{t('common', 'saved')}</Badge>}
              </button>
              
              {showNotes && (
                <div className="space-y-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('devotionals', 'writeThoughts')}
                    rows={4}
                    className="w-full"
                  />
                  <Button size="sm" onClick={handleSaveNotes} disabled={!bookmarked}>
                    {t('devotionals', 'saveNotes')}
                  </Button>
                  {!bookmarked && (
                    <p className="text-xs text-gray-500">{t('devotionals', 'bookmarkToSave')}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => onNavigate('prev')}
            disabled={entry.day_number === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('devotionals', 'previousDay')}
          </Button>

          {!completed && (
            <Button onClick={handleComplete} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              {t('devotionals', 'markComplete')}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => onNavigate('next')}
            disabled={entry.day_number === totalDays}
          >
            {t('devotionals', 'nextDay')}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* Completion Message */}
        {entry.day_number === totalDays && completed && (
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-6 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-xl font-bold text-green-900 mb-2">
                {t('devotionals', 'congratulations')}
              </h3>
              <p className="text-green-700">
                {t('devotionals', 'completedSeries', { series: seriesTitle })}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};