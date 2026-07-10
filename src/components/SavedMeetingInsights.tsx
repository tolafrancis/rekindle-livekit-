// Post-session insights: read back what MeetingRecordingPanel persisted to
// `meeting_ai_notes` (migration 0148) and hand it to MeetingInsightsPanel.
//
// Without this the three "Meeting Insights" dialogs (live-channel meetings,
// ministry meetings, broadcast) passed `cleaned={null}` and therefore always
// showed "Transcribe the meeting first" — even when a transcript existed. The
// notes were being written and never read.
//
// RLS on meeting_ai_notes is `auth.uid() = created_by`, so this shows *your own*
// notes for the meeting. Someone who never took notes sees the empty state,
// which is correct: there is nothing of theirs to show.

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CleanedTranscript, MeetingInsights } from '@/lib/meetingAIEngine';
import MeetingInsightsPanel from './MeetingInsightsPanel';

interface SavedMeetingInsightsProps {
  meetingId: string;
  meetingTitle: string;
}

export default function SavedMeetingInsights({ meetingId, meetingTitle }: SavedMeetingInsightsProps) {
  const [loading, setLoading] = useState(true);
  const [cleaned, setCleaned] = useState<CleanedTranscript | null>(null);
  const [insights, setInsights] = useState<MeetingInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      // Most recent notes for this meeting. A meeting can have several rows when
      // more than one person took notes; the latest is the best transcript,
      // because Option A distributed transcription merges every speaker's lines.
      const { data, error: err } = await supabase
        .from('meeting_ai_notes')
        .select('transcript, insights')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (err) {
        setError(err.message);
      } else if (data) {
        setCleaned((data.transcript as CleanedTranscript) ?? null);
        setInsights((data.insights as MeetingInsights) ?? null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading saved notes…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Couldn't load saved notes: {error}</span>
      </div>
    );
  }

  // No row yet → the panel's own empty state ("Transcribe the meeting first")
  // is the right thing to show, so pass the nulls straight through.
  return (
    <MeetingInsightsPanel
      meetingTitle={meetingTitle}
      meetingId={meetingId}
      cleaned={cleaned}
      existingInsights={insights}
      onInsightsGenerated={() => {}}
    />
  );
}
