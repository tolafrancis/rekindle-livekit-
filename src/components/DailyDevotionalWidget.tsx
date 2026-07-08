import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import { BookOpen, Play, ChevronRight, Clock, Calendar, Loader2, Volume2, X, Building2, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalDateString, endOfLocalDayISO } from '@/lib/utils';
import { DevotionalModule } from './DevotionalModule';
import { recordDailyActivity } from '@/lib/streak';
import { shareDevotional } from '@/lib/devotionalShare';
import { canNativeShare } from '@/lib/webShare';
import { useLocalizedScriptures, ScriptureInput } from '@/hooks/useLocalizedScripture';

// Scripture block for the widget. Isolated into its own component so the
// useLocalizedScriptures hook runs unconditionally (the main widget body sits
// after several early returns). Renders stored English first, then upgrades each
// verse to a published Bible version in the reader's language.
const WidgetScriptureBlock: React.FC<{ items: ScriptureInput[]; mainText: string }> = ({ items, mainText }) => {
  const resolved = useLocalizedScriptures(items);
  if (resolved.length > 0) {
    return (
      <div className="bg-white/10 rounded-lg p-4 space-y-3">
        {resolved.map((s, idx) => (
          <div key={idx} className={idx > 0 ? 'pt-3 border-t border-white/20' : ''}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-amber-200 font-medium">{s.reference}</p>
              {s.version && <span className="text-xs text-purple-200">{s.version}</span>}
            </div>
            {s.text && <p className="text-sm italic opacity-90 line-clamp-3">"{s.text}"</p>}
          </div>
        ))}
      </div>
    );
  }
  if (mainText) {
    return (
      <div className="bg-white/10 rounded-lg p-4">
        <p className="text-sm text-white/90 line-clamp-3">{mainText.slice(0, 200)}…</p>
      </div>
    );
  }
  return null;
};

// ── Platform devotional (devotionals table) ──────────────────
interface PlatformDevotional {
  id: string;
  title: string;
  // scripture fields — table uses snake_case
  scripture?: string;
  scripture_reference?: string;
  scripture_text?: string;
  scripture_version?: string;
  bible_passage_reference?: string;
  bible_passage_text?: string;
  scripture_references?: Array<{ reference: string; text: string; version: string }> | string;
  // content fields
  message?: string;
  content?: string;
  prayer?: string;
  prayer_focus?: string;
  reflection_questions?: string[] | string;
  // media
  image_url?: string;
  cover_image_url?: string;
  background_music_id?: number;
  audio_url?: string;
  // meta
  author?: string;
  author_name?: string;
  is_published: boolean;
  schedule_date?: string;    // datetime — main platform devotionals table
  scheduled_date?: string;  // date — used by some admin flows
}

// ── Ministry devotional (ministry_devotionals table) ─────────
interface MinistryDevotional {
  id: string;
  ministry_id?: string | null;
  title: string;
  scripture_reference?: string | null;
  scripture_text?: string | null;
  bible_passage_reference?: string | null;
  bible_passage_text?: string | null;
  content: string;
  image_url?: string | null;
  audio_url?: string | null;
  author_name?: string | null;
  author?: string | null;
  is_published: boolean;
  scheduled_date?: string | null;
  created_at: string;
}

type DevotionalSource = 'platform' | 'ministry' | 'both';

interface Props {
  onStartDevotional?: (devotional: any) => void;
  source?: DevotionalSource;
  ministryId?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────
function parseJsonField<T>(field: T | string | undefined, fallback: T): T {
  if (!field) return fallback;
  if (typeof field !== 'string') return field as T;
  try { return JSON.parse(field) as T; } catch { return fallback; }
}

function formatForModule(d: PlatformDevotional) {
  const refs = parseJsonField<Array<{ reference: string; text: string; version: string }>>(
    d.scripture_references, []
  );
  const questions = parseJsonField<string[]>(d.reflection_questions, []);
  const mainText = d.message || d.content || '';

  return {
    id:                  d.id,
    title:               d.title,
    author:              d.author || d.author_name || '',
    scripture:           d.scripture || d.scripture_reference || '',
    scriptureText:       d.scripture_text || '',
    scriptureVersion:    d.scripture_version,
    biblePassageReference: d.bible_passage_reference || '',
    biblePassageText:      d.bible_passage_text || '',
    scriptureReferences: refs,
    cover_image_url:     d.cover_image_url || d.image_url,
    background_music_id: d.background_music_id,
    message:             mainText,
    prayer:              d.prayer || d.prayer_focus || '',
    reflectionQuestions: Array.isArray(questions) ? questions : [],
    excerpt:             mainText.slice(0, 150) + (mainText.length > 150 ? '…' : ''),
    theme:               'Daily Devotional',
    modules:             1,
  };
}


// Format ministry devotional for DevotionalModule
function formatMinistryForModule(d: MinistryDevotional) {
  const questions = (() => {
    const q = (d as any).reflection_questions;
    if (!q) return [];
    if (typeof q === 'string') { try { return JSON.parse(q); } catch { return []; } }
    return Array.isArray(q) ? q : [];
  })();

  return {
    id:                  d.id,
    title:               d.title,
    author:              d.author_name || d.author || '',
    scripture:           d.scripture_reference || '',
    scriptureText:       d.scripture_text || '',
    scriptureVersion:    undefined,
    scriptureReferences: [],
    biblePassageReference: (d as any).bible_passage_reference || '',
    biblePassageText:      (d as any).bible_passage_text || '',
    cover_image_url:     d.image_url || undefined,
    background_music_id: undefined,
    message:             d.content || '',
    prayer:              (d as any).prayer || '',
    reflectionQuestions: questions,
    excerpt:             (d.content || '').slice(0, 150) + ((d.content || '').length > 150 ? '…' : ''),
    theme:               'Ministry Devotional',
    modules:             1,
  };
}

// Text fields overlaid from each row's `translations` JSONB for display.
const PLATFORM_LOCALIZED_FIELDS = [
  'title', 'scripture', 'scripture_reference', 'scripture_text', 'message',
  'content', 'prayer', 'prayer_focus', 'reflection_questions',
  'bible_passage_reference', 'bible_passage_text',
];
const MINISTRY_LOCALIZED_FIELDS = [
  'title', 'scripture_reference', 'scripture_text', 'content', 'prayer',
  'reflection_questions', 'bible_passage_reference', 'bible_passage_text',
];

// ── Component ─────────────────────────────────────────────────
export const DailyDevotionalWidget: React.FC<Props> = ({
  onStartDevotional,
  source = 'platform',
  ministryId = null,
}) => {
  const { user } = useAuth();
  const { t, getLocalizedContent } = useLanguage();
  const [todayDevotional, setTodayDevotional]       = useState<PlatformDevotional | null>(null);
  const [ministryDevotional, setMinistryDevotional] = useState<MinistryDevotional | null>(null);
  const [loading, setLoading]                       = useState(true);
  const [showModule, setShowModule]                 = useState(false);
  const [progress, setProgress]                     = useState({ completed: 0, total: 1 });
  const [showAudioPreview, setShowAudioPreview]     = useState(false);
  const [ministryProgress, setMinistryProgress]     = useState({ completed: 0, total: 1 });
  const [showMinistryModule, setShowMinistryModule] = useState(false);
  // Ministry name for branded share text — resolved via the name-only RPC.
  const [ministryName, setMinistryName]             = useState<string | null>(null);

  const loadMinistryDevotional = useCallback(async () => {
    if (!ministryId) return;
    // Resolve the ministry's display name for branded share text. Try the
    // name-only RPC first (works for anon too); if it's unavailable, fall back
    // to a direct read (authed members can read their ministry). Best-effort —
    // share falls back to "Rekindle Devotional" only if both fail.
    try {
      const { data: mn, error } = await supabase.rpc('get_ministry_name', { mid: ministryId });
      const rpcName = !error && mn ? (typeof mn === 'string' ? mn : String(mn)) : null;
      if (rpcName) {
        setMinistryName(rpcName);
      } else {
        const { data: m } = await supabase
          .from('ministries').select('name').eq('id', ministryId).maybeSingle();
        if (m?.name) setMinistryName(m.name);
      }
    } catch { /* fall back to Rekindle branding */ }
    try {
      const now = new Date();
      const today = getLocalDateString(now);
      const { data } = await supabase
        .from('ministry_devotionals')
        .select('*')
        .eq('ministry_id', ministryId)
        .eq('is_published', true)
        // Through the END of local today (mirrors the platform path) so a
        // devotional scheduled for today — which usually carries a daytime
        // timestamp — is included instead of falling back to yesterday's.
        .or(`scheduled_date.is.null,scheduled_date.lte.${endOfLocalDayISO(now)}`)
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        // 1. Prefer exact today match
        const todayMatch = data.find(d => d.scheduled_date?.split('T')[0] === today);
        if (todayMatch) { setMinistryDevotional(todayMatch); return; }

        // 2. Prefer most recently scheduled (past dates)
        const dated = data
          .filter(d => d.scheduled_date)
          .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
        if (dated.length > 0) { setMinistryDevotional(dated[0]); return; }

        // 3. Fall back to most recently created
        const byDate = [...data].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMinistryDevotional(byDate[0]);
      }
    } catch (err) {
      console.error('Error loading ministry devotional:', err);
    }
  }, [ministryId]);

  const loadTodayDevotional = useCallback(async () => {
    // Skip platform devotional entirely when source is ministry-only
    if (source === 'ministry') {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const now        = new Date();
      const today      = getLocalDateString(now); // YYYY-MM-DD in local timezone

      // Fetch all published devotionals scheduled up to the end of today (local time).
      // Using the local end-of-day boundary so a devotional dated for today is
      // included immediately at local midnight, not after UTC catches up.
      let { data } = await supabase
        .from('devotionals')
        .select('*')
        .eq('is_published', true)
        .lte('schedule_date', endOfLocalDayISO(now)) // through end of local today
        .order('schedule_date', { ascending: false })
        .limit(10);

      // Pick today's if it exists, otherwise most recent past one
      if (data && data.length > 0) {
        const todayMatch = data.find(d =>
          d.schedule_date && d.schedule_date.split('T')[0] === today
        );
        // Use today's exact match, or the most recent one
        data = [todayMatch || data[0]];
      }

      // Final fallback: any published devotional
      if (!data || data.length === 0) {
        const res = await supabase
          .from('devotionals')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(1);
        data = res.data;
      }

      if (data && data.length > 0) {
        setTodayDevotional(data[0]);
        if (user) {
          const { data: progressData } = await supabase
            .from('devotional_progress')
            .select('*')
            .eq('user_id', user.id)
            .eq('devotional_id', data[0].id)
            .maybeSingle();
          if (progressData) {
            setProgress({ completed: progressData.completed ? 1 : 0, total: 1 });
          }
        }
      }
    } catch (err) {
      console.error('Error loading devotional:', err);
    } finally {
      setLoading(false);
    }
  }, [user, source]);

  useEffect(() => {
    loadTodayDevotional();
    if ((source === 'ministry' || source === 'both') && ministryId) {
      loadMinistryDevotional();
    }
  }, [user, source, ministryId, loadTodayDevotional, loadMinistryDevotional]);

  const handleStartDevotional = async () => {
    if (!todayDevotional) return;
    setShowModule(true);
    if (user?.id) {
      try {
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existingProfile) {
          await supabase.from('user_profiles').upsert({
            user_id:    user.id,
            email:      user.email || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id', ignoreDuplicates: true });
          await new Promise(r => setTimeout(r, 100));
        }

        await supabase.from('devotional_progress').upsert({
          user_id:      user.id,
          devotional_id: todayDevotional.id,
          started_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id,devotional_id' });
      } catch (err) {
        console.error('Error tracking devotional start:', err);
      }
    }
  };

  const handleComplete = async () => {
    if (!todayDevotional || !user) return;
    try {
      await supabase.from('devotional_progress').upsert({
        user_id:       user.id,
        devotional_id: todayDevotional.id,
        completed:     true,
        completed_at:  new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id,devotional_id' });
      setProgress({ completed: 1, total: 1 });
      recordDailyActivity(user.id, 'daily_devotional');
    } catch (err) {
      console.error('Error marking complete:', err);
    }
  };

  const handleCloseModule = () => {
    setShowModule(false);
    loadTodayDevotional();
  };

  // Share helpers (defined before any early return so every render path can use
  // them). Each shares a public-preview link that converts recipients to sign-up.
  // The branded message (ministry name + title + CTA + link) is built by
  // shareDevotional, which uses the native share sheet on mobile and copies to
  // the clipboard on web.
  const shareLink = async (url: string, title: string, ministry?: string | null) => {
    const result = await shareDevotional({ ministryName: ministry, title, url });
    if (result.method === 'clipboard') {
      toast({ title: t('devotionals', 'copiedToShare', 'Copied to share!'), description: t('devotionals', 'copiedToShareDesc', 'The devotional message is on your clipboard — paste it anywhere to invite someone.') });
    } else if (result.method === 'none' && !canNativeShare()) {
      toast({ title: t('common', 'share', 'Share'), description: url });
    }
  };
  const shareDailyDevotional = () => {
    if (!todayDevotional) return;
    // Platform devotionals aren't ministry-owned — falls back to Rekindle branding.
    shareLink(`${window.location.origin}/daily-devotional/${todayDevotional.id}`, todayDevotional.title || "Today's Devotional");
  };
  const shareMinistryDevotional = () => {
    if (!ministryDevotional) return;
    // Use the name prefetched on load (synchronous — so the native share sheet
    // keeps the user-activation gesture on iOS). Falls back to Rekindle branding
    // only if the name genuinely couldn't be resolved.
    shareLink(`${window.location.origin}/ministry-devotional/${ministryDevotional.id}`, ministryDevotional.title || "Today's Devotional", ministryName);
  };

  // ── Render: full-screen devotional module ──────────────────
  if (showModule && todayDevotional) {
    const lz = getLocalizedContent(todayDevotional, PLATFORM_LOCALIZED_FIELDS);
    return (
      <DevotionalModule
        devotional={formatForModule(lz)}
        moduleNumber={1}
        shareUrl={`${window.location.origin}/daily-devotional/${todayDevotional.id}`}
        onComplete={() => { handleComplete(); handleCloseModule(); }}
        onClose={handleCloseModule}
      />
    );
  }

  // ── Render: ministry devotional module ─────────────────────
  if (showMinistryModule && ministryDevotional) {
    const lz = getLocalizedContent(ministryDevotional, MINISTRY_LOCALIZED_FIELDS);
    return (
      <DevotionalModule
        devotional={formatMinistryForModule(lz)}
        moduleNumber={1}
        ministryName={ministryName}
        shareUrl={`${window.location.origin}/ministry-devotional/${ministryDevotional.id}`}
        onComplete={() => { recordDailyActivity(user?.id, 'daily_devotional'); setShowMinistryModule(false); }}
        onClose={() => { setShowMinistryModule(false); }}
      />
    );
  }

  // ── Render: loading ────────────────────────────────────────
  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Render: ministry-only — always show ministry card ───────
  if (source === 'ministry' && ministryDevotional) {
    const lz = getLocalizedContent(ministryDevotional, MINISTRY_LOCALIZED_FIELDS);
    const mQuestions = parseJsonField<string[]>(
      (lz as any).reflection_questions, []
    );
    const mProgress = ministryProgress.completed / ministryProgress.total * 100;
    const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
      <Card className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-200" />
              <span className="text-sm text-purple-200">{todayLabel}</span>
            </div>
            {ministryProgress.completed > 0 && (
              <div className="bg-green-500/30 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <span>✓</span> {t('devotionals', 'completed', 'Completed')}
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-serif flex items-center gap-2 mt-2">
            <BookOpen className="h-6 w-6" />{t('devotionals', 'todaysDevotional', "Today's Devotional")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-1">{lz.title}</h3>
            <p className="text-purple-200 text-sm">{t('devotionals', 'dailyScriptureReflection', 'Daily Scripture Reflection')}</p>
          </div>

          {/* Scripture */}
          {(lz.scripture_reference || lz.scripture_text) && (
            <div className="bg-white/10 rounded-lg p-4 space-y-2">
              {lz.scripture_reference && (
                <p className="text-amber-200 font-medium">{lz.scripture_reference}</p>
              )}
              {lz.scripture_text && (
                <p className="text-sm italic opacity-90 line-clamp-3">"{lz.scripture_text}"</p>
              )}
            </div>
          )}

          {/* Content preview */}
          {lz.content && (
            <p className="text-sm text-white/90 line-clamp-3 leading-relaxed">{lz.content}</p>
          )}

          {/* Reflection questions */}
          {Array.isArray(mQuestions) && mQuestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-purple-200">{t('devotionals', 'reflectionQuestions', 'Reflection Questions:')}</p>
              <ul className="text-sm text-white/90 space-y-1">
                {mQuestions.slice(0, 2).map((q: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-300">•</span><span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('devotionals', 'progress', 'Progress')}</span><span>{ministryProgress.completed}/{ministryProgress.total}</span>
            </div>
            <Progress value={mProgress} className="h-2 bg-white/20" />
          </div>

          <div className="flex items-center gap-2 text-sm text-purple-200">
            <Clock className="h-4 w-4" /><span>{t('devotionals', 'readTime', '~8 minutes')}</span>
          </div>

          {/* Audio preview if available */}
          {ministryDevotional.audio_url && (
            <Button
              variant="outline"
              className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => setShowAudioPreview(v => !v)}
            >
              <Volume2 className="h-4 w-4 mr-2" />{t('devotionals', 'previewAudio', 'Preview Audio')}
            </Button>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-white text-purple-700 hover:bg-purple-50 font-semibold"
              onClick={() => setShowMinistryModule(true)}
            >
              <Play className="h-4 w-4 mr-2" />
              {ministryProgress.completed > 0 ? t('devotionals', 'experienceAgain', 'Experience Again') : t('devotionals', 'startTodaysDevotional', "Start Today's Devotional")}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              onClick={shareMinistryDevotional}
              variant="outline"
              size="icon"
              title={t('devotionals', 'shareDevotional', 'Share devotional')}
              aria-label="Share ministry devotional"
              className="shrink-0 bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Render: ministry-only but no ministry devotional found ──
  if (source === 'ministry' && !ministryDevotional) {
    return (
      <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-serif flex items-center gap-2">
            <BookOpen className="h-6 w-6" />{t('devotionals', 'ministryDevotional', 'Ministry Devotional')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-blue-200 mb-4">{t('devotionals', 'noMinistryDevotional', 'No ministry devotional available yet. Check back soon!')}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render: no devotional available ───────────────────────
  if (!todayDevotional) {
    return (
      <Card className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-serif flex items-center gap-2">
            <BookOpen className="h-6 w-6" />{t('devotionals', 'todaysDevotional', "Today's Devotional")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-purple-200 mb-4">{t('devotionals', 'noDevotionalToday', 'No devotional scheduled for today. Check back tomorrow!')}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render: main widget ────────────────────────────────────
  const progressPercent = (progress.completed / progress.total) * 100;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lz         = getLocalizedContent(todayDevotional, PLATFORM_LOCALIZED_FIELDS);
  const mlz        = ministryDevotional
    ? getLocalizedContent(ministryDevotional, MINISTRY_LOCALIZED_FIELDS)
    : null;
  const scripture  = lz.scripture || lz.scripture_reference || '';
  const refs       = parseJsonField<Array<{ reference: string; text: string; version: string }>>(
    todayDevotional.scripture_references, []
  );
  const questions  = parseJsonField<string[]>(lz.reflection_questions, []);
  const mainText   = lz.message || lz.content || '';

  return (
    <>
      <Card className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-200" />
              <span className="text-sm text-purple-200">{todayLabel}</span>
            </div>
            {progress.completed > 0 && (
              <div className="bg-green-500/30 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <span>✓</span> {t('devotionals', 'completed', 'Completed')}
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-serif flex items-center gap-2 mt-2">
            <BookOpen className="h-6 w-6" />{t('devotionals', 'todaysDevotional', "Today's Devotional")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-1">{lz.title}</h3>
            <p className="text-purple-200 text-sm">{t('devotionals', 'dailyScriptureReflection', 'Daily Scripture Reflection')}</p>
          </div>

          {/* Scripture — verses resolve to a published Bible version in the
              reader's language by reference (falls back to stored English). */}
          <WidgetScriptureBlock
            items={
              refs.length > 0
                ? refs
                : scripture
                ? [{ reference: scripture, text: lz.scripture_text, version: todayDevotional.scripture_version }]
                : []
            }
            mainText={mainText}
          />

          {/* Reflection questions */}
          {Array.isArray(questions) && questions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-purple-200">{t('devotionals', 'reflectionQuestions', 'Reflection Questions:')}</p>
              <ul className="text-sm text-white/90 space-y-1">
                {questions.slice(0, 2).map((q, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-300">•</span><span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('devotionals', 'progress', 'Progress')}</span><span>{progress.completed}/{progress.total}</span>
            </div>
            <Progress value={progressPercent} className="h-2 bg-white/20" />
          </div>

          <div className="flex items-center gap-2 text-sm text-purple-200">
            <Clock className="h-4 w-4" /><span>{t('devotionals', 'readTime', '~8 minutes')}</span>
          </div>

          {/* Audio preview */}
          {!showAudioPreview ? (
            <Button
              onClick={() => setShowAudioPreview(true)}
              variant="outline"
              className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <Volume2 className="h-4 w-4 mr-2" />{t('devotionals', 'previewAudio', 'Preview Audio')}
            </Button>
          ) : (
            <div className="bg-white/95 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{t('devotionals', 'audioPreview', 'Audio Preview')}</span>
                <Button variant="ghost" size="sm" onClick={() => setShowAudioPreview(false)} className="h-6 w-6 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <HighQualityAudioPlayer
                text={`${lz.title}\n\n${scripture}\n${lz.scripture_text || ''}\n\n${mainText.substring(0, 500)}...`}
                contentId={`${todayDevotional.id}-preview`}
                contentType="daily_devotional"
                title="Preview"
                autoLoad={false}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleStartDevotional}
              className="flex-1 bg-white text-purple-700 hover:bg-purple-50 font-semibold"
            >
              <Play className="h-4 w-4 mr-2" />
              {progress.completed > 0 ? t('devotionals', 'experienceAgain', 'Experience Again') : t('devotionals', 'startTodaysDevotional', "Start Today's Devotional")}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              onClick={shareDailyDevotional}
              variant="outline"
              size="icon"
              title={t('devotionals', 'shareDevotional', 'Share devotional')}
              aria-label="Share devotional"
              className="shrink-0 bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ministry devotional — shown when source is 'both' */}
      {source === 'both' && ministryDevotional && mlz && (
        <Card className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white mt-4 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-200" />
              <span className="text-xs font-medium text-purple-200 uppercase tracking-wide">{t('devotionals', 'ministryDevotional', 'Ministry Devotional')}</span>
            </div>
            <CardTitle className="text-2xl font-serif flex items-center gap-2 mt-2">
              <BookOpen className="h-6 w-6" />{t('devotionals', 'todaysDevotional', "Today's Devotional")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-1">{mlz.title}</h3>
              <p className="text-purple-200 text-sm">{t('devotionals', 'dailyScriptureReflection', 'Daily Scripture Reflection')}</p>
            </div>
            {(mlz.scripture_reference || mlz.scripture_text) && (
              <WidgetScriptureBlock
                items={[{
                  reference: mlz.scripture_reference,
                  text: mlz.scripture_text,
                  version: (ministryDevotional as any)?.scripture_version,
                }]}
                mainText=""
              />
            )}
            {mlz.content && (
              <p className="text-sm text-white/90 line-clamp-3 leading-relaxed">{mlz.content}</p>
            )}
            <div className="flex items-center gap-2 text-sm text-purple-200">
              <Clock className="h-4 w-4" /><span>{t('devotionals', 'readTime', '~8 minutes')}</span>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-white text-purple-700 hover:bg-purple-50 font-semibold"
                onClick={() => setShowMinistryModule(true)}
              >
                <Play className="h-4 w-4 mr-2" />{t('devotionals', 'startMinistryDevotional', 'Start Ministry Devotional')}<ChevronRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                onClick={shareMinistryDevotional}
                variant="outline"
                size="icon"
                title={t('devotionals', 'shareDevotional', 'Share devotional')}
                aria-label="Share ministry devotional"
                className="shrink-0 bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};
