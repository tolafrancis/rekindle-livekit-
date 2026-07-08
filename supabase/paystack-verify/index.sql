// supabase/functions/paystack-verify/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reference } = await req.json()

    if (!reference) {
      return new Response(
        JSON.stringify({ error: 'Payment reference is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Paystack secret key
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecretKey) {
      console.error('PAYSTACK_SECRET_KEY not found')
      return new Response(
        JSON.stringify({ error: 'Payment verification unavailable' }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Verifying Paystack payment:', reference)

    // Verify transaction with Paystack
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const verifyData = await verifyResponse.json()

    if (!verifyResponse.ok || !verifyData.status) {
      console.error('Paystack verification failed:', verifyData)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: verifyData.message || 'Payment verification failed' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const transaction = verifyData.data

    // Only update if payment was successful
    if (transaction.status !== 'success') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Payment was not successful',
          status: transaction.status 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Extract metadata from transaction
    const metadata    = transaction.metadata || {}
    const userId      = metadata.user_id
    const planType    = metadata.plan_type
    const tierMapping: Record<string, string> = {
      'premium':       'premium',
      'premium_plus':  'premium_plus',
      'family':        'ministry',
      'ministry_plus': 'ministry_plus',
    }
    const subscriptionTier = metadata.subscription_tier || tierMapping[planType] || planType

    // ── Update subscription tier on user_profiles ─────────────────────────
    if (userId && planType) {
      const expiresAt = new Date()
      expiresAt.setMonth(expiresAt.getMonth() + 1) // 1 month from now

      await supabaseClient
        .from('user_profiles')
        .update({
          subscription_tier:       subscriptionTier,
          subscription_status:     'active',
          paystack_customer_code:  transaction.customer?.customer_code || null,
          paystack_reference:      transaction.reference,
          pending_plan_type:       null,
          subscription_ends_at:    expiresAt.toISOString(),
        })
        .eq('user_id', userId)
    }

    // ── Update donation record if this was a donation payment ─────────────
    const { error: updateError } = await supabaseClient
      .from('donations')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('payment_reference', reference)
      .eq('payment_provider', 'paystack')

    if (updateError) {
      console.log('No donation record to update (may be a subscription payment) — continuing')
    }

    console.log('Payment verified successfully:', reference)

    return new Response(
      JSON.stringify({ 
        success: true,
        subscriptionTier,
        amount: transaction.amount / 100,
        currency: transaction.currency,
        reference: transaction.reference,
        paidAt: transaction.paid_at
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Verification error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'An unexpected error occurred'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})