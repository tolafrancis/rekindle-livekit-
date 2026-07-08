/**
 * MeetingRecordingPanel.tsx
 *
 * Recording control panel for meetings. Manages recording state,
 * session timer, slash command detection, and coordinates the
 * transcription + summarization pipeline post-session.
 * Used by both MinistryInteractiveMeetings and LiveChannelInteractiveMeetings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Circle, StopCircle, Clock, Sparkles, FileText,
  Loader2, ChevronDown, ChevronUp, Mic
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  RawTranscript,
  CleanedTranscript,
  MeetingInsights,
  parseSlashCommand,
} from '@/lib/meetingAIEngine';
import MeetingTranscriptionPanel from './MeetingTranscriptionPanel';
import MeetingInsightsPanel from './MeetingInsightsPanel';

// ── Types ─────────────────────────────────────────────────────────────────

type RecordingState = 'idle' | 'recording' | 'stopped';
type TableName = 'ministry_video_meetings' | 'live_channel_video_meetings';

interface MeetingRecordingPanelProps {
  meetingId: string;
  meetingTitle: string;
  speakerName: string;
  userId: string;
  isHost: boolean;
  tableName: TableName; // Which Supabase table to persist results to
  enableRecording: boolean; // From meeting settings
  inCallOverlay?: boolean; // Show compact version inside the video call
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
    setShowTranscriptPanel(true);
    toast.success('Session recording started');
  }, []);

  const handleStopRecording = useCallback(async () => {
    setRecordingState('stopped');

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

    toast.success('Recording stopped. Clean the transcript and generate insights below.');
  }, [meetingId, tableName, enableRecording]);

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

      await supabase
        .from(tableName)
        .update({
          transcript_text: transcriptText,
          transcript_language: insights.dominantLanguage,
          transcript_status: 'completed',
          summary_json: insights,
        })
        .eq('id', meetingId);

      toast.success('Insights saved to meeting record');
    } catch (err) {
      console.error('Error saving insights to DB:', err);
      // Not fatal — insights are still in state
    } finally {
      setIsSavingToDb(false);
    }
  }, [meetingId, tableName, cleanedTranscript]);

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
                {recordingState === 'recording'
                  ? `REC ${formatDuration(elapsedSeconds)}`
                  : recordingState === 'stopped'
                  ? 'Stopped'
                  : 'AI Features'}
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
              {recordingState === 'idle' && (
                <Button
                  size="sm"
                  onClick={handleStartRecording}
                  className="w-full h-7 text-xs bg-red-600 hover:bg-red-700"
                >
                  <Circle className="h-3 w-3 mr-1 fill-current" />
                  Start Recording
                </Button>
              )}
              {recordingState === 'recording' && (
                <Button
                  size="sm"
                  onClick={handleStopRecording}
                  className="w-full h-7 text-xs bg-orange-600 hover:bg-orange-700"
                >
                  <StopCircle className="h-3 w-3 mr-1" />
                  Stop Recording
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

      {/* Inline transcription panel */}
      {showTranscriptPanel && (
        <MeetingTranscriptionPanel
          speakerName={speakerName}
          meetingTitle={meetingTitle}
          isHost={isHost}
          sessionStartTime={sessionStartTime}
          onTranscriptReady={handleTranscriptReady}
          onCleanedReady={handleCleanedReady}
        />
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
