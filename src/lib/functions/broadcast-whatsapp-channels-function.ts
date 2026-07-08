// Supabase Edge Function: broadcast-whatsapp
// File: supabase/functions/broadcast-whatsapp/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BroadcastWhatsAppRequest {
  title: string
  message: string
  phones: string[]
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get request body
    const { title, message, phones }: BroadcastWhatsAppRequest = await req.json()

    // Validate input
    if (!title || !message || !phones || phones.length === 0) {
      throw new Error('Missing required fields: title, message, phones')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // WhatsApp Business API credentials
    const WHATSAPP_API_URL = Deno.env.get('WHATSAPP_API_URL') || 'https://graph.facebook.com/v18.0'
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')

    if (!WHATSAPP_PHONE_ID || !WHATSAPP_ACCESS_TOKEN) {
      throw new Error('WhatsApp credentials not configured')
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[]
    }

    // Send to each phone number
    for (const phone of phones) {
      try {
        // Format phone number (remove any spaces, dashes, etc.)
        const formattedPhone = phone.replace(/[^\d+]/g, '')

        // Prepare WhatsApp message
        const whatsappMessage = {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: {
            body: `*${title}*\n\n${message}`
          }
        }

        // Send via WhatsApp Business API
        const response = await fetch(
          `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(whatsappMessage),
          }
        )

        const responseData = await response.json()

        if (response.ok) {
          results.successful++
          console.log(`WhatsApp message sent to ${formattedPhone}`)
        } else {
          results.failed++
          results.errors.push(`${formattedPhone}: ${responseData.error?.message || 'Unknown error'}`)
          console.error(`Failed to send to ${formattedPhone}:`, responseData)
        }
      } catch (error) {
        results.failed++
        results.errors.push(`${phone}: ${error.message}`)
        console.error(`Error sending to ${phone}:`, error)
      }
    }

    // Log the broadcast results
    await supabaseClient
      .from('broadcast_logs')
      .insert({
        channel: 'whatsapp',
        title,
        message,
        total_recipients: phones.length,
        successful: results.successful,
        failed: results.failed,
        error_details: results.errors,
        created_at: new Date().toISOString()
      })

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `WhatsApp broadcast sent to ${results.successful}/${phones.length} recipients`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in broadcast-whatsapp function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
/* 
SETUP INSTRUCTIONS:

1. Set environment variables in Supabase Dashboard:
   - WHATSAPP_API_URL: https://graph.facebook.com/v18.0
   - WHATSAPP_PHONE_ID: Your WhatsApp Business Phone Number ID
   - WHATSAPP_ACCESS_TOKEN: Your WhatsApp Business API Access Token

2. Deploy this function:
   supabase functions deploy broadcast-whatsapp

3. Grant permissions to call this function in your RLS policies

4. WhatsApp Business API Setup:
   - Register at https://business.facebook.com/
   - Set up WhatsApp Business API
   - Get Phone Number ID and Access Token
   - Add phone numbers to allowed list (for testing)
   - Verify business for production use

5. Alternative: Use a WhatsApp gateway service like:
   - Twilio WhatsApp API
   - MessageBird
   - Vonage (Nexmo)
   - Infobip
*/
