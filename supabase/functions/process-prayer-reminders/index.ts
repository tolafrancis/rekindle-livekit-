// Supabase Edge Function: process-prayer-reminders
// Called by pg_cron every 15 minutes through private.call_edge_fn, which signs
// in with the vault's service role key (verify_jwt = true).
// Deploy with: supabase functions deploy process-prayer-reminders

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Role claim of the caller's JWT. The gateway has already verified the
// signature (verify_jwt = true), so the claim can be trusted here.
function jwtRole(authHeader: string | null): string | null {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    return JSON.parse(json)?.role ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // pg_cron calls with a service-role JWT; the old x-cron-secret header is
  // still accepted.
  const cronSecret = req.headers.get('x-cron-secret');
  const secretOk = !!cronSecret && cronSecret === Deno.env.get('CRON_SHARED_SECRET');
  if (!secretOk && jwtRole(req.headers.get('Authorization')) !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
