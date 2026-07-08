// Supabase Edge Function: send-push-notification
// Deploy with: supabase functions deploy send-push-notification

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, body, link, senderName, targetAudience, notificationType, challengeId, userId, ministryId, announcementId, inApp, push } = await req.json();
    // Channel flags: push defaults ON (back-compat); inApp defaults OFF.
    const doPush = push !== false;
    const doInApp = inApp === true;
    const clickLink = (typeof link === 'string' && link) ? link : '/';

    // Validation
    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'Title and body are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log(`Sending push notifications - Type: ${notificationType}, Audience: ${targetAudience}`);

    // -- Resolve audience to a list of user IDs (Step 1) ------------------
    // null  = no filter (send to all)
    // []    = filter matched nobody (abort early)
    // [...] = send only to these user IDs
    let baseUserIds: string[] | null = null;

    if (notificationType === 'prayer_challenge_reminder' && userId) {
      baseUserIds = [userId];
    } else if (targetAudience && targetAudience !== 'all') {
      switch (targetAudience) {
        case 'premium': {
          const { data } = await supabaseClient
            .from('user_profiles').select('user_id').eq('subscription_tier', 'premium');
          baseUserIds = (data ?? []).map((p: any) => p.user_id).filter(Boolean);
          break;
        }
        case 'free': {
          const { data } = await supabaseClient
            .from('user_profiles').select('user_id')
            .or('subscription_tier.eq.free,subscription_tier.is.null');
          baseUserIds = (data ?? []).map((p: any) => p.user_id).filter(Boolean);
          break;
        }
        case 'leaders':
        case 'counsellors':
        case 'new_converts': {
          const roleValue =
            targetAudience === 'counsellors' ? 'counsellor'
            : targetAudience === 'new_converts' ? 'new_convert'
            : 'leader';
          const [rolesResult, profilesResult] = await Promise.all([
            supabaseClient.from('ministry_roles').select('user_id').eq('role', roleValue).eq('status', 'active'),
            supabaseClient.from('user_profiles').select('user_id').eq('role', roleValue),
          ]);
          const fromRoles    = (rolesResult.data    ?? []).map((r: any) => r.user_id).filter(Boolean);
          const fromProfiles = (profilesResult.data ?? []).map((p: any) => p.user_id).filter(Boolean);
          baseUserIds = [...new Set([...fromRoles, ...fromProfiles])];
          console.log(`audience "${targetAudience}": ${fromRoles.length} ministry_roles + ${fromProfiles.length} user_profiles = ${baseUserIds.length} unique`);
          break;
        }
        case 'ministry_members': {
          if (ministryId) {
            const { data } = await supabaseClient
              .from('ministry_members').select('user_id').eq('ministry_id', ministryId).eq('status', 'active');
            baseUserIds = (data ?? []).map((m: any) => m.user_id).filter(Boolean);
          }
          break;
        }
      }
    }

    // -- Apply group scope for group_broadcast (Step 2) -------------------
    let tokenUserIds: string[] | null = baseUserIds;

    if (notificationType === 'group_broadcast' && ministryId) {
      const { data: groupMembers } = await supabaseClient
        .from('ministry_group_members').select('user_id')
        .eq('group_id', ministryId).eq('can_receive_broadcasts', true);
      const groupMemberIds = (groupMembers ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (baseUserIds === null) {
        tokenUserIds = groupMemberIds;
      } else {
        const groupSet = new Set(groupMemberIds);
        tokenUserIds = baseUserIds.filter((id) => groupSet.has(id));
      }
      console.log(`group_broadcast: ${tokenUserIds.length} eligible after scoping to group ${ministryId}`);
    }

    // ====================================================================
    // IN-APP FAN-OUT (optional) — one notifications row per recipient via the
    // service role (bypasses RLS). Runs regardless of push tokens.
    // tokenUserIds === null means "all users".
    // ====================================================================
    let inAppInserted = 0;
    if (doInApp) {
      let recipientIds: string[];
      if (tokenUserIds === null) {
        const { data: allUsers } = await supabaseClient.from('user_profiles').select('user_id');
        recipientIds = (allUsers ?? []).map((r: any) => r.user_id).filter(Boolean);
      } else {
        recipientIds = tokenUserIds;
      }

      const rows = recipientIds.map((uid: string) => ({
        user_id:     uid,
        type:        notificationType || 'broadcast',
        title,
        message:     body,
        link:        clickLink === '/' ? null : clickLink,
        ministry_id: ministryId ?? null,
        sender_name: senderName ?? null,
        is_read:     false,
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: inAppErr } = await supabaseClient.from('notifications').insert(chunk);
        if (inAppErr) console.error('[in-app] insert failed:', inAppErr.message);
        else inAppInserted += chunk.length;
      }
      console.log(`[in-app] inserted ${inAppInserted} notifications`);
    }

    // If push is not requested, we're done after the in-app fan-out.
    if (!doPush) {
      return new Response(
        JSON.stringify({ success: true, message: 'In-app notifications sent', sent: 0, failed: 0, total: 0, inApp: inAppInserted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -- Fetch push tokens (Step 3) ----------------------------------------
    let tokenQuery = supabaseClient.from('push_tokens').select('device_token, platform, user_id');

    if (tokenUserIds !== null) {
      if (tokenUserIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No devices found for target audience', sent: 0, failed: 0, total: 0, inApp: inAppInserted }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      tokenQuery = tokenQuery.in('user_id', tokenUserIds);
    }

    const { data: tokens, error: tokensError } = await tokenQuery;

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      throw tokensError;
    }

    console.log(`Found ${tokens?.length || 0} device tokens`);

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No devices found for target audience',
          sent: 0,
          failed: 0,
          total: 0,
          inApp: inAppInserted
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Consent filtering — map notificationType to consent flag ──────────
    // Removes PUSH tokens for users who opted out of this category. In-app
    // fan-out (above) is never consent-gated. Admin broadcasts / announcements
    // are treated as important and bypass consent entirely (not listed here);
    // only genuine 'marketing' sends respect the marketing opt-out.
    const CONSENT_MAP: Record<string, string> = {
      'devotional':                  'consent_devotionals',
      'devotional_reminder':         'consent_devotionals',
      'affirmation':                 'consent_affirmations',
      'affirmation_reminder':        'consent_affirmations',
      'prayer_challenge_reminder':   'consent_reminders',
      'prayer_reminder':             'consent_reminders',
      'marketing':                   'consent_marketing',
    };

    const consentField = notificationType ? CONSENT_MAP[notificationType] : null;

    let filteredTokens = tokens;
    if (consentField) {
      // Fetch consent flags for all token owners in one query
      const tokenUserIdSet = [...new Set(tokens.map((t: any) => t.user_id).filter(Boolean))];
      const { data: consentRows } = await supabaseClient
        .from('user_profiles')
        .select(`user_id, ${consentField}`)
        .in('user_id', tokenUserIdSet);

      // Build a map of user_id → consent value (null/undefined = default true)
      const consentMap = new Map<string, boolean>(
        (consentRows ?? []).map((r: any) => [r.user_id, r[consentField] !== false])
      );

      filteredTokens = tokens.filter((t: any) => consentMap.get(t.user_id) !== false);

      const removed = tokens.length - filteredTokens.length;
      if (removed > 0) {
        console.log(`Consent filter (${consentField}): removed ${removed} opted-out users, ${filteredTokens.length} remain`);
      }

      if (filteredTokens.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `No recipients after consent filter (${consentField})`,
            sent: 0, failed: 0, total: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ==================================================================
    // FCM v1 API — Service Account Authentication
    // No Legacy API, no server key needed
    // ==================================================================

    const PROJECT_ID          = Deno.env.get('FCM_PROJECT_ID') ?? 'rekindle-bc';
    const SA_CLIENT_EMAIL     = Deno.env.get('FCM_CLIENT_EMAIL') ?? '';
    const SA_PRIVATE_KEY      = (Deno.env.get('FCM_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
    const FCM_V1_URL          = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    if (!SA_CLIENT_EMAIL || !SA_PRIVATE_KEY) {
      console.warn('FCM service account not configured — simulating send');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Push notifications sent successfully (simulated — set FCM secrets to send for real)',
          sent: tokens.length, failed: 0, total: tokens.length,
          details: { mode: 'development', recipients: tokens.length },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Get OAuth2 access token via JWT ──────────────────────────────────────
    async function getAccessToken(): Promise<string> {
      const now     = Math.floor(Date.now() / 1000);
      const payload = {
        iss:   SA_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud:   'https://oauth2.googleapis.com/token',
        iat:   now,
        exp:   now + 3600,
      };

      // Build JWT header.payload
      const enc = (obj: object) =>
        btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const header  = enc({ alg: 'RS256', typ: 'JWT' });
      const body    = enc(payload);
      const signing = `${header}.${body}`;

      // Import the RSA private key
      const pemBody = SA_PRIVATE_KEY
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s+/g, '');
      const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', binaryKey.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign'],
      );

      const sigBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(signing),
      );
      const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const jwt = `${signing}.${sig}`;

      // Exchange JWT for access token
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to get FCM access token: ${err}`);
      }

      const data = await res.json();
      return data.access_token;
    }

    const accessToken = await getAccessToken();
    const notifTitle  = senderName ? `${senderName}: ${title}` : title;

    // ── Send one notification per token ──────────────────────────────────────
    const results = await Promise.allSettled(
      filteredTokens.map(async (tokenData) => {
        const raw = tokenData.device_token;

        // Detect Web Push subscription JSON vs plain FCM registration token
        let fcmToken: string | null = null;
        let webPushEndpoint: string | null = null;
        let webPushKeys: any = null;

        try {
          const parsed = JSON.parse(raw);
          if (parsed?.endpoint) {
            // Web Push subscription stored by usePushNotifications.ts
            webPushEndpoint = parsed.endpoint;
            webPushKeys     = parsed.keys;
          } else {
            fcmToken = raw;
          }
        } catch {
          fcmToken = raw;
        }

        try {
          let messageBody: any;

          if (fcmToken) {
            // ── Native FCM token (Android/iOS or FCM web token) ──────────
            messageBody = {
              message: {
                token: fcmToken,
                notification: { title: notifTitle, body },
                data: {
                  type:        notificationType || 'broadcast',
                  senderName:  senderName || '',
                  challengeId: challengeId || '',
                  url:         '/',
                  timestamp:   new Date().toISOString(),
                },
                webpush: {
                  notification: {
                    title: notifTitle,
                    body,
                    icon:  '/icon-192.png',
                    badge: '/badge-72.png',
                  },
                  fcm_options: { link: '/' },
                },
                android: {
                  priority: 'high',
                  notification: { sound: 'default', icon: 'ic_notification' },
                },
                apns: {
                  payload: { aps: { sound: 'default', badge: 1 } },
                },
              },
            };
          } else if (webPushEndpoint && webPushKeys) {
            // ── Web Push subscription (browser VAPID) ────────────────────
            // FCM v1 supports sending to web push endpoints via the token field
            // Extract FCM token from the endpoint URL
            const endpointToken = webPushEndpoint.split('/').pop();
            messageBody = {
              message: {
                token: endpointToken,
                webpush: {
                  notification: {
                    title: notifTitle,
                    body,
                    icon:  '/icon-192.png',
                    badge: '/badge-72.png',
                  },
                  fcm_options: { link: '/' },
                },
                data: {
                  type:      notificationType || 'broadcast',
                  senderName: senderName || '',
                  url:       '/',
                  timestamp: new Date().toISOString(),
                },
              },
            };
          } else {
            throw new Error('No valid token or endpoint found');
          }

          const res = await fetch(FCM_V1_URL, {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify(messageBody),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg  = errData?.error?.message ?? `HTTP ${res.status}`;

            // Remove stale tokens
            if (res.status === 404 || errMsg.includes('UNREGISTERED') || errMsg.includes('INVALID_ARGUMENT')) {
              await supabaseClient.from('push_tokens').delete().eq('device_token', raw);
            }
            throw new Error(`FCM v1 error: ${errMsg}`);
          }

          return await res.json();

        } catch (error: any) {
          console.error('Failed to send push:', error.message);
          throw error;
        }
      }),
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed     = results.filter(r => r.status === 'rejected').length;

    console.log(`Push complete: ${successful} sent, ${failed} failed`);

    // Log to database (best-effort — a Postgrest builder has no .catch(), so
    // await inside try/catch or it throws "catch is not a function").
    try {
      await supabaseClient.from('broadcast_logs').insert({
        title,
        message:          body,
        sender_name:      senderName || null,
        channel:          doInApp ? 'push+inapp' : 'push',
        recipients_count: filteredTokens.length,
        successful_sends: successful,
        failed_sends:     failed,
        sent_at:          new Date().toISOString(),
      });
    } catch (logErr) {
      console.error('Failed to log broadcast:', logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notifications sent',
        sent:    successful,
        failed:  failed,
        total:   filteredTokens.length,
        inApp:   inAppInserted,
        details: { audience: targetAudience, tokens: filteredTokens.length },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('Push notification error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/*
DEPLOYMENT — FCM v1 (Service Account)

1. Set these secrets in Supabase Dashboard → Edge Functions → Secrets:

   FCM_PROJECT_ID   = rekindle-bc
   FCM_CLIENT_EMAIL = firebase-adminsdk-fbsvc@rekindle-bc.iam.gserviceaccount.com
   FCM_PRIVATE_KEY  = -----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n

   For FCM_PRIVATE_KEY: paste the entire private_key value from the JSON file,
   keeping the \n characters as literal \n (not real newlines).

2. Also set for VAPID web push:
   VITE_VAPID_PUBLIC_KEY = (from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates)

3. Deploy:
   supabase functions deploy send-push-notification

4. Create push_tokens table if not done:
   CREATE TABLE push_tokens (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
     device_token text NOT NULL,
     platform text DEFAULT 'web',
     role text DEFAULT 'user',
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now(),
     UNIQUE (user_id, device_token)
   );
   ALTER TABLE push_tokens DISABLE ROW LEVEL SECURITY;
*/
