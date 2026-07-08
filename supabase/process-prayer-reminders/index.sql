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

        // ── Consent check — skip if user opted out of reminders ───────────
        const { data: profile } = await supabaseClient
          .from('user_profiles')
          .select('consent_reminders')
          .eq('user_id', reminder.user_id)
          .single();

        if (profile?.consent_reminders === false) {
          console.log(`[Prayer Reminders] Skipping ${reminder.user_id} — consent_reminders = false`);
        } else {

        // Prepare notification content
        const notificationTitle = `Prayer Reminder: ${reminder.challenge_title}`;
        let notificationBody = `It's time for your ${reminder.reminder_frequency} prayer session.`;

        // Customize message based on streak and sessions
        if (reminder.current_streak && reminder.current_streak > 0) {
          notificationBody = `Keep your ${reminder.current_streak}-day streak going! Time for prayer: ${reminder.challenge_title}`;
        } else if (reminder.completed_sessions && reminder.completed_sessions > 0) {
          notificationBody = `Continue your prayer journey with ${reminder.challenge_title}`;
        }

        // Call push notification function
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
              targetAudience: 'specific_user'
            })
          }
        );

        if (!notificationResponse.ok) {
          const errorText = await notificationResponse.text();
          throw new Error(`Notification failed: ${notificationResponse.status} - ${errorText}`);
        }

        const notificationResult = await notificationResponse.json();
        console.log(`[Prayer Reminders] Notification sent for reminder ${reminder.reminder_id}:`, notificationResult);

        // Mark reminder as sent and calculate next occurrence
        const { error: markError } = await supabaseClient.rpc('mark_prayer_reminder_sent', {
          p_reminder_id: reminder.reminder_id
        });

        if (markError) {
          console.error(`[Prayer Reminders] Error marking reminder ${reminder.reminder_id} as sent:`, markError);
          throw markError;
        }

        sentCount++;
        console.log(`[Prayer Reminders] Successfully processed reminder ${reminder.reminder_id}`);

        } // end else (consent check)

      } catch (error) {
        console.error(`[Prayer Reminders] Failed to process reminder ${reminder.reminder_id}:`, error);
        failedCount++;
        
        // Log failed reminder attempt (optional - create table for this)
        await supabaseClient
          .from('reminder_failures')
          .insert({
            reminder_id: reminder.reminder_id,
            challenge_id: reminder.challenge_id,
            user_id: reminder.user_id,
            error_message: error.message || 'Unknown error',
            failed_at: new Date().toISOString()
          })
          .catch(err => console.error('[Prayer Reminders] Failed to log error:', err));
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

// DEPLOYMENT INSTRUCTIONS:
//
// 1. Create the edge function:
//    supabase functions new process-prayer-reminders
//
// 2. Copy this code to:
//    supabase/functions/process-prayer-reminders/index.ts
//
// 3. Deploy the function:
//    supabase functions deploy process-prayer-reminders
//
// 4. Set up cron job to call this function every 15 minutes:
//
//    OPTION A - Using pg_cron (Supabase):
//
//    SELECT cron.schedule(
//      'process-prayer-reminders',
//      '0,15,30,45 * * * *',
//      $$
//      SELECT net.http_post(
//        url:='https://YOUR_PROJECT.supabase.co/functions/v1/process-prayer-reminders',
//        headers:='{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
//      );
//      $$
//    );
//
//    OPTION B - External cron (every 15 min):
//    curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/process-prayer-reminders
//         -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
//
// 5. Create optional reminder_failures table for logging:
//
//    CREATE TABLE IF NOT EXISTS reminder_failures (
//      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//      reminder_id UUID NOT NULL,
//      challenge_id TEXT NOT NULL,
//      user_id UUID NOT NULL,
//      error_message TEXT NOT NULL,
//      failed_at TIMESTAMPTZ NOT NULL,
//      created_at TIMESTAMPTZ DEFAULT now()
//    );
//
// 6. Monitor function logs:
//    supabase functions logs process-prayer-reminders