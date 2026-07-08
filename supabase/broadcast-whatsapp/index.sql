import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_SID_BROADCAST = 'HX7ff57d7502a193c482bef108173dccf7'

interface BroadcastWhatsAppRequest {
  title: string
  message: string
  phones: string[]
  senderName?: string
  userId?: string
  provider?: 'meta' | 'twilio'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { title, message, phones, senderName, userId, provider: requestedProvider }: BroadcastWhatsAppRequest = await req.json()

    if (!title || !message || !phones || phones.length === 0) {
      throw new Error('Missing required fields: title, message, phones')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM')
    const twilioAvailable = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM)

    const WHATSAPP_API_URL      = Deno.env.get('WHATSAPP_API_URL') || 'https://graph.facebook.com/v18.0'
    const WHATSAPP_PHONE_ID     = Deno.env.get('WHATSAPP_PHONE_ID')
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
    const metaAvailable = !!(WHATSAPP_PHONE_ID && WHATSAPP_ACCESS_TOKEN)

    let useTwilio: boolean
    if (requestedProvider === 'twilio') {
      if (!twilioAvailable) throw new Error('Twilio not configured.')
      useTwilio = true
    } else if (requestedProvider === 'meta') {
      if (!metaAvailable) throw new Error('Meta not configured.')
      useTwilio = false
    } else {
      useTwilio = twilioAvailable
    }

    if (!useTwilio && !metaAvailable) {
      throw new Error('No WhatsApp provider configured.')
    }

    const results = { successful: 0, failed: 0, errors: [] as string[] }

    for (const phone of phones) {
      try {
        const formattedPhone = phone.replace(/[^\d+]/g, '')

        if (useTwilio) {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
          const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

          const params = new URLSearchParams({
            From:             TWILIO_WHATSAPP_FROM!,
            To:               `whatsapp:${formattedPhone}`,
            ContentSid:       TEMPLATE_SID_BROADCAST,
            ContentVariables: JSON.stringify({ '1': title, '2': message }),
          })

          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type':  'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          })

          const responseData = await response.json()

          if (response.ok && responseData.sid) {
            results.successful++
            console.log(`Twilio broadcast sent to ${formattedPhone} — SID: ${responseData.sid}`)
          } else {
            results.failed++
            results.errors.push(`${formattedPhone}: ${responseData.message || responseData.error_message || 'Unknown error'}`)
            console.error(`Twilio failed to send to ${formattedPhone}:`, responseData)
          }

        } else {
          // Meta — free form (only works within 24hr window)
          const response = await fetch(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to:   formattedPhone,
              type: 'text',
              text: { body: senderName ? `*${senderName}*\n*${title}*\n\n${message}` : `*${title}*\n\n${message}` }
            }),
          })

          const responseData = await response.json()
          if (response.ok) {
            results.successful++
          } else {
            results.failed++
            results.errors.push(`${formattedPhone}: ${responseData.error?.message || 'Unknown error'}`)
          }
        }
      } catch (error: any) {
        results.failed++
        results.errors.push(`${phone}: ${error.message}`)
      }
    }

    // Log broadcast
    await supabaseClient.from('broadcast_logs').insert({
      channel: 'whatsapp',
      title, message,
      sender_name:       senderName || null,
      total_recipients:  phones.length,
      successful:        results.successful,
      failed:            results.failed,
      error_details:     results.errors,
      credits_used:      results.successful,
      usd_cost:          parseFloat((results.successful * 0.03).toFixed(2)),
      created_at:        new Date().toISOString(),
    })

    // Deduct wallet credits
    if (userId && results.successful > 0) {
      try {
        const { data: wallet, error: walletError } = await supabaseClient
          .from('broadcast_wallets')
          .select('id, balance_credits, total_used')
          .eq('user_id', userId)
          .single()

        if (!walletError && wallet) {
          await supabaseClient.from('broadcast_wallets').update({
            balance_credits: Math.max(0, wallet.balance_credits - results.successful),
            total_used:      wallet.total_used + results.successful,
            updated_at:      new Date().toISOString(),
          }).eq('user_id', userId)

          await supabaseClient.from('broadcast_wallet_transactions').insert({
            user_id:          userId,
            type:             'deduction',
            credits:          -results.successful,
            usd_amount:       parseFloat((results.successful * 0.03).toFixed(2)),
            description:      `WhatsApp broadcast: "${title}"`,
            recipients_count: results.successful,
            status:           'completed',
            created_at:       new Date().toISOString(),
          })
        }
      } catch (walletErr) {
        console.error('Wallet deduction error (non-fatal):', walletErr)
      }
    }

    return new Response(
      JSON.stringify({ success: true, results, provider: useTwilio ? 'twilio' : 'meta', message: `WhatsApp broadcast sent to ${results.successful}/${phones.length} recipients` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Error in broadcast-whatsapp:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
