import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Plan prices in different currencies (in smallest unit - kobo, pesewas, cents)
const PLAN_PRICES: Record<string, Record<string, number>> = {
  'premium': {
    'NGN': 1500000, // 15,000 NGN
    'GHS': 15000,   // 150 GHS
    'ZAR': 18000,   // 180 ZAR
    'USD': 999      // $9.99
  },
  'premium_plus': {
    'NGN': 3000000, // 30,000 NGN
    'GHS': 30000,   // 300 GHS
    'ZAR': 36000,   // 360 ZAR
    'USD': 1999     // $19.99
  },
  'family': {
    'NGN': 4500000, // 45,000 NGN
    'GHS': 45000,   // 450 GHS
    'ZAR': 54000,   // 540 ZAR
    'USD': 2999     // $29.99
  },
  'ministry_plus': {
    'NGN': 7500000, // 75,000 NGN
    'GHS': 75000,   // 750 GHS
    'ZAR': 90000,   // 900 ZAR
    'USD': 4999     // $49.99
  }
};

// Paystack plan codes — create these in your Paystack dashboard
// then set them as Supabase secrets (env vars), or use the placeholders below
const getPaystackPlanCode = (planType: string, currency: string): string | undefined => {
  const key = `PAYSTACK_PLAN_${planType.toUpperCase()}_${currency.toUpperCase()}`;
  return Deno.env.get(key);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecretKey) throw new Error("Paystack secret key not configured");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { planType, userId, userEmail, currency = 'NGN', callbackUrl } = await req.json();

    if (!planType || !PLAN_PRICES[planType]) {
      throw new Error('Invalid plan type');
    }

    if (!userEmail) {
      throw new Error('Email is required');
    }

    const amount = PLAN_PRICES[planType][currency];
    if (!amount) {
      throw new Error(`Currency ${currency} not supported for this plan`);
    }

    // Generate unique reference
    const reference = `sub_${userId}_${planType}_${Date.now()}`;

    // Get Paystack plan code if one exists for this plan+currency
    // (enables recurring billing via Paystack subscriptions)
    const planCode = getPaystackPlanCode(planType, currency);

    // Tier mapping for user_profiles.subscription_tier
    const tierMapping: Record<string, string> = {
      'premium':       'premium',
      'premium_plus':  'premium_plus',
      'family':        'ministry',
      'ministry_plus': 'ministry_plus',
    };

    // Initialize transaction for subscription
    const initPayload: Record<string, any> = {
      email: userEmail,
      amount: amount,
      currency: currency,
      reference: reference,
      callback_url: callbackUrl || `${Deno.env.get('SITE_URL') || 'https://rekindlebc.com'}?payment=success`,
      metadata: {
        user_id: userId,
        plan_type: planType,
        subscription_tier: tierMapping[planType] || planType,
        subscription: true,
        custom_fields: [
          { display_name: 'Plan',    variable_name: 'plan_type', value: planType },
          { display_name: 'User ID', variable_name: 'user_id',   value: userId   },
        ]
      },
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    };

    // Add plan code for recurring billing if configured
    if (planCode) {
      initPayload.plan = planCode;
    }

    // Initialize transaction for subscription
    const initResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${paystackSecretKey}`
      },
      body: JSON.stringify(initPayload)
    });

    const initData = await initResponse.json();

    if (!initData.status) {
      throw new Error(initData.message || 'Failed to initialize payment');
    }

    // Store pending transaction reference
    await supabase
      .from('user_profiles')
      .update({
        paystack_reference: reference,
        pending_plan_type: planType
      })
      .eq('user_id', userId);

    return new Response(JSON.stringify({
      authorizationUrl: initData.data.authorization_url,
      accessCode: initData.data.access_code,
      reference: initData.data.reference
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('Paystack initialize error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});