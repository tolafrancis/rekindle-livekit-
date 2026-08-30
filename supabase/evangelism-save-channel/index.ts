// Supabase Edge Function: evangelism-save-channel
// Encrypts and stores per-ministry Messenger / Instagram page tokens.
// Deploy: supabase functions deploy evangelism-save-channel
//
// Required secrets: ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function encryptToken(plainText: string, key: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyData = enc.encode(key.slice(0, 32).padEnd(32, '0'));
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt']);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(plainText));
  const full    = new Uint8Array(iv.length + cipherBuf.byteLength);
  full.set(iv, 0);
  full.set(new Uint8Array(cipherBuf), iv.length);
  return Array.from(full).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { ministryId, channel, pageId, accessToken } = await req.json();

    if (!ministryId || !channel || !pageId || !accessToken) {
      return json({ error: 'ministryId, channel, pageId and accessToken are required' }, 400);
    }
    if (!['messenger', 'instagram'].includes(channel)) {
      return json({ error: 'channel must be messenger or instagram' }, 400);
    }

    // Verify caller is authenticated and is a leader of this ministry
    const authHeader = req.headers.get('authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get calling user from JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Check leader/admin
    const { data: membership } = await supabase
      .from('ministry_members')
      .select('is_leader, role')
      .eq('ministry_id', ministryId)
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: ministry } = await supabase
      .from('ministry_groups')
      .select('owner_id, leader_id')
      .eq('id', ministryId)
      .maybeSingle();

    const isLeader = membership?.is_leader ||
      ministry?.owner_id === user.id ||
      ministry?.leader_id === user.id ||
      membership?.role === 'admin';

    if (!isLeader) return json({ error: 'Only ministry leaders can configure channels' }, 403);

    // Ministry CRM gate (fix 6, ministry-billing-tier-enforcement-audit.md):
    // Messenger/Instagram are Growth Partner and above — same threshold as
    // ministryEntitlements.ts's crmChannels cap (fix 4), duplicated inline
    // since this Deno/esm.sh edge function can't import the npm workspace.
    // WhatsApp isn't affected — it never reaches this function at all (its
    // own separate ministry_whatsapp_configs flow).
    const { data: sub } = await supabase
      .from('ministry_subscriptions')
      .select('plan_type, status')
      .eq('ministry_id', ministryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const PLAN_RANK: Record<string, number> = { starter: 1, growth_partner: 2, ministry_partner: 3, ministry_plus: 4 };
    const crmAllowed = sub?.status === 'active' && (PLAN_RANK[sub.plan_type as string] ?? 0) >= 2;
    if (!crmAllowed) {
      return json({ error: "This ministry's plan doesn't include Messenger/Instagram — upgrade to Growth Partner or above." }, 403);
    }

    // Encrypt the access token
    const encKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    if (!encKey) return json({ error: 'ENCRYPTION_KEY not configured' }, 500);
    const encryptedToken = await encryptToken(accessToken, encKey);

    // Upsert into ministry_channel_configs
    const { error } = await supabase
      .from('ministry_channel_configs')
      .upsert({
        ministry_id:             ministryId,
        channel,
        page_id:                 pageId,
        access_token_encrypted:  encryptedToken,
        connected_at:            new Date().toISOString(),
        connected_by:            user.id,
      }, { onConflict: 'ministry_id,channel' });

    if (error) throw error;

    return json({ success: true, channel, page_id: pageId });
  } catch (err: any) {
    console.error('[evangelism-save-channel]', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
