// Supabase Edge Function: webinar-registration
// ---------------------------------------------------------------------------
// Zoom-style webinar registration (migration 0427).
//
//   { action: 'register', webinarId, name?, email? }
//     Signed-in members register as themselves. Signed-out visitors register
//     as guests (name + email) — PUBLIC webinars only. New rows start
//     'registered', or 'pending' when the host turned on "Require approval".
//     Emails a confirmation with the person's own join link (…?tk=<token>),
//     or a "waiting for approval" notice. Re-registering an email that is
//     already registered re-sends the link by EMAIL only — the token is never
//     returned for an existing guest row, so typing someone else's address
//     can't reveal their link.
//
//   { action: 'decide', registrationId, approve: boolean }
//     Webinar host/co-host (or ministry admin) approves or declines a pending
//     registration; the registrant is emailed their join link or a decline.
//
// verify_jwt = false (config.toml): signed-out guests must be able to call it.
// Secrets: RESEND_API_KEY, FROM_EMAIL, MINISTRY_APP_ORIGIN.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENDED = new Set(["ending", "ended", "recording_processing", "completed", "cancelled"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtWhen(iso: string | null, tz: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC", dateStyle: "full", timeStyle: "short", timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}

type Kind = "confirmed" | "pending" | "approved" | "declined";

async function sendEmail(opts: {
  kind: Kind; to: string; name: string | null; webinar: any; ministryName: string | null; joinUrl: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") || "notifications@rekindlebc.com";
  if (!resendKey) { console.error("[webinar-registration] RESEND_API_KEY not set"); return false; }
  const { kind, to, name, webinar, ministryName, joinUrl } = opts;
  const title = esc(webinar.title);
  const when = fmtWhen(webinar.scheduled_start_at, webinar.timezone);
  const host = esc(ministryName || "the host");

  const subject = {
    confirmed: `You're registered: ${webinar.title}`,
    approved: `You're approved: ${webinar.title}`,
    pending: `Registration received: ${webinar.title}`,
    declined: `Registration update: ${webinar.title}`,
  }[kind];

  const intro = {
    confirmed: `Thanks for registering! You're all set for this webinar hosted by ${host}.`,
    approved: `Good news, ${host} approved your registration. You're all set.`,
    pending: `Thanks for registering. ${host} reviews registrations for this webinar, so we'll email you your join link as soon as you're approved.`,
    declined: `Sorry, ${host} wasn't able to approve your registration for this webinar.`,
  }[kind];

  const showLink = kind === "confirmed" || kind === "approved";
  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#6d28d9;margin:0 0 8px">${title}</h2>
      <p style="font-size:15px;color:#111">Hi ${esc(name) || "there"}, ${intro}</p>
      ${when ? `<p style="font-size:15px;color:#111;margin:4px 0"><b>When:</b> ${esc(when)}</p>` : ""}
      ${showLink ? `
        <p style="margin:20px 0"><a href="${joinUrl}" style="background:#6d28d9;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Join webinar</a></p>
        <p style="font-size:12px;color:#888">This link is just for you, so please don't share it. No Rekindle account needed. We'll also send reminders before it starts.<br><br>If the button doesn't work, paste this link into your browser:<br>${joinUrl}</p>` : ""}
    </div>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
    });
    if (!resp.ok) { console.error(`[webinar-registration] email ${to}:`, await resp.text()); return false; }
    return true;
  } catch (e) {
    console.error(`[webinar-registration] email err ${to}:`, (e as Error).message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const origin = (Deno.env.get("MINISTRY_APP_ORIGIN") || "https://rekindlebc.com").replace(/\/$/, "");
    const admin = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Caller is optional: guests call this signed out.
    let callerId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
      const { data } = await userClient.auth.getUser();
      callerId = data?.user?.id ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const loadWebinar = async (id: string) => {
      const { data } = await admin
        .from("ministry_webinars")
        .select("id, ministry_id, host_id, title, scheduled_start_at, timezone, status, is_public, registration_required, registration_approval, max_attendees")
        .eq("id", id).maybeSingle();
      return data as any;
    };
    const joinUrlFor = (w: any, token: string) => `${origin}/ministry/${w.ministry_id}/webinar/${w.id}?tk=${token}`;
    const ministryNameFor = async (w: any) => {
      const { data } = await admin.rpc("public_ministry_name", { p_id: w.ministry_id });
      return (data as string | null) ?? null;
    };

    // ── register ────────────────────────────────────────────────────────
    if (action === "register") {
      const webinarId = String(body.webinarId || "");
      if (!webinarId) return json({ error: "webinarId required" }, 400);
      const w = await loadWebinar(webinarId);
      if (!w) return json({ error: "Webinar not found" }, 404);
      if (ENDED.has(w.status)) return json({ error: "This webinar has already ended." }, 400);

      let name: string | null = null;
      let email: string | null = null;

      if (callerId) {
        if (!w.is_public) {
          const { data: member } = await admin.rpc("is_group_member", { p_ministry_id: w.ministry_id, p_user_id: callerId });
          if (!member) return json({ error: "This webinar is for ministry members only." }, 403);
        }
        const { data: prof } = await admin.from("user_profiles").select("full_name, email").eq("user_id", callerId).maybeSingle();
        name = (prof as any)?.full_name ?? null;
        email = (prof as any)?.email ?? null;
      } else {
        if (!w.is_public) return json({ error: "Please sign in to register for this webinar." }, 403);
        name = String(body.name || "").trim().slice(0, 120);
        email = String(body.email || "").trim().toLowerCase().slice(0, 254);
        if (!name || !EMAIL_RE.test(email)) return json({ error: "Enter your name and a valid email." }, 400);
      }

      // Existing row for this person?
      let q = admin.from("meeting_registrations").select("id, status, join_token")
        .eq("meeting_id", w.id).eq("meeting_kind", "webinar");
      q = callerId ? q.eq("user_id", callerId) : q.is("user_id", null).eq("guest_email", email!);
      const { data: existing } = await q.maybeSingle();
      const ministryName = await ministryNameFor(w);

      if (existing && (existing as any).status === "declined") {
        return json({ status: "declined" });
      }
      if (existing && ((existing as any).status === "registered" || (existing as any).status === "pending")) {
        const st = (existing as any).status as "registered" | "pending";
        if (email) {
          await sendEmail({
            kind: st === "registered" ? "confirmed" : "pending", to: email, name, webinar: w, ministryName,
            joinUrl: joinUrlFor(w, (existing as any).join_token),
          });
        }
        // Members may see their own token; guests only get it by email.
        return json({ status: st, already: true, token: callerId ? (existing as any).join_token : undefined });
      }

      // Capacity (Zoom caps registrations at the webinar's size).
      const { count } = await admin.from("meeting_registrations").select("id", { count: "exact", head: true })
        .eq("meeting_id", w.id).in("status", ["registered", "pending"]);
      if (w.max_attendees && (count ?? 0) >= w.max_attendees) {
        return json({ error: "Registration is full for this webinar." }, 409);
      }

      const status = w.registration_approval === "manual" ? "pending" : "registered";
      let row: any;
      if (existing) {
        const { data, error } = await admin.from("meeting_registrations")
          .update({ status, registered_at: new Date().toISOString(), decided_at: null, guest_name: callerId ? null : name })
          .eq("id", (existing as any).id).select("id, join_token").single();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await admin.from("meeting_registrations").insert({
          meeting_id: w.id, meeting_kind: "webinar", status,
          user_id: callerId, guest_name: callerId ? null : name, guest_email: callerId ? null : email,
        }).select("id, join_token").single();
        if (error) throw error;
        row = data;
      }

      let emailed = false;
      if (email) {
        emailed = await sendEmail({
          kind: status === "registered" ? "confirmed" : "pending", to: email, name, webinar: w, ministryName,
          joinUrl: joinUrlFor(w, row.join_token),
        });
      }
      return json({ status, token: row.join_token, emailed });
    }

    // ── decide (host approves / declines) ───────────────────────────────
    if (action === "decide") {
      if (!callerId) return json({ error: "Not authenticated" }, 401);
      const registrationId = String(body.registrationId || "");
      const approve = !!body.approve;
      const { data: reg } = await admin.from("meeting_registrations")
        .select("id, meeting_id, meeting_kind, user_id, guest_name, guest_email, status, join_token")
        .eq("id", registrationId).maybeSingle();
      if (!reg || (reg as any).meeting_kind !== "webinar") return json({ error: "Registration not found" }, 404);
      const w = await loadWebinar((reg as any).meeting_id);
      if (!w) return json({ error: "Webinar not found" }, 404);

      const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
        admin.rpc("is_webinar_manager", { p_webinar_id: w.id, p_user_id: callerId }),
        admin.rpc("is_group_admin", { p_ministry_id: w.ministry_id, p_user_id: callerId }),
      ]);
      if (!isManager && !isAdmin) return json({ error: "Not authorized for this webinar" }, 403);

      const status = approve ? "registered" : "declined";
      const { error } = await admin.from("meeting_registrations")
        .update({ status, decided_at: new Date().toISOString() }).eq("id", (reg as any).id);
      if (error) throw error;

      let to = (reg as any).guest_email as string | null;
      let name = (reg as any).guest_name as string | null;
      if ((reg as any).user_id) {
        const { data: prof } = await admin.from("user_profiles").select("full_name, email").eq("user_id", (reg as any).user_id).maybeSingle();
        to = (prof as any)?.email ?? null;
        name = (prof as any)?.full_name ?? null;
        await admin.from("notifications").insert({
          user_id: (reg as any).user_id,
          type: "meeting_reminder",
          title: approve ? `You're approved: ${w.title}` : `Registration update: ${w.title}`,
          message: approve ? "Your webinar registration was approved." : "Your webinar registration wasn't approved.",
          link: `/ministry/${w.ministry_id}/webinar/${w.id}`,
          is_read: false,
        });
      }
      if (to && (reg as any).status !== status) {
        await sendEmail({
          kind: approve ? "approved" : "declined", to, name, webinar: w,
          ministryName: await ministryNameFor(w), joinUrl: joinUrlFor(w, (reg as any).join_token),
        });
      }
      return json({ status });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[webinar-registration] error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
