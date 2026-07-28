// Supabase Edge Function: process-meeting-reminders
// ---------------------------------------------------------------------------
// Delivers the per-meeting reminders a host configured on a SCHEDULED meeting
// (reminder_offsets = minutes-before-start), for BOTH meeting kinds:
//   • ministry meetings  (public.ministry_video_meetings)
//   • live-channel meetings (public.live_channel_video_meetings)
//
// Each recipient gets an IN-APP notification (row in public.notifications, read
// live by the bell) and an EMAIL (via Resend).
//
// Recipients = the host + eligible members/followers (access-level aware) + anyone
// who REGISTERED (public.meeting_registrations), including guests (email only).
//
// Runs on a cron every 5 minutes (see schedule.sql). Idempotent via
// public.meeting_reminder_sends, keyed on (meeting_id, recipient_key, offset) —
// recipient_key = a user's uuid, or 'guest:'+lower(email).
//
// Deploy: Supabase Dashboard → Edge Functions → function named exactly
//         "process-meeting-reminders". Requires migrations 0247 + 0248.
// Secrets: RESEND_API_KEY, FROM_EMAIL, MEETING_APP_ORIGIN (channel links),
//          MINISTRY_APP_ORIGIN (ministry links; defaults to MEETING_APP_ORIGIN),
//          plus auto-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRACE_MINUTES = 10; // 2× the 5-min cadence, so one missed tick still delivers.

type Kind = "ministry" | "channel";

interface Recipient {
  key: string;            // ledger dedupe key: user uuid, or 'guest:'+email
  userId: string | null;  // for the in-app notification
  email: string | null;   // for the email
  name: string | null;
  optedOut?: boolean;     // profile consent_reminders === false → skip email
}

function fmtWhen(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC", dateStyle: "medium", timeStyle: "short", timeZoneName: "short",
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

  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== Deno.env.get("CRON_SHARED_SECRET")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@rekindlebc.com";
    const channelOrigin = (Deno.env.get("MEETING_APP_ORIGIN") || "https://app.rekindlebc.com").replace(/\/$/, "");
    const ministryOrigin = (Deno.env.get("MINISTRY_APP_ORIGIN") || Deno.env.get("MEETING_APP_ORIGIN") || "https://rekindlebc.com").replace(/\/$/, "");

    const now = Date.now();
    const horizonISO = new Date(now + 25 * 60 * 60 * 1000).toISOString();
    const nowISO = new Date(now).toISOString();

    let delivered = 0;
    let skipped = 0;

    const KINDS: {
      kind: Kind;
      table: string;
      ownerCol: "ministry_id" | "channel_id";
      path: (m: any) => string;
      origin: string;
    }[] = [
      { kind: "ministry", table: "ministry_video_meetings", ownerCol: "ministry_id",
        path: (m) => `/ministry/${m.ministry_id}/meeting/${m.id}`, origin: ministryOrigin },
      { kind: "channel", table: "live_channel_video_meetings", ownerCol: "channel_id",
        path: (m) => `/channel/${m.channel_id}/meeting/${m.id}`, origin: channelOrigin },
    ];

    for (const K of KINDS) {
      const { data: meetings, error } = await supabase
        .from(K.table)
        .select(`id, ${K.ownerCol}, host_id, title, description, scheduled_time, timezone, reminder_offsets, access_level, is_active, ended_at`)
        .eq("meeting_type", "scheduled")
        .not("reminder_offsets", "is", null)
        .not("scheduled_time", "is", null)
        .is("ended_at", null)
        .eq("is_active", false)
        .gt("scheduled_time", nowISO)
        .lt("scheduled_time", horizonISO);
      if (error) { console.error(`[meeting-reminders] ${K.kind} query:`, error.message); continue; }

      for (const meeting of meetings ?? []) {
        const offsets: number[] = Array.isArray(meeting.reminder_offsets) ? meeting.reminder_offsets : [];
        if (offsets.length === 0) continue;
        const startMs = new Date(meeting.scheduled_time).getTime();
        const dueOffsets = offsets.filter((off) => {
          const delta = now - (startMs - off * 60_000);
          return delta >= 0 && delta <= GRACE_MINUTES * 60_000;
        });
        if (dueOffsets.length === 0) continue;

        // ── Resolve recipients ────────────────────────────────────────────────
        const byKey = new Map<string, Recipient>();
        const addUser = (uid: string) => { if (uid && !byKey.has(uid)) byKey.set(uid, { key: uid, userId: uid, email: null, name: null }); };

        addUser(meeting.host_id);

        if (K.kind === "ministry") {
          const leadersOnly = meeting.access_level === "leaders";
          const { data: members } = await supabase
            .from("ministry_members").select("user_id, role")
            .eq("ministry_id", meeting.ministry_id).eq("status", "active");
          for (const m of members ?? []) {
            if (leadersOnly && !["admin", "leader"].includes((m as any).role)) continue;
            if ((m as any).user_id) addUser((m as any).user_id);
          }
        } else {
          if (meeting.access_level === "cohosts") {
            const { data: cohosts } = await supabase
              .from("channel_co_hosts").select("user_id").eq("channel_id", meeting.channel_id);
            for (const c of cohosts ?? []) if ((c as any).user_id) addUser((c as any).user_id);
          } else {
            const { data: followers } = await supabase
              .from("channel_followers").select("user_id, notifications_enabled").eq("channel_id", meeting.channel_id);
            for (const f of followers ?? []) {
              if ((f as any).notifications_enabled === false) continue;
              if ((f as any).user_id) addUser((f as any).user_id);
            }
          }
        }

        // Registrants (both kinds). Users merge by uid; guests keyed by email.
        const { data: regs } = await supabase
          .from("meeting_registrations")
          .select("user_id, guest_name, guest_email")
          .eq("meeting_id", meeting.id).eq("status", "registered");
        for (const r of regs ?? []) {
          const uid = (r as any).user_id as string | null;
          if (uid) { addUser(uid); continue; }
          const email = ((r as any).guest_email as string | null)?.toLowerCase();
          if (!email) continue;
          const gkey = `guest:${email}`;
          if (!byKey.has(gkey)) byKey.set(gkey, { key: gkey, userId: null, email, name: (r as any).guest_name ?? null });
        }

        // Hydrate member/host emails, names and email opt-out from profiles.
        const userIds = [...byKey.values()].filter((r) => r.userId).map((r) => r.userId!) as string[];
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from("user_profiles").select("user_id, full_name, email, consent_reminders").in("user_id", userIds);
          for (const p of profiles ?? []) {
            const rec = byKey.get((p as any).user_id);
            if (rec) { rec.email = (p as any).email ?? null; rec.name = (p as any).full_name ?? null; rec.optedOut = (p as any).consent_reminders === false; }
          }
        }

        const when = fmtWhen(meeting.scheduled_time, meeting.timezone);
        const path = K.path(meeting);
        const emailUrl = `${K.origin}${path}`;

        for (const off of dueOffsets) {
          const lead = offsetLabel(off);
          const title = `⏰ Reminder: ${meeting.title}`;
          const message = `Starts in ${lead} — ${when}.`;

          for (const rec of byKey.values()) {
            // Claim (meeting, recipient, offset). No row back → already sent.
            const { data: claim, error: claimErr } = await supabase
              .from("meeting_reminder_sends")
              .upsert(
                { meeting_id: meeting.id, meeting_kind: K.kind, recipient_key: rec.key, offset_minutes: off },
                { onConflict: "meeting_id,recipient_key,offset_minutes", ignoreDuplicates: true },
              ).select();
            if (claimErr) { console.error(`[meeting-reminders] claim ${meeting.id}/${rec.key}/${off}:`, claimErr.message); continue; }
            if (!claim || claim.length === 0) { skipped++; continue; }

            // In-app (only for real users).
            if (rec.userId) {
              const { error: nErr } = await supabase.from("notifications").insert({
                user_id: rec.userId, type: "meeting_reminder", title, message, link: path, is_read: false,
              });
              if (nErr) console.error(`[meeting-reminders] notify ${meeting.id}/${rec.userId}:`, nErr.message);
              else delivered++;
            }

            // Email (best-effort; needs key + address + not opted out).
            if (resendKey && rec.email && !rec.optedOut) {
              const html = `
                <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto">
                  <h2 style="color:#6d28d9;margin:0 0 8px">${meeting.title}</h2>
                  <p style="font-size:15px;color:#111">Hi ${rec.name || "there"}, this is a reminder that your meeting starts in <b>${lead}</b>.</p>
                  <p style="font-size:15px;color:#111;margin:4px 0"><b>When:</b> ${when}</p>
                  ${meeting.description ? `<p style="font-size:14px;color:#444">${meeting.description}</p>` : ""}
                  <p style="margin:20px 0"><a href="${emailUrl}" style="background:#6d28d9;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Join the meeting</a></p>
                  <p style="font-size:12px;color:#888">If the button doesn't work, paste this link into your browser:<br>${emailUrl}</p>
                </div>`;
              try {
                const resp = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ from: fromEmail, to: [rec.email], subject: title, html }),
                });
                if (!resp.ok) console.error(`[meeting-reminders] email ${rec.email}:`, await resp.text());
              } catch (e) {
                console.error(`[meeting-reminders] email err ${rec.email}:`, (e as Error).message);
              }
            }
          }
        }
      }
    }

    console.log(`[meeting-reminders] delivered=${delivered} skipped=${skipped}`);
    return new Response(
      JSON.stringify({ success: true, delivered, skipped, timestamp: nowISO }),
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
