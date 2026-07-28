// Supabase Edge Function: process-scheduled-video-messages
//
// PURPOSE
//   Flips Pastor's Video Messages from status='scheduled' to 'published' once
//   their scheduled_publish_at time has arrived, then fires the same
//   notification path as a manual "Publish Now" in MinistryVideoMessagesManager
//   (push + in-app fan-out via send-push-notification, email via
//   send-email-broadcast — both called directly, not through notify.ts, since
//   that's a client-side helper this server function can't import).
//
// TRIGGER
//   Called every 15 minutes by pg_cron (see schedule.sql). No body params
//   required.
//
// DEPLOY
//   supabase functions deploy process-scheduled-video-messages  (JWT
//   verification OFF — called by pg_cron with the service-role bearer token)
//
// ENV SECRETS (Supabase Dashboard -> Edge Functions)
//   SUPABASE_URL                auto-injected
//   SUPABASE_SERVICE_ROLE_KEY   auto-injected
//   SITE_URL                    your app's origin (same var send-email-broadcast
//                               uses) — used to build the notification link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Same env var send-email-broadcast uses for its footer/unsubscribe links —
  // the app's real origin, not derivable from the Supabase project URL.
  const SITE_URL = Deno.env.get('SITE_URL') ?? '';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: due, error } = await supabase
      .from('ministry_video_messages')
      .select('id, ministry_id, title, speaker_name, description')
      .eq('status', 'scheduled')
      .lte('scheduled_publish_at', new Date().toISOString());

    if (error) throw error;

    let published = 0;
    for (const video of due ?? []) {
      const { error: updateError } = await supabase
        .from('ministry_video_messages')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          scheduled_publish_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', video.id)
        .eq('status', 'scheduled'); // guards against a double-fire racing a manual publish

      if (updateError) {
        console.error(`Failed to publish video ${video.id}:`, updateError);
        continue;
      }
      published++;

      const { data: ministry } = await supabase
        .from('ministry_groups')
        .select('name')
        .eq('id', video.ministry_id)
        .maybeSingle();

      const speaker = video.speaker_name ? `Pastor ${video.speaker_name}` : 'your ministry';
      const title = `📹 New Video Message from ${speaker}`;
      const body = `A new message titled "${video.title}" has been shared. Tap to watch now.`;
      const link = `${SITE_URL}/ministry-videos/${video.id}`;

      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body, link,
          targetAudience: 'ministry_members',
          ministryId: video.ministry_id,
          notificationType: 'pastor_video_message',
          push: true,
          inApp: true,
        }),
      }).catch((err) => console.error(`Push/in-app notify failed for video ${video.id}:`, err));

      await fetch(`${SUPABASE_URL}/functions/v1/send-email-broadcast`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ministryId: video.ministry_id,
          subject: `New video message: ${video.title}`,
          title: video.title,
          message: `${ministry?.name || 'Your ministry'} just posted a new video message${video.speaker_name ? ` from ${video.speaker_name}` : ''}: "${video.title}".`,
          messageCategory: 'transactional',
        }),
      }).catch((err) => console.error(`Email notify failed for video ${video.id}:`, err));
    }

    return new Response(
      JSON.stringify({ success: true, checked: due?.length ?? 0, published }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('process-scheduled-video-messages error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
