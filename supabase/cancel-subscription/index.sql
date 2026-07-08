import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { provider, immediate = false } = await req.json();

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_subscription_id, paystack_subscription_code, subscription_ends_at')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) throw new Error('User profile not found');

    if (provider === 'stripe' && profile.stripe_subscription_id) {
      if (!gatewayApiKey) throw new Error("Gateway API key not configured");

      // Cancel Stripe subscription
      const cancelResponse = await fetch(
        `https://stripe.gateway.fastrouter.io/payments/subscriptions/${profile.stripe_subscription_id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
          body: JSON.stringify({ immediately: immediate })
        }
      );
      
      const cancelData = await cancelResponse.json();
      if (!cancelResponse.ok) throw new Error(cancelData.error || 'Failed to cancel subscription');

      // Update user profile
      if (immediate) {
        await supabase
          .from('user_profiles')
          .update({ 
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            stripe_subscription_id: null,
            subscription_ends_at: null
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_profiles')
          .update({ 
            subscription_status: 'cancelled'
          })
          .eq('user_id', user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: immediate 
          ? 'Subscription cancelled immediately' 
          : `Subscription will be cancelled at the end of the billing period (${new Date(profile.subscription_ends_at).toLocaleDateString()})`
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } else if (provider === 'paystack' && profile.paystack_subscription_code) {
      if (!paystackSecretKey) throw new Error("Paystack secret key not configured");

      // Disable Paystack subscription
      const disableResponse = await fetch(
        `https://api.paystack.co/subscription/disable`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${paystackSecretKey}`
          },
          body: JSON.stringify({ 
            code: profile.paystack_subscription_code,
            token: profile.paystack_email_token || ''
          })
        }
      );
      
      const disableData = await disableResponse.json();
      if (!disableResponse.ok || !disableData.status) {
        throw new Error(disableData.message || 'Failed to cancel subscription');
      }

      // Update user profile
      if (immediate) {
        await supabase
          .from('user_profiles')
          .update({ 
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            paystack_subscription_code: null,
            subscription_ends_at: null
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_profiles')
          .update({ 
            subscription_status: 'cancelled'
          })
          .eq('user_id', user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: immediate 
          ? 'Subscription cancelled immediately' 
          : 'Subscription will be cancelled at the end of the billing period'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    throw new Error('No active subscription found');

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});