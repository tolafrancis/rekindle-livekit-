import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Web Push utilities for VAPID
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importVapidKeys(publicKey: string, privateKey: string) {
  const publicKeyBuffer = urlBase64ToUint8Array(publicKey);
  const privateKeyBuffer = urlBase64ToUint8Array(privateKey);
  
  const cryptoPublicKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    []
  );
  
  const cryptoPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
  
  return { publicKey: cryptoPublicKey, privateKey: cryptoPrivateKey };
}

async function createJWT(audience: string, subject: string, privateKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject
  };
  
  const headerB64 = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );
  
  // Convert DER signature to raw format
  const signatureArray = new Uint8Array(signature);
  let r, s;
  
  if (signatureArray.length === 64) {
    r = signatureArray.slice(0, 32);
    s = signatureArray.slice(32, 64);
  } else {
    // DER format
    let offset = 2;
    const rLength = signatureArray[offset + 1];
    offset += 2;
    r = signatureArray.slice(offset, offset + rLength);
    offset += rLength + 2;
    const sLength = signatureArray[offset - 1];
    s = signatureArray.slice(offset, offset + sLength);
    
    // Pad to 32 bytes if needed
    if (r.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(r, 32 - r.length);
      r = padded;
    } else if (r.length > 32) {
      r = r.slice(r.length - 32);
    }
    if (s.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(s, 32 - s.length);
      s = padded;
    } else if (s.length > 32) {
      s = s.slice(s.length - 32);
    }
  }
  
  const rawSignature = new Uint8Array(64);
  rawSignature.set(r, 0);
  rawSignature.set(s, 32);
  
  const signatureB64 = arrayBufferToBase64Url(rawSignature.buffer);
  return `${unsignedToken}.${signatureB64}`;
}

async function sendWebPush(
  subscription: any,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    const endpoint = subscription.endpoint;
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    
    // For simplicity, we'll use a direct fetch approach
    // In production, you might want to use a proper web-push library
    const vapidSubject = 'mailto:admin@prayerapp.com';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Authorization': `vapid t=${await createSimpleJWT(audience, vapidSubject, vapidPrivateKey)}, k=${vapidPublicKey}`,
      },
      body: payload
    });
    
    if (response.status === 201 || response.status === 200) {
      return true;
    }
    
    console.error(`Push failed with status ${response.status}: ${await response.text()}`);
    return false;
  } catch (error) {
    console.error('Error sending push:', error);
    return false;
  }
}

async function createSimpleJWT(audience: string, subject: string, privateKeyBase64: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject
  };
  
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  return `${headerB64}.${payloadB64}.placeholder`;
}

// Simplified push notification sender using fetch
async function sendPushNotification(
  subscription: any,
  title: string,
  body: string,
  url: string,
  vapidPublicKey: string
): Promise<boolean> {
  try {
    const endpoint = subscription.endpoint;
    const payload = JSON.stringify({ title, body, url });
    
    // For Web Push without encryption (some browsers support this)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400',
      },
      body: payload
    });
    
    console.log(`Push response status: ${response.status}`);
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error('Push notification error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const results = {
      checked: now.toISOString(),
      reminders15min: 0,
      reminders5min: 0,
      notificationsSent: 0,
      errors: [] as string[]
    };

    // Calculate time windows for 15-minute and 5-minute reminders
    // Using a 2-minute window to account for scheduling variance
    const in15MinStart = new Date(now.getTime() + 14 * 60 * 1000);
    const in15MinEnd = new Date(now.getTime() + 16 * 60 * 1000);
    const in5MinStart = new Date(now.getTime() + 4 * 60 * 1000);
    const in5MinEnd = new Date(now.getTime() + 6 * 60 * 1000);

    console.log(`Checking for sessions between:`);
    console.log(`15-min window: ${in15MinStart.toISOString()} - ${in15MinEnd.toISOString()}`);
    console.log(`5-min window: ${in5MinStart.toISOString()} - ${in5MinEnd.toISOString()}`);

    // Query sessions starting in ~15 minutes
    const { data: sessions15, error: err15 } = await supabase
      .from('counselling_sessions')
      .select('id, user_id, counsellor_id, scheduled_at, reminder_15_sent')
      .eq('status', 'confirmed')
      .gte('scheduled_at', in15MinStart.toISOString())
      .lte('scheduled_at', in15MinEnd.toISOString())
      .or('reminder_15_sent.is.null,reminder_15_sent.eq.false');

    if (err15) {
      console.error('Error fetching 15-min sessions:', err15);
      results.errors.push(`15-min query error: ${err15.message}`);
    }

    // Query sessions starting in ~5 minutes
    const { data: sessions5, error: err5 } = await supabase
      .from('counselling_sessions')
      .select('id, user_id, counsellor_id, scheduled_at, reminder_5_sent')
      .eq('status', 'confirmed')
      .gte('scheduled_at', in5MinStart.toISOString())
      .lte('scheduled_at', in5MinEnd.toISOString())
      .or('reminder_5_sent.is.null,reminder_5_sent.eq.false');

    if (err5) {
      console.error('Error fetching 5-min sessions:', err5);
      results.errors.push(`5-min query error: ${err5.message}`);
    }

    console.log(`Found ${sessions15?.length || 0} sessions for 15-min reminder`);
    console.log(`Found ${sessions5?.length || 0} sessions for 5-min reminder`);

    // Process 15-minute reminders
    for (const session of sessions15 || []) {
      results.reminders15min++;
      
      // Get user's push subscriptions
      const { data: userSubs } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', session.user_id);

      // Get counsellor's push subscriptions
      const { data: counsellorData } = await supabase
        .from('counsellors')
        .select('user_id')
        .eq('id', session.counsellor_id)
        .single();

      let counsellorSubs: any[] = [];
      if (counsellorData?.user_id) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('user_id', counsellorData.user_id);
        counsellorSubs = subs || [];
      }

      const sessionTime = new Date(session.scheduled_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      // Send to user
      for (const sub of userSubs || []) {
        try {
          const sent = await sendPushNotification(
            sub.subscription,
            'Session Starting in 15 Minutes',
            `Your counselling session is scheduled for ${sessionTime}. Please be ready to join.`,
            '/my-bookings',
            vapidPublicKey
          );
          if (sent) results.notificationsSent++;
        } catch (e) {
          console.error('Error sending user notification:', e);
        }
      }

      // Send to counsellor
      for (const sub of counsellorSubs) {
        try {
          const sent = await sendPushNotification(
            sub.subscription,
            'Session Starting in 15 Minutes',
            `You have a counselling session scheduled for ${sessionTime}. Please prepare to join.`,
            '/counsellor-dashboard',
            vapidPublicKey
          );
          if (sent) results.notificationsSent++;
        } catch (e) {
          console.error('Error sending counsellor notification:', e);
        }
      }

      // Mark reminder as sent
      await supabase
        .from('counselling_sessions')
        .update({ reminder_15_sent: true })
        .eq('id', session.id);
    }

    // Process 5-minute reminders
    for (const session of sessions5 || []) {
      results.reminders5min++;
      
      // Get user's push subscriptions
      const { data: userSubs } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', session.user_id);

      // Get counsellor's push subscriptions
      const { data: counsellorData } = await supabase
        .from('counsellors')
        .select('user_id')
        .eq('id', session.counsellor_id)
        .single();

      let counsellorSubs: any[] = [];
      if (counsellorData?.user_id) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('user_id', counsellorData.user_id);
        counsellorSubs = subs || [];
      }

      // Send to user
      for (const sub of userSubs || []) {
        try {
          const sent = await sendPushNotification(
            sub.subscription,
            'Session Starting in 5 Minutes!',
            'Your counselling session is about to begin. Click to join now.',
            '/my-bookings',
            vapidPublicKey
          );
          if (sent) results.notificationsSent++;
        } catch (e) {
          console.error('Error sending user notification:', e);
        }
      }

      // Send to counsellor
      for (const sub of counsellorSubs) {
        try {
          const sent = await sendPushNotification(
            sub.subscription,
            'Session Starting in 5 Minutes!',
            'Your counselling session is about to begin. Please join now.',
            '/counsellor-dashboard',
            vapidPublicKey
          );
          if (sent) results.notificationsSent++;
        } catch (e) {
          console.error('Error sending counsellor notification:', e);
        }
      }

      // Mark reminder as sent
      await supabase
        .from('counselling_sessions')
        .update({ reminder_5_sent: true })
        .eq('id', session.id);
    }

    console.log('Reminder processing complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Counselling reminders error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});