// Supabase Edge Function: ministry-whatsapp-broadcast
// Deploy with: supabase functions deploy ministry-whatsapp-broadcast
//
// IMPORTANT — SENDER IDENTITY NOTE:
// Each ministry has its own verified WhatsApp Business Account (WABA) and
// phone number. The sender name recipients see is the business display name
// tied to that WABA. This CANNOT be changed per-message — it is permanently
// set during Meta business verification. This is by design: verified sender
// names are what make WhatsApp messages trustworthy.
// Each ministry gets its own identity by having its own WABA.
//
// SEND VIA REKINDLE (sender: 'rekindle'):
// A ministry without a WABA of its own can broadcast from Rekindle's shared
// number instead (WHATSAPP_PHONE_ID / WHATSAPP_ACCESS_TOKEN). Recipients see
// "Rekindle" as the sender, so the message always goes out as one approved
// template on Rekindle's WABA (SHARED_WHATSAPP_TEMPLATE, body
// {{1}} = ministry name, {{2}} = title, {{3}} = message) that names the
// ministry. Only opted-in members receive it, every delivered message costs
// one wallet credit (no plan allowance), and each ministry is capped at
// SHARED_WHATSAPP_DAILY_LIMIT messages per 24 hours to protect the shared
// number's quality rating.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_VERSION = 'v20.0';
const WHATSAPP_BASE_URL    = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const COST_PER_MESSAGE_USD = 0.03; // Platform rate charged to ministry

const SHARED_DAILY_LIMIT_DEFAULT = 1000;

interface BroadcastRequest {
  ministryId:      string;
  sender?:         'ministry' | 'rekindle';  // default 'ministry' (own WABA)
  userId:          string;      // wallet owner
  messageType:     'text' | 'template';
  title:           string;
  message?:        string;      // for text messages
  templateName?:   string;      // for template messages
  templateParams?: string[];    // template variable values
  language?:       string;      // template language, e.g. 'en_US'
  targetType:      'all' | 'group' | 'small_group' | 'custom';
  groupId?:        string;      // targetType 'group' — ministry_groups (whole-ministry group system)
  smallGroupId?:   string;      // targetType 'small_group' — small_groups (0331_small_groups.sql)
  scheduledAt?:    string;      // ISO string — if provided, save and return
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: BroadcastRequest = await req.json();
    const {
      ministryId, userId, messageType, title, message,
      templateName, templateParams, language,
      targetType, groupId, smallGroupId, scheduledAt,
    } = body;
    const sender = body.sender === 'rekindle' ? 'rekindle' : 'ministry';

    if (!ministryId || !userId) {
      return jsonError('ministryId and userId are required', 400);
    }
    if (targetType === 'small_group' && !smallGroupId) {
      return jsonError('smallGroupId is required when targetType is small_group', 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── 0. Authorize ───────────────────────────────────────────────────────
    // This function previously trusted `userId` from the request body with no
    // verification at all — anyone who knew a ministryId/userId pair could
    // fire a broadcast (and bill it) as someone else. Closing that here while
    // adding a new authorization boundary anyway (small-group targeting):
    // a full ministry admin can broadcast any way; a small-group leader can
    // ONLY broadcast to their own group, never 'all'/'group'/'custom'.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller || caller.id !== userId) {
      return jsonError('Unauthorized', 401);
    }

    const { data: isAdmin } = await supabase.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: userId });
    if (!isAdmin) {
      if (targetType !== 'small_group') {
        return jsonError('Not authorized to broadcast for this ministry', 403);
      }
      const { data: isLeader } = await supabase.rpc('is_small_group_leader', { p_group_id: smallGroupId, p_user_id: userId });
      if (!isLeader) {
        return jsonError('Not authorized to broadcast to this small group', 403);
      }
    }

    if (sender === 'rekindle') {
      return await sendViaRekindle(supabase, {
        ministryId, userId, title, message, targetType, groupId, smallGroupId, scheduledAt,
      });
    }

    // ── 1. Load this ministry's WABA config ──────────────────────────────
    const { data: wabaConfig, error: configError } = await supabase
      .from('ministry_whatsapp_configs')
      .select('*')
      .eq('ministry_id', ministryId)
      .single();

    if (configError || !wabaConfig) {
      return jsonError('WhatsApp not configured for this ministry', 400);
    }
    if (wabaConfig.connection_status !== 'connected') {
      return jsonError(`WhatsApp connection status is "${wabaConfig.connection_status}" — cannot send`, 400);
    }

    const provider = wabaConfig.provider ?? 'meta';

    // ── Validate credentials based on provider ───────────────────────────
    if (provider === 'twilio') {
      if (!wabaConfig.twilio_account_sid || !wabaConfig.twilio_auth_token_encrypted || !wabaConfig.twilio_from_number) {
        return jsonError('Missing Twilio credentials for this ministry', 400);
      }
    } else {
      if (!wabaConfig.phone_number_id || !wabaConfig.access_token_encrypted) {
        return jsonError('Missing WABA credentials', 400);
      }
    }

    // Decrypt the appropriate token
    const encKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const accessToken = provider === 'twilio'
      ? await decryptToken(wabaConfig.twilio_auth_token_encrypted, encKey)
      : await decryptToken(wabaConfig.access_token_encrypted, encKey);

    if (!accessToken) return jsonError('Could not decrypt credentials', 500);

    // ── 2. If scheduled, save and return ────────────────────────────────
    if (scheduledAt) {
      await supabase.from('ministry_whatsapp_broadcasts').insert({
        ministry_id:   ministryId,
        created_by:    userId,
        title,
        message:       message ?? templateName ?? '',
        message_type:  messageType,
        template_name: templateName,
        target_type:   targetType,
        // Same column carries either group system's id — target_type says which.
        group_id:      targetType === 'small_group' ? smallGroupId : groupId,
        status:        'scheduled',
        scheduled_at:  scheduledAt,
        created_at:    new Date().toISOString(),
      });
      return jsonOk({ scheduled: true, scheduledAt });
    }

    // ── 3. Resolve recipient phone numbers ───────────────────────────────
    const phones = await resolveRecipientPhones(supabase, ministryId, targetType, groupId, smallGroupId);

    if (phones.length === 0) {
      return jsonOk({ sent: 0, failed: 0, cost_usd: 0, message: 'No opted-in recipients found' });
    }

    // ── 4. Check wallet balance for overage ─────────────────────────────
    const { data: planUsage } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('successful_sends')
      .eq('ministry_id', ministryId)
      .eq('sender', 'ministry')
      .gte('sent_at', startOfMonth());

    const monthlyUsed    = (planUsage ?? []).reduce((s: number, r: any) => s + (r.successful_sends ?? 0), 0);
    const planIncluded   = getPlanIncluded(wabaConfig.whatsapp_plan);
    const overageCount   = Math.max(0, monthlyUsed + phones.length - planIncluded);
    const creditsNeeded  = overageCount;

    if (creditsNeeded > 0) {
      const { data: wallet } = await supabase
        .from('broadcast_wallets')
        .select('balance_credits')
        .eq('user_id', userId)
        .single();

      if (!wallet || wallet.balance_credits < creditsNeeded) {
        return jsonError(
          `Insufficient credits: need ${creditsNeeded} for overage, have ${wallet?.balance_credits ?? 0}`,
          402,
        );
      }
    }

    // ── 5. Send messages via ministry's own provider ──────────────────────
    console.log(`Sending ${phones.length} msgs via provider="${provider}" for ministry ${ministryId}`);

    const results = { successful: 0, failed: 0, errors: [] as string[] };

    for (const phone of phones) {
      try {
        const formattedPhone = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');

        if (provider === 'twilio') {
          // ── Twilio Programmable Messaging ─────────────────────────────
          const twilioUrl   = `https://api.twilio.com/2010-04-01/Accounts/${wabaConfig.twilio_account_sid}/Messages.json`;
          const credentials = btoa(`${wabaConfig.twilio_account_sid}:${accessToken}`);

          let params: URLSearchParams;

          if (messageType === 'template' && templateName) {
            // templateName for Twilio is a ContentSid (starts with HX...)
            // Try ContentSid first; fall back to body text if not a valid SID
            const isSid = /^HX[a-f0-9]{32}$/.test(templateName);

            if (isSid) {
              // Send via Twilio Content API template
              const contentVars: Record<string, string> = {};
              (templateParams ?? []).forEach((v, i) => { contentVars[String(i + 1)] = v; });

              params = new URLSearchParams({
                From:         wabaConfig.twilio_from_number,
                To:           `whatsapp:+${formattedPhone}`,
                ContentSid:   templateName,
                ...(Object.keys(contentVars).length > 0
                  ? { ContentVariables: JSON.stringify(contentVars) }
                  : {}),
              });
            } else {
              // Friendly name — use as body text (sandbox fallback)
              params = new URLSearchParams({
                From: wabaConfig.twilio_from_number,
                To:   `whatsapp:+${formattedPhone}`,
                Body: templateName,
              });
            }
          } else {
            // Free-form text
            params = new URLSearchParams({
              From: wabaConfig.twilio_from_number,
              To:   `whatsapp:+${formattedPhone}`,
              Body: message ?? '',
            });
          }

          const res = await fetch(twilioUrl, {
            method:  'POST',
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type':  'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });

          const responseData = await res.json();

          if (res.ok && responseData.sid) {
            results.successful++;
          } else {
            results.failed++;
            const errMsg = responseData.message ?? responseData.error_message ?? `HTTP ${res.status}`;
            results.errors.push(`${phone}: ${errMsg}`);
            console.error(`Twilio failed for ${phone}:`, errMsg);
          }

        } else {
          // ── Meta Graph API ─────────────────────────────────────────────
          const payload = buildMessagePayload(formattedPhone, messageType, message, templateName, templateParams, language);

          const res = await fetch(`${WHATSAPP_BASE_URL}/${wabaConfig.phone_number_id}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify(payload),
          });

          const responseData = await res.json();

          if (res.ok && responseData.messages?.[0]?.id) {
            results.successful++;
          } else {
            results.failed++;
            const errMsg = responseData.error?.message ?? `HTTP ${res.status}`;
            results.errors.push(`${phone}: ${errMsg}`);
            console.error(`Meta failed for ${phone}:`, errMsg);
          }
        }

      } catch (err: any) {
        results.failed++;
        results.errors.push(`${phone}: ${err.message}`);
      }
    }

    const costUsd     = results.successful * COST_PER_MESSAGE_USD;
    const overageCost = Math.max(0, results.successful - (planIncluded - monthlyUsed)) * COST_PER_MESSAGE_USD;

    // ── 6. Save broadcast record ─────────────────────────────────────────
    const { data: broadcastRow } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .insert({
        ministry_id:       ministryId,
        created_by:        userId,
        title,
        message:           message ?? templateName ?? '',
        message_type:      messageType,
        template_name:     templateName,
        target_type:       targetType,
        group_id:          targetType === 'small_group' ? smallGroupId : groupId,
        recipient_count:   phones.length,
        successful_sends:  results.successful,
        failed_sends:      results.failed,
        cost_usd:          costUsd,
        overage_cost_usd:  overageCost,
        status:            'sent',
        sent_at:           new Date().toISOString(),
        created_at:        new Date().toISOString(),
      })
      .select('id')
      .single();

    // ── 7. Deduct wallet credits for overage ─────────────────────────────
    const creditsToDeduct = Math.min(
      creditsNeeded,
      Math.max(0, results.successful - (planIncluded - monthlyUsed)),
    );

    if (creditsToDeduct > 0) {
      await deductWalletCredits(supabase, userId, creditsToDeduct, overageCost, `WhatsApp overage: "${title}"`, broadcastRow?.id);
    }

    console.log(`Broadcast complete: ${results.successful} sent, ${results.failed} failed. Cost: $${costUsd.toFixed(2)}`);

    return jsonOk({
      sent:       results.successful,
      failed:     results.failed,
      total:      phones.length,
      cost_usd:   costUsd,
      overage_usd: overageCost,
      broadcast_id: broadcastRow?.id,
      errors:     results.errors.length > 0 ? results.errors.slice(0, 10) : undefined,
    });

  } catch (err: any) {
    console.error('ministry-whatsapp-broadcast error:', err);
    return jsonError(err.message ?? 'Unexpected error', 500);
  }
});


// ── Recipients ────────────────────────────────────────────────────────────────

// Phone numbers of the people a broadcast may go to — only members who opted
// in. 'all' and 'group' use the ministry's WhatsApp subscriber list (the
// "WhatsApp Updates" card in the ministry space); 'small_group' uses that
// group's own WhatsApp reminders opt-in (small_group_members.whatsapp_notify).
async function resolveRecipientPhones(
  supabase: ReturnType<typeof createClient>,
  ministryId: string,
  targetType: string,
  groupId?: string,
  smallGroupId?: string,
): Promise<string[]> {
  let phones: string[] = [];

  if (targetType === 'all') {
    const { data: subs } = await supabase
      .from('ministry_whatsapp_subscribers')
      .select('phone_number')
      .eq('ministry_id', ministryId)
      .eq('opted_in', true);
    phones = (subs ?? []).map((s: any) => s.phone_number);
  } else if (targetType === 'group' && groupId) {
    // Previously every member of the group with a phone on their profile,
    // opted in or not — WhatsApp only allows messaging people who agreed to
    // it, so this is now limited to the group's opted-in subscribers.
    const { data: members } = await supabase
      .from('ministry_group_members')
      .select('user_id')
      .eq('group_id', groupId);
    const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    if (userIds.length > 0) {
      const { data: subs } = await supabase
        .from('ministry_whatsapp_subscribers')
        .select('phone_number')
        .eq('ministry_id', ministryId)
        .eq('opted_in', true)
        .in('user_id', userIds);
      phones = (subs ?? []).map((s: any) => s.phone_number);
    }
  } else if (targetType === 'small_group' && smallGroupId) {
    // small_group_members.user_id references auth.users(id), not
    // user_profiles directly, so there's no FK PostgREST can embed through —
    // resolve members first, then look up their phones separately.
    const { data: members } = await supabase
      .from('small_group_members')
      .select('user_id')
      .eq('group_id', smallGroupId)
      .eq('status', 'active')
      .eq('whatsapp_notify', true);
    const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('phone')
        .in('user_id', userIds);
      phones = (profiles ?? []).map((p: any) => p.phone);
    }
  }

  // One message per number, even if two members share one.
  const seen = new Set<string>();
  return phones.filter((p): p is string => {
    if (!p) return false;
    const key = p.replace(/[^\d]/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Send via Rekindle (shared number) ─────────────────────────────────────────

async function sendViaRekindle(
  supabase: ReturnType<typeof createClient>,
  req: {
    ministryId: string;
    userId: string;
    title: string;
    message?: string;
    targetType: string;
    groupId?: string;
    smallGroupId?: string;
    scheduledAt?: string;
  },
): Promise<Response> {
  const accessToken  = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneId      = Deno.env.get('WHATSAPP_PHONE_ID');
  const templateName = Deno.env.get('SHARED_WHATSAPP_TEMPLATE');
  const templateLang = Deno.env.get('SHARED_WHATSAPP_TEMPLATE_LANG') || 'en_US';
  const dailyLimit   = Number(Deno.env.get('SHARED_WHATSAPP_DAILY_LIMIT')) || SHARED_DAILY_LIMIT_DEFAULT;

  if (!accessToken || !phoneId || !templateName) {
    return jsonError("Sending via Rekindle isn't switched on yet. Please try again later.", 503);
  }
  if (req.scheduledAt) {
    return jsonError("Scheduling isn't available when sending via Rekindle yet. Send it now instead.", 400);
  }

  const title   = cleanTemplateParam(req.title ?? '');
  const message = cleanTemplateParam(req.message ?? '');
  if (!title || !message) return jsonError('Title and message are required', 400);
  if (title.length > 60)    return jsonError('Title must be 60 characters or fewer', 400);
  if (message.length > 700) return jsonError('Message must be 700 characters or fewer', 400);

  const { data: ministry } = await supabase
    .from('ministries')
    .select('name')
    .eq('id', req.ministryId)
    .maybeSingle();
  const ministryName = cleanTemplateParam(ministry?.name ?? '') || 'Your ministry';

  const phones = await resolveRecipientPhones(supabase, req.ministryId, req.targetType, req.groupId, req.smallGroupId);
  if (phones.length === 0) {
    return jsonOk({ sent: 0, failed: 0, cost_usd: 0, message: 'No opted-in recipients found' });
  }

  // Per-ministry cap over the last 24 hours on the shared number.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('ministry_whatsapp_broadcasts')
    .select('successful_sends')
    .eq('ministry_id', req.ministryId)
    .eq('sender', 'rekindle')
    .gte('sent_at', since);
  const usedToday = (recent ?? []).reduce((s: number, r: any) => s + (r.successful_sends ?? 0), 0);
  if (usedToday + phones.length > dailyLimit) {
    return jsonError(
      `Sending via Rekindle is limited to ${dailyLimit.toLocaleString()} messages per day per ministry. ` +
      `${Math.max(0, dailyLimit - usedToday).toLocaleString()} left today; this broadcast needs ${phones.length.toLocaleString()}.`,
      429,
    );
  }

  // Every message costs one credit — there is no plan allowance here.
  const { data: wallet } = await supabase
    .from('broadcast_wallets')
    .select('balance_credits')
    .eq('user_id', req.userId)
    .maybeSingle();
  if (!wallet || wallet.balance_credits < phones.length) {
    return jsonError(
      `Insufficient credits: need ${phones.length}, have ${wallet?.balance_credits ?? 0}`,
      402,
    );
  }

  console.log(`Sending ${phones.length} msgs via Rekindle's number for ministry ${req.ministryId}`);
  const results = { successful: 0, failed: 0, errors: [] as string[] };

  for (const phone of phones) {
    try {
      const to = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
      const payload = buildMessagePayload(to, 'template', undefined, templateName, [ministryName, title, message], templateLang);
      const res = await fetch(`${WHATSAPP_BASE_URL}/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.messages?.[0]?.id) {
        results.successful++;
      } else {
        results.failed++;
        const errMsg = data.error?.message ?? `HTTP ${res.status}`;
        results.errors.push(`${phone}: ${errMsg}`);
        console.error(`Rekindle-number send failed for ${phone}:`, errMsg);
      }
    } catch (err: any) {
      results.failed++;
      results.errors.push(`${phone}: ${err.message}`);
    }
  }

  const costUsd = results.successful * COST_PER_MESSAGE_USD;
  const now = new Date().toISOString();

  const { data: broadcastRow } = await supabase
    .from('ministry_whatsapp_broadcasts')
    .insert({
      ministry_id:      req.ministryId,
      created_by:       req.userId,
      sender:           'rekindle',
      title,
      message,
      message_type:     'template',
      template_name:    templateName,
      target_type:      req.targetType,
      group_id:         req.targetType === 'small_group' ? req.smallGroupId : req.groupId,
      recipient_count:  phones.length,
      successful_sends: results.successful,
      failed_sends:     results.failed,
      cost_usd:         costUsd,
      overage_cost_usd: costUsd,
      status:           'sent',
      sent_at:          now,
      created_at:       now,
    })
    .select('id')
    .single();

  if (results.successful > 0) {
    await deductWalletCredits(
      supabase, req.userId, results.successful, costUsd,
      `WhatsApp via Rekindle: "${title}"`, broadcastRow?.id,
    );
  }

  return jsonOk({
    sent:         results.successful,
    failed:       results.failed,
    total:        phones.length,
    cost_usd:     costUsd,
    broadcast_id: broadcastRow?.id,
    errors:       results.errors.length > 0 ? results.errors.slice(0, 10) : undefined,
  });
}

// Meta rejects template parameters containing new lines, tabs or more than
// four spaces in a row.
function cleanTemplateParam(v: string): string {
  return String(v).replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMessagePayload(
  phone: string,
  type: 'text' | 'template',
  message?: string,
  templateName?: string,
  templateParams?: string[],
  language?: string,
): object {
  if (type === 'template') {
    return {
      messaging_product: 'whatsapp',
      to:                phone,
      type:              'template',
      template: {
        name:     templateName,
        language: { code: language ?? 'en_US' },
        components: templateParams?.length
          ? [{
              type:       'body',
              parameters: templateParams.map(v => ({ type: 'text', text: v })),
            }]
          : [],
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    to:                phone,
    type:              'text',
    text:              { body: message ?? '', preview_url: false },
  };
}

function getPlanIncluded(plan: string): number {
  const map: Record<string, number> = {
    basic:   1000,
    growth:  5000,
    premium: Infinity,
  };
  return map[plan] ?? 0;
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function deductWalletCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  usdAmount: number,
  description: string,
  broadcastId?: string,
) {
  const { data: wallet } = await supabase
    .from('broadcast_wallets')
    .select('id, balance_credits, total_used')
    .eq('user_id', userId)
    .single();

  if (!wallet) return;

  await supabase
    .from('broadcast_wallets')
    .update({
      balance_credits: Math.max(0, wallet.balance_credits - credits),
      total_used:      wallet.total_used + credits,
      updated_at:      new Date().toISOString(),
    })
    .eq('user_id', userId);

  await supabase
    .from('broadcast_wallet_transactions')
    .insert({
      user_id:          userId,
      type:             'deduction',
      credits:          -credits,
      usd_amount:       usdAmount,
      description,
      broadcast_id:     broadcastId,
      recipients_count: credits,
      status:           'completed',
      created_at:       new Date().toISOString(),
    });
}

// AES-GCM decrypt — access tokens are stored encrypted at rest
async function decryptToken(encrypted: string, keyHex: string): Promise<string | null> {
  try {
    if (!keyHex || !encrypted) return encrypted; // fallback: return as-is if no key set

    const enc     = new TextEncoder();
    const keyData = hexToBytes(keyHex.slice(0, 64)); // 32 bytes = AES-256
    const key     = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);

    const combined = hexToBytes(encrypted);
    const iv       = combined.slice(0, 12);
    const data     = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Decrypt error — returning token as-is (may be unencrypted in dev):', err);
    return encrypted; // dev fallback
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function jsonOk(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/*
DEPLOYMENT:
  supabase functions new ministry-whatsapp-broadcast
  supabase functions deploy ministry-whatsapp-broadcast

ENVIRONMENT SECRETS:
  ENCRYPTION_KEY   32-byte hex key for AES-256-GCM (generate with: openssl rand -hex 32)
  WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_ID — Rekindle's own number (sender 'rekindle')
  SHARED_WHATSAPP_TEMPLATE       approved template on Rekindle's WABA: {{1}} ministry, {{2}} title, {{3}} message
  SHARED_WHATSAPP_TEMPLATE_LANG  its language code (default en_US)
  SHARED_WHATSAPP_DAILY_LIMIT    per-ministry messages per 24h on Rekindle's number (default 1000)
  SUPABASE_ANON_KEY — for the caller-identity check (userClient.auth.getUser())

DATABASE TABLES REQUIRED:
  ministry_whatsapp_configs       — per-ministry WABA credentials & status
  ministry_whatsapp_broadcasts    — broadcast history per ministry
  ministry_whatsapp_subscribers   — opted-in subscriber list per ministry
  small_group_members             — targetType 'small_group' (0331_small_groups.sql)
  broadcast_wallets               — credit balances (shared with existing wallet system)
  broadcast_wallet_transactions   — transaction ledger (shared)

RPCs REQUIRED (both already exist — is_group_admin from 0150_rls_hardening_phase4.sql,
is_small_group_leader from 0331_small_groups.sql):
  is_group_admin(p_ministry_id, p_user_id)
  is_small_group_leader(p_group_id, p_user_id)

SENDER NAME NOTE (critical):
  The WhatsApp Business display name that recipients see is set during Meta's
  business verification process. It is tied to the WABA and phone number and
  CANNOT be changed dynamically per message. Every ministry gets its own WABA
  and phone number, so each ministry has its own verified sender name — this
  is the recommended and compliant way to implement per-ministry branding.
*/
