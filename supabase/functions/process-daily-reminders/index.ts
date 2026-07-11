// Supabase Edge Function: process-daily-reminders
// ---------------------------------------------------------------------------
// Fires the user-configured "Daily Reminders" (Bible reading, Book summary,
// Prayer challenge, Daily devotional, Scripture memory) as IN-APP notifications
// — rows in public.notifications, which the bell/NotificationFeed reads live.
//
// It is meant to run on a cron every 15 minutes (see schedule.sql). Each tick:
//   1. Loads every user_profile that has daily_reminders set and has not
//      opted out (consent_reminders !== false).
//   2. Computes the user's LOCAL date + minutes-of-day from user_profiles.timezone.
//   3. For each enabled reminder whose local time has just passed (within a
//      grace window), atomically "claims" it for today via daily_reminder_sends
//      and inserts an in-app notification. The claim is what prevents duplicates.
//   4. Also sends a web-push (best-effort). Push is ON by default; set the
//      secret SEND_PUSH_WITH_REMINDERS='false' to turn it off.
//
// Deploy: paste into Supabase Dashboard → Edge Functions → new function
//         named "process-daily-reminders". Requires migration 0141.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// How long after a reminder's set time we will still deliver it (minutes).
// 2× the 15-min cron cadence, so a single missed tick still delivers.
const GRACE_MINUTES = 30;

// Reminder catalogue. `id` must match the ids saved by DailyReminders.tsx.
// `type` drives the colour/label in NotificationFeed's TYPE_META.
// `link` is a URL-hash deep link into the app's tab router.
type ReminderDef = { id: string; type: string; title: string; body: string; link: string };

const REMINDERS: ReminderDef[] = [
  { id: 'bible',      type: 'reading_reminder',    title: '📖 Time for Bible Reading', body: "Open today's scripture reading and spend a few minutes in the Word.", link: '/reading-plan' },
  { id: 'book',       type: 'book_reminder',       title: '📚 Book Summary of the Day', body: "Today's Christian book summary is ready for you.",                     link: '/books' },
  { id: 'prayer',     type: 'prayer_reminder',     title: '🙏 Prayer Challenge',        body: "It's time for your daily prayer challenge. Keep the momentum going!",  link: '/challenges' },
  { id: 'devotional', type: 'devotional_reminder', title: '🌅 Daily Devotional',        body: 'Your devotional is waiting. Start your day grounded in faith.',        link: '/devotional-library' },
  { id: 'memory',     type: 'memory_reminder',     title: '🧠 Scripture Memory',        body: 'Practice your memory verse and hide the Word in your heart.',          link: '/scripture' },
];
const REMINDER_BY_ID = new Map(REMINDERS.map((r) => [r.id, r]));

interface SavedReminder { id: string; enabled: boolean; time: string } // time = "HH:MM"

// Return the user's local calendar date ("YYYY-MM-DD") and minutes-of-day.
function localNow(tz: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
  } catch {
    // Unknown/invalid tz string → fall back to UTC.
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  let hh = get('hour');
  if (hh === '24') hh = '00'; // en-GB renders midnight as "24"
  const minutes = parseInt(hh, 10) * 60 + parseInt(get('minute'), 10);
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Push is ON by default. Set SEND_PUSH_WITH_REMINDERS='false' to disable.
    const sendPush = Deno.env.get('SEND_PUSH_WITH_REMINDERS') !== 'false';

    // 1. Candidate users: reminders configured + not opted out.
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id, daily_reminders, timezone, consent_reminders')
      .not('daily_reminders', 'is', null);

    if (profilesError) throw profilesError;

    let created = 0;
    let skipped = 0;
    let scanned = 0;

    for (const profile of profiles ?? []) {
      if (profile.consent_reminders === false) continue;
      const reminders = profile.daily_reminders as SavedReminder[] | null;
      if (!Array.isArray(reminders) || reminders.length === 0) continue;

      const { date, minutes: nowMin } = localNow(profile.timezone || 'UTC');

      for (const saved of reminders) {
        if (!saved?.enabled) continue;
        const def = REMINDER_BY_ID.get(saved.id);
        if (!def) continue;

        const target = toMinutes(saved.time);
        if (target === null) continue;

        // Fire only if the set time has JUST passed (0..GRACE minutes ago).
        const delta = nowMin - target;
        if (delta < 0 || delta > GRACE_MINUTES) continue;

        scanned++;

        // 3a. Atomically claim today's slot. If the row already exists the
        // upsert with ignoreDuplicates returns no rows → already sent, skip.
        const { data: claim, error: claimError } = await supabase
          .from('daily_reminder_sends')
          .upsert(
            { user_id: profile.user_id, reminder_id: saved.id, sent_on: date },
            { onConflict: 'user_id,reminder_id,sent_on', ignoreDuplicates: true },
          )
          .select();

        if (claimError) {
          console.error(`[daily-reminders] claim failed for ${profile.user_id}/${saved.id}:`, claimError.message);
          continue;
        }
        if (!claim || claim.length === 0) { skipped++; continue; } // already sent today

        // 3b. Insert the in-app notification.
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: profile.user_id,
          type:    def.type,
          title:   def.title,
          message: def.body,
          link:    def.link,
          is_read: false,
        });

        if (notifError) {
          console.error(`[daily-reminders] notify insert failed for ${profile.user_id}/${saved.id}:`, notifError.message);
          continue;
        }
        created++;

        // 4. Optional best-effort push (does not block; never fails the run).
        if (sendPush) {
          supabase.functions.invoke('send-push-notification', {
            body: {
              title: def.title,
              body: def.body,
              link: def.link,
              userId: profile.user_id,
              targetAudience: 'specific_user',
              notificationType: def.type,
            },
          }).catch((e) => console.error('[daily-reminders] push failed:', e?.message));
        }
      }
    }

    console.log(`[daily-reminders] scanned=${scanned} created=${created} skipped=${skipped}`);
    return new Response(
      JSON.stringify({ success: true, scanned, created, skipped, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[daily-reminders] critical error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
