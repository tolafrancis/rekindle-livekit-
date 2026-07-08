// Supabase Edge Function: process-scheduled-broadcasts
//
// PURPOSE
//   Processes rows that are due for delivery from two tables:
//     - broadcast_notifications  (main-app broadcasts from BroadcastMessaging)
//     - ministry_group_broadcasts (group broadcasts from MinistryGroupsManager)
//
// TRIGGER
//   Called by pg_cron every 2 minutes (see cron-setup.sql).
//   Can also be invoked manually via HTTP for testing.
//
// DEPLOY
//   supabase functions deploy process-scheduled-broadcasts
//
// ENV SECRETS  (Supabase Dashboard ? Settings ? Edge Functions)
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Supabase client — service role so we can read and update any row
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function makeClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Helper: invoke a sibling edge function
// ---------------------------------------------------------------------------
async function invokeFunction(
  supabase: ReturnType<typeof makeClient>,
  name: string,
  body: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(`${name} failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Dispatch helpers — one per channel
// ---------------------------------------------------------------------------

/** Push notification via FCM */
async function dispatchPush(
  supabase: ReturnType<typeof makeClient>,
  opts: {
    title: string;
    message: string;
    targetAudience: string;
    referenceId: string;
    ministryId?: string;
  }
) {
  await invokeFunction(supabase, "send-push-notification", {
    title: opts.title,
    body: opts.message,
    targetAudience: opts.targetAudience,
    notificationType: "scheduled_broadcast",
    announcementId: opts.referenceId,
    ministryId: opts.ministryId ?? null,
  });
}

/** Email via Resend through send-ministry-email */
async function dispatchEmail(
  supabase: ReturnType<typeof makeClient>,
  opts: {
    announcementId: string;
    ministryId: string;
    targetAudience: string;
    title: string;
    content: string;
  }
) {
  await invokeFunction(supabase, "send-ministry-email", {
    announcementId: opts.announcementId,
    ministryId: opts.ministryId,
    targetAudience: opts.targetAudience,
    title: opts.title,
    content: opts.content,
  });
}

/** WhatsApp: send to an explicit list of phone numbers via send-whatsapp */
async function dispatchWhatsApp(
  supabase: ReturnType<typeof makeClient>,
  phones: string[],
  title: string,
  message: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const phone of phones) {
    try {
      await invokeFunction(supabase, "send-whatsapp", {
        phone_number: phone,
        message_type: "text",
        message: `*${title}*\n\n${message}`,
      });
      sent++;
    } catch (err) {
      console.error(`WhatsApp send failed for ${phone}:`, err);
      failed++;
    }
  }

  return { sent, failed };
}

// ---------------------------------------------------------------------------
// PART 1 — Process broadcast_notifications (main app BroadcastMessaging)
//
// Schema:
//   id, title, message, channel (comma-separated e.g. "push,whatsapp,inapp"),
//   whatsapp_channels (uuid[]), target_audience, status, scheduled_at, sent_at
// ---------------------------------------------------------------------------
async function processMainAppBroadcasts(
  supabase: ReturnType<typeof makeClient>
): Promise<{ processed: number; errors: number }> {
  const now = new Date().toISOString();

  // Atomically claim all due rows by flipping status to 'processing'.
  // A single UPDATE … RETURNING is one SQL statement — no two concurrent
  // workers can claim the same row.
  const { data: claimed, error: claimErr } = await supabase
    .from("broadcast_notifications")
    .update({ status: "processing" })
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .select("id, title, message, channel, whatsapp_channels, target_audience");

  if (claimErr) {
    console.error("Failed to claim broadcast_notifications rows:", claimErr);
    return { processed: 0, errors: 1 };
  }

  const rows = claimed ?? [];
  if (rows.length === 0) return { processed: 0, errors: 0 };

  console.log(`Claimed ${rows.length} broadcast_notification(s) for processing`);

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    let rowFailed = false;

    try {
      const channels: string[] = (row.channel ?? "")
        .split(",")
        .map((c: string) => c.trim())
        .filter(Boolean);

      const audience = row.target_audience ?? "all";

      // ---- in-app -------------------------------------------------------
      if (channels.includes("inapp")) {
        try {
          await supabase.from("notifications").insert({
            title: row.title,
            message: row.message,
            type: "broadcast",
            target_audience: audience,
            created_at: now,
          });
          console.log(`[${row.id}] in-app notification inserted`);
        } catch (err) {
          console.error(`[${row.id}] in-app failed:`, err);
          rowFailed = true;
        }
      }

      // ---- push ---------------------------------------------------------
      if (channels.includes("push")) {
        try {
          await dispatchPush(supabase, {
            title: row.title,
            message: row.message,
            targetAudience: audience,
            referenceId: row.id,
          });
          console.log(`[${row.id}] push dispatched`);
        } catch (err) {
          console.error(`[${row.id}] push failed:`, err);
          rowFailed = true;
        }
      }

      // ---- whatsapp -----------------------------------------------------
      if (channels.includes("whatsapp")) {
        try {
          const channelIds: string[] = Array.isArray(row.whatsapp_channels)
            ? row.whatsapp_channels
            : [];

          if (channelIds.length > 0) {
            const { data: subscribers } = await supabase
              .from("whatsapp_channel_subscribers")
              .select("phone_number")
              .in("channel_id", channelIds);

            const phones = (subscribers ?? [])
              .map((s: any) => s.phone_number)
              .filter(Boolean);

            if (phones.length > 0) {
              const result = await dispatchWhatsApp(
                supabase,
                phones,
                row.title,
                row.message
              );
              console.log(
                `[${row.id}] WhatsApp: ${result.sent} sent, ${result.failed} failed`
              );
              if (result.failed > 0 && result.sent === 0) rowFailed = true;
            } else {
              console.warn(`[${row.id}] WhatsApp: no subscriber phones found`);
            }
          } else {
            console.warn(`[${row.id}] WhatsApp: no channels selected`);
          }
        } catch (err) {
          console.error(`[${row.id}] WhatsApp failed:`, err);
          rowFailed = true;
        }
      }

      // ---- mark row done ------------------------------------------------
      await supabase
        .from("broadcast_notifications")
        .update({
          status: rowFailed ? "failed" : "sent",
          sent_at: now,
        })
        .eq("id", row.id);

      if (rowFailed) errors++;
      else processed++;
    } catch (outerErr) {
      console.error(`[${row.id}] Unexpected error, marking failed:`, outerErr);
      await supabase
        .from("broadcast_notifications")
        .update({ status: "failed", sent_at: now })
        .eq("id", row.id);
      errors++;
    }
  }

  return { processed, errors };
}

// ---------------------------------------------------------------------------
// PART 2 — Process ministry_group_broadcasts (MinistryGroupsManager)
//
// Schema:
//   id, group_id, sender_id, title, message, channels (text[]),
//   audience ('all'|'leaders'|'active'), status, scheduled_at,
//   recipient_count, delivered_count
// ---------------------------------------------------------------------------
async function processGroupBroadcasts(
  supabase: ReturnType<typeof makeClient>
): Promise<{ processed: number; errors: number }> {
  const now = new Date().toISOString();

  // Claim rows atomically
  const { data: claimed, error: claimErr } = await supabase
    .from("ministry_group_broadcasts")
    .update({ status: "processing" })
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .select("id, group_id, title, message, channels, audience");

  if (claimErr) {
    console.error("Failed to claim ministry_group_broadcasts rows:", claimErr);
    return { processed: 0, errors: 1 };
  }

  const rows = claimed ?? [];
  if (rows.length === 0) return { processed: 0, errors: 0 };

  console.log(`Claimed ${rows.length} ministry_group_broadcast(s) for processing`);

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    let rowFailed = false;
    let recipientCount = 0;
    let deliveredCount = 0;

    try {
      const channels: string[] = Array.isArray(row.channels)
        ? row.channels
        : [row.channels].filter(Boolean);

      // ---- Resolve group members based on audience ----------------------
      let memberQuery = supabase
        .from("ministry_group_members")
        .select("user_id, role")
        .eq("group_id", row.group_id)
        .eq("can_receive_broadcasts", true);

      if (row.audience === "leaders") {
        memberQuery = memberQuery.in("role", ["admin", "leader"]);
      }
      // 'active' and 'all' get every member with can_receive_broadcasts=true

      const { data: members, error: memberErr } = await memberQuery;
      if (memberErr) throw memberErr;

      const memberUserIds: string[] = (members ?? [])
        .map((m: any) => m.user_id)
        .filter(Boolean);

      recipientCount = memberUserIds.length;

      if (memberUserIds.length === 0) {
        console.warn(`[${row.id}] No eligible members — skipping dispatch`);
        await supabase
          .from("ministry_group_broadcasts")
          .update({ status: "sent", sent_at: now, recipient_count: 0 })
          .eq("id", row.id);
        processed++;
        continue;
      }

      // ---- push ----------------------------------------------------------
      if (channels.includes("push")) {
        try {
          await dispatchPush(supabase, {
            title: row.title,
            message: row.message,
            targetAudience: row.audience ?? "all",
            referenceId: row.id,
            ministryId: row.group_id,
          });
          deliveredCount += memberUserIds.length;
          console.log(`[${row.id}] push dispatched`);
        } catch (err) {
          console.error(`[${row.id}] push failed:`, err);
          rowFailed = true;
        }
      }

      // ---- email ---------------------------------------------------------
      if (channels.includes("email")) {
        try {
          await dispatchEmail(supabase, {
            announcementId: row.id,
            ministryId: row.group_id,
            targetAudience: row.audience ?? "all",
            title: row.title,
            content: row.message,
          });
          deliveredCount += memberUserIds.length;
          console.log(`[${row.id}] email dispatched`);
        } catch (err) {
          console.error(`[${row.id}] email failed:`, err);
          rowFailed = true;
        }
      }

      // ---- whatsapp ------------------------------------------------------
      if (channels.includes("whatsapp")) {
        try {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("phone_number")
            .in("user_id", memberUserIds)
            .not("phone_number", "is", null);

          const phones: string[] = (profiles ?? [])
            .map((p: any) => p.phone_number)
            .filter(Boolean);

          if (phones.length > 0) {
            const result = await dispatchWhatsApp(
              supabase,
              phones,
              row.title,
              row.message
            );
            deliveredCount += result.sent;
            console.log(
              `[${row.id}] WhatsApp: ${result.sent} sent, ${result.failed} failed`
            );
            if (result.failed > 0 && result.sent === 0) rowFailed = true;
          } else {
            console.warn(`[${row.id}] WhatsApp: no member phone numbers found`);
          }
        } catch (err) {
          console.error(`[${row.id}] WhatsApp failed:`, err);
          rowFailed = true;
        }
      }

      // ---- in-app --------------------------------------------------------
      if (channels.includes("in-app")) {
        try {
          const notifications = memberUserIds.map((uid: string) => ({
            user_id: uid,
            title: row.title,
            message: row.message,
            type: "group_broadcast",
            reference_id: row.id,
            is_read: false,
            created_at: now,
          }));
          const { error: notifErr } = await supabase
            .from("broadcast_notifications")
            .insert(notifications);
          if (notifErr) throw notifErr;
          deliveredCount += memberUserIds.length;
          console.log(`[${row.id}] in-app notifications inserted for ${memberUserIds.length} members`);
        } catch (err) {
          console.error(`[${row.id}] in-app failed:`, err);
          rowFailed = true;
        }
      }

      // ---- mark row done ------------------------------------------------
      await supabase
        .from("ministry_group_broadcasts")
        .update({
          status: rowFailed ? "failed" : "sent",
          sent_at: now,
          recipient_count: recipientCount,
          delivered_count: deliveredCount,
        })
        .eq("id", row.id);

      if (rowFailed) errors++;
      else processed++;
    } catch (outerErr) {
      console.error(`[${row.id}] Unexpected error, marking failed:`, outerErr);
      await supabase
        .from("ministry_group_broadcasts")
        .update({
          status: "failed",
          sent_at: now,
          recipient_count: recipientCount,
        })
        .eq("id", row.id);
      errors++;
    }
  }

  return { processed, errors };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Accept calls from pg_cron (no body) or authenticated HTTP clients.
  // pg_cron passes the service role key in the Authorization header (see cron-setup.sql).
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader.includes(SERVICE_ROLE_KEY);
  const isCronHeader = req.headers.get("x-cron-source") === "pg_cron";

  if (!isServiceRole && !isCronHeader) {
    // Fail open in development (no SERVICE_ROLE_KEY set means we're in test mode)
    if (SERVICE_ROLE_KEY !== "") {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  const startTime = Date.now();
  const supabase = makeClient();

  console.log("process-scheduled-broadcasts: starting run at", new Date().toISOString());

  // Run both processors concurrently — they touch different tables
  const [mainResult, groupResult] = await Promise.all([
    processMainAppBroadcasts(supabase),
    processGroupBroadcasts(supabase),
  ]);

  const summary = {
    run_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    broadcast_notifications: mainResult,
    ministry_group_broadcasts: groupResult,
    total_processed: mainResult.processed + groupResult.processed,
    total_errors: mainResult.errors + groupResult.errors,
  };

  console.log("process-scheduled-broadcasts: complete", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});