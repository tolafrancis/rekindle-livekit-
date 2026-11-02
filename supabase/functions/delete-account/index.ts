// Supabase Edge Function: delete-account
// =====================================================================
// Permanently deletes the signed-in user's account (Apple requires apps
// that offer sign-up to offer in-app deletion). Called from the shared
// DeleteAccountSection in packages/features.
//
//   1. Cancels any Stripe subscription immediately, and disables any
//      Paystack subscription, so the user isn't billed after deletion.
//   2. prepare_user_account_deletion() (migration 0422) refuses ministry
//      owners and clears the NO ACTION references that would block the
//      delete.
//   3. Revokes the user's Sign in with Apple tokens when the iOS app sent
//      a fresh Apple authorization code (see revokeAppleTokens).
//   4. auth.admin.deleteUser() removes the user; everything else cascades.
//
// Secrets: STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY,
//          APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as Sentry from 'npm:@sentry/deno@^10';
import { SignJWT, importPKCS8 } from 'npm:jose@5';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false, tracesSampleRate: 0 });
Sentry.setTag('function', 'delete-account');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });

// Bundle IDs of the two iOS apps, the client_id Apple issued the code to.
const APPLE_CLIENT_IDS = ['com.rekindlebc.app', 'com.rekindlebc.ministry'];

// Apple requires apps to revoke a user's Sign in with Apple tokens when the
// account is deleted. Supabase keeps no Apple token, so the iOS app has the
// user confirm with Apple and sends the fresh authorization code; it is
// exchanged for a refresh token here and that token is revoked.
// APPLE_PRIVATE_KEY is the contents of the Sign in with Apple .p8 key.
async function revokeAppleTokens(code: string, clientId: string) {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !privateKey) {
    throw new Error('Apple revoke is not configured. Set APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY in Supabase secrets.');
  }

  const key = await importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256');
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: form,
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  const token: string | undefined = tokens.refresh_token ?? tokens.access_token;
  if (!tokenResponse.ok || !token) {
    throw new Error(`Apple token exchange failed: ${tokens.error ?? tokenResponse.status}`);
  }

  const revokeResponse = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: form,
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    }),
  });
  if (!revokeResponse.ok) throw new Error(`Apple revoke failed: ${revokeResponse.status}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // Ministry owners are refused before anything is cancelled.
    const { count: ownedMinistries } = await supabase
      .from('ministries')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);
    if (ownedMinistries) {
      return json({
        error: 'You own a ministry. Transfer it to another leader or close it before deleting your account.',
        code: 'OWNS_MINISTRY',
      }, 409);
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_subscription_id, paystack_subscription_code, paystack_email_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.stripe_subscription_id) {
      if (!stripeSecretKey) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets.');
      const cancelResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${stripeSecretKey}` } }
      );
      if (!cancelResponse.ok) {
        const cancelData = await cancelResponse.json().catch(() => ({}));
        const message: string = cancelData?.error?.message ?? 'Failed to cancel subscription';
        // Already gone on Stripe's side: nothing left to bill, carry on.
        if (!message.includes('No such subscription')) throw new Error(message);
      }
    }

    if (profile?.paystack_subscription_code && paystackSecretKey) {
      // Best effort: a failed disable is logged, not fatal.
      try {
        const disableResponse = await fetch('https://api.paystack.co/subscription/disable', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${paystackSecretKey}`
          },
          body: JSON.stringify({
            code: profile.paystack_subscription_code,
            token: profile.paystack_email_token || ''
          })
        });
        const disableData = await disableResponse.json();
        if (!disableResponse.ok || !disableData.status) {
          console.warn('Paystack disable failed:', disableData?.message);
        }
      } catch (err) {
        console.warn('Paystack disable failed:', err);
      }
    }

    const { error: prepareError } = await supabase.rpc('prepare_user_account_deletion', {
      p_user_id: user.id,
    });
    if (prepareError) {
      if (prepareError.message?.startsWith('OWNS_MINISTRY')) {
        return json({
          error: 'You own a ministry. Transfer it to another leader or close it before deleting your account.',
          code: 'OWNS_MINISTRY',
        }, 409);
      }
      throw new Error(prepareError.message);
    }

    // Best effort, like Paystack: a failed revoke is reported, not fatal, so
    // deleting an account never depends on Apple being reachable.
    if (typeof body?.appleAuthorizationCode === 'string' && APPLE_CLIENT_IDS.includes(body?.appleClientId)) {
      try {
        await revokeAppleTokens(body.appleAuthorizationCode, body.appleClientId);
      } catch (err) {
        console.warn('Apple revoke failed:', err);
        Sentry.captureException(err);
      }
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return json({ success: true });

  } catch (error: any) {
    console.error('Delete account error:', error);
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return json({ error: error.message }, 500);
  }
});
