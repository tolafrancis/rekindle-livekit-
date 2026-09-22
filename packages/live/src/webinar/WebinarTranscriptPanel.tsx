import React, { useEffect, useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Loader2, FileText, Download } from 'lucide-react';
import { supabase } from '@rekindle/supabase';

interface SessionInfo {
  id: string;
  source_language: string;
  target_language: string;
}

interface LogRow {
  id: string;
  source_text: string;
  translated_text: string;
  created_at: string;
}

interface WebinarTranscriptPanelProps {
  webinarId: string;
  /** ministry_webinars.room_name — the same LiveKit room translation_sessions
   *  are keyed on (livekit_room_name), matching how the live caption pickers
   *  (WebinarTranslationButton.tsx) already look sessions up. */
  roomName: string;
}

/** Read-only replay transcript (2026-09-23, F-CAP-6/build-plan Phase 2: a
 *  webinar's "Watch the recording" link never had any transcript surfaced
 *  anywhere, even though translation_logs already has the full text sitting
 *  there — the only prior "export" was a plain .txt download buried in the
 *  unrelated /display page). Shown on WebinarEndScreen, visible to
 *  attendees too (same public-unless-private RLS as the live caption
 *  pickers) — not gated to host. Renders nothing at all if no caption/
 *  translation session ever ran for this webinar, so it doesn't clutter the
 *  end screen for the common case where captions were never turned on. */
export function WebinarTranscriptPanel({ webinarId, roomName }: WebinarTranscriptPanelProps) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('translation_sessions')
        .select('id, source_language, target_language')
        .eq('livekit_room_name', roomName)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as SessionInfo[];
      setSessions(rows);
      setSelectedSessionId(rows[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roomName]);

  useEffect(() => {
    if (!expanded || !selectedSessionId) return;
    let cancelled = false;
    setLogsLoading(true);
    supabase
      .from('translation_logs')
      .select('id, source_text, translated_text, created_at')
      .eq('session_id', selectedSessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setLogs((data ?? []) as LogRow[]);
        setLogsLoading(false);
      });
    return () => { cancelled = true; };
  }, [expanded, selectedSessionId]);

  if (loading || sessions.length === 0) return null;

  // A same-language "Show Captions" session has source_language ===
  // target_language — labeled "Original" rather than e.g. "EN → EN", same
  // convention the live pickers (WebinarTranslationButton.tsx) already use.
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const sessionLabel = (s: SessionInfo) =>
    s.source_language === s.target_language ? 'Original' : `${s.source_language.toUpperCase()} → ${s.target_language.toUpperCase()}`;
  // Same-language sessions show only the one transcript (source === translated
  // text from the bot's own pipeline); a real translation shows both.
  const isTranslated = !!selectedSession && selectedSession.source_language !== selectedSession.target_language;

  const downloadTranscript = () => {
    if (logs.length === 0 || !selectedSession) return;
    const bodyText = logs
      .map((row) => {
        const time = new Date(row.created_at).toLocaleTimeString();
        return isTranslated
          ? `[${time}] ${row.source_text}\n→ ${row.translated_text}`
          : `[${time}] ${row.source_text}`;
      })
      .join('\n\n');
    const blob = new Blob([bodyText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${sessionLabel(selectedSession)}-${webinarId}.txt`.replace(/[^\w.-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="text-left border-t pt-3 mt-1">
      {!expanded ? (
        <Button variant="outline" className="w-full" onClick={() => setExpanded(true)}>
          <FileText className="h-4 w-4 mr-2" /> View transcript
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-500">Transcript</p>
            {sessions.length > 1 && (
              <Select value={selectedSessionId ?? undefined} onValueChange={setSelectedSessionId}>
                <SelectTrigger className="h-8 w-auto text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{sessionLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border bg-gray-50 p-3 space-y-2 text-sm">
            {logsLoading ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : logs.length === 0 ? (
              <p className="text-gray-400 text-center py-6">No transcript was recorded for this session.</p>
            ) : (
              logs.map((row) => (
                <div key={row.id}>
                  <p className="text-gray-800">{row.source_text}</p>
                  {isTranslated && <p className="text-gray-500">→ {row.translated_text}</p>}
                </div>
              ))
            )}
          </div>
          {logs.length > 0 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={downloadTranscript}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download transcript
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default WebinarTranscriptPanel;
