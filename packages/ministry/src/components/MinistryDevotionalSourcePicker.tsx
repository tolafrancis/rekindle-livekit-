import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { listPublicStreams, getMinistryStreamId } from '@rekindle/features/devotionalStreams';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';
import { BookOpen, Check, Loader2, PenLine, Radio } from 'lucide-react';

/**
 * Leader-only control to choose this ministry's daily-devotional SOURCE — mirrors
 * the consumer app's "devotional source" picker, but for a ministry homepage.
 *
 *   Own    → daily_devotional_stream_id = null; the ministry's own devotionals show.
 *   Stream → a public admin-authored stream (migration 0149) shows instead.
 *
 * Writes ministry_devotional_settings (upsert on ministry_id). RLS already allows
 * the ministry's owner/leader (or an admin) to write this row.
 */
export const MinistryDevotionalSourcePicker: React.FC<{ ministryId: string; className?: string }> = ({ ministryId, className = '' }) => {
  const { t, language } = useLanguage();
  const [streams, setStreams] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, chosen] = await Promise.all([listPublicStreams(language), getMinistryStreamId(ministryId)]);
      if (cancelled) return;
      setStreams(s.map((x) => ({ id: x.id, name: x.name, description: x.description })));
      setStreamId(chosen);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ministryId]);

  const save = async (next: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from('ministry_devotional_settings')
      .upsert(
        { ministry_id: ministryId, daily_devotional_stream_id: next, updated_at: new Date().toISOString() },
        { onConflict: 'ministry_id' },
      );
    setSaving(false);
    if (error) {
      toast({ title: t('ministryDevotionalSource', 'saveFailed', 'Could not save devotional source'), description: error.message, variant: 'destructive' });
      return;
    }
    setStreamId(next);
    toast({ title: t('ministryDevotionalSource', 'saved', 'Devotional source updated') });
  };

  const usingStream = !!streamId;

  return (
    <div className={`rounded-xl border border-purple-100 bg-white p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="h-4 w-4 text-purple-600" />
        <h3 className="font-semibold text-sm text-gray-900">
          {t('ministryDevotionalSource', 'title', 'Daily Devotional Source')}
        </h3>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-purple-500 font-medium">
          {t('ministryDevotionalSource', 'leaderOnly', 'Leaders only')}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {t('ministryDevotionalSource', 'subtitle', "Choose what your members see as today's devotional.")}
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Our own devotionals */}
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className={`text-left p-3 rounded-lg border transition-all ${!usingStream ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-1.5">
                <PenLine className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-sm">{t('ministryDevotionalSource', 'ownTitle', 'Our own')}</span>
                {!usingStream && <Check className="h-3.5 w-3.5 text-purple-600 ml-auto" />}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('ministryDevotionalSource', 'ownDesc', 'Show devotionals your ministry writes.')}</p>
            </button>

            {/* A ReKindle stream */}
            <button
              type="button"
              disabled={saving || streams.length === 0}
              onClick={() => save(streamId ?? streams[0]?.id ?? null)}
              className={`text-left p-3 rounded-lg border transition-all ${usingStream ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'} ${streams.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-sm">{t('ministryDevotionalSource', 'streamTitle', 'A ReKindle stream')}</span>
                {usingStream && <Check className="h-3.5 w-3.5 text-purple-600 ml-auto" />}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('ministryDevotionalSource', 'streamDesc', 'Show a curated ReKindle feed instead.')}</p>
            </button>
          </div>

          {usingStream && (
            <div className="pt-1">
              <Select value={streamId ?? ''} onValueChange={(v) => save(v)} disabled={saving}>
                <SelectTrigger><SelectValue placeholder={t('ministryDevotionalSource', 'selectStream', 'Select a stream')} /></SelectTrigger>
                <SelectContent>
                  {streams.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {saving && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t('ministryDevotionalSource', 'saving', 'Saving…')}</p>}
        </div>
      )}
    </div>
  );
};

export default MinistryDevotionalSourcePicker;
