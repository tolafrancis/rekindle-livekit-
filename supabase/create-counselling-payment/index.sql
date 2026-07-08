export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
    if (!gatewayApiKey) {
      throw new Error("Gateway API key not configured");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get user from auth token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { counsellor_id, scheduled_at, duration, topic, notes, amount } = await req.json();

    if (!counsellor_id || !scheduled_at || !amount) {
      throw new Error('Missing required fields: counsellor_id, scheduled_at, amount');
    }

    // Verify counsellor exists and is active
    const { data: counsellor, error: counsellorError } = await supabase
      .from('counsellors')
      .select('*')
      .eq('id', counsellor_id)
      .eq('is_active', true)
      .single();

    if (counsellorError || !counsellor) {
      throw new Error('Counsellor not found or inactive');
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('user_id', user.id)
      .single();

    // Calculate fees (2% platform fee)
    const amountInCents = Math.round(amount * 100);
    const platformFee = Math.round(amountInCents * 0.02);
    const counsellorPayout = amountInCents - platformFee;

    // Create PaymentIntent through the Payment Gateway
    const paymentResponse = await fetch('https://stripe.gateway.fastrouter.io/payments/payment-intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': gatewayApiKey
      },
      body: JSON.stringify({
        amount: amountInCents,
        currency: 'usd',
        metadata: {
          type: 'counselling_session',
          counsellor_id,
          user_id: user.id,
          scheduled_at,
          duration: duration || 30
        }
      })
    });

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      throw new Error(paymentData.error || 'Failed to create payment intent');
    }

    // Create the session record with pending payment status
    const { data: session, error: sessionError } = await supabase
      .from('counselling_sessions')
      .insert({
        counsellor_id,
        user_id: user.id,
        user_name: userProfile?.full_name || user.email || 'Anonymous',
        scheduled_at,
        duration: duration || 30,
        topic: topic || 'General Counselling',
        notes,
        status: 'pending',
        payment_status: 'pending',
        payment_intent_id: paymentData.id,
        amount_paid: amountInCents,
        platform_fee: platformFee,
        counsellor_payout: counsellorPayout,
        messaging_enabled: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sessionError) {
      throw new Error('Failed to create session: ' + sessionError.message);
    }

    return new Response(JSON.stringify({
      clientSecret: paymentData.clientSecret,
      paymentIntentId: paymentData.id,
      sessionId: session.id,
      amount: amountInCents,
      platformFee,
      counsellorPayout
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error: any) {
    console.error('Payment creation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});