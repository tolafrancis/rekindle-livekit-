// Supabase Edge Function: send-push-notification
// Delivers a notification over PUSH (FCM HTTP v1) and/or IN-APP (notifications
// table) to a resolved audience. Both channels run server-side with the service
// role, so in-app fan-out to other users is not blocked by RLS.
//
// Channel flags in the request body:
//   push:  boolean (default TRUE)  — send web push via FCM v1
//   inApp: boolean (default FALSE) — insert a notifications row per recipient

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// FCM HTTP v1 helpers — OAuth2 access token minted from a service-account JSON.
// The JSON is stored in the FCM_SERVICE_ACCOUNT secret (the full file contents).
// ---------------------------------------------------------------------------

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Exchange the service account for a short-lived OAuth2 access token.
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const unsigned = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(claim)))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed: ${res.status} - ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

// Decode the `role` claim of the caller's bearer JWT WITHOUT verifying the
// signature — used only to distinguish trusted internal service-role calls (crons,
// notify(), other edge fns) from user calls. The gateway (verify_jwt) has already
// validated the token; authorization decisions below use the service-role client.
function decodeJwtRole(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload && typeof payload.role === 'string') ? payload.role : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, body, link, senderName, targetAudience, notificationType, challengeId, userId, ministryId, announcementId, channelId, inApp, push } = await req.json();
    // Channel flags: push defaults ON (back-compat with existing callers);
    // inApp defaults OFF. Broadcasts / notify() opt into in-app fan-out.
    const doPush = push !== false;
    const doInApp = inApp === true;

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

    console.log(`send-notification - Type: ${notificationType}, Audience: ${targetAudience}, push=${doPush}, inApp=${doInApp}`);

    // ── AUTHORIZATION (§3c) — prevent cross-tenant blasts ───────────────────
    // Internal callers use the service role and are trusted (crons, notify(),
    // other edge fns). USER callers may ONLY target their own ministry (as a
    // leader/admin/owner) or themselves — never another church's members, a
    // platform-wide audience, or "all users". The null=all default below is a
    // cross-tenant blast unless the caller is a platform admin.
    const authHeader = req.headers.get('Authorization') ?? '';
    const isServiceCall = decodeJwtRole(authHeader) === 'service_role';
    let isPlatformAdmin = false;

    if (!isServiceCall) {
      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: prof } = await supabaseClient
        .from('user_profiles').select('role').eq('user_id', caller.id).maybeSingle();
      isPlatformAdmin = ['admin', 'super_admin'].includes((prof as any)?.role);

      let isMinistryAdmin = false;
      if (ministryId) {
        const [{ data: mem }, { data: grp }] = await Promise.all([
          supabaseClient.from('ministry_group_members')
            .select('role, is_leader').eq('group_id', ministryId).eq('user_id', caller.id).maybeSingle(),
          supabaseClient.from('ministry_groups')
            .select('owner_id, leader_id').eq('id', ministryId).maybeSingle(),
        ]);
        isMinistryAdmin =
          (!!mem && ((mem as any).is_leader === true || ['admin', 'moderator'].includes((mem as any).role))) ||
          (grp as any)?.owner_id === caller.id || (grp as any)?.leader_id === caller.id;
      }

      const ministryScoped = !!ministryId &&
        (targetAudience === 'ministry_members' || notificationType === 'group_broadcast');
      const selfSend = !!userId && userId === caller.id &&
        (notificationType === 'prayer_challenge_reminder' || targetAudience === 'specific_user');

      if (ministryScoped) {
        if (!isMinistryAdmin && !isPlatformAdmin) {
          return new Response(JSON.stringify({ error: 'Not authorized to message this ministry' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else if (!selfSend && !isPlatformAdmin) {
        // Platform-wide audiences (premium/free/leaders/all/unknown) are admin-only.
        return new Response(JSON.stringify({ error: 'Not authorized for this audience' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // -- Resolve audience to a list of user IDs (Step 1) ------------------
    // null  = no filter (send to all)
    // []    = filter matched nobody (abort early)
    // [...] = send only to these user IDs
    let baseUserIds: string[] | null = null;

    if (userId && (notificationType === 'prayer_challenge_reminder' || targetAudience === 'specific_user')) {
      // Single-user delivery: prayer reminders and any caller that passes
      // targetAudience:'specific_user' with a userId target exactly one person.
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
        case 'channel_followers': {
          // Followers of a live channel who haven't muted it (used when a channel goes live).
          if (channelId) {
            const [followersRes, channelRes] = await Promise.all([
              supabaseClient
                .from('channel_followers')
                .select('user_id')
                .eq('channel_id', channelId)
                .neq('notifications_enabled', false),
              supabaseClient
                .from('live_channels')
                .select('owner_id')
                .eq('id', channelId)
                .maybeSingle()
            ]);

            const ownerId = channelRes.data?.owner_id;
            const followers = (followersRes.data ?? []).map((f: any) => f.user_id).filter(Boolean);
            baseUserIds = ownerId ? followers.filter((uid: string) => uid !== ownerId) : followers;
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

    // -- Filter by per-user community notification preferences (Step 2b) --
    // For community_revelation and community_question types, exclude users
    // who have opted out in their user_profiles preference columns.
    if (notificationType === 'community_revelation' || notificationType === 'community_question') {
      const prefColumn = notificationType === 'community_revelation'
        ? 'notif_community_revelations'
        : 'notif_community_questions';

      // Fetch opted-out users (false = opted out; null means not set = default true, keep them)
      const { data: optedOut } = await supabaseClient
        .from('user_profiles')
        .select('user_id')
        .eq(prefColumn, false);

      if (optedOut && optedOut.length > 0) {
        const optedOutSet = new Set(optedOut.map((r: any) => r.user_id).filter(Boolean));
        if (tokenUserIds === null) {
          // Was sending to all — now need to resolve all users and subtract opted-out
          const { data: allUsers } = await supabaseClient
            .from('user_profiles')
            .select('user_id');
          const allIds = (allUsers ?? []).map((r: any) => r.user_id).filter(Boolean);
          tokenUserIds = allIds.filter((id: string) => !optedOutSet.has(id));
        } else {
          tokenUserIds = tokenUserIds.filter((id: string) => !optedOutSet.has(id));
        }
        console.log(`${notificationType}: filtered to ${tokenUserIds.length} after removing ${optedOut.length} opted-out users`);
      }
    }

    // Hard guard (§3c): tokenUserIds === null means "all users". Only a trusted
    // service call or a platform admin may ever reach the entire user base — for
    // anyone else this is a cross-tenant blast, so refuse rather than fan out.
    if (tokenUserIds === null && !isServiceCall && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: 'Refusing to broadcast to all users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ====================================================================
    // IN-APP FAN-OUT (Step 3a, optional) — one notifications row per recipient
    // via the service role (bypasses RLS). tokenUserIds === null = "all users".
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
        link:        (typeof link === 'string' && link) ? link : null,
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

    // ====================================================================
    // PUSH via FCM HTTP v1 (Step 3b, optional)
    // ====================================================================
    let pushSent = 0, pushFailed = 0, pushTotal = 0, pushNote = '';

    if (doPush) {
      if (tokenUserIds !== null && tokenUserIds.length === 0) {
        pushNote = 'No recipients in target audience';
      } else {
        let tokenQuery = supabaseClient.from('push_tokens').select('device_token, platform, user_id');
        if (tokenUserIds !== null) tokenQuery = tokenQuery.in('user_id', tokenUserIds);

        const { data: tokens, error: tokensError } = await tokenQuery;
        if (tokensError) { console.error('Error fetching tokens:', tokensError); throw tokensError; }
        console.log(`Found ${tokens?.length || 0} device tokens`);

        if (!tokens || tokens.length === 0) {
          pushNote = 'No devices found for target audience';
        } else {
          pushTotal = tokens.length;
          const serviceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');

          if (!serviceAccountRaw) {
            console.warn('FCM_SERVICE_ACCOUNT not set — skipping push');
            pushNote = 'Push provider not configured (FCM_SERVICE_ACCOUNT missing)';
          } else {
            let serviceAccount: ServiceAccount;
            try { serviceAccount = JSON.parse(serviceAccountRaw); }
            catch { throw new Error('FCM_SERVICE_ACCOUNT is not valid JSON'); }

            // Mint one OAuth2 access token and reuse it for every send this run.
            const accessToken = await getAccessToken(serviceAccount);
            const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
            const clickLink = typeof link === 'string' && link ? link : '/';

            // FCM v1 requires string data values and has no multicast, so we send
            // one request per token. Data-only payload → the service worker
            // (firebase-messaging-sw.js) renders it and reads `link`.
            const results = await Promise.allSettled(
              tokens.map(async (tokenData: any) => {
                const isNativeToken = tokenData.platform === 'android' || tokenData.platform === 'ios';

                const messagePayload: Record<string, unknown> = {
                  token: tokenData.device_token,
                  data: {
                    title: String(title),
                    body: String(body),
                    link: clickLink,
                    type: String(notificationType || 'broadcast'),
                    challengeId: challengeId ? String(challengeId) : '',
                  },
                };

                if (isNativeToken) {
                  // Native apps need a `notification` block for the OS to auto-display the
                  // push while backgrounded (unlike web, which relies on the service worker
                  // to render data-only payloads). The `data` block above is still sent
                  // alongside it so the app's notificationActionPerformed handler still
                  // gets `link` for deep-linking on tap.
                  messagePayload.notification = {
                    title: String(title),
                    body: String(body),
                  };
                  if (tokenData.platform === 'android') {
                    messagePayload.android = {
                      priority: 'high',
                    };
                  }
                } else {
                  // Web path — UNCHANGED from current behavior.
                  messagePayload.webpush = {
                    headers: { Urgency: 'high' },
                    fcm_options: { link: clickLink.startsWith('http') ? clickLink : undefined },
                  };
                }

                const response = await fetch(fcmEndpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({ message: messagePayload }),
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  // Prune tokens FCM reports as dead so we stop trying them.
                  if (
                    response.status === 404 ||
                    errorText.includes('UNREGISTERED') ||
                    errorText.includes('INVALID_ARGUMENT')
                  ) {
                    await supabaseClient.from('push_tokens').delete().eq('device_token', tokenData.device_token);
                  }
                  throw new Error(`FCM v1 error: ${response.status} - ${errorText}`);
                }
                return await response.json();
              }),
            );

            pushSent = results.filter(r => r.status === 'fulfilled').length;
            pushFailed = results.filter(r => r.status === 'rejected').length;
            results.forEach((r) => { if (r.status === 'rejected') console.error('[push] send failed:', (r as any).reason?.message); });
            console.log(`Push complete: ${pushSent} sent, ${pushFailed} failed`);
          }
        }
      }
    }

    // Log to database (best-effort — a Postgrest builder has no .catch()).
    try {
      await supabaseClient
        .from('broadcast_logs')
        .insert({
          title,
          message: body,
          channel: doPush ? (doInApp ? 'push+inapp' : 'push') : 'inapp',
          recipients_count: pushTotal,
          successful_sends: pushSent,
          failed_sends: pushFailed,
          sent_at: new Date().toISOString()
        });
    } catch (logErr) {
      console.error('Failed to log broadcast:', logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notifications processed',
        sent: pushSent,
        failed: pushFailed,
        total: pushTotal,
        inApp: inAppInserted,
        note: pushNote || undefined,
        details: { audience: targetAudience },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('send-notification error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/*
DEPLOYMENT (FCM HTTP v1 + in-app fan-out):

1. Paste this code into the Supabase Dashboard edge function "send-push-notification".

2. Secret (Edge Functions → Secrets):
   - FCM_SERVICE_ACCOUNT = full Firebase service-account JSON (project rekindle-bc).

3. Request body flags:
   - push:  boolean (default true)  — FCM web push
   - inApp: boolean (default false) — insert notifications rows for the audience
   Both use the same audience resolution (targetAudience / userId / ministryId).

TESTING (push + in-app to one user):
curl -i --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"title":"Test","body":"Hello","userId":"<uuid>","targetAudience":"specific_user","push":true,"inApp":true,"link":"/#home"}'
*/
