export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface WhatsAppRequest {
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
    const { phone_number, message_type, message, template_name, template_params } = body;

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
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