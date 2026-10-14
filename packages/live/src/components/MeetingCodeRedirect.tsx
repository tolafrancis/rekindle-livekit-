/**
 * Short meeting link: /m/:code (e.g. /m/abc-defg-hij, Google Meet style).
 *
 * Looks the code up in both meeting tables (short_code, migration 0408; both
 * tables allow public read) and replaces the URL with the full join path, so
 * the existing join page handles everything from there.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@rekindle/supabase';

export function MeetingCodeRedirect() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const shortCode = (code || '').trim().toLowerCase();
    if (!shortCode) {
      setNotFound(true);
      return;
    }

    (async () => {
      const { data: ministryMeeting } = await supabase
        .from('ministry_video_meetings')
        .select('id, ministry_id')
        .eq('short_code', shortCode)
        .maybeSingle();
      if (cancelled) return;
      if (ministryMeeting) {
        navigate(`/ministry/${ministryMeeting.ministry_id}/meeting/${ministryMeeting.id}`, { replace: true });
        return;
      }

      const { data: channelMeeting } = await supabase
        .from('live_channel_video_meetings')
        .select('id, channel_id')
        .eq('short_code', shortCode)
        .maybeSingle();
      if (cancelled) return;
      if (channelMeeting) {
        navigate(`/channel/${channelMeeting.channel_id}/meeting/${channelMeeting.id}`, { replace: true });
        return;
      }

      setNotFound(true);
    })();

    return () => { cancelled = true; };
  }, [code, navigate]);

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Meeting not found</p>
        <p className="text-sm text-muted-foreground">Check the link and try again, or ask the host to send it again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
    </div>
  );
}

export default MeetingCodeRedirect;
