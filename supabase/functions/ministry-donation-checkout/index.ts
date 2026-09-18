// Supabase Edge Function: ministry-donation-checkout
// =====================================================================
// Creates a destination-charge PaymentIntent for a one-time donation to a
// ministry via Stripe Connect (Express). Replaces create-donation ONLY for
// the ministryId + provider:'stripe' case — create-donation itself is left
// untouched for the non-ministry consumer donation path (PartnerDonationPage
// / SponsorshipSystem) and for ministry+Paystack donations.
//
// Donor-facing: no admin check. Callers are anonymous or logged-in donors —
// Supabase's anon-key JWT satisfies gateway verification without requiring a
// real signed-in user; this function trusts the email/name in the request
// body, same trust model create-donation already uses.
//
// The platform takes a flat 3% cut via application_fee_amount; the remainder
// auto-transfers to the ministry's connected Stripe account via
// transfer_data.destination. Both live on the PLATFORM's PaymentIntent — the
// browser confirms it with the platform's own publishable key (no
// `stripeAccount` Elements option; that's only for direct charges).
//
// Secrets: STRIPE_SECRET_KEY (platform key, shared with ministry-checkout /
// stripe-subscription / ministry-connect-onboarding).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PLATFORM_FEE_RATE = 0.03; // 3% flat platform fee

function flattenForStripe(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenForStripe(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') Object.assign(result, flattenForStripe(item, `${key}[${i}]`));
        else result[`${key}[${i}]`] = String(item);
      });
    } else {
      result[key] = String(v);
    }
  }
  return result;
}

async function stripeCall(method: string, path: string, secretKey: string, body?: Record<string, any>): Promise<any> {
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
  };
  if (body) init.body = new URLSearchParams(flattenForStripe(body)).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
}

// Stripe metadata values cap at 500 chars — truncate defensively.
const meta = (s: string | null | undefined) => (s ? String(s).slice(0, 500) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_KEY) return json({ error: 'Stripe is not configured' }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const {
      ministryId, amount, currency = 'USD', email, name, userId,
      isAnonymous = false, message, campaignId, fundAllocation,
    } = await req.json();

    if (!ministryId) return json({ error: 'ministryId is required' }, 400);
    if (!amount || amount < 100) return json({ error: 'Minimum donation amount is $1.00' }, 400);
    if (!email) return json({ error: 'Email is required' }, 400);

    const { data: connect } = await supabase
      .from('ministry_stripe_connect').select('stripe_account_id, charges_enabled')
      .eq('ministry_id', ministryId).maybeSingle();

    if (!connect || !connect.charges_enabled) {
      return json({ error: "This ministry hasn't finished setting up Stripe donations yet. Please try Paystack, or check back soon." }, 400);
    }

    const applicationFeeAmount = Math.round(amount * PLATFORM_FEE_RATE);
    const donorName = isAnonymous ? 'Anonymous' : (name || 'Anonymous');

    const paymentIntent = await stripeCall('POST', '/payment_intents', STRIPE_KEY, {
      amount,
      currency: String(currency).toLowerCase(),
      automatic_payment_methods: { enabled: true },
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: connect.stripe_account_id },
      metadata: {
        ministry_id: ministryId,
        type: 'donation',
        donor_email: meta(email),
        donor_name: meta(donorName),
        user_id: meta(userId),
        campaign_id: meta(campaignId),
        fund_allocation: meta(fundAllocation),
        message: meta(message),
      },
    });

    const { error: insertError } = await supabase.from('ministry_donations').insert({
      user_id: userId || null,
      amount: amount / 100,
      currency: String(currency).toUpperCase(),
      payment_method: 'stripe',
      donor_name: donorName,
      donor_email: email,
      is_anonymous: isAnonymous,
      status: 'pending',
      ministry_id: ministryId,
      donor_id: userId || null,
      amount_cents: amount,
      stripe_payment_id: paymentIntent.id,
      notes: message || null,
      donation_type: 'one_time',
      fund_allocation: fundAllocation || 'General',
      campaign_id: campaignId || null,
    });
    // Don't fail the request over this — Stripe already has a valid
    // PaymentIntent and the donor's card may already be charged by the time
    // they confirm it client-side. Log loudly so a schema mismatch like this
    // is visible in function logs instead of silently losing the record.
    if (insertError) console.error('ministry_donations insert failed:', insertError.message, insertError.details);

    return json({ clientSecret: paymentIntent.client_secret });

  } catch (error: any) {
    console.error('Ministry donation checkout error:', error);
    return json({ error: error.message || 'An unexpected error occurred' }, 500);
  }
});
