export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const dailyApiKey = Deno.env.get("DAILY_API_KEY");
    if (!dailyApiKey) {
      throw new Error("Daily API key not configured");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { session_id, payment_intent_id } = await req.json();

    if (!session_id || !payment_intent_id) {
      throw new Error('Missing required fields: session_id, payment_intent_id');
    }

    // Get the session
    const { data: session, error: sessionError } = await supabase
      .from('counselling_sessions')
      .select('*, counsellor:counsellors(*)')
      .eq('id', session_id)
      .eq('payment_intent_id', payment_intent_id)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    // Verify the user owns this session
    if (session.user_id !== user.id) {
      throw new Error('Unauthorized: You do not own this session');
    }

    // Create Daily.co room for the session
    const roomName = `counselling-${session_id.slice(0, 8)}-${Date.now()}`;
    
    // Calculate room expiry (session time + 2 hours buffer)
    const scheduledTime = new Date(session.scheduled_at).getTime();
    const expiryTime = Math.floor((scheduledTime + (session.duration + 120) * 60 * 1000) / 1000);

    const dailyResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dailyApiKey}`
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: {
          exp: expiryTime,
          max_participants: 2,
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: 'cloud',
          start_video_off: false,
          start_audio_off: false
        }
      })
    });

    const dailyData = await dailyResponse.json();

    if (!dailyResponse.ok) {
      console.error('Daily.co error:', dailyData);
      throw new Error('Failed to create video room');
    }

    // Update session with confirmed status and room details
    const { data: updatedSession, error: updateError } = await supabase
      .from('counselling_sessions')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        daily_room_name: dailyData.name,
        daily_room_url: dailyData.url,
        messaging_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', session_id)
      .select('*, counsellor:counsellors(*)')
      .single();

    if (updateError) {
      throw new Error('Failed to update session: ' + updateError.message);
    }

    // Get counsellor's user_id for notification
    const counsellorUserId = session.counsellor?.user_id;

    // TODO: Send notification to counsellor (email/push)
    // This could be done via another edge function or webhook

    return new Response(JSON.stringify({
      success: true,
      session: updatedSession,
      room: {
        name: dailyData.name,
        url: dailyData.url
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error: any) {
    console.error('Session confirmation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});