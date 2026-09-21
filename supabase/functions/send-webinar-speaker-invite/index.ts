// Supabase Edge Function: send-webinar-speaker-invite
// ---------------------------------------------------------------------------
// Sends the invite email for a single webinar_speakers row (added by
// CreateWebinarWizard.tsx's "Speakers & co-hosts" section, or invited later).
// Called directly from the client right after webinarControl.ts's
// createWebinarSpeaker() inserts the row — best-effort, same as
// process-meeting-reminders' email step (a failure here doesn't roll back
// the invite row; the host can always re-send).
//
// The link points at /webinar-invite/:token — a public route (both apps)
// backed by migration 0365's get_webinar_speaker_invite/
// accept_webinar_speaker_invite RPCs, mirroring MinistryJoinLanding's
// inline-auth pattern.
//
// Deploy: npx supabase functions deploy send-webinar-speaker-invite --project-ref vpnpembyqbbaaiynfvli
// Secrets: RESEND_API_KEY, FROM_EMAIL, MINISTRY_APP_ORIGIN,
//          plus auto-injected SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL");
    const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@rekindlebc.com";
    const origin = Deno.env.get("MINISTRY_APP_ORIGIN") || "https://rekindlebc.com";

    const { speakerId } = await req.json();
    if (!speakerId) {
      return new Response(JSON.stringify({ error: "speakerId required" }), { status: 400, headers: corsHeaders });
    }

    const userClient = createClient(SB_URL!, SB_ANON!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });
    }

    const admin = createClient(SB_URL!, SB_SERVICE!);

    const { data: speaker, error: speakerErr } = await admin
      .from("webinar_speakers")
      .select("id, webinar_id, invited_email, invited_name, invite_token, role, status")
      .eq("id", speakerId)
      .maybeSingle();
    if (speakerErr || !speaker) {
      return new Response(JSON.stringify({ error: "Speaker invite not found" }), { status: 404, headers: corsHeaders });
    }
    if (!speaker.invited_email) {
      // Pre-assigned by user_id (an existing member picked directly, not by
      // email) — nothing to send. Not an error.
      return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: corsHeaders });
    }

    const { data: isManager } = await admin.rpc("is_webinar_manager", {
      p_webinar_id: speaker.webinar_id, p_user_id: caller.id,
    });
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Not authorized for this webinar" }), { status: 403, headers: corsHeaders });
    }

    const { data: webinar } = await admin
      .from("ministry_webinars")
      .select("title, ministry_id")
      .eq("id", speaker.webinar_id)
      .maybeSingle();
    const { data: ministryName } = await admin.rpc("public_ministry_name", { p_id: webinar?.ministry_id });

    const title = webinar?.title || "a webinar";
    const roleLabel = speaker.role === "host" || speaker.role === "co-host" ? "co-host" : "speaker";
    const inviteUrl = `${origin}/webinar-invite/${speaker.invite_token}`;
    const subject = `You're invited to speak at "${title}"`;

    if (!resendKey) {
      console.error("[send-webinar-speaker-invite] RESEND_API_KEY not set, skipping email");
      return new Response(JSON.stringify({ error: "Email not configured" }), { status: 500, headers: corsHeaders });
    }

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#6d28d9;margin:0 0 8px">${title}</h2>
        <p style="font-size:15px;color:#111">Hi ${speaker.invited_name || "there"}, ${ministryName || "the host"} has invited you as a <b>${roleLabel}</b> for this upcoming webinar.</p>
        <p style="margin:20px 0"><a href="${inviteUrl}" style="background:#6d28d9;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">View invite</a></p>
        <p style="font-size:12px;color:#888">If the button doesn't work, paste this link into your browser:<br>${inviteUrl}</p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [speaker.invited_email], subject, html }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[send-webinar-speaker-invite] email ${speaker.invited_email}:`, text);
      return new Response(JSON.stringify({ error: "Email send failed" }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ sent: true }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[send-webinar-speaker-invite] error:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
