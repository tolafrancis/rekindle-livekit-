// Supabase Edge Function: process-prayer-reminders
// This function should be called by a cron job every 15 minutes
// Deploy with: supabase functions deploy process-prayer-reminders

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[Prayer Reminders] Starting reminder processing...');

    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get all reminders that are due to be sent
    const { data: dueReminders, error: remindersError } = await supabaseClient
      .rpc('get_due_prayer_challenge_reminders');

    if (remindersError) {
      console.error('[Prayer Reminders] Error fetching due reminders:', remindersError);
      throw remindersError;
    }

    console.log(`[Prayer Reminders] Found ${dueReminders?.length || 0} due reminders`);

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No reminders due at this time',
          processed: 0,
          sent: 0,
          failed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentCount = 0;
    let failedCount = 0;

    // Process each reminder
    for (const reminder of dueReminders) {
      try {
        console.log(`[Prayer Reminders] Processing reminder ${reminder.reminder_id} for user ${reminder.user_id}`);

        // Prepare notification content
        const notificationTitle = `Prayer Reminder: ${reminder.challenge_title}`;
        let notificationBody = `It's time for your ${reminder.reminder_frequency} prayer session.`;

        // Customize message based on streak and sessions
        if (reminder.current_streak && reminder.current_streak > 0) {
          notificationBody = `Keep your ${reminder.current_streak}-day streak going! Time for prayer: ${reminder.challenge_title}`;
        } else if (reminder.completed_sessions && reminder.completed_sessions > 0) {
          notificationBody = `Continue your prayer journey with ${reminder.challenge_title}`;
        }

        // 1. In-app notification (primary, reliable channel) — appears live in
        //    the bell/NotificationFeed. If this fails we throw so the reminder
        //    stays "due" and retries next run (nothing is marked sent).
        const { error: inAppError } = await supabaseClient
          .from('notifications')
          .insert({
            user_id: reminder.user_id,
            type:    'prayer_reminder',
            title:   notificationTitle,
            message: notificationBody,
            link:    '/#challenges',
            is_read: false,
          });

        if (inAppError) {
          throw new Error(`In-app insert failed: ${inAppError.message}`);
        }

        // 2. Push notification (best-effort). A push failure must NOT block
        //    mark-sent below, otherwise the reminder would re-fire and spam the
        //    in-app feed on every subsequent run.
        try {
          const notificationResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                notificationType: 'prayer_challenge_reminder',
                challengeId: reminder.challenge_id,
                userId: reminder.user_id,
                title: notificationTitle,
                body: notificationBody,
                link: '/#challenges',
                targetAudience: 'specific_user'
              })
            }
          );

          if (!notificationResponse.ok) {
            const errorText = await notificationResponse.text();
            console.error(`[Prayer Reminders] Push failed (non-fatal) for ${reminder.reminder_id}: ${notificationResponse.status} - ${errorText}`);
          } else {
            const notificationResult = await notificationResponse.json();
            console.log(`[Prayer Reminders] Push sent for reminder ${reminder.reminder_id}:`, notificationResult);
          }
        } catch (pushErr) {
          console.error(`[Prayer Reminders] Push error (non-fatal) for ${reminder.reminder_id}:`, pushErr);
        }

        // 3. Mark reminder as sent and calculate next occurrence
        const { error: markError } = await supabaseClient.rpc('mark_prayer_reminder_sent', {
          p_reminder_id: reminder.reminder_id
        });

        if (markError) {
          console.error(`[Prayer Reminders] Error marking reminder ${reminder.reminder_id} as sent:`, markError);
          throw markError;
        }

        sentCount++;
        console.log(`[Prayer Reminders] Successfully processed reminder ${reminder.reminder_id}`);

      } catch (error) {
        console.error(`[Prayer Reminders] Failed to process reminder ${reminder.reminder_id}:`, error);
        failedCount++;
        
        // Log failed reminder attempt (optional - create table for this).
        // Await inside try/catch — a Postgrest builder has no .catch() method.
        try {
          await supabaseClient
            .from('reminder_failures')
            .insert({
              reminder_id: reminder.reminder_id,
              challenge_id: reminder.challenge_id,
              user_id: reminder.user_id,
              error_message: error.message || 'Unknown error',
              failed_at: new Date().toISOString()
            });
        } catch (logErr) {
          console.error('[Prayer Reminders] Failed to log error:', logErr);
        }
      }
    }

    console.log(`[Prayer Reminders] Processing complete: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Prayer reminders processed',
        processed: dueReminders.length,
        sent: sentCount,
        failed: failedCount,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Prayer Reminders] Critical error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/* 
DEPLOYMENT INSTRUCTIONS:

1. Create the edge function:
   supabase functions new process-prayer-reminders

2. Copy this code to:
   supabase/functions/process-prayer-reminders/index.ts

3. Deploy the function:
   supabase functions deploy process-prayer-reminders

4. Set up cron job to call this function every 15 minutes:

   OPTION A - Using pg_cron (Supabase):
   
   SELECT cron.schedule(
     'process-prayer-reminders',
     '0,15,30,45 * * * *',
     $$
     SELECT net.http_post(
       url:='https://YOUR_PROJECT.supabase.co/functions/v1/process-prayer-reminders',
       headers:='{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     $$
   );

   OPTION B - Using external cron (Node.js, GitHub Actions, etc.):
   
   0,15,30,45 * * * * curl -X POST \
     https://YOUR_PROJECT.supabase.co/functions/v1/process-prayer-reminders \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

   OPTION C - Using Supabase CLI for testing:
   
   supabase functions serve process-prayer-reminders

5. Create optional reminder_failures table for logging:

   CREATE TABLE IF NOT EXISTS reminder_failures (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     reminder_id UUID NOT NULL,
     challenge_id TEXT NOT NULL,
     user_id UUID NOT NULL,
     error_message TEXT NOT NULL,
     failed_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE INDEX idx_reminder_failures_user ON reminder_failures(user_id);
   CREATE INDEX idx_reminder_failures_failed_at ON reminder_failures(failed_at);

6. Monitor function logs:
   supabase functions logs process-prayer-reminders

TESTING:

Test manually by calling the function:

curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/process-prayer-reminders \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

MONITORING:

Monitor the function's performance:
- Check logs for errors
- Track sent vs failed counts
- Monitor reminder delivery rates
- Set up alerts for high failure rates

IMPORTANT NOTES:

1. This function requires SUPABASE_SERVICE_ROLE_KEY environment variable
2. The function processes ALL due reminders in a single batch
3. Failed reminders are logged but won't retry automatically
4. Consider implementing retry logic for production use
5. Adjust cron frequency based on your user base size
6. Monitor function execution time (Supabase has timeout limits)
*/