import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Label } from '@rekindle/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { PhoneOff, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@rekindle/supabase';
import { WebinarAnalytics } from './WebinarAnalytics';
import type { MinistryWebinar } from './webinarControl';

interface WebinarEndScreenProps {
  webinar: MinistryWebinar;
  onHome: () => void;
  /** Only the host/co-host sees the Analytics action — attendees just see the
   *  plain "ended" screen. */
  isHost?: boolean;
}

/** Attendee/speaker-facing "this webinar has ended" screen — shown once
 *  webinar.status flips to 'ended'/'recording_processing'/'completed'. The
 *  host's own end confirmation dialog lives in WebinarStage.tsx. */
export function WebinarEndScreen({ webinar, onHome, isHost = false }: WebinarEndScreenProps) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private'>(webinar.recording_visibility ?? 'private');
  const [savingVisibility, setSavingVisibility] = useState(false);
  const durationMinutes = webinar.started_at && webinar.ended_at
    ? Math.round((new Date(webinar.ended_at).getTime() - new Date(webinar.started_at).getTime()) / 60000)
    : null;

  const changeVisibility = async (next: 'public' | 'private') => {
    setVisibility(next);
    setSavingVisibility(true);
    try {
      const { error } = await supabase.from('ministry_webinars').update({ recording_visibility: next }).eq('id', webinar.id);
      if (error) throw error;
    } catch (err) {
      console.error('[WebinarEndScreen] recording visibility update failed:', err);
      toast.error("Couldn't update recording visibility.");
      setVisibility(webinar.recording_visibility ?? 'private');
    } finally {
      setSavingVisibility(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4 text-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <PhoneOff className="h-5 w-5 text-gray-500" />
          </div>
          <CardTitle>This webinar has ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">{webinar.title}</p>
          {durationMinutes !== null && (
            <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
              <Clock className="h-4 w-4" /> {durationMinutes} min
            </p>
          )}
          {webinar.recording_status === 'processing' && (
            <p className="text-xs text-gray-400">The recording is processing and will be available soon.</p>
          )}
          {webinar.recording_url && (
            <a href={webinar.recording_url} target="_blank" rel="noreferrer" className="text-sm text-purple-600 hover:underline block">
              Watch the recording
            </a>
          )}
          {isHost && webinar.recording_url && (
            <div className="text-left space-y-1">
              <Label className="text-xs">Recording visibility</Label>
              <Select value={visibility} onValueChange={(v) => changeVisibility(v as 'public' | 'private')} disabled={savingVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — host &amp; admins only</SelectItem>
                  <SelectItem value="public">Public — in the ministry's Recordings tab</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isHost && (
            <Button onClick={() => setShowAnalytics(true)} variant="outline" className="w-full">
              <BarChart3 className="h-4 w-4 mr-2" /> View analytics
            </Button>
          )}
          <Button onClick={onHome} variant="outline" className="w-full">Back home</Button>
        </CardContent>
      </Card>
      {isHost && <WebinarAnalytics webinar={webinar} open={showAnalytics} onClose={() => setShowAnalytics(false)} />}
    </div>
  );
}

export default WebinarEndScreen;
