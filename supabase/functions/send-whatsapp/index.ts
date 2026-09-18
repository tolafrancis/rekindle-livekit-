// Supabase Edge Function: send-whatsapp
// =====================================================================
// Sends a single WhatsApp text/template message via the platform's own
// shared WhatsApp Business number (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_ID)
// — distinct from the ministry app's per-ministry-WABA system
// (ministry-whatsapp-broadcast) and from broadcast-whatsapp (this
// function's batch/multi-provider sibling). Called per-recipient from
// MinistryGroupsManager.tsx's WhatsApp broadcast flow in the consumer app.
//
// Mirrored here from the untracked supabase/send-whatsapp/index.sql (never
// actually deployed via the CLI, which requires index.ts) so it's part of
// the real, trackable deploy pipeline — this function was previously called
// from real, live UI with its actual deployment status unconfirmed.
//
// Caller must be a leader/admin/owner of ministryId (checked via
// is_group_admin, same gate evangelism-send-message uses) — previously this
// function trusted whatever phone_number/message came in the raw POST body
// with no identity check at all, letting any logged-in user send WhatsApp
// messages through the platform's shared number to any number they liked.
//
// Secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_ID.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface WhatsAppRequest {
  ministryId: string;
  phone_number: string;
  message_type: 'text' | 'template';
  message?: string;
  template_name?: string;
  template_params?: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_ID");

    if (!accessToken || !phoneNumberId) {
      console.error('Missing WhatsApp credentials');
      return new Response(
        JSON.stringify({
          error: 'WhatsApp integration not configured',
          details: 'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_ID environment variables'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const body: WhatsAppRequest = await req.json();
    const { ministryId, phone_number, message_type, message, template_name, template_params } = body;

    if (!ministryId) {
      return new Response(JSON.stringify({ error: 'ministryId is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Caller must administer ministryId — resolve their identity from the
    // forwarded Authorization header (supabase.functions.invoke() already
    // sends this from the client SDK).
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized to message on behalf of this ministry' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Clean phone number - remove + and any spaces/dashes
    const cleanedPhone = phone_number.replace(/[\s\-\+]/g, '');

    // Build the WhatsApp API request
    const whatsappApiUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    let messagePayload: any;

    if (message_type === 'template') {
      // Template message
      messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanedPhone,
        type: 'template',
        template: {
          name: template_name || 'hello_world',
          language: {
            code: 'en_US'
          },
          components: template_params && template_params.length > 0 ? [
            {
              type: 'body',
              parameters: template_params.map(param => ({
                type: 'text',
                text: param
              }))
            }
          ] : undefined
        }
      };
    } else {
      // Text message
      const textMessage = message || (template_params && template_params[0]) || 'Hello from Kindled!';
      messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: textMessage
        }
      };
    }

    console.log('Sending WhatsApp message to:', cleanedPhone);
    console.log('Message type:', message_type);

    const response = await fetch(whatsappApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', responseData);

      // Parse WhatsApp error for better user feedback
      let errorMessage = 'Failed to send WhatsApp message';

      if (responseData.error) {
        const waError = responseData.error;

        if (waError.code === 131030) {
          errorMessage = 'This phone number is not registered on WhatsApp or has not opted in to receive messages.';
        } else if (waError.code === 131047) {
          errorMessage = 'Message failed to send. The recipient may have blocked messages or the number is invalid.';
        } else if (waError.code === 131051) {
          errorMessage = 'The message template is not approved or does not exist.';
        } else if (waError.code === 100) {
          errorMessage = 'Invalid phone number format. Please include country code.';
        } else if (waError.code === 190) {
          errorMessage = 'WhatsApp access token is invalid or expired. Please contact administrator.';
        } else if (waError.message) {
          errorMessage = waError.message;
        }
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          details: responseData.error
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    console.log('WhatsApp message sent successfully:', responseData);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: responseData.messages?.[0]?.id,
        data: responseData
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );

  } catch (error: any) {
    console.error('Error in send-whatsapp function:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});
