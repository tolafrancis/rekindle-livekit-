import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Button } from '@rekindle/ui/button';
import { Languages, Square, Plus, Loader2, Radio } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';

interface ActiveSession {
  id: string;
  target_language: string;
  status: string;
}

interface BroadcastTranslationHostControlProps {
  channelId: string;
  ministryId: string;
}

/**
 * Host-side "Start Live Translation" — the broadcast equivalent of a
 * meeting's "+ Add language" inside FloatingTranslationButton. Before this,
 * the only way to get a translation running on a broadcast was the generic
 * ministry-dashboard "Start Service" dialog, which needed the room name
 * (channel-{channelId}) typed in by hand — undiscoverable, easy to get
 * wrong, and nothing there even knows a "broadcast" concept exists. This
 * auto-fills the room from channelId the same way the meeting flow
 * auto-fills from meeting.room_name, so the host just picks a language.
 */
export const BroadcastTranslationHostControl: React.FC<BroadcastTranslationHostControlProps> = ({
  channelId,
  ministryId,
}) => {
  const roomName = `channel-${channelId}`;
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [newLanguage, setNewLanguage] = useState('');
  const [starting, setStarting] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      supabase
        .from('translation_sessions')
        .select('id, target_language, status')
        .eq('livekit_room_name', roomName)
        .in('status', ['initialising', 'joining', 'active', 'paused'])
        .then(({ data }) => {
          if (!cancelled && data) setSessions(data as ActiveSession[]);
        });
    };
    load();

    const channel = supabase
      .channel(`broadcast-host-translation-${channelId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_sessions', filter: `livekit_room_name=eq.${roomName}` },
        load)
      .subscribe();

    supabase
      .from('language_configs')
      .select('source_language, supported_target_languages')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setSourceLanguage(data.source_language || 'en');
        setSupportedLanguages(data.supported_target_languages || []);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [channelId, roomName, ministryId]);

  const startLanguage = async () => {
    if (!newLanguage) return;
    setStarting(true);
    try {
      const { error } = await supabase.rpc('start_bot_session', {
        p_ministry_id: ministryId,
        p_room_name: roomName,
        p_source_language: sourceLanguage,
        p_target_language: newLanguage,
        p_speaker_identity: null,
      });
      if (error) throw error;
      toast({ title: `${newLanguage.toUpperCase()} translation starting…`, description: 'Viewers will see it in their Audio picker automatically.' });
      setNewLanguage('');
    } catch (err: any) {
      toast({ title: 'Could not start translation', description: err.message, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const stopLanguage = async (session: ActiveSession) => {
    setStoppingId(session.id);
    try {
      const { error } = await supabase.rpc('stop_bot_session', { p_session_id: session.id });
      if (error) throw error;
      toast({ title: `${session.target_language.toUpperCase()} translation stopped` });
    } catch (err: any) {
      toast({ title: 'Could not stop translation', description: err.message, variant: 'destructive' });
    } finally {
      setStoppingId(null);
    }
  };

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors text-gray-700 hover:bg-gray-100';
  const availableToAdd = supportedLanguages.filter((code) => !sessions.some((s) => s.target_language === code));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={sessions.length > 0 ? 'default' : 'outline'}
          size="sm"
          className={`rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2 ${sessions.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
        >
          <Languages className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden md:inline">
            {sessions.length > 0 ? `Translating (${sessions.length})` : 'Translate'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1">Live translation</p>

        {sessions.length > 0 && (
          <div className="space-y-0.5 mb-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-1">
                <div className="flex-1 flex items-center gap-2 px-2.5 py-2 text-sm">
                  <Radio className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="flex-1">{s.target_language.toUpperCase()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => stopLanguage(s)}
                  disabled={stoppingId === s.id}
                  title="Stop this language"
                  className="p-2 text-gray-500 hover:text-red-600 disabled:opacity-50"
                >
                  {stoppingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {supportedLanguages.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2.5 py-1">
            No supported languages configured yet — set them in Live Translation → Settings first.
          </p>
        ) : availableToAdd.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2.5 py-1">Every configured language is already running.</p>
        ) : (
          <div className="space-y-1.5 border-t pt-2">
            <Select value={newLanguage} onValueChange={setNewLanguage}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose a language" /></SelectTrigger>
              <SelectContent>
                {availableToAdd.map((code) => (
                  <SelectItem key={code} value={code}>{code.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="w-full" onClick={startLanguage} disabled={!newLanguage || starting}>
              {starting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Start translation
            </Button>
          </div>
        )}

        <p className="text-[10px] text-gray-400 px-2.5 pt-2">
          Viewers pick their own language from a picker on the video — you don't need to do anything else once it's running.
        </p>
      </PopoverContent>
    </Popover>
  );
};

export default BroadcastTranslationHostControl;
