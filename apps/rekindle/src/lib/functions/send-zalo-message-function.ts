// Supabase Edge Function: send-zalo-message
// Deploy with: supabase functions deploy send-zalo-message

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, message, targetAudience } = await req.json();

    // Validation
    if (!title || !message) {
      return new Response(
        JSON.stringify({ error: 'Title and message are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log(`Sending Zalo messages to audience: ${targetAudience || 'all'}`);

    // Get Zalo user IDs based on target audience
    let query = supabaseClient
      .from('zalo_profiles')
      .select(`
        zalo_user_id,
        user_id,
        opt_in_messages,
        profiles!inner(subscription_type)
      `)
      .eq('opt_in_messages', true);

    // Filter by target audience
    if (targetAudience && targetAudience !== 'all') {
      switch (targetAudience) {
        case 'premium':
          query = query.eq('profiles.subscription_type', 'premium');
          break;
        case 'free':
          query = query.eq('profiles.subscription_type', 'free');
          break;
        // Add more audience filters as needed
      }
    }

    const { data: zaloProfiles, error: profilesError } = await query;

    if (profilesError) {
      console.error('Error fetching Zalo profiles:', profilesError);
      throw profilesError;
    }

    console.log(`Found ${zaloProfiles?.length || 0} Zalo profiles`);

    if (!zaloProfiles || zaloProfiles.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No Zalo users found for target audience',
          sent: 0,
          failed: 0,
          total: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================================================================
    // ZALO API INTEGRATION
    // ==================================================================
    
    const zaloOAId = Deno.env.get('ZALO_OA_ID');
    const zaloAccessToken = Deno.env.get('ZALO_ACCESS_TOKEN');
    
    if (!zaloOAId || !zaloAccessToken) {
      console.warn('Zalo API not configured, simulating send');
      
      // DEVELOPMENT MODE
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Zalo messages sent successfully (simulated)',
          sent: zaloProfiles.length,
          failed: 0,
          total: zaloProfiles.length,
          details: {
            mode: 'development',
            recipients: zaloProfiles.length
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PRODUCTION MODE: Send via Zalo Official Account API
    // Format message for Zalo
    const formattedMessage = {
      text: `${title}\n\n${message}`
    };

    const results = await Promise.allSettled(
      zaloProfiles.map(async (profile) => {
        try {
          // Zalo Official Account API endpoint
          const response = await fetch('https://openapi.zalo.me/v2.0/oa/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access_token': zaloAccessToken
            },
            body: JSON.stringify({
              recipient: {
                user_id: profile.zalo_user_id
              },
              message: formattedMessage
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Zalo API error: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          
          // Check if Zalo API returned error
          if (result.error !== 0) {
            throw new Error(`Zalo error code: ${result.error} - ${result.message}`);
          }

          return result;
        } catch (error) {
          console.error(`Failed to send to Zalo user ${profile.zalo_user_id}:`, error);
          throw error;
        }
      })
    );

    // Count successful and failed sends
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Zalo broadcast complete: ${successful} sent, ${failed} failed`);

    // Log to database
    await supabaseClient
      .from('broadcast_logs')
      .insert({
        title,
        message,
        channel: 'zalo',
        recipients_count: zaloProfiles.length,
        successful_sends: successful,
        failed_sends: failed,
        sent_at: new Date().toISOString()
      })
      .catch(err => console.error('Failed to log broadcast:', err));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Zalo messages sent',
        sent: successful,
        failed: failed,
        total: zaloProfiles.length,
        details: {
          audience: targetAudience || 'all',
          profiles: zaloProfiles.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Zalo messaging error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/* 
DEPLOYMENT INSTRUCTIONS:

1. Create the edge function:
   supabase functions new send-zalo-message

2. Copy this code to:
   supabase/functions/send-zalo-message/index.ts

3. Set environment secrets in Supabase Dashboard:
   - ZALO_OA_ID: Your Zalo Official Account ID
   - ZALO_ACCESS_TOKEN: Your Zalo API access token
   - ZALO_APP_ID: Your Zalo app ID (optional)
   - ZALO_APP_SECRET: Your Zalo app secret (for token refresh)

4. Deploy the function:
   supabase functions deploy send-zalo-message

5. Create zalo_profiles table (see migration file)

ZALO OFFICIAL ACCOUNT (ZOA) SETUP:

1. Register Zalo Official Account:
   - Go to: https://oa.zalo.me/
   - Create business account
   - Verify business documents (Vietnamese business)
   - Wait for approval (1-3 days)

2. Get API credentials:
   - Go to Zalo Developers: https://developers.zalo.me/
   - Create app
   - Link app to Official Account
   - Get App ID and App Secret
   - Generate access token

3. Configure webhooks (optional):
   - Set webhook URL for receiving messages
   - Verify webhook
   - Handle user interactions

ZALO API DOCUMENTATION:
- Official Account API: https://developers.zalo.me/docs/official-account-api
- Message API: https://developers.zalo.me/docs/api/official-account-api/gui-tin/gui-tin-nhan-post-4201
- Authentication: https://developers.zalo.me/docs/api/official-account-api/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-post-4306

ZALO MESSAGE TYPES:

1. Text Message (implemented above):
{
  recipient: { user_id: "..." },
  message: { text: "..." }
}

2. Image Message:
{
  recipient: { user_id: "..." },
  message: { 
    attachment: {
      type: "template",
      payload: {
        template_type: "media",
        elements: [{
          media_type: "image",
          url: "https://..."
        }]
      }
    }
  }
}

3. Button Message:
{
  recipient: { user_id: "..." },
  message: {
    attachment: {
      type: "template",
      payload: {
        template_type: "list",
        elements: [{
          title: "...",
          subtitle: "...",
          default_action: {
            type: "oa.open.url",
            url: "https://..."
          }
        }]
      }
    }
  }
}

MOBILE APP INTEGRATION:

// Example: Link Zalo account
import { openURL } from 'react-native';

async function linkZaloAccount() {
  // Zalo OAuth URL
  const authUrl = `https://oauth.zaloapp.com/v3/permission?app_id=${ZALO_APP_ID}&redirect_uri=${REDIRECT_URI}`;
  
  // Open Zalo OAuth
  await openURL(authUrl);
  
  // After OAuth callback, save Zalo user ID
  await supabase.from('zalo_profiles').insert({
    user_id: currentUser.id,
    zalo_user_id: zaloUserId,
    opt_in_messages: true
  });
}

TESTING:

Test the function:
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-zalo-message' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"title":"Test","message":"Hello from Zalo","targetAudience":"all"}'

IMPORTANT NOTES:

1. Zalo Official Account requires:
   - Vietnamese business registration
   - Business verification documents
   - Approval process (1-3 days)

2. Zalo API limitations:
   - Can only send to users who have interacted with OA
   - Message format restrictions
   - Daily message limits based on OA tier

3. User consent required:
   - Users must follow your Official Account
   - Users must opt-in to receive messages
   - Provide easy unsubscribe option

4. Vietnamese language:
   - Primary audience is Vietnamese users
   - Consider Vietnamese language support
   - Follow Vietnamese data protection laws
*/
