// Supabase Edge Function: send-ministry-member-invite
// Deploy with: supabase functions deploy send-ministry-member-invite
//
// Backs the "Invite Member" dialog on the ministry Members page. Emails each
// address a personal invitation with the ministry's real join link
// (/join/<slug>?code=…&v=…, the same link as the QR code), so the invitee
// lands on MinistryJoinLanding and signs up or signs in to join.
//
// Body: { ministryId, emails: string[], message?, origin? }
//   origin — the web origin the leader is using (window origin / public web
//   origin). Only rekindlebc.com, its subdomains, or this ministry's own active
//   custom domain are accepted; anything else falls back to https://rekindlebc.com
//   so the email can never carry a link to an arbitrary site.
//
// Secrets: RESEND_API_KEY, FROM_EMAIL (same as send-ministry-email).
// Only admins of this ministry (is_group_admin) or platform admins may call it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_REQUEST = 25;
const MAX_PER_DAY = 300; // per ministry, across all calls
const DEFAULT_ORIGIN = "https://rekindlebc.com";
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function safeOrigin(raw: unknown, customDomain: string | null, domainActive: boolean): string {
  if (typeof raw !== "string" || !raw) return DEFAULT_ORIGIN;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return DEFAULT_ORIGIN;
    const host = u.hostname.toLowerCase();
    if (host === "rekindlebc.com" || host.endsWith(".rekindlebc.com")) return `https://${host}`;
    if (domainActive && customDomain && host === customDomain.toLowerCase()) return `https://${host}`;
  } catch { /* fall through */ }
  return DEFAULT_ORIGIN;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ministryId, emails, message, origin } = await req.json();

    if (!ministryId || !Array.isArray(emails)) {
      return json({ error: "ministryId and emails are required" }, 400);
    }

    // Normalise + dedupe; split out anything that isn't an email address.
    const seen = new Set<string>();
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const raw of emails) {
      const e = String(raw ?? "").trim().toLowerCase();
      if (!e || seen.has(e)) continue;
      seen.add(e);
      (EMAIL_RE.test(e) ? valid : invalid).push(e);
    }
    if (valid.length === 0) return json({ error: "No valid email addresses", invalid }, 400);
    if (valid.length > MAX_PER_REQUEST) {
      return json({ error: `You can invite up to ${MAX_PER_REQUEST} people at a time.` }, 400);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // -- Authorization: an admin of THIS ministry, or a platform admin --------
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : { data: { user: null } };
    if (!user) return json({ error: "Unauthorized: please sign in again." }, 401);

    const [{ data: isMinistryAdmin }, { data: callerProfile }] = await Promise.all([
      supabase.rpc("is_group_admin", { p_ministry_id: ministryId, p_user_id: user.id }),
      supabase.from("user_profiles").select("role, full_name").eq("user_id", user.id).maybeSingle(),
    ]);
    const isPlatformAdmin = ["admin", "super_admin"].includes(callerProfile?.role ?? "");
    if (!isMinistryAdmin && !isPlatformAdmin) {
      return json({ error: "Only this ministry's admins can send invitations." }, 403);
    }

    // -- Ministry + its join link ----------------------------------------------
    const { data: ministry, error: mErr } = await supabase
      .from("ministry_groups")
      .select("name, slug, invite_code, qr_code_version, logo_url, white_label_domain, domain_status")
      .eq("id", ministryId)
      .maybeSingle();
    if (mErr || !ministry) return json({ error: "Ministry not found" }, 404);
    if (!ministry.slug) {
      return json({ error: "This ministry has no join link yet. Set one in Members › Join link & QR." }, 400);
    }

    const base = safeOrigin(origin, ministry.white_label_domain, ministry.domain_status === "active");
    const params = new URLSearchParams();
    if (ministry.invite_code) params.set("code", ministry.invite_code);
    if (ministry.qr_code_version) params.set("v", String(ministry.qr_code_version));
    const qs = params.toString();
    const joinUrl = `${base}/join/${encodeURIComponent(ministry.slug)}${qs ? `?${qs}` : ""}`;

    // -- Daily cap per ministry (abuse guard: this sends from our domain) -------
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from("broadcast_logs")
      .select("successful_sends")
      .eq("channel", "email")
      .eq("mode", "member_invite")
      .eq("error_details->>ministryId", ministryId)
      .gte("sent_at", since);
    const sentToday = (recentLogs ?? []).reduce((n: number, r: any) => n + (r.successful_sends ?? 0), 0);
    if (sentToday + valid.length > MAX_PER_DAY) {
      return json({
        error: `Daily invite limit reached (${MAX_PER_DAY} per day). Share your join link or QR code instead, or try again tomorrow.`,
      }, 429);
    }

    // -- Skip people who are already members -----------------------------------
    const { data: existing } = await supabase
      .from("ministry_group_members")
      .select("user_profiles!inner(email)")
      .eq("group_id", ministryId)
      .in("user_profiles.email", valid);
    const memberEmails = new Set(
      (existing ?? []).map((m: any) => String(m.user_profiles?.email ?? "").toLowerCase()),
    );
    const alreadyMembers = valid.filter((e) => memberEmails.has(e));
    const toSend = valid.filter((e) => !memberEmails.has(e));

    // -- Build the email ---------------------------------------------------------
    const ministryName = esc(ministry.name || "Your ministry");
    const inviter = esc(callerProfile?.full_name || "");
    const personal = typeof message === "string" ? message.trim().slice(0, 1000) : "";
    const personalHtml = personal
      ? `<div style="margin:0 0 24px;padding:16px 20px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:6px;color:#374151;line-height:1.6;">${
          esc(personal).replace(/\n/g, "<br/>")
        }${inviter ? `<p style="margin:10px 0 0;color:#6b7280;font-size:13px;">— ${inviter}</p>` : ""}</div>`
      : "";
    const logo = ministry.logo_url && /^https:\/\//.test(ministry.logo_url)
      ? `<img src="${esc(ministry.logo_url)}" alt="" width="56" height="56" style="border-radius:12px;display:block;margin:0 0 12px;background:#fff;" />`
      : "";
    const link = esc(joinUrl);

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px;">
          ${logo}
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">${ministryName}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">You're invited to join ${ministryName} on Rekindle</h1>
          ${personalHtml}
          <p style="margin:0 0 12px;line-height:1.6;color:#374151;">Read our daily devotional, join your small group, share prayer requests and watch our services live, all in one place.</p>
          <p style="margin:0 0 12px;line-height:1.6;color:#374151;">It takes about two minutes. Use this email address when you sign up so we recognise you. If you're asked "Is this you?", tap <strong>This is me</strong>.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${link}" style="background:#7c3aed;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block;">Join ${ministryName}</a>
          </div>
          <p style="margin:0;line-height:1.6;color:#6b7280;font-size:13px;">Already on Rekindle? Open the link and sign in to join.<br/>Button not working? Copy this link: <a href="${link}" style="color:#7c3aed;word-break:break-all;">${link}</a></p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            ${inviter ? `${inviter} at ` : ""}<strong>${ministryName}</strong> invited you to join them on Rekindle.<br/>
            If you weren't expecting this, you can ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      `You're invited to join ${ministry.name} on Rekindle.`,
      personal ? `\n${personal}${callerProfile?.full_name ? `\n— ${callerProfile.full_name}` : ""}\n` : "",
      "Read our daily devotional, join your small group, share prayer requests and watch our services live.",
      `Join here (about two minutes): ${joinUrl}`,
      "Use this email address when you sign up so we recognise you. Already on Rekindle? Open the link and sign in.",
    ].join("\n");

    // -- Send --------------------------------------------------------------------
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@rekindlebc.com";
    const sent: string[] = [];
    const failed: string[] = [];

    if (!resendKey) {
      console.warn("RESEND_API_KEY not set — invite emails not sent");
      return json({ error: "Email sending isn't configured yet. Please contact support." }, 503);
    }

    const results = await Promise.allSettled(
      toSend.map((to) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: `${(ministry.name || "Rekindle").replace(/[<>"]/g, "")} <${fromEmail}>`,
            to: [to],
            subject: `You're invited to join ${ministry.name} on Rekindle`,
            html,
            text,
          }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
        })
      ),
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") sent.push(toSend[i]);
      else { failed.push(toSend[i]); console.error("invite send failed", toSend[i], r.reason); }
    });

    const { error: logError } = await supabase.from("broadcast_logs").insert({
      title: `Member invite: ${ministry.name}`,
      message: personal.slice(0, 500),
      channel: "email",
      recipients_count: toSend.length,
      successful_sends: sent.length,
      failed_sends: failed.length,
      sent_at: new Date().toISOString(),
      subject: `You're invited to join ${ministry.name} on Rekindle`,
      sender_name: callerProfile?.full_name ?? null,
      // broadcast_logs has no metadata column; mode + error_details carry what
      // the daily cap above filters on.
      mode: "member_invite",
      error_details: { ministryId, invitedBy: user.id, failed },
    });
    if (logError) console.error("Failed to write broadcast log:", logError);

    return json({ success: true, sent, failed, alreadyMembers, invalid, joinUrl });
  } catch (error) {
    console.error("send-ministry-member-invite error:", error);
    return json({ error: (error as Error).message || "Unexpected error" }, 500);
  }
});
