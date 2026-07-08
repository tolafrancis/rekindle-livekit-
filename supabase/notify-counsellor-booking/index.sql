import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { counsellor_id, session_id, user_name, scheduled_at } = await req.json();

    if (!counsellor_id) {
      return new Response(
        JSON.stringify({ error: 'counsellor_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the counsellor's user_id
    const { data: counsellor, error: counsellorError } = await supabase
      .from('counsellors')
      .select('user_id, name')
      .eq('id', counsellor_id)
      .single();

    if (counsellorError || !counsellor) {
      console.log('Counsellor not found:', counsellorError);
      return new Response(
        JSON.stringify({ success: true, message: 'Counsellor not found, notification skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the counsellor's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', counsellor.user_id);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
    }

    console.log(`Found ${subscriptions?.length || 0} push subscriptions for counsellor`);

    const scheduledTime = scheduled_at 
      ? new Date(scheduled_at).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      : 'soon';

    let notificationsSent = 0;

    // Send push notifications to each subscription
    for (const sub of subscriptions || []) {
      try {
        if (sub.subscription && sub.subscription.endpoint) {
          const payload = JSON.stringify({
            title: 'New Counselling Request',
            body: `${user_name || 'A user'} has requested a counselling session for ${scheduledTime}. Please review and confirm.`,
            url: '/counsellor-dashboard'
          });

          const response = await fetch(sub.subscription.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TTL': '86400',
            },
            body: payload
          });

          if (response.ok || response.status === 201) {
            notificationsSent++;
          }
          console.log(`Push response: ${response.status}`);
        }
      } catch (e) {
        console.error('Error sending notification:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent,
        counsellorName: counsellor.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Notify counsellor error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});