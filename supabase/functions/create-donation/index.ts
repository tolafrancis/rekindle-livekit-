// Supabase Edge Function: create-donation
// =====================================================================
// Donation checkout for the non-ministry consumer donation path
// (PartnerDonationPage.tsx / SponsorshipSystem.tsx, writes to the
// platform-wide `donations` table) AND ministry+Paystack donations
// (MinistryDonationForm.tsx, writes to `ministry_donations`). Ministry
// +Stripe donations go through ministry-donation-checkout instead (real
// Stripe Connect destination charges) — this function's own Stripe branch
// is effectively dead for ministries now but kept working for the
// consumer path, which still goes through the fastrouter.io gateway (a
// known, separately-flagged issue, out of scope here).
//
// Mirrored here from the untracked supabase/create-donation/index.sql
// (never actually deployed via the CLI, which requires index.ts) so it's
// part of the real, trackable deploy pipeline.
//
// BUG FIXED: the ministry_donations insert (both branches) previously spread
// a `donationData` object built for the DIFFERENT platform-wide `donations`
// table schema — payment_status/payment_provider/payment_reference/message
// aren't real columns on ministry_donations (only status/payment_method
// exist), and donation_type must be 'one_time' (underscore), not 'one-time'.
// Neither insert checked its error, so this failed COMPLETELY SILENTLY: a
// real Paystack donation would charge the donor with zero DB record ever
// created (same class of bug found and fixed in ministry-donation-checkout
// this session — see STRIPE_PAYMENTS_SETUP memory for the diagnostic
// pattern that caught it). Now builds a ministry_donations-specific object
// with only real columns, and logs (not swallows) any insert error.
//
// Secrets: PAYSTACK_SECRET_KEY, GATEWAY_API_KEY (Stripe/consumer path only).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const platformPaystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const {
    provider,
    amount,
    currency = 'USD',
    email,
    name,
    userId,
    isAnonymous = false,
    message,
    ministryId,
    campaignId,
    fundAllocation,
    callbackUrl
  } = body;

  if (!amount || amount < 100) {
    return new Response(JSON.stringify({ error: 'Minimum donation amount is $1.00 or N1000' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  let supabase = null;
  if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  // Ministry-scoped donations write to ministry_donations, which has a
  // narrower, DIFFERENT real column set than the platform-wide `donations`
  // table below — never spread one object into both.
  async function insertMinistryDonation(fields: {
    paymentMethod: 'stripe' | 'paystack';
    currency: string;
    amountCents: number;
    reference: string; // stripe_payment_id or transaction_id, provider-specific
  }) {
    if (!supabase) return;
    const { error } = await supabase.from('ministry_donations').insert({
      user_id: userId || null,
      amount: fields.amountCents / 100,
      currency: fields.currency,
      payment_method: fields.paymentMethod,
      donor_name: isAnonymous ? 'Anonymous' : (name || 'Anonymous'),
      donor_email: email,
      is_anonymous: isAnonymous,
      status: 'pending',
      ministry_id: ministryId,
      donor_id: userId || null,
      amount_cents: fields.amountCents,
      ...(fields.paymentMethod === 'stripe' ? { stripe_payment_id: fields.reference } : { transaction_id: fields.reference }),
      notes: message || null,
      donation_type: 'one_time',
      fund_allocation: fundAllocation || 'General',
      campaign_id: campaignId || null,
    });
    if (error) console.error('ministry_donations insert failed:', error.message, error.details);
  }

  let paymentSettings = null;
  let useMinistryPaystack = false;
  let ministryPaystackKey = null;

  if (ministryId && supabase) {
    const { data: settings } = await supabase
      .from('ministry_payment_settings')
      .select('*')
      .eq('ministry_id', ministryId)
      .eq('is_active', true)
      .single();

    if (settings) {
      paymentSettings = settings;

      if (settings.payment_mode === 'external' && settings.external_payment_url) {
        return new Response(JSON.stringify({
          redirectUrl: settings.external_payment_url,
          provider: 'external',
          externalName: settings.external_payment_name || 'External Payment'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      if (settings.payment_mode === 'custom' && settings.paystack_secret_key_encrypted) {
        useMinistryPaystack = true;
        ministryPaystackKey = settings.paystack_secret_key_encrypted;
      }
    }
  }

  const paystackSecretKey = useMinistryPaystack ? ministryPaystackKey : platformPaystackSecretKey;

  if (provider === 'stripe') {
    if (!gatewayApiKey) {
      return new Response(JSON.stringify({
        error: 'Stripe payments are temporarily unavailable. Please use Paystack.'
      }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    try {
      const response = await fetch('https://stripe.gateway.fastrouter.io/payments/payment-intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': gatewayApiKey
        },
        body: JSON.stringify({
          amount,
          currency: 'usd',
          metadata: {
            type: 'donation',
            user_id: userId || 'guest',
            donor_name: isAnonymous ? 'Anonymous' : (name || 'Anonymous'),
            donor_email: email,
            ministry_id: ministryId || '',
            campaign_id: campaignId || '',
            fund_allocation: fundAllocation || 'General',
            message: message || ''
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment intent');
      }

      if (supabase) {
        if (ministryId) {
          await insertMinistryDonation({ paymentMethod: 'stripe', currency: 'USD', amountCents: amount, reference: data.id });
        } else {
          await supabase.from('donations').insert({
            user_id: userId || null,
            amount: amount / 100,
            currency: 'USD',
            payment_method: 'stripe',
            payment_provider: 'stripe',
            payment_reference: data.id,
            donor_name: isAnonymous ? 'Anonymous' : (name || 'Anonymous'),
            donor_email: email,
            is_anonymous: isAnonymous,
            message: message || null,
            payment_status: 'pending'
          });
        }
      }

      return new Response(JSON.stringify({
        clientSecret: data.clientSecret,
        paymentIntentId: data.id,
        provider: 'stripe'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (err: any) {
      console.error('Stripe error:', err);
      return new Response(JSON.stringify({
        error: 'Stripe payments are temporarily unavailable. Please use Paystack.'
      }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  if (provider === 'paystack') {
    if (!paystackSecretKey) {
      return new Response(JSON.stringify({ error: 'Paystack is not configured' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const validCurrencies = ['USD', 'NGN', 'GHS', 'ZAR'];
    const finalCurrency = validCurrencies.includes(currency) ? currency : 'USD';
    const paystackAmount = amount;
    const reference = `don_${ministryId ? 'min_' : ''}${userId || 'guest'}_${Date.now()}`;

    try {
      const initResponse = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${paystackSecretKey}`
        },
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          currency: finalCurrency,
          reference,
          callback_url: callbackUrl || 'https://rekindled.app?donation=success',
          metadata: {
            type: 'donation',
            user_id: userId || 'guest',
            donor_name: isAnonymous ? 'Anonymous' : (name || 'Anonymous'),
            ministry_id: ministryId || '',
            campaign_id: campaignId || '',
            fund_allocation: fundAllocation || 'General',
            message: message || ''
          }
        })
      });

      const initData = await initResponse.json();

      if (!initData.status) {
        return new Response(JSON.stringify({ error: initData.message || 'Paystack error' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (supabase) {
        if (ministryId) {
          await insertMinistryDonation({ paymentMethod: 'paystack', currency: finalCurrency, amountCents: amount, reference });
        } else {
          await supabase.from('donations').insert({
            user_id: userId || null,
            amount: amount / 100,
            currency: finalCurrency,
            payment_method: 'paystack',
            payment_provider: 'paystack',
            payment_reference: reference,
            donor_name: isAnonymous ? 'Anonymous' : (name || 'Anonymous'),
            donor_email: email,
            is_anonymous: isAnonymous,
            message: message || null,
            payment_status: 'pending'
          });
        }
      }

      return new Response(JSON.stringify({
        authorizationUrl: initData.data.authorization_url,
        accessCode: initData.data.access_code,
        reference: initData.data.reference,
        provider: 'paystack'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (err: any) {
      console.error('Paystack error:', err);
      return new Response(JSON.stringify({ error: 'Paystack error occurred' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid provider. Use "stripe" or "paystack"' }), {
    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
});
