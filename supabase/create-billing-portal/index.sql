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
    if (!gatewayApiKey) throw new Error("Gateway API key not configured");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { returnUrl } = await req.json();

    // Get user profile with Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      throw new Error('No Stripe customer found. Please contact support.');
    }

    // Create billing portal session
    // Note: The Stripe Gateway may not support billing portal directly
    // In that case, we'll return an error message
    const portalResponse = await fetch('https://stripe.gateway.fastrouter.io/payments/billing-portal-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': gatewayApiKey },
      body: JSON.stringify({
        customer: profile.stripe_customer_id,
        return_url: returnUrl || 'https://rekindled.app/subscription'
      })
    });

    if (!portalResponse.ok) {
      // If billing portal is not supported, provide alternative
      return new Response(JSON.stringify({
        error: 'Billing portal is not available. Please contact support to manage your subscription.',
        supportEmail: 'support@rekindled.app'
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

    const portalData = await portalResponse.json();
    
    return new Response(JSON.stringify({
      url: portalData.url
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('Billing portal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});