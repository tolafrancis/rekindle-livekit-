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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_VERSION = 'v20.0';
const WHATSAPP_BASE_URL    = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const COST_PER_MESSAGE_USD = 0.03; // Platform rate charged to ministry

interface BroadcastRequest {
  ministryId:      string;
  userId:          string;      // wallet owner
  messageType:     'text' | 'template';
  title:           string;
  message?:        string;      // for text messages
  templateName?:   string;      // for template messages
  templateParams?: string[];    // template variable values
  language?:       string;      // template language, e.g. 'en_US'
  targetType:      'all' | 'group' | 'custom';
  groupId?:        string;
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
      targetType, groupId, scheduledAt,
    } = body;

    if (!ministryId || !userId) {
      return jsonError('ministryId and userId are required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // -- 1. Load this ministry's WABA config ------------------------------
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
    if (!wabaConfig.phone_number_id || !wabaConfig.access_token_encrypted) {
      return jsonError('Missing WABA credentials', 400);
    }

    // Decrypt access token (stored encrypted in DB)
    const accessToken = await decryptToken(wabaConfig.access_token_encrypted, Deno.env.get('ENCRYPTION_KEY') ?? '');
    if (!accessToken) return jsonError('Could not decrypt access token', 500);

    // -- 2. If scheduled, save and return --------------------------------
    if (scheduledAt) {
      await supabase.from('ministry_whatsapp_broadcasts').insert({
        ministry_id:   ministryId,
        created_by:    userId,
        title,
        message:       message ?? templateName ?? '',
        message_type:  messageType,
        template_name: templateName,
        target_type:   targetType,
        group_id:      groupId,
        status:        'scheduled',
        scheduled_at:  scheduledAt,
        created_at:    new Date().toISOString(),
      });
      return jsonOk({ scheduled: true, scheduledAt });
    }

    // -- 3. Resolve recipient phone numbers -------------------------------
    let phones: string[] = [];

    if (targetType === 'all') {
      const { data: subs } = await supabase
        .from('ministry_whatsapp_subscribers')
        .select('phone_number')
        .eq('ministry_id', ministryId)
        .eq('opted_in', true);
      phones = (subs ?? []).map((s: any) => s.phone_number).filter(Boolean);
    } else if (targetType === 'group' && groupId) {
      const { data: members } = await supabase
        .from('ministry_group_members')
        .select('user_profiles!inner(phone)')
        .eq('group_id', groupId);
      phones = (members ?? []).map((m: any) => m.user_profiles?.phone).filter(Boolean);
    }

    if (phones.length === 0) {
      return jsonOk({ sent: 0, failed: 0, cost_usd: 0, message: 'No opted-in recipients found' });
    }

    // -- 4. Check wallet balance for overage -----------------------------
    const { data: planUsage } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('successful_sends')
      .eq('ministry_id', ministryId)
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

    // -- 5. Send messages via ministry's own WABA -------------------------
    console.log(`Sending ${phones.length} msgs via WABA ${wabaConfig.waba_id} for ministry ${ministryId}`);

    const results = { successful: 0, failed: 0, errors: [] as string[] };

    for (const phone of phones) {
      try {
        const formattedPhone = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
        const payload        = buildMessagePayload(formattedPhone, messageType, message, templateName, templateParams, language);

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
          console.error(`Failed to send to ${phone}:`, errMsg);
        }
      } catch (err: any) {
        results.failed++;
        results.errors.push(`${phone}: ${err.message}`);
      }
    }

    const costUsd     = results.successful * COST_PER_MESSAGE_USD;
    const overageCost = Math.max(0, results.successful - (planIncluded - monthlyUsed)) * COST_PER_MESSAGE_USD;

    // -- 6. Save broadcast record -----------------------------------------
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
        group_id:          groupId,
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

    // -- 7. Deduct wallet credits for overage -----------------------------
    const creditsToDeduct = Math.min(
      creditsNeeded,
      Math.max(0, results.successful - (planIncluded - monthlyUsed)),
    );

    if (creditsToDeduct > 0) {
      await deductWalletCredits(supabase, userId, creditsToDeduct, overageCost, title, broadcastRow?.id);
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

// -- Helpers -------------------------------------------------------------------

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
      description:      `WhatsApp overage: "${description}"`,
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

DATABASE TABLES REQUIRED:
  ministry_whatsapp_configs       — per-ministry WABA credentials & status
  ministry_whatsapp_broadcasts    — broadcast history per ministry
  ministry_whatsapp_subscribers   — opted-in subscriber list per ministry
  broadcast_wallets               — credit balances (shared with existing wallet system)
  broadcast_wallet_transactions   — transaction ledger (shared)

SENDER NAME NOTE (critical):
  The WhatsApp Business display name that recipients see is set during Meta's
  business verification process. It is tied to the WABA and phone number and
  CANNOT be changed dynamically per message. Every ministry gets its own WABA
  and phone number, so each ministry has its own verified sender name — this
  is the recommended and compliant way to implement per-ministry branding.
*/