// Supabase Edge Function: send-email-broadcast
// Deploy with: supabase functions deploy send-email-broadcast

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailBroadcastRequest {
  title: string;
  message: string;
  subject: string;
  senderName?: string;
  templateId?: string;
  targetAudience?: string;
  ministryId?: string;
  userIds?: string[];
  messageCategory?: 'transactional' | 'marketing';  // default: 'marketing'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      title,
      message,
      subject,
      senderName,
      templateId,
      targetAudience = 'all',
      ministryId,
      userIds,
      messageCategory = 'marketing',
    }: EmailBroadcastRequest = await req.json();

    // ── Validation ──────────────────────────────────────────────────────────
    if (!title || !message || !subject) {
      return new Response(
        JSON.stringify({ error: 'title, message, and subject are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Supabase client (service role) ───────────────────────────────────────
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Email provider config ────────────────────────────────────────────────
    const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY');
    const SENDGRID_API_KEY  = Deno.env.get('SENDGRID_API_KEY');
    const FROM_EMAIL        = Deno.env.get('FROM_EMAIL') ?? 'noreply@example.com';
    // The "From" display name: senderName overrides the default org name
    const FROM_NAME         = senderName || Deno.env.get('FROM_NAME') || 'ReKindle';
    const fromAddress       = `${FROM_NAME} <${FROM_EMAIL}>`;

    // ── Resolve recipient emails ─────────────────────────────────────────────
    let recipientEmails: string[] = [];

    if (userIds && userIds.length > 0) {
      // Explicit user ID list (e.g. from ministry member selection)
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('email')
        .in('user_id', userIds)
        .not('email', 'is', null);
      if (error) throw error;
      recipientEmails = (data ?? []).map((r: { email: string }) => r.email).filter(Boolean);
    } else if (ministryId) {
      // All active members of a ministry
      const { data, error } = await supabaseClient
        .from('ministry_members')
        .select('user_profiles!inner(email)')
        .eq('ministry_id', ministryId)
        .eq('status', 'active');
      if (error) throw error;
      recipientEmails = (data ?? [])
        .map((r: any) => r.user_profiles?.email)
        .filter(Boolean);
    } else {
      // Audience-based query against user_profiles
      // Transactional messages (receipts, reminders, confirmations) only check email_opt_in.
      // Marketing messages also require consent_marketing = true.
      const isMarketing = messageCategory !== 'transactional';

      let query = supabaseClient
        .from('user_profiles')
        .select('email')
        .not('email', 'is', null)
        .eq('email_opt_in', true);

      // Apply consent_marketing filter for marketing broadcasts only
      if (isMarketing) {
        query = query.neq('consent_marketing', false);
      }

      if (targetAudience !== 'all') {
        switch (targetAudience) {
          case 'premium':
            query = query.eq('subscription_tier', 'premium');
            break;
          case 'free':
            query = query.or('subscription_tier.eq.free,subscription_tier.is.null');
            break;
          case 'leaders': {
            // Pull from both user_profiles.role and ministry_roles
            const [profilesRes, rolesRes] = await Promise.all([
              supabaseClient.from('user_profiles').select('email').eq('role', 'leader').not('email', 'is', null),
              supabaseClient.from('ministry_roles').select('user_profiles!inner(email)').eq('role', 'leader').eq('status', 'active'),
            ]);
            const fromProfiles = (profilesRes.data ?? []).map((r: any) => r.email);
            const fromRoles    = (rolesRes.data   ?? []).map((r: any) => r.user_profiles?.email);
            recipientEmails = [...new Set([...fromProfiles, ...fromRoles].filter(Boolean))];
            break;
          }
          case 'counsellors': {
            const [profilesRes, rolesRes] = await Promise.all([
              supabaseClient.from('user_profiles').select('email').eq('role', 'counsellor').not('email', 'is', null),
              supabaseClient.from('ministry_roles').select('user_profiles!inner(email)').eq('role', 'counsellor').eq('status', 'active'),
            ]);
            const fromProfiles = (profilesRes.data ?? []).map((r: any) => r.email);
            const fromRoles    = (rolesRes.data   ?? []).map((r: any) => r.user_profiles?.email);
            recipientEmails = [...new Set([...fromProfiles, ...fromRoles].filter(Boolean))];
            break;
          }
          case 'new_converts':
            query = query.eq('role', 'new_convert');
            break;
        }
      }

      // Only run the simple query if recipientEmails wasn't already populated
      // by the special-case branches above
      if (recipientEmails.length === 0 && !['leaders', 'counsellors'].includes(targetAudience)) {
        const { data, error } = await query;
        if (error) throw error;
        recipientEmails = (data ?? []).map((r: { email: string }) => r.email).filter(Boolean);
      }
    }

    console.log(`Email broadcast: ${recipientEmails.length} recipients, sender="${FROM_NAME}", audience="${targetAudience}"`);

    if (recipientEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No email recipients found for target audience', sent: 0, failed: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Resolve HTML body ────────────────────────────────────────────────────
    // If a templateId is provided, fetch it and substitute variables.
    // Otherwise fall back to a clean plain-layout HTML email.
    const SITE_URL            = Deno.env.get('SITE_URL') ?? '';
    const UNSUBSCRIBE_SECRET  = Deno.env.get('UNSUBSCRIBE_SECRET') ?? 'changeme';
    let htmlBodyTemplate: string;

    if (templateId) {
      const { data: tpl, error: tplError } = await supabaseClient
        .from('email_templates')
        .select('html_content, subject')
        .eq('id', templateId)
        .single();

      if (tplError || !tpl) {
        console.warn('Template not found, falling back to plain layout');
        htmlBodyTemplate = buildPlainHtml({ title, message, senderName, siteUrl: SITE_URL });
      } else {
        const today = new Date().toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });
        htmlBodyTemplate = tpl.html_content
          .replace(/\{\{title\}\}/g,      title)
          .replace(/\{\{message\}\}/g,    message)
          .replace(/\{\{senderName\}\}/g, senderName ?? FROM_NAME)
          .replace(/\{\{userName\}\}/g,   'Valued Member')
          .replace(/\{\{date\}\}/g,       today)
          .replace(/\{\{siteUrl\}\}/g,    SITE_URL);
      }
    } else {
      htmlBodyTemplate = buildPlainHtml({ title, message, senderName, siteUrl: SITE_URL });
    }

    // Look up user_ids for all recipient emails so we can generate per-user tokens
    const { data: profileRows } = await supabaseClient
      .from('user_profiles')
      .select('user_id, email')
      .in('email', recipientEmails);

    const emailToUserId = new Map<string, string>(
      (profileRows ?? []).map((r: { user_id: string; email: string }) => [r.email.toLowerCase(), r.user_id])
    );

    // ── Send emails ──────────────────────────────────────────────────────────
    // Dev / simulation mode (no provider configured)
    if (!RESEND_API_KEY && !SENDGRID_API_KEY) {
      console.warn('No email provider configured — simulating send');

      await logBroadcast(supabaseClient, {
        title, message, subject, senderName: senderName ?? null,
        channel: 'email', totalRecipients: recipientEmails.length,
        successful: recipientEmails.length, failed: 0, mode: 'development',
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email broadcast sent successfully (simulated)',
          sent: recipientEmails.length, failed: 0, total: recipientEmails.length,
          details: { mode: 'development', recipients: recipientEmails.length, senderName: senderName ?? null },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const results = { successful: 0, failed: 0, errors: [] as string[] };

    // Helper — injects a per-user signed unsubscribe link into the HTML body
    const buildPersonalizedHtml = async (toEmail: string): Promise<string> => {
      const userId = emailToUserId.get(toEmail.toLowerCase());
      if (!userId) return htmlBodyTemplate;
      const token = await generateUnsubscribeToken(userId, toEmail, UNSUBSCRIBE_SECRET);
      const unsubUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}&action=unsubscribe`;
      return htmlBodyTemplate
        .replace(/\{\{unsubscribeUrl\}\}/g, unsubUrl)
        .replace(/href="[^"]*#unsubscribe[^"]*"/g, `href="${unsubUrl}"`);
    };

    if (RESEND_API_KEY) {
      // ── Resend: batch send (up to 100 per request) ───────────────────────
      const BATCH_SIZE = 100;
      for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
        const batch = recipientEmails.slice(i, i + BATCH_SIZE);
        try {
          const personalizedBatch = await Promise.all(
            batch.map(async (to) => ({
              from: fromAddress,
              to,
              subject,
              html: await buildPersonalizedHtml(to),
            }))
          );

          const res = await fetch('https://api.resend.com/emails/batch', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(personalizedBatch),
          });

          if (res.ok) {
            results.successful += batch.length;
          } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData?.message ?? `HTTP ${res.status}`;
            results.failed += batch.length;
            results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${errMsg}`);
            console.error('Resend batch error:', errMsg);
          }
        } catch (err: any) {
          results.failed += batch.length;
          results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${err.message}`);
        }
      }
    } else if (SENDGRID_API_KEY) {
      // ── SendGrid: send individually for per-user unsubscribe tokens ──────
      const BATCH_SIZE = 100;
      for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
        const batch = recipientEmails.slice(i, i + BATCH_SIZE);
        try {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: { email: FROM_EMAIL, name: FROM_NAME },
              subject,
              personalizations: await Promise.all(
                batch.map(async (email) => ({
                  to: [{ email }],
                  substitutions: {
                    '{{unsubscribeUrl}}': (() => {
                      const userId = emailToUserId.get(email.toLowerCase());
                      return userId ? `${SITE_URL}/unsubscribe?token=PENDING&action=unsubscribe` : '#';
                    })(),
                  },
                }))
              ),
              content: [{ type: 'text/html', value: await buildPersonalizedHtml(batch[0]) }],
            }),
          });

          if (res.ok || res.status === 202) {
            results.successful += batch.length;
          } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData?.errors?.[0]?.message ?? `HTTP ${res.status}`;
            results.failed += batch.length;
            results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${errMsg}`);
            console.error('SendGrid batch error:', errMsg);
          }
        } catch (err: any) {
          results.failed += batch.length;
          results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${err.message}`);
        }
      }
    }

    console.log(`Email broadcast complete: ${results.successful} sent, ${results.failed} failed`);

    await logBroadcast(supabaseClient, {
      title, message, subject, senderName: senderName ?? null,
      channel: 'email', totalRecipients: recipientEmails.length,
      successful: results.successful, failed: results.failed,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email broadcast complete',
        sent: results.successful,
        failed: results.failed,
        total: recipientEmails.length,
        errors: results.errors.length > 0 ? results.errors : undefined,
        details: { audience: targetAudience, senderName: senderName ?? null, fromAddress },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('Email broadcast error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred', details: error.toString() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a signed unsubscribe token (same algorithm as email-unsubscribe function).
 * Payload: userId|email|issuedAt — signed with HMAC-SHA256.
 */
async function generateUnsubscribeToken(
  userId: string,
  email: string,
  secret: string,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload  = `${userId}|${email}|${issuedAt}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  const raw = `${payload}|${sigHex}`;
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Minimal responsive HTML email when no template is selected.
 * The senderName appears as the "from" line beneath the header.
 */
function buildPlainHtml({
  title,
  message,
  senderName,
  siteUrl,
}: {
  title: string;
  message: string;
  senderName?: string;
  siteUrl: string;
}): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const senderLine = senderName
    ? `<p style="margin:0 0 24px;font-size:13px;color:#8b5cf6;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;">${senderName}</p>`
    : '';
  const messageHtml = message
    .split('\n')
    .map(line => line.trim() ? `<p style="margin:0 0 16px;line-height:1.7;">${line}</p>` : '<br>')
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#333;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#8b5cf6 0%,#a855f7 100%);padding:36px 32px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;line-height:1.3;">${title}</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${today}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              ${senderLine}
              ${messageHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 32px;text-align:center;border-top:1px solid #eee;">
              ${senderName ? `<p style="margin:0 0 6px;font-size:13px;color:#555;">Sent by <strong>${senderName}</strong></p>` : ''}
              ${siteUrl ? `<p style="margin:0 0 8px;font-size:12px;color:#aaa;"><a href="${siteUrl}" style="color:#8b5cf6;text-decoration:none;">${siteUrl}</a></p>` : ''}
              <p style="margin:0;font-size:12px;color:#bbb;">
                You received this email because you have an account with ReKindle. &nbsp;·&nbsp;
                <a href="{{unsubscribeUrl}}" style="color:#8b5cf6;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Write a row to broadcast_logs for audit trail. */
async function logBroadcast(
  client: ReturnType<typeof createClient>,
  data: {
    title: string;
    message: string;
    subject: string;
    senderName: string | null;
    channel: string;
    totalRecipients: number;
    successful: number;
    failed: number;
    mode?: string;
  },
) {
  await client
    .from('broadcast_logs')
    .insert({
      title:             data.title,
      message:           data.message,
      subject:           data.subject,
      sender_name:       data.senderName,
      channel:           data.channel,
      recipients_count:  data.totalRecipients,
      successful_sends:  data.successful,
      failed_sends:      data.failed,
      mode:              data.mode ?? 'production',
      sent_at:           new Date().toISOString(),
    })
    .catch(err => console.error('Failed to log broadcast:', err));
}

/*
DEPLOYMENT INSTRUCTIONS:

1. Create the edge function:
   supabase functions new send-email-broadcast

2. Copy this file to:
   supabase/functions/send-email-broadcast/index.ts

3. Set environment secrets in Supabase Dashboard → Settings → Edge Functions:

   Required:
   - FROM_EMAIL        Your verified sending address (e.g. hello@yourdomain.com)
   - FROM_NAME         Default "From" display name (e.g. "ReKindle" — overridden by senderName at call time)
   - SITE_URL          Your app URL (injected into email footer)

   Choose ONE provider:
   - RESEND_API_KEY    Get from resend.com (recommended — generous free tier)
   - SENDGRID_API_KEY  Get from sendgrid.com

4. Deploy:
   supabase functions deploy send-email-broadcast

5. Ensure broadcast_logs table has these columns:
   ALTER TABLE broadcast_logs ADD COLUMN IF NOT EXISTS sender_name TEXT;
   ALTER TABLE broadcast_logs ADD COLUMN IF NOT EXISTS subject     TEXT;
   ALTER TABLE broadcast_logs ADD COLUMN IF NOT EXISTS mode        TEXT;

6. Ensure user_profiles has email_opt_in BOOLEAN (default true) so users
   can opt out of broadcast emails:
   ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT true;

HOW senderName WORKS IN EMAILS:

  From header (envelope):   "Youth Ministry <noreply@yourdomain.com>"
  Email body header:         sender label printed below the title in purple
  Email body footer:         "Sent by Youth Ministry"
  Template variable:         {{senderName}} is substituted in HTML templates

  If senderName is omitted the FROM_NAME env var is used instead,
  so the Ministry's verified domain name always appears — ensuring trust
  even when no custom sender is set.

TEMPLATE VARIABLES SUPPORTED:
  {{title}}       Broadcast title
  {{message}}     Broadcast body (plain text, line breaks preserved)
  {{senderName}}  Resolved sender identity
  {{userName}}    "Valued Member" (personalisation not yet per-user)
  {{date}}        e.g. "Monday, April 6, 2026"
  {{siteUrl}}     Your app URL

RESEND SETUP (recommended):
  1. Sign up at resend.com
  2. Add & verify your domain
  3. Create an API key
  4. Set RESEND_API_KEY and FROM_EMAIL in Supabase secrets

SENDGRID SETUP:
  1. Sign up at sendgrid.com
  2. Verify your sender identity / domain
  3. Create an API key with "Mail Send" permission
  4. Set SENDGRID_API_KEY and FROM_EMAIL in Supabase secrets

TEST THE FUNCTION:
  curl -i --location --request POST \
    'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email-broadcast' \
    --header 'Authorization: Bearer YOUR_ANON_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
      "title": "Weekend Service",
      "message": "Join us this Sunday at 10am for a time of worship and the Word.",
      "subject": "You'\''re invited this Sunday",
      "senderName": "Youth Ministry",
      "targetAudience": "all"
    }'
*/
