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
        const donationData = {
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
        };

        if (ministryId) {
          await supabase.from('ministry_donations').insert({
            ...donationData,
            ministry_id: ministryId,
            donor_id: userId || null,
            amount_cents: amount,
            stripe_payment_id: data.id,
            notes: message || null,
            status: 'pending',
            donation_type: 'one-time',
            fund_allocation: fundAllocation || 'General',
            campaign_id: campaignId || null
          });
        } else {
          await supabase.from('donations').insert(donationData);
        }
      }

      return new Response(JSON.stringify({
        clientSecret: data.clientSecret,
        paymentIntentId: data.id,
        provider: 'stripe'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (err) {
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
        const donationData = {
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
        };

        if (ministryId) {
          await supabase.from('ministry_donations').insert({
            ...donationData,
            ministry_id: ministryId,
            donor_id: userId || null,
            amount_cents: amount,
            transaction_id: reference,
            notes: message || null,
            status: 'pending',
            donation_type: 'one-time',
            fund_allocation: fundAllocation || 'General',
            campaign_id: campaignId || null
          });
        } else {
          await supabase.from('donations').insert(donationData);
        }
      }

      return new Response(JSON.stringify({
        authorizationUrl: initData.data.authorization_url,
        accessCode: initData.data.access_code,
        reference: initData.data.reference,
        provider: 'paystack'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (err) {
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