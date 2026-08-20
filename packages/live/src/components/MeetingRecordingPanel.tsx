/**
 * MeetingRecordingPanel.tsx
 *
 * Recording control panel for meetings. Manages recording state,
 * session timer, slash command detection, and coordinates the
 * transcription + summarization pipeline post-session.
 * Used by both MinistryInteractiveMeetings and LiveChannelInteractiveMeetings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@rekindle/ui/dialog';
import {
  Circle, StopCircle, Clock, Sparkles, FileText,
  Loader2, ChevronDown, ChevronUp, Mic
} from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { toast } from 'sonner';
import {
  RawTranscript,
  CleanedTranscript,
  MeetingInsights,
  parseSlashCommand,
} from '@rekindle/features/meetingAIEngine';
import { useMeetingNotes } from '@rekindle/features/useMeetingNotes';
import MeetingInsightsPanel from './MeetingInsightsPanel';

// ── Types ─────────────────────────────────────────────────────────────────

type RecordingState = 'idle' | 'recording' | 'stopped';
// `channel_broadcasts` was already being passed by LiveChannelBroadcast but wasn't in
// this union — a real type error. It has no transcript_* / summary_json columns, so
// the meeting-row update is skipped for it; notes still persist to meeting_ai_notes.
type TableName = 'ministry_video_meetings' | 'live_channel_video_meetings' | 'channel_broadcasts';

interface MeetingRecordingPanelProps {
  meetingId: string;
  meetingTitle: string;
  speakerName: string;
  userId: string;
  isHost: boolean;
  tableName: TableName; // Which Supabase table to persist results to
  enableRecording: boolean; // From meeting settings
  inCallOverlay?: boolean; // Show compact version inside the video call
  /** Reports note-taking state up so the parent can pulse its "AI" button. */
  onStateChange?: (state: RecordingState) => void;
  /** Allow a non-host to take notes (e.g. ministry-tier members). */
  canTakeNotes?: boolean;
  roomName?: string;
  ministryId?: string;
}

// ── Format helpers ────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────

const MeetingRecordingPanel: React.FC<MeetingRecordingPanelProps> = ({
  meetingId,
  meetingTitle,
  speakerName,
  userId,
  isHost,
  tableName,
  enableRecording,
  inCallOverlay = false,
  onStateChange,
  canTakeNotes = false,
  roomName,
  ministryId,
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [rawTranscript, setRawTranscript] = useState<RawTranscript | null>(null);
  const [cleanedTranscript, setCleanedTranscript] = useState<CleanedTranscript | null>(null);
  const [generatedInsights, setGeneratedInsights] = useState<MeetingInsights | null>(null);
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(false);
  const [showInsightsDialog, setShowInsightsDialog] = useState(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Distributed note-taking + server STT bot trigger.
  const notes = useMeetingNotes(meetingId, speakerName, true, roomName, ministryId, userId);
  // Only the browser that started notes runs the (paid) AI pipeline + persistence.
  const isInitiatorRef = useRef(false);
  // Row created when notes stop, so the transcript survives even if the user never
  // generates insights. handleInsightsGenerated updates this row instead of inserting.
  const savedNoteIdRef = useRef<string | null>(null);

  // Mirror remote-triggered start/stop so non-initiators show the running state.
  useEffect(() => {
    if (notes.active && recordingState === 'idle') {
      setSessionStartTime(Date.now());
      setElapsedSeconds(0);
      setRecordingState('recording');
    } else if (!notes.active && recordingState === 'recording') {
      setRecordingState('stopped');
    }
  }, [notes.active, recordingState]);

  // Report note-taking state up so the parent can flicker its "AI" button, and
  // collapse this panel once notes start — the pulsing button is the indicator,
  // rather than a big REC-style overlay sitting over the video.
  // Held in a ref so an inline parent callback can't re-fire this effect.
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => {
    onStateChangeRef.current?.(recordingState);
    if (recordingState === 'recording') setIsCollapsed(true);
  }, [recordingState]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (recordingState === 'recording') {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingState]);

  const handleStartRecording = useCallback(() => {
    const now = Date.now();
    setSessionStartTime(now);
    setElapsedSeconds(0);
    setRecordingState('recording');
    isInitiatorRef.current = true;
    // Tells EVERY participant's browser to start transcribing its own mic (Option A).
    notes.startNotes();
    toast.success('AI notes started — everyone is being transcribed');
  }, [notes]);

  const handleStopRecording = useCallback(async () => {
    setRecordingState('stopped');
    notes.stopNotes();

    // Capture the merged, speaker-attributed transcript from all participants.
    const raw: RawTranscript = {
      lines: notes.lines,
      durationSeconds: elapsedSeconds,
      detectedLanguages: [],
    };
    setRawTranscript(raw);

    // Persist the transcript NOW. Insights are optional and cost an API call; the
    // transcript must not depend on the user remembering to click "Generate" before
    // they leave. handleInsightsGenerated later updates this same row.
    if (isInitiatorRef.current && raw.lines.length > 0 && userId) {
      try {
        const { data, error } = await supabase
          .from('meeting_ai_notes')
          .insert({
            meeting_id: meetingId,
            source_table: tableName,
            meeting_title: meetingTitle,
            created_by: userId,
            raw_transcript: raw,
            // A usable transcript for playback even before cleaning/insights run.
            transcript: { lines: raw.lines, dominantLanguage: '', isMixedLanguage: false },
            duration_seconds: elapsedSeconds,
          })
          .select('id')
          .single();
        if (error) throw error;
        savedNoteIdRef.current = data?.id ?? null;
      } catch (err) {
        console.error('Failed to save transcript:', err);
        toast.error('Notes stopped, but the transcript could not be saved.');
      }
    }

    // Update DB recording status
    if (enableRecording) {
      try {
        await supabase
          .from(tableName)
          .update({
            recording_status: 'processing',
            recording_ended_at: new Date().toISOString(),
          })
          .eq('id', meetingId);
      } catch (err) {
        console.error('Error updating recording status:', err);
      }
    }

    toast.success('Notes stopped. Clean the transcript and generate insights below.');
  }, [meetingId, tableName, enableRecording, notes, elapsedSeconds, meetingTitle, userId]);

  const handleTranscriptReady = useCallback((raw: RawTranscript) => {
    setRawTranscript(raw);
  }, []);

  const handleCleanedReady = useCallback((cleaned: CleanedTranscript) => {
    setCleanedTranscript(cleaned);
  }, []);

  const handleInsightsGenerated = useCallback(async (insights: MeetingInsights) => {
    setGeneratedInsights(insights);
    setIsSavingToDb(true);

    // Persist to Supabase
    try {
      const transcriptText = cleanedTranscript
        ? cleanedTranscript.lines.map(l => `[${l.speaker}] ${l.text}`).join('\n')
        : null;

      // Durable, per-session record — survives the meeting and supports more than
      // one note-taker. (The meeting-row update below only keeps the latest.)
      // handleStopRecording already inserted the transcript row; enrich it rather
      // than inserting a second row for the same session.
      if (savedNoteIdRef.current) {
        await supabase
          .from('meeting_ai_notes')
          .update({
            raw_transcript: rawTranscript,
            transcript: cleanedTranscript,
            insights,
            dominant_language: insights.dominantLanguage,
            duration_seconds: elapsedSeconds,
          })
          .eq('id', savedNoteIdRef.current);
      } else {
        await supabase.from('meeting_ai_notes').insert({
          meeting_id: meetingId,
          source_table: tableName,
          meeting_title: meetingTitle,
          created_by: userId,
          raw_transcript: rawTranscript,
          transcript: cleanedTranscript,
          insights,
          dominant_language: insights.dominantLanguage,
          duration_seconds: elapsedSeconds,
        });
      }

      // Keep the meeting row's summary in sync. `channel_broadcasts` doesn't have
      // these columns, so skip it there rather than failing the whole save.
      if (tableName !== 'channel_broadcasts') {
        await supabase
          .from(tableName)
          .update({
            transcript_text: transcriptText,
            transcript_language: insights.dominantLanguage,
            transcript_status: 'completed',
            summary_json: insights,
          })
          .eq('id', meetingId);
      }

      toast.success('Notes and insights saved');
    } catch (err) {
      console.error('Error saving insights to DB:', err);
      // Not fatal — insights are still in state
    } finally {
      setIsSavingToDb(false);
    }
  }, [meetingId, tableName, cleanedTranscript, meetingTitle, userId, rawTranscript, elapsedSeconds]);

  // Slash command listener — listens to chat messages via Supabase realtime
  useEffect(() => {
    const channel = supabase
      .channel(`meeting-chat-${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_chat_messages',
          filter: `room_id=eq.${meetingId}`,
        },
        (payload) => {
          const message = (payload.new as { content?: string }).content ?? '';
          const command = parseSlashCommand(message);
          if (!command) return;

          if (command === '/record' && recordingState === 'idle') {
            handleStartRecording();
          } else if (command === '/transcribe') {
            setShowTranscriptPanel(true);
            toast.info('Transcription panel opened');
          } else if (command === '/summarize') {
            setShowInsightsDialog(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, recordingState, handleStartRecording]);

  // ── Overlay (compact, inside video call) ─────────────────────────────────

  if (inCallOverlay) {
    return (
      <>
        <div className="bg-gray-900/85 backdrop-blur-sm rounded-xl p-3 space-y-2 min-w-[220px]">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {recordingState === 'recording' ? (
                <Circle className="h-3 w-3 text-red-400 fill-red-400 animate-pulse" />
              ) : (
                <Mic className="h-3 w-3 text-gray-400" />
              )}
              <span className="text-xs text-gray-200 font-medium">
                {/* "Notes", never "REC" — this transcribes speech, it does NOT
                    record audio/video (that's the separate recording button). */}
                {recordingState === 'recording'
                  ? `Notes ${formatDuration(elapsedSeconds)}`
                  : recordingState === 'stopped'
                  ? 'Notes stopped'
                  : 'AI Notes'}
              </span>
            </div>
            <button
              onClick={() => setIsCollapsed(prev => !prev)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
          </div>

          {/* Expanded controls */}
          {!isCollapsed && (
            <div className="space-y-2">
              {/* Host, or any ministry-tier member, may take notes from their own
                  browser — each transcribes their own microphone. */}
              {recordingState === 'idle' && (isHost || canTakeNotes) && (
                <Button
                  size="sm"
                  onClick={handleStartRecording}
                  disabled={notes.isStarting}
                  className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-75"
                >
                  {notes.isStarting ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <FileText className="h-3 w-3 mr-1" />
                      Take Notes
                    </>
                  )}
                </Button>
              )}
              {recordingState === 'idle' && !isHost && !canTakeNotes && (
                <p className="text-[10px] text-gray-400 leading-tight px-1">
                  AI notes are available to the host and ministry members.
                </p>
              )}
              {recordingState === 'recording' && (
                <Button
                  size="sm"
                  onClick={handleStopRecording}
                  className="w-full h-7 text-xs bg-orange-600 hover:bg-orange-700"
                >
                  <StopCircle className="h-3 w-3 mr-1" />
                  Stop Notes
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTranscriptPanel(prev => !prev)}
                className="w-full h-7 text-xs text-gray-300 hover:bg-gray-700"
              >
                <FileText className="h-3 w-3 mr-1" />
                {showTranscriptPanel ? 'Hide' : 'Show'} Transcript
              </Button>
              {(rawTranscript || cleanedTranscript) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowInsightsDialog(true)}
                  className="w-full h-7 text-xs text-purple-300 hover:bg-gray-700"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  View Insights
                </Button>
              )}

              {/* The "Show Transcript" button above only toggled this state — it
                  never actually rendered anything in this compact overlay (the
                  live transcript list only existed in the full, outside-the-call
                  panel below). Same merged, speaker-attributed stream as there. */}
              {showTranscriptPanel && (
                <div className="max-h-40 overflow-y-auto rounded-lg bg-black/40 p-2 text-[11px] text-gray-200 space-y-1">
                  {notes.availableLanguages.length > 1 && (
                    <div className="flex items-center gap-1 mb-1.5 pb-1 border-b border-gray-700/60">
                      <span className="text-[10px] text-gray-400">Language:</span>
                      {notes.availableLanguages.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => notes.setSelectedLanguage(lang)}
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-medium transition-colors ${
                            notes.selectedLanguage === lang
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {lang === 'en' ? 'Original (EN)' : lang}
                        </button>
                      ))}
                    </div>
                  )}
                  {notes.lines.length === 0 && !notes.interimText && (
                    <p className="text-gray-500">No speech captured yet…</p>
                  )}
                  {notes.lines.map((l, i) => (
                    <p key={`${l.timestamp}-${i}`}>
                      <span className="text-purple-300 font-medium">{l.speaker}:</span>{' '}
                      <span>{l.text}</span>
                    </p>
                  ))}
                  {notes.interimText && (
                    <p className="text-gray-400 italic">
                      <span className="text-purple-300/70 font-medium">{speakerName}:</span>{' '}
                      {notes.interimText}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Full-screen insights dialog */}
        <Dialog open={showInsightsDialog} onOpenChange={setShowInsightsDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Meeting Insights — {meetingTitle}</DialogTitle>
            </DialogHeader>
            <MeetingInsightsPanel
              meetingTitle={meetingTitle}
              meetingId={meetingId}
              cleaned={cleanedTranscript}
              existingInsights={generatedInsights}
              onInsightsGenerated={handleInsightsGenerated}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── Full panel (used outside the call) ───────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Recording control card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {recordingState === 'recording' && (
                <Badge className="bg-red-500 text-white border-0 animate-pulse flex items-center gap-1">
                  <Circle className="h-3 w-3 fill-current" />
                  REC {formatDuration(elapsedSeconds)}
                </Badge>
              )}
              {recordingState === 'stopped' && (
                <Badge variant="outline" className="text-green-700 border-green-300 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Session recorded
                </Badge>
              )}
              {recordingState === 'idle' && (
                <span className="text-sm text-gray-500">Ready to record</span>
              )}
              {isSavingToDb && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {recordingState === 'idle' && (
                <Button
                  onClick={handleStartRecording}
                  className="bg-red-600 hover:bg-red-700"
                  size="sm"
                >
                  <Circle className="h-4 w-4 mr-1 fill-current" />
                  Start Recording
                </Button>
              )}
              {recordingState === 'recording' && (
                <Button
                  onClick={handleStopRecording}
                  variant="destructive"
                  size="sm"
                >
                  <StopCircle className="h-4 w-4 mr-1" />
                  Stop Recording
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTranscriptPanel(prev => !prev)}
              >
                <FileText className="h-4 w-4 mr-1" />
                {showTranscriptPanel ? 'Hide' : 'Show'} Transcript
              </Button>
              {(rawTranscript || cleanedTranscript) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-300 text-purple-700"
                  onClick={() => setShowInsightsDialog(true)}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  Insights
                </Button>
              )}
            </div>
          </div>

          {/* Slash command hint */}
          <p className="text-xs text-gray-400 mt-2">
            Chat commands:{' '}
            <code className="bg-gray-100 px-1 rounded">/record</code>{' '}
            <code className="bg-gray-100 px-1 rounded">/transcribe</code>{' '}
            <code className="bg-gray-100 px-1 rounded">/summarize</code>
          </p>
        </CardContent>
      </Card>

      {/* Live transcript — the MERGED, speaker-attributed stream from every
          participant. (The old MeetingTranscriptionPanel ran its own recogniser and
          only ever heard this one browser, and only after you clicked its mic
          button. useMeetingNotes owns recognition now, so it must not run too.) */}
      {showTranscriptPanel && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-gray-900/90 p-2 text-xs text-gray-200 space-y-1">
          {notes.availableLanguages.length > 1 && (
            <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-gray-700/60">
              <span className="text-xs text-gray-400">Language:</span>
              {notes.availableLanguages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => notes.setSelectedLanguage(lang)}
                  className={`px-2 py-0.5 rounded text-xs uppercase font-medium transition-colors ${
                    notes.selectedLanguage === lang
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {lang === 'en' ? 'Original (EN)' : lang}
                </button>
              ))}
            </div>
          )}
          {notes.lines.length === 0 && !notes.interimText && (
            <p className="text-gray-500">No speech captured yet…</p>
          )}
          {notes.lines.map((l, i) => (
            <p key={`${l.timestamp}-${i}`}>
              <span className="text-purple-300 font-medium">{l.speaker}:</span>{' '}
              <span>{l.text}</span>
            </p>
          ))}
          {notes.interimText && (
            <p className="text-gray-400 italic">
              <span className="text-purple-300/70 font-medium">{speakerName}:</span>{' '}
              {notes.interimText}
            </p>
          )}
        </div>
      )}

      {/* Insights dialog */}
      <Dialog open={showInsightsDialog} onOpenChange={setShowInsightsDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Meeting Insights — {meetingTitle}</DialogTitle>
          </DialogHeader>
          <MeetingInsightsPanel
            meetingTitle={meetingTitle}
            meetingId={meetingId}
            cleaned={cleanedTranscript}
            existingInsights={generatedInsights}
            onInsightsGenerated={handleInsightsGenerated}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MeetingRecordingPanel;
