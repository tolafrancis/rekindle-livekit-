import React, { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Button } from '@rekindle/ui/button';
import { Languages, Check, Volume2, Copy, Square, Plus, Loader2, Captions, X } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';

interface CaptionLine {
  id: string;
  text: string;
}

/** 'off' | 'original' (source_text, whatever language the speaker is
 *  actually using) | a target language code (translated_text for that
 *  language's session). Independent of the audio picker below — a
 *  participant can keep the real voice AND read translated captions, or
 *  mute translated audio but still read along, same as any video app's
 *  separate CC menu. */
type CaptionMode = 'off' | 'original' | string;

export interface TranslationControls {
  tracks: Array<{ language: string; botIdentity: string }>;
  currentLanguage: string | null;
  setLanguage: (language: string | null, originalSpeakerIdentity?: string) => void;
}

interface FloatingTranslationButtonProps {
  translation: TranslationControls;
  /** Needed to dispatch start_bot_session for "+ Add language" (host-only) —
   *  the meeting's own LiveKit room name and ministry, from `meeting.room_name`
   *  / `meeting.ministry_id`. */
  ministryId: string;
  roomName: string;
  /** language_configs.speaker_identity for this ministry, if the caller has
   *  it — passed through to setLanguage so the wrapper can locally mute the
   *  original speaker while a translation plays (build plan §2.7). Also used
   *  as the default for newly-started languages. */
  speakerIdentity?: string | null;
  /** Shows the per-language Stop control and "+ Add language". Advisory
   *  only — start_bot_session/stop_bot_session actually require
   *  is_group_admin server-side (migration 0273), so a non-admin "host"
   *  (e.g. a meeting co-host who isn't a ministry admin) would see the
   *  buttons but get an RPC error, same as every other
   *  advisory-vs-server-enforced control in this file (mute-all, etc). */
  isHost?: boolean;
}

const sessionIdFromBotIdentity = (botIdentity: string): string => botIdentity.replace(/^rlt-bot-/, '');

/** Live-translation language picker + status, styled to match the other
 *  floating pills (FloatingSpeakerButton, FloatingBackgroundButton) that sit
 *  bottom-center above the control bar. For non-hosts with no translation
 *  active yet, renders nothing — nothing to pick, nothing to add. Hosts
 *  still get the button (to add a language), even with zero tracks so far. */
export const FloatingTranslationButton: React.FC<FloatingTranslationButtonProps> = ({
  translation,
  ministryId,
  roomName,
  speakerIdentity,
  isHost = false,
}) => {
  const { tracks, currentLanguage, setLanguage } = translation;
  const [stoppingLanguage, setStoppingLanguage] = useState<string | null>(null);
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [newLanguage, setNewLanguage] = useState('');
  const [starting, setStarting] = useState(false);

  // In-meeting captions (real first-class option, not just the "copy link
  // to /display" workaround) — same translation_logs Realtime feed
  // TranslationDisplayPage.tsx reads, just condensed for an in-call overlay.
  const [captionMode, setCaptionMode] = useState<CaptionMode>('off');
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const captionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Resolve which session's log feed to read: an exact language match for a
  // real target code, or — for 'original' — any currently active session,
  // since every session for the same speaker carries the identical
  // source_text regardless of which target language it's translating to.
  const sessionIdForCaptionMode = (mode: CaptionMode): string | null => {
    if (mode === 'off') return null;
    const track = mode === 'original' ? tracks[0] : tracks.find((t) => t.language === mode);
    return track ? sessionIdFromBotIdentity(track.botIdentity) : null;
  };

  useEffect(() => {
    if (captionChannelRef.current) {
      supabase.removeChannel(captionChannelRef.current);
      captionChannelRef.current = null;
    }
    setCaptionLines([]);

    const sessionId = sessionIdForCaptionMode(captionMode);
    if (!sessionId) {
      // The selected language's track disappeared (host stopped it) — fall
      // back to off instead of silently showing nothing with no explanation.
      if (captionMode !== 'off') setCaptionMode('off');
      return;
    }

    const field = captionMode === 'original' ? 'source_text' : 'translated_text';
    let cancelled = false;

    supabase
      .from('translation_logs')
      .select('id, source_text, translated_text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCaptionLines([...data].reverse().map((row: any) => ({ id: row.id, text: row[field] })));
      });

    const channel = supabase
      .channel(`meeting-captions-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; source_text: string; translated_text: string };
          setCaptionLines((prev) => [...prev, { id: row.id, text: field === 'source_text' ? row.source_text : row.translated_text }].slice(-2));
        })
      .subscribe();
    captionChannelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionMode, tracks]);

  // Loaded lazily (host-only, only once "+ Add language" is opened) rather
  // than for every participant on every meeting — this is a config lookup
  // most people in the call never need.
  useEffect(() => {
    if (!showAddLanguage || !isHost) return;
    supabase
      .from('language_configs')
      .select('source_language, supported_target_languages')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSourceLanguage(data.source_language || 'en');
          setSupportedLanguages(data.supported_target_languages || []);
        }
      });
  }, [showAddLanguage, isHost, ministryId]);

  if (tracks.length === 0 && !isHost) return null;

  const addLanguage = async () => {
    if (!newLanguage) return;
    setStarting(true);
    try {
      const { error } = await supabase.rpc('start_bot_session', {
        p_ministry_id: ministryId,
        p_room_name: roomName,
        p_source_language: sourceLanguage,
        p_target_language: newLanguage,
        p_speaker_identity: speakerIdentity || null,
      });
      if (error) throw error;
      toast({ title: `${newLanguage.toUpperCase()} translation starting…` });
      setNewLanguage('');
      setShowAddLanguage(false);
      // The new "rlt-translated-{lang}" track shows up via
      // onTranslationTracksChanged once the bot actually joins and
      // publishes — no local state to update here.
    } catch (err: any) {
      toast({ title: 'Could not start translation', description: err.message, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const copyDisplayLink = (botIdentity: string) => {
    const url = `${window.location.origin}/display/${sessionIdFromBotIdentity(botIdentity)}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Display link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
  };

  const stopLanguage = async (track: { language: string; botIdentity: string }) => {
    setStoppingLanguage(track.language);
    try {
      const { error } = await supabase.rpc('stop_bot_session', {
        p_session_id: sessionIdFromBotIdentity(track.botIdentity),
      });
      if (error) throw error;
      if (currentLanguage === track.language) setLanguage(null);
      toast({ title: `${track.language.toUpperCase()} translation stopped` });
    } catch (err: any) {
      toast({ title: 'Could not stop translation', description: err.message, variant: 'destructive' });
    } finally {
      setStoppingLanguage(null);
    }
  };

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const sel = (on: boolean) => (on ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100');
  const captionText = captionMode === 'off' ? null : captionLines[captionLines.length - 1]?.text ?? null;

  return (
    <>
      {/* In-meeting captions — a real overlay, not a link out to /display.
          Sits above the floating-pill row (bottom-24/28 in the meeting
          layout) so it never overlaps the controls beneath it. Only takes
          up space once a caption language is actually chosen. */}
      {captionMode !== 'off' && (
        <div className="fixed bottom-40 sm:bottom-44 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] sm:max-w-xl px-3">
          <div className="flex items-center gap-2 rounded-lg bg-black/75 backdrop-blur-sm text-white px-4 py-2.5 shadow-lg">
            <p className="flex-1 text-sm sm:text-base text-center leading-snug">
              {captionText ?? (captionMode === 'original' ? 'Waiting for speech…' : 'Waiting for translation…')}
            </p>
            <button
              type="button"
              onClick={() => setCaptionMode('off')}
              title="Turn off captions"
              className="shrink-0 text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Live Translation"
            className={`flex h-10 items-center gap-1.5 rounded-full shadow-lg backdrop-blur-sm px-3 transition-colors ${
              currentLanguage || captionMode !== 'off' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-900/70 text-white hover:bg-gray-800/80'
            }`}
          >
            <Languages className="h-5 w-5" />
            {currentLanguage && <span className="text-xs font-semibold">{currentLanguage.toUpperCase()}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 p-2">
          <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1">Audio</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            <button type="button" onClick={() => setLanguage(null)} className={`${row} ${sel(currentLanguage === null)}`}>
              <Volume2 className="h-4 w-4" />
              <span className="flex-1">Original</span>
              {currentLanguage === null && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            {tracks.map((track) => (
              <div key={track.botIdentity} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLanguage(track.language, speakerIdentity || undefined)}
                  className={`${row} flex-1 ${sel(currentLanguage === track.language)}`}
                >
                  <Languages className="h-4 w-4" />
                  <span className="flex-1">{track.language.toUpperCase()}</span>
                  {currentLanguage === track.language && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyDisplayLink(track.botIdentity)}
                  title="Copy display link"
                  className="p-2 text-gray-500 hover:text-gray-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => stopLanguage(track)}
                    disabled={stoppingLanguage === track.language}
                    title="Stop this language"
                    className="p-2 text-gray-500 hover:text-red-600 disabled:opacity-50"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Captions — independent of the Audio choice above: keep the
              real voice and still read translated captions, or mute
              translated audio but read along, same idea as any video
              app's separate CC menu. "Original" needs at least one active
              session too (that's what's actually running STT), so it's
              only offered once a track exists. */}
          <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1 mt-2 border-t pt-2">Captions</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            <button type="button" onClick={() => setCaptionMode('off')} className={`${row} ${sel(captionMode === 'off')}`}>
              <X className="h-4 w-4" />
              <span className="flex-1">Off</span>
              {captionMode === 'off' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            {tracks.length > 0 && (
              <button type="button" onClick={() => setCaptionMode('original')} className={`${row} ${sel(captionMode === 'original')}`}>
                <Captions className="h-4 w-4" />
                <span className="flex-1">Original</span>
                {captionMode === 'original' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
              </button>
            )}
            {tracks.map((track) => (
              <button
                key={`caption-${track.botIdentity}`}
                type="button"
                onClick={() => setCaptionMode(track.language)}
                className={`${row} ${sel(captionMode === track.language)}`}
              >
                <Captions className="h-4 w-4" />
                <span className="flex-1">{track.language.toUpperCase()}</span>
                {captionMode === track.language && <Check className="h-3.5 w-3.5 text-indigo-600" />}
              </button>
            ))}
          </div>

          {isHost && !showAddLanguage && (
          <button
            type="button"
            onClick={() => setShowAddLanguage(true)}
            className={`${row} text-indigo-700 hover:bg-indigo-50 mt-1`}
          >
            <Plus className="h-4 w-4" />
            <span className="flex-1">Add language</span>
          </button>
        )}

        {isHost && showAddLanguage && (
          <div className="mt-1.5 space-y-1.5 border-t pt-1.5">
            {supportedLanguages.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2.5">
                No supported languages configured yet — set them in Live Translation → Settings first.
              </p>
            ) : (
              <>
                <Select value={newLanguage} onValueChange={setNewLanguage}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose a language" /></SelectTrigger>
                  <SelectContent>
                    {supportedLanguages
                      .filter((code) => !tracks.some((t) => t.language === code))
                      .map((code) => (
                        <SelectItem key={code} value={code}>{code.toUpperCase()}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1" onClick={addLanguage} disabled={!newLanguage || starting}>
                    {starting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                    Start
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddLanguage(false)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 px-2.5 pt-1.5">
          Audio "Original" mutes the translation and restores the room's normal audio. Captions run independently of
          whichever audio you're listening to.
        </p>
      </PopoverContent>
    </Popover>
    </>
  );
};

export default FloatingTranslationButton;
