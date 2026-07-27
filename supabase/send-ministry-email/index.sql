// Supabase Edge Function: send-ministry-email
// Deploy with: supabase functions deploy send-ministry-email
//
// Required env secrets (set in Supabase Dashboard ? Settings ? Edge Functions):
//   RESEND_API_KEY   � from resend.com
//   FROM_EMAIL       � e.g. announcements@yourdomain.com
//   SUPABASE_URL     � auto-injected
//   SUPABASE_SERVICE_ROLE_KEY � auto-injected

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendMinistryEmailPayload {
  // Optional — only set when the send is tied to a published announcement
  // (MinistryAnnouncementsManager). A standalone broadcast has no announcement.
  announcementId?: string;
  ministryId: string;
  targetAudience: "all" | "leaders" | "premium" | "volunteers";
  title: string;
  content: string;
  category?: string;
  priority?: string;
  linkUrl?: string;
  linkText?: string;
  imageUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: SendMinistryEmailPayload = await req.json();
    const {
      announcementId,
      ministryId,
      targetAudience,
      title,
      content,
      category,
      priority,
      linkUrl,
      linkText,
      imageUrl,
    } = payload;

    // -- Validation --------------------------------------------------------
    if (!ministryId || !title || !content) {
      return new Response(
        JSON.stringify({
          error: "ministryId, title, and content are required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("FROM_EMAIL") || "announcements@gracecounsel.app";

    // -- Supabase client ---------------------------------------------------
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // -- Fetch ministry name -----------------------------------------------
    // NOTE: this previously read from `ministries`/`ministry_members`/`profiles`
    // — tables that don't exist in the current schema (ministry_groups /
    // ministry_group_members / user_profiles). That meant this function threw
    // on every real call; fixed here to match the schema every other ministry
    // function in this repo uses.
    const { data: ministry } = await supabase
      .from("ministry_groups")
      .select("name")
      .eq("id", ministryId)
      .single();
    const ministryName = ministry?.name ?? "Your Ministry";

    // -- Resolve recipient emails ------------------------------------------
    // "premium"/"volunteers" don't map to anything on ministry_group_members
    // (no subscription tier or volunteer role lives there) — fall back to
    // "all" for those rather than silently returning zero recipients.
    let membersQuery = supabase
      .from("ministry_group_members")
      .select("user_id, role, is_leader, user_profiles!inner(email, full_name)")
      .eq("group_id", ministryId);

    if (targetAudience === "leaders") {
      membersQuery = membersQuery.or("is_leader.eq.true,role.in.(admin,moderator)");
    }

    const { data: members, error: membersError } = await membersQuery;

    if (membersError) {
      console.error("Error fetching members:", membersError);
      throw membersError;
    }

    const recipients: Array<{ email: string; name: string }> = (members ?? [])
      .map((m: any) => ({
        email: m.user_profiles?.email ?? "",
        name: m.user_profiles?.full_name ?? "Member",
      }))
      .filter((r) => Boolean(r.email));

    console.log(
      `Sending ministry email to ${recipients.length} recipients (audience: ${targetAudience})`
    );

    if (recipients.length === 0) {
      // Still mark announcement as notified, just no recipients
      await supabase
        .from("broadcast_logs")
        .insert({
          title,
          message: content.slice(0, 500),
          channel: "email",
          recipients_count: 0,
          successful_sends: 0,
          failed_sends: 0,
          sent_at: new Date().toISOString(),
          metadata: { announcementId, ministryId, targetAudience },
        })
        .catch((e) => console.error("Log error:", e));

      return new Response(
        JSON.stringify({
          success: true,
          message: "No recipients found for target audience",
          sent: 0,
          failed: 0,
          total: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -- Build HTML email --------------------------------------------------
    const priorityBanner =
      priority === "urgent"
        ? `<div style="background:#ef4444;color:#fff;padding:8px 24px;font-weight:700;text-align:center;font-size:13px;letter-spacing:.5px;">? URGENT ANNOUNCEMENT</div>`
        : priority === "high"
        ? `<div style="background:#f97316;color:#fff;padding:8px 24px;font-weight:700;text-align:center;font-size:13px;letter-spacing:.5px;">HIGH PRIORITY</div>`
        : "";

    const imageBlock = imageUrl
      ? `<img src="${imageUrl}" alt="${title}" style="width:100%;max-height:300px;object-fit:cover;display:block;" />`
      : "";

    const ctaBlock =
      linkUrl && linkText
        ? `<div style="text-align:center;margin-top:28px;">
             <a href="${linkUrl}" style="background:#7c3aed;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">${linkText}</a>
           </div>`
        : "";

    const contentHtml = content
      .split("\n")
      .map((line) =>
        line.trim()
          ? `<p style="margin:0 0 12px;line-height:1.6;color:#374151;">${line}</p>`
          : `<br/>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px;">
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${ministryName}</p>
          ${category ? `<span style="display:inline-block;background:rgba(255,255,255,.2);color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;margin-top:6px;">${category}</span>` : ""}
        </td></tr>
        <!-- Priority banner -->
        ${priorityBanner ? `<tr><td>${priorityBanner}</td></tr>` : ""}
        <!-- Image -->
        ${imageBlock ? `<tr><td>${imageBlock}</td></tr>` : ""}
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">${title}</h1>
          ${contentHtml}
          ${ctaBlock}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            You're receiving this because you're a member of <strong>${ministryName}</strong>.<br/>
            This announcement was sent via Grace Counsel.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // -- Send emails -------------------------------------------------------
    let successful = 0;
    let failed = 0;

    if (!resendKey) {
      // Development mode � log and return simulated success
      console.warn("RESEND_API_KEY not set � simulating email delivery");
      console.log("Would send to:", recipients.map((r) => r.email));
      successful = recipients.length;
    } else {
      // Production: send in batches of 50 to respect Resend rate limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((recipient) =>
            fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
              },
              body: JSON.stringify({
                from: `${ministryName} <${fromEmail}>`,
                to: [recipient.email],
                subject: `[${ministryName}] ${title}`,
                html,
              }),
            }).then(async (res) => {
              if (!res.ok) {
                const err = await res.text();
                throw new Error(`Resend error ${res.status}: ${err}`);
              }
              return res.json();
            })
          )
        );

        successful += results.filter((r) => r.status === "fulfilled").length;
        failed += results.filter((r) => r.status === "rejected").length;

        // Respect rate limits between batches
        if (i + BATCH_SIZE < recipients.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }

    console.log(
      `Ministry email complete: ${successful} sent, ${failed} failed`
    );

    // -- Write broadcast log -----------------------------------------------
    await supabase
      .from("broadcast_logs")
      .insert({
        title,
        message: content.slice(0, 500),
        channel: "email",
        recipients_count: recipients.length,
        successful_sends: successful,
        failed_sends: failed,
        sent_at: new Date().toISOString(),
        metadata: { announcementId, ministryId, targetAudience },
      })
      .catch((e) => console.error("Failed to write broadcast log:", e));

    return new Response(
      JSON.stringify({
        success: true,
        message: resendKey
          ? "Ministry announcement emails sent"
          : "Ministry announcement emails sent (simulated � set RESEND_API_KEY for production)",
        sent: successful,
        failed,
        total: recipients.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-ministry-email error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Unexpected error",
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});