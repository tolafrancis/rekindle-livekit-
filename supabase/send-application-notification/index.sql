export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface NotificationRequest {
  type: 'approved' | 'rejected';
  applicantEmail: string;
  applicantName: string;
  rejectionReason?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { type, applicantEmail, applicantName, rejectionReason } = await req.json() as NotificationRequest;

    if (!applicantEmail || !applicantName || !type) {
      throw new Error('Missing required fields: applicantEmail, applicantName, type');
    }

    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
    if (!gatewayApiKey) {
      throw new Error("Gateway API key not configured");
    }

    // Generate email content using AI
    const prompt = type === 'approved' 
      ? `Write a warm, encouraging email to ${applicantName} congratulating them on being approved as a counsellor for a Christian prayer and mentorship app. Keep it brief (2-3 paragraphs), professional yet warm, and mention they can now start accepting counselling sessions. Sign it from "The Grace Counsel Team".`
      : `Write a compassionate, professional email to ${applicantName} informing them their counsellor application was not approved at this time. The reason given was: "${rejectionReason || 'Does not meet current requirements'}". Encourage them to continue their spiritual journey and consider reapplying in the future. Keep it brief (2-3 paragraphs) and kind. Sign it from "The Grace Counsel Team".`;

    const aiResponse = await fetch('https://ai.gateway.fastrouter.io/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': gatewayApiKey
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    const aiData = await aiResponse.json();
    const emailBody = aiData.choices?.[0]?.message?.content || 
      (type === 'approved' 
        ? `Dear ${applicantName},\n\nCongratulations! Your application to become a counsellor has been approved. You can now start accepting counselling sessions.\n\nBest regards,\nThe Grace Counsel Team`
        : `Dear ${applicantName},\n\nThank you for your interest in becoming a counsellor. Unfortunately, we are unable to approve your application at this time.\n\nBest regards,\nThe Grace Counsel Team`
      );

    const subject = type === 'approved' 
      ? 'Congratulations! Your Counsellor Application Has Been Approved'
      : 'Update on Your Counsellor Application';

    // Log the notification (in production, this would send an actual email)
    console.log('Notification to be sent:', {
      to: applicantEmail,
      subject,
      body: emailBody
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Notification prepared successfully',
      notification: {
        to: applicantEmail,
        subject,
        preview: emailBody.substring(0, 200) + '...'
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Notification error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});