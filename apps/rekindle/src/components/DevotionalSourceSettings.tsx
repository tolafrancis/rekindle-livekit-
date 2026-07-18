import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { BookOpen, Check, Loader2, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { listPublicStreams, type DevotionalStream } from '@/lib/devotionalStreams';

type DevotionalSource = 'platform' | 'ministry' | 'both';

interface Props {
  /** Called after preference is saved so the parent can refresh the widget.
   *  Signature kept for back-compat; source is always 'platform' now (stream-based). */
  onSaved?: (source: DevotionalSource, ministryId: string | null, streamId?: string | null) => void;
}

/**
 * Consumer daily-devotional picker. Users freely choose ANY public devotional
 * STREAM (migration 0149) — the previous platform/ministry/both "source" model is
 * gone. The chosen stream is stored in user_profiles.devotional_stream_id (with
 * devotional_source pinned to 'platform' so the widget resolves via the stream).
 */
export const DevotionalSourceSettings: React.FC<Props> = ({ onSaved }) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [streams, setStreams] = useState<DevotionalStream[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: pref }, publicStreams] = await Promise.all([
        supabase.from('user_profiles')
          .select('devotional_stream_id')
          .eq('user_id', user.id)
          .single(),
        listPublicStreams(language).catch(() => [] as DevotionalStream[]),
      ]);
      setStreams(publicStreams);
      setSelectedStreamId((pref as any)?.devotional_stream_id ?? null);
      setLoading(false);
    })();
  }, [user]);

  // The stream shown when the user hasn't explicitly picked one = the default feed.
  const effectiveStreamId = selectedStreamId ?? streams.find((s) => s.is_default)?.id ?? null;
  const currentName = streams.find((s) => s.id === effectiveStreamId)?.name
    ?? t('devotionalSourceSettings', 'labelPlatform', 'ReKindle BC');

  const pick = async (streamId: string) => {
    if (!user) return;
    setSavingId(streamId);
    const { error } = await supabase
      .from('user_profiles')
      .update({
        devotional_source: 'platform',   // stream-based: always the platform feed, scoped by stream
        devotional_ministry_id: null,
        devotional_stream_id: streamId,
      })
      .eq('user_id', user.id);
    setSavingId(null);
    if (error) return; // silent — the row stays on the previous choice
    setSelectedStreamId(streamId);
    setExpanded(false);
    onSaved?.('platform', null, streamId);
  };

  if (loading) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-1"
      >
        <BookOpen className="h-3.5 w-3.5" />
        {t('devotionalSourceSettings', 'devotionalStreamLabel', 'Devotional stream:')}{' '}
        <span className="font-medium text-gray-600">{currentName}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <Card className="border border-gray-100 shadow-sm mb-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">
              {t('devotionalSourceSettings', 'chooseStreamTitle', 'Choose your devotional stream')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {streams.length === 0 ? (
              <p className="text-xs text-gray-400">{t('devotionalSourceSettings', 'noStreams', 'No devotional streams are available yet.')}</p>
            ) : (
              streams.map((s) => {
                const isSel = effectiveStreamId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => pick(s.id)}
                    disabled={savingId !== null}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      isSel ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s.cover_image_url
                      ? <img src={s.cover_image_url} className="w-8 h-8 rounded object-cover shrink-0" alt="" />
                      : <div className="w-8 h-8 rounded bg-purple-50 flex items-center justify-center shrink-0"><BookOpen className="h-4 w-4 text-purple-300" /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium ${isSel ? 'text-gray-900' : 'text-gray-600'}`}>{s.name}</p>
                        {s.is_default && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1 py-0">
                            <Star className="h-2.5 w-2.5 mr-0.5" />{t('devotionalSourceSettings', 'defaultBadge', 'Default')}
                          </Badge>
                        )}
                      </div>
                      {s.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{s.description}</p>}
                    </div>
                    {savingId === s.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-purple-600 shrink-0" />
                      : isSel && <Check className="h-4 w-4 text-purple-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DevotionalSourceSettings;
