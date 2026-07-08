// Supabase Edge Function: onboarding-tips
// Delivers new-user feature tips on a gentle cadence (one tip every 3 days).
// Channels: in-app (notifications table) + push (send-push-notification) +
// best-effort WhatsApp (send-whatsapp, free-form text — only lands inside
// Meta's 24h window, so it's attempted, never required).
//
// Driven by pg_cron once daily (see onboarding-tips-schedule.sql). State lives
// in user_onboarding_tips (see onboarding-tips.sql); new users are seeded by a
// trigger, so this function only processes rows that are already due.
//
// Deploy: supabase functions deploy onboarding-tips

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gentle cadence: ~1 tip every 3 days
const TIP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
// Process at most this many due users per run (keeps under the function timeout)
const BATCH_LIMIT = 500;

interface Tip {
  key: string;
  link: string;
  title: string;   body: string;     // English
  titleVi: string; bodyVi: string;   // Vietnamese
}

// Keep this list in sync with src/lib/onboardingTips.ts
const TIPS: Tip[] = [
  { key: 'whatsapp_optin',  link: '#profile',
    title: '📱 Get reminders on WhatsApp',
    body:  'Turn on WhatsApp in Settings to receive your daily devotional and prayer nudges right where you chat.',
    titleVi: '📱 Nhận nhắc nhở qua WhatsApp',
    bodyVi:  'Bật WhatsApp trong Cài đặt để nhận tĩnh nguyện và lời nhắc cầu nguyện mỗi ngày ngay trong khung chat của bạn.' },
  { key: 'daily_reminder',  link: '#reminders',
    title: '⏰ Set your daily reminder time',
    body:  'Pick a time that works for you and let ReKindle gently nudge you to spend time with God each day.',
    titleVi: '⏰ Đặt giờ nhắc nhở hằng ngày',
    bodyVi:  'Chọn một khung giờ phù hợp và để ReKindle nhẹ nhàng nhắc bạn dành thời gian với Chúa mỗi ngày.' },
  { key: 'devotional_audio', link: '#devotional-library',
    title: '🎧 Listen to your devotional hands-free',
    body:  'Open a devotional and press play — it reads to you slide by slide, perfect for commutes or quiet time.',
    titleVi: '🎧 Nghe tĩnh nguyện rảnh tay',
    bodyVi:  'Mở một bài tĩnh nguyện và nhấn phát — nó sẽ đọc cho bạn từng trang, rất hợp khi di chuyển hoặc tĩnh tâm.' },
  { key: 'push_optin',      link: '#profile',
    title: '🔔 Never miss a nudge',
    body:  'Enable push notifications in Settings so reminders and ministry updates reach you even when the app is closed.',
    titleVi: '🔔 Đừng bỏ lỡ lời nhắc',
    bodyVi:  'Bật thông báo đẩy trong Cài đặt để nhận nhắc nhở và tin tức mục vụ ngay cả khi đã đóng ứng dụng.' },
  { key: 'declarations',    link: '#home',
    title: '✨ Speak life with daily declarations',
    body:  'Personalize your declarations and affirmations — or let AI generate Scripture-based ones to declare each day.',
    titleVi: '✨ Xưng nhận sự sống mỗi ngày',
    bodyVi:  'Cá nhân hoá lời xưng nhận của bạn — hoặc để AI tạo ra những lời dựa trên Kinh Thánh để bạn tuyên xưng mỗi ngày.' },
  { key: 'prayer_wall',     link: '#wall',
    title: '🙏 Share your first prayer request',
    body:  'Post a request on the Community Prayer Wall and stand in prayer with others walking the same journey.',
    titleVi: '🙏 Chia sẻ điều cầu nguyện đầu tiên',
    bodyVi:  'Đăng một điều cầu nguyện lên Bức Tường Cầu Nguyện và cùng hiệp nguyện với những người đồng hành.' },
  { key: 'challenges',      link: '#challenges',
    title: '🔥 Start a prayer challenge',
    body:  'Build a streak with a faith challenge and earn prayer points as you grow in consistency.',
    titleVi: '🔥 Bắt đầu một thử thách cầu nguyện',
    bodyVi:  'Tạo chuỗi ngày liên tục với một thử thách đức tin và nhận điểm cầu nguyện khi bạn bền bỉ hơn.' },
  { key: 'reading_plan',    link: '#reading-plan',
    title: '📖 Begin a Bible reading plan',
    body:  'Stay consistent in the Word, one day at a time, with a plan that fits your pace.',
    titleVi: '📖 Bắt đầu kế hoạch đọc Kinh Thánh',
    bodyVi:  'Bền bỉ trong Lời Chúa mỗi ngày một chút, với kế hoạch phù hợp nhịp độ của bạn.' },
  { key: 'scripture_memory', link: '#scripture',
    title: '💭 Hide the Word in your heart',
    body:  'Memorize verses with Scripture Memory and carry God\u2019s promises with you everywhere.',
    titleVi: '💭 Giấu Lời Chúa trong lòng',
    bodyVi:  'Học thuộc câu gốc với Ghi Nhớ Kinh Thánh và mang theo lời hứa của Chúa mọi nơi.' },
  { key: 'live_channels',   link: '#live-channels',
    title: '📡 Join a live ministry meeting',
    body:  'Catch live broadcasts and interactive ministry meetings in Live Channels — worship and grow together.',
    titleVi: '📡 Tham gia buổi nhóm trực tuyến',
    bodyVi:  'Theo dõi các buổi phát trực tiếp và nhóm mục vụ tương tác trong Live Channels — cùng thờ phượng và lớn lên.' },
  { key: 'counsellors',     link: '#counsellors',
    title: '🤝 Talk to a counsellor',
    body:  'Need prayer or someone to talk to? Find a counsellor and book a confidential session for support.',
    titleVi: '🤝 Trò chuyện với người tư vấn',
    bodyVi:  'Cần cầu nguyện hay một người để chia sẻ? Tìm người tư vấn và đặt một buổi gặp riêng tư để được hỗ trợ.' },
  { key: 'referral',        link: '#referral',
    title: '💌 Invite a friend',
    body:  'Know someone who could be encouraged? Share ReKindle and invite them into the journey.',
    titleVi: '💌 Mời một người bạn',
    bodyVi:  'Bạn biết ai cần được khích lệ không? Chia sẻ ReKindle và mời họ cùng đồng hành.' },
  { key: 'partner',         link: '#sponsor',
    title: '❤️ Partner with the mission',
    body:  'ReKindle is free for everyone. If it has blessed you, consider becoming a partner to help us reach more people.',
    titleVi: '❤️ Đồng hành cùng sứ mệnh',
    bodyVi:  'ReKindle miễn phí cho mọi người. Nếu được phước, hãy cân nhắc trở thành đối tác để giúp chúng tôi tiếp cận nhiều người hơn.' },
];

function localize(tip: Tip, lang?: string) {
  const vi = (lang || 'en').toLowerCase().startsWith('vi');
  return { title: vi ? tip.titleVi : tip.title, body: vi ? tip.bodyVi : tip.body };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const nowIso = new Date().toISOString();

    // 1) Due users
    const { data: due, error: dueErr } = await supabase
      .from('user_onboarding_tips')
      .select('user_id, next_index')
      .eq('enabled', true)
      .eq('completed', false)
      .lte('next_tip_at', nowIso)
      .limit(BATCH_LIMIT);

    if (dueErr) throw dueErr;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2) Their profiles (language + WhatsApp opt-in) in one query
    const userIds = due.map((d: any) => d.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', userIds);
    const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.user_id, p]));

    let inApp = 0, pushed = 0, whatsapped = 0, completed = 0;

    for (const row of due) {
      const idx: number = row.next_index ?? 0;
      if (idx >= TIPS.length) {
        await supabase.from('user_onboarding_tips')
          .update({ completed: true, updated_at: nowIso })
          .eq('user_id', row.user_id);
        completed++;
        continue;
      }

      const profile = profileById.get(row.user_id) ?? {};
      const lang = profile.language ?? profile.preferred_language ?? 'en';
      const tip = TIPS[idx];
      const { title, body } = localize(tip, lang);

      // ── In-app ──────────────────────────────────────────────
      try {
        await supabase.from('notifications').insert({
          user_id: row.user_id,
          type: 'onboarding_tip',
          title,
          message: body,
          link: tip.link,
          sender_name: 'ReKindle Tips',
          is_read: false,
        });
        inApp++;
      } catch (e) {
        console.error('[onboarding-tips] in-app insert failed:', (e as Error).message);
      }

      // ── Push (best effort; targets the single user) ─────────
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationType: 'onboarding_tip', userId: row.user_id, title, body }),
        });
        if (r.ok) pushed++;
      } catch (e) {
        console.error('[onboarding-tips] push failed:', (e as Error).message);
      }

      // ── WhatsApp (best effort; free-form, only lands in 24h window) ──
      const phone = profile.phone ?? profile.phone_number;
      const waAllowed = profile.whatsapp_opted_in === true && !!phone && profile.whatsapp_marketing !== false;
      if (waAllowed) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: phone, message_type: 'text', message: `*${title}*\n\n${body}` }),
          });
          if (r.ok) whatsapped++;
        } catch (e) {
          // Expected when outside Meta's 24h window — never block the tip on this.
          console.warn('[onboarding-tips] whatsapp send skipped/failed:', (e as Error).message);
        }
      }

      // ── Advance state ───────────────────────────────────────
      const nextIndex = idx + 1;
      await supabase.from('user_onboarding_tips').update({
        next_index: nextIndex,
        next_tip_at: new Date(Date.now() + TIP_INTERVAL_MS).toISOString(),
        completed: nextIndex >= TIPS.length,
        updated_at: nowIso,
      }).eq('user_id', row.user_id);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: due.length,
      inApp, pushed, whatsapped, completed,
      timestamp: nowIso,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[onboarding-tips] critical error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
