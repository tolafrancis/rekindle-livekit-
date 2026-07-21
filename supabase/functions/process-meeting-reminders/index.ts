// Supabase Edge Function: process-meeting-reminders
// ---------------------------------------------------------------------------
// Delivers the per-meeting reminders a host configured on a SCHEDULED ministry
// meeting (reminder_offsets = minutes-before-start). Each recipient gets an
// IN-APP notification (row in public.notifications, read live by the bell) and an
// EMAIL (via Resend).
//
// Recipients = the host + every ACTIVE ministry_member whose role matches the
// meeting's access_level ('leaders' → admin/leader only; otherwise all members).
//
// Runs on a cron every 5 minutes (see schedule.sql). Each tick:
//   1. Load upcoming scheduled meetings that have reminder_offsets.
//   2. For each meeting × offset whose fire time has just passed (0..GRACE min),
//      resolve recipients and, per recipient, atomically CLAIM the slot in
//      meeting_reminder_sends (the unique constraint prevents duplicates), then
//      insert the in-app notification and send the email.
//
// Deploy: Supabase Dashboard → Edge Functions → new function named exactly
//         "process-meeting-reminders". Requires migration 0247.
// Secrets: RESEND_API_KEY, FROM_EMAIL (email), MEETING_APP_ORIGIN (optional,
//          defaults to https://rekindlebc.com), plus the auto-injected
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// How long after an offset's fire time we will still deliver (minutes). 2× the
// 5-min cron cadence, so a single missed tick still delivers.
const GRACE_MINUTES = 10;

interface MeetingRow {
  id: string;
  ministry_id: string;
  host_id: string;
  title: string;
  description: string | null;
  scheduled_time: string;
  timezone: string | null;
  reminder_offsets: number[] | null;
  access_level: string;
  is_active: boolean;
  ended_at: string | null;
}

function fmtWhen(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}

function offsetLabel(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"}`;
  return `${min} minutes`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@rekindlebc.com";
    const appOrigin = (Deno.env.get("MEETING_APP_ORIGIN") || "https://rekindlebc.com").replace(/\/$/, "");

    const now = Date.now();
    // Only meetings starting within the next ~25h are candidates (max offset = 1 day).
    const horizonISO = new Date(now + 25 * 60 * 60 * 1000).toISOString();
    const nowISO = new Date(now).toISOString();

    const { data: meetings, error: meetingsError } = await supabase
      .from("ministry_video_meetings")
      .select("id, ministry_id, host_id, title, description, scheduled_time, timezone, reminder_offsets, access_level, is_active, ended_at")
      .eq("meeting_type", "scheduled")
      .not("reminder_offsets", "is", null)
      .not("scheduled_time", "is", null)
      .is("ended_at", null)
      .eq("is_active", false)
      .gt("scheduled_time", nowISO)
      .lt("scheduled_time", horizonISO);

    if (meetingsError) throw meetingsError;

    let delivered = 0;
    let claimsSkipped = 0;

    for (const meeting of (meetings ?? []) as MeetingRow[]) {
      const offsets = Array.isArray(meeting.reminder_offsets) ? meeting.reminder_offsets : [];
      if (offsets.length === 0) continue;

      const startMs = new Date(meeting.scheduled_time).getTime();

      // Which offsets are firing on this tick?
      const dueOffsets = offsets.filter((off) => {
        const target = startMs - off * 60_000;
        const delta = now - target;
        return delta >= 0 && delta <= GRACE_MINUTES * 60_000;
      });
      if (dueOffsets.length === 0) continue;

      // Resolve recipients once per meeting: host + eligible active members.
      const recipientIds = new Set<string>([meeting.host_id]);
      const leadersOnly = meeting.access_level === "leaders";
      const { data: members } = await supabase
        .from("ministry_members")
        .select("user_id, role")
        .eq("ministry_id", meeting.ministry_id)
        .eq("status", "active");
      for (const m of members ?? []) {
        if (leadersOnly && !["admin", "leader"].includes((m as any).role)) continue;
        if ((m as any).user_id) recipientIds.add((m as any).user_id);
      }

      // Profiles for names, emails and email opt-out.
      const ids = [...recipientIds];
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, full_name, email, consent_reminders")
        .in("user_id", ids);
      const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.user_id, p]));

      const when = fmtWhen(meeting.scheduled_time, meeting.timezone);
      const link = `${appOrigin}/ministry/${meeting.ministry_id}/meeting/${meeting.id}`;

      for (const off of dueOffsets) {
        for (const userId of ids) {
          // Atomically claim (meeting, user, offset). No row back → already sent.
          const { data: claim, error: claimError } = await supabase
            .from("meeting_reminder_sends")
            .upsert(
              { meeting_id: meeting.id, user_id: userId, offset_minutes: off },
              { onConflict: "meeting_id,user_id,offset_minutes", ignoreDuplicates: true },
            )
            .select();
          if (claimError) {
            console.error(`[meeting-reminders] claim failed ${meeting.id}/${userId}/${off}:`, claimError.message);
            continue;
          }
          if (!claim || claim.length === 0) { claimsSkipped++; continue; }

          const lead = offsetLabel(off);
          const title = `⏰ Reminder: ${meeting.title}`;
          const message = `Starts in ${lead} — ${when}.`;

          // In-app notification (always).
          const { error: notifError } = await supabase.from("notifications").insert({
            user_id: userId,
            type: "meeting_reminder",
            title,
            message,
            link,
            ministry_id: meeting.ministry_id,
            is_read: false,
          });
          if (notifError) {
            console.error(`[meeting-reminders] notify insert failed ${meeting.id}/${userId}:`, notifError.message);
          } else {
            delivered++;
          }

          // Email (best-effort; needs RESEND_API_KEY + a profile email + not opted out).
          const profile = profileById.get(userId);
          const email = profile?.email as string | undefined;
          const optedOut = profile?.consent_reminders === false;
          if (resendKey && email && !optedOut) {
            const name = profile?.full_name || "there";
            const html = `
              <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto">
                <h2 style="color:#6d28d9;margin:0 0 8px">${meeting.title}</h2>
                <p style="font-size:15px;color:#111">Hi ${name}, this is a reminder that your meeting starts in <b>${lead}</b>.</p>
                <p style="font-size:15px;color:#111;margin:4px 0"><b>When:</b> ${when}</p>
                ${meeting.description ? `<p style="font-size:14px;color:#444">${meeting.description}</p>` : ""}
                <p style="margin:20px 0">
                  <a href="${link}" style="background:#6d28d9;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Join the meeting</a>
                </p>
                <p style="font-size:12px;color:#888">If the button doesn't work, paste this link into your browser:<br>${link}</p>
              </div>`;
            try {
              const resp = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ from: fromEmail, to: [email], subject: title, html }),
              });
              if (!resp.ok) {
                console.error(`[meeting-reminders] email failed ${email}:`, await resp.text());
              }
            } catch (e) {
              console.error(`[meeting-reminders] email error ${email}:`, (e as Error).message);
            }
          }
        }
      }
    }

    console.log(`[meeting-reminders] delivered=${delivered} skipped=${claimsSkipped}`);
    return new Response(
      JSON.stringify({ success: true, delivered, skipped: claimsSkipped, timestamp: nowISO }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[meeting-reminders] critical error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
