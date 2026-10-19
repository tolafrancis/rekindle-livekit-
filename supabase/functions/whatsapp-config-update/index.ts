// Supabase Edge Function: whatsapp-config-update
// =====================================================================
// Leader-side writes to a ministry's ministry_whatsapp_configs row.
// That table is write-protected to the service role by RLS, so the
// Settings tab's "Save" (Small Group notification template) and
// "Disconnect WhatsApp" used to update it straight from the browser and
// silently change nothing. They go through here instead.
//
// Request:  POST { ministryId, action, ... }
//   action 'set_notify_template': { templateName, templateLanguage }
//   action 'disconnect'
//   action 'set_shared_sender':   { enabled }  — "Send via Rekindle" on/off;
//                                  creates the row if the ministry has none.
// Response: { ok: true }
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { ministryId, action } = body ?? {};
    if (!ministryId || !action) return json({ error: 'ministryId and action required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to change WhatsApp settings for this ministry' }, 403);

    const now = new Date().toISOString();

    if (action === 'set_notify_template') {
      const templateName = typeof body.templateName === 'string' ? body.templateName.trim() : '';
      const templateLanguage = typeof body.templateLanguage === 'string' && body.templateLanguage ? body.templateLanguage : 'en_US';
      const { error } = await admin
        .from('ministry_whatsapp_configs')
        .update({ notify_template_name: templateName || null, notify_template_language: templateLanguage, updated_at: now })
        .eq('ministry_id', ministryId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'disconnect') {
      const { error } = await admin
        .from('ministry_whatsapp_configs')
        .update({
          connection_status: 'pending',
          verification_status: 'unverified',
          waba_id: '',
          phone_number_id: '',
          phone_number_display: '',
          access_token_encrypted: '',
          access_token_last4: '',
          app_secret_encrypted: null,
          updated_at: now,
        })
        .eq('ministry_id', ministryId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'set_shared_sender') {
      const enabled = body.enabled === true;
      const { data: existing } = await admin
        .from('ministry_whatsapp_configs')
        .select('id')
        .eq('ministry_id', ministryId)
        .maybeSingle();
      const { error } = existing
        ? await admin
            .from('ministry_whatsapp_configs')
            .update({ shared_sender_enabled: enabled, updated_at: now })
            .eq('ministry_id', ministryId)
        : await admin
            .from('ministry_whatsapp_configs')
            .insert({ ministry_id: ministryId, shared_sender_enabled: enabled });
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err: any) {
    console.error('[whatsapp-config-update] error:', err);
    return json({ error: err.message ?? 'Unexpected error' }, 500);
  }
});
