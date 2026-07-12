/**
 * onboardingTips.ts — ordered feature-discovery tips for new users.
 *
 * Delivered one at a time on a gentle cadence (see useOnboardingTips).
 * `link` is a hash route that AppLayout maps to a tab (e.g. '#reminders').
 * Highest-value opt-ins are first; soft asks (giving, referral) are last.
 *
 * To add/reorder tips, just edit this array — the engine tracks progress
 * by index, so new tips appended to the end reach users who haven't
 * finished the series yet.
 */

export interface OnboardingTip {
  /** Stable identifier (used for logging / future per-tip tracking) */
  key: string;
  title: string;
  body: string;
  /** Hash route to deep-link the CTA, e.g. '#reminders' */
  link: string;
  /** Vietnamese copy (optional; falls back to EN) */
  titleVi?: string;
  bodyVi?: string;
}

export const ONBOARDING_TIPS: OnboardingTip[] = [
  // ── Phase 1: habit + opt-ins (highest value) ──────────────────────────
  {
    key: 'whatsapp_optin',
    title: '📱 Get reminders on WhatsApp',
    body: 'Turn on WhatsApp in Settings to receive your daily devotional and prayer nudges right where you chat.',
    link: '#profile',
    titleVi: '📱 Nhận nhắc nhở qua WhatsApp',
    bodyVi: 'Bật WhatsApp trong Cài đặt để nhận tĩnh nguyện và lời nhắc cầu nguyện mỗi ngày ngay trong khung chat của bạn.',
  },
  {
    key: 'daily_reminder',
    title: '⏰ Set your daily reminder time',
    body: 'Pick a time that works for you and let ReKindle gently nudge you to spend time with God each day.',
    link: '#reminders',
    titleVi: '⏰ Đặt giờ nhắc nhở hằng ngày',
    bodyVi: 'Chọn một khung giờ phù hợp và để ReKindle nhẹ nhàng nhắc bạn dành thời gian với Chúa mỗi ngày.',
  },
  {
    key: 'devotional_audio',
    title: '🎧 Listen to your devotional hands-free',
    body: 'Open a devotional and press play — it reads to you slide by slide, perfect for commutes or quiet time.',
    link: '#devotional-library',
    titleVi: '🎧 Nghe tĩnh nguyện rảnh tay',
    bodyVi: 'Mở một bài tĩnh nguyện và nhấn phát — nó sẽ đọc cho bạn từng trang, rất hợp khi di chuyển hoặc tĩnh tâm.',
  },
  {
    key: 'push_optin',
    title: '🔔 Never miss a nudge',
    body: 'Enable push notifications in Settings so reminders and ministry updates reach you even when the app is closed.',
    link: '#profile',
    titleVi: '🔔 Đừng bỏ lỡ lời nhắc',
    bodyVi: 'Bật thông báo đẩy trong Cài đặt để nhận nhắc nhở và tin tức mục vụ ngay cả khi đã đóng ứng dụng.',
  },

  // ── Phase 2: personalize + engage ─────────────────────────────────────
  {
    key: 'declarations',
    title: '✨ Speak life with daily declarations',
    body: 'Personalize your declarations and affirmations — or let AI generate Scripture-based ones to declare each day.',
    link: '#home',
    titleVi: '✨ Xưng nhận sự sống mỗi ngày',
    bodyVi: 'Cá nhân hoá lời xưng nhận của bạn — hoặc để AI tạo ra những lời dựa trên Kinh Thánh để bạn tuyên xưng mỗi ngày.',
  },
  {
    key: 'prayer_wall',
    title: '🙏 Share your first prayer request',
    body: 'Post a request on the Community Prayer Wall and stand in prayer with others walking the same journey.',
    link: '#wall',
    titleVi: '🙏 Chia sẻ điều cầu nguyện đầu tiên',
    bodyVi: 'Đăng một điều cầu nguyện lên Bức Tường Cầu Nguyện và cùng hiệp nguyện với những người đồng hành.',
  },
  {
    key: 'challenges',
    title: '🔥 Start a prayer challenge',
    body: 'Build a streak with a faith challenge and earn prayer points as you grow in consistency.',
    link: '#challenges',
    titleVi: '🔥 Bắt đầu một thử thách cầu nguyện',
    bodyVi: 'Tạo chuỗi ngày liên tục với một thử thách đức tin và nhận điểm cầu nguyện khi bạn bền bỉ hơn.',
  },

  // ── Phase 3: depth + community ────────────────────────────────────────
  {
    key: 'reading_plan',
    title: '📖 Begin a Bible reading plan',
    body: 'Stay consistent in the Word, one day at a time, with a plan that fits your pace.',
    link: '#reading-plan',
    titleVi: '📖 Bắt đầu kế hoạch đọc Kinh Thánh',
    bodyVi: 'Bền bỉ trong Lời Chúa mỗi ngày một chút, với kế hoạch phù hợp nhịp độ của bạn.',
  },
  {
    key: 'scripture_memory',
    title: '💭 Hide the Word in your heart',
    body: 'Memorize verses with Scripture Memory and carry God\u2019s promises with you everywhere.',
    link: '#scripture',
    titleVi: '💭 Giấu Lời Chúa trong lòng',
    bodyVi: 'Học thuộc câu gốc với Ghi Nhớ Kinh Thánh và mang theo lời hứa của Chúa mọi nơi.',
  },
  {
    key: 'live_channels',
    title: '📡 Join a live ministry meeting',
    body: 'Catch live broadcasts and interactive ministry meetings in Live Channels — worship and grow together.',
    link: '#live-channels',
    titleVi: '📡 Tham gia buổi nhóm trực tuyến',
    bodyVi: 'Theo dõi các buổi phát trực tiếp và nhóm mục vụ tương tác trong Live Channels — cùng thờ phượng và lớn lên.',
  },
  {
    key: 'counsellors',
    title: '🤝 Talk to a counsellor',
    body: 'Need prayer or someone to talk to? Find a counsellor and book a confidential session for support.',
    link: '#counsellors',
    titleVi: '🤝 Trò chuyện với người tư vấn',
    bodyVi: 'Cần cầu nguyện hay một người để chia sẻ? Tìm người tư vấn và đặt một buổi gặp riêng tư để được hỗ trợ.',
  },

  // ── Phase 4: soft asks (last) ─────────────────────────────────────────
  {
    key: 'referral',
    title: '💌 Invite a friend',
    body: 'Know someone who could be encouraged? Share ReKindle and invite them into the journey.',
    link: '#referral',
    titleVi: '💌 Mời một người bạn',
    bodyVi: 'Bạn biết ai cần được khích lệ không? Chia sẻ ReKindle và mời họ cùng đồng hành.',
  },
  {
    key: 'partner',
    title: '❤️ Partner with the mission',
    body: 'ReKindle is free for everyone. If it has blessed you, consider becoming a partner to help us reach more people.',
    link: '#sponsor',
    titleVi: '❤️ Đồng hành cùng sứ mệnh',
    bodyVi: 'ReKindle miễn phí cho mọi người. Nếu được phước, hãy cân nhắc trở thành đối tác để giúp chúng tôi tiếp cận nhiều người hơn.',
  },
];

export function localizeTip(
  tip: OnboardingTip,
  language?: string,
): { title: string; body: string } {
  const isVi = (language || 'en').toLowerCase().startsWith('vi');
  return {
    title: isVi && tip.titleVi ? tip.titleVi : tip.title,
    body: isVi && tip.bodyVi ? tip.bodyVi : tip.body,
  };
}
