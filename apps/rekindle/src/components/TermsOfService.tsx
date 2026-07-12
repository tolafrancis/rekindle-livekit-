import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EFFECTIVE_DATE = 'May 10, 2026';
const COMPANY = 'ReKindle BC';
const EMAIL = 'legal@rekindlebc.com';
const WEBSITE = 'rekindlebc.com';

export const TermsOfService: React.FC<Props> = ({ open, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      scrollRef.current?.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        animation: 'tosFadeIn .2s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes tosFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes tosSlideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        .tos-modal { animation: tosSlideUp .25s ease; }
        .tos-body h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.25rem; font-weight: 700; color: #e2d9f3; margin: 2rem 0 .6rem; padding-bottom: .4rem; border-bottom: 1px solid rgba(167,139,250,.15); }
        .tos-body h3 { font-size: .9rem; font-weight: 600; color: #c4b5fd; margin: 1.25rem 0 .4rem; }
        .tos-body p, .tos-body li { font-size: .88rem; color: rgba(255,255,255,.55); line-height: 1.8; margin-bottom: .6rem; }
        .tos-body ul { padding-left: 1.4rem; margin-bottom: .8rem; }
        .tos-body li { margin-bottom: .3rem; }
        .tos-body a { color: #a78bfa; text-decoration: none; }
        .tos-body strong { color: rgba(255,255,255,.75); font-weight: 600; }
        .tos-callout { background: rgba(167,139,250,.06); border: 1px solid rgba(167,139,250,.15); border-radius: 8px; padding: 14px 18px; margin: 1rem 0; }
      `}</style>

      <div
        className="tos-modal"
        style={{
          background: 'linear-gradient(135deg, #0d0a1e 0%, #0a0718 100%)',
          border: '1px solid rgba(167,139,250,.18)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 760,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,.7), inset 0 1px 0 rgba(167,139,250,.1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid rgba(167,139,250,.1)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.8rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Terms of Service
            </div>
            <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.3)' }}>Effective date: {EFFECTIVE_DATE} · {COMPANY}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,.5)', flexShrink: 0, marginLeft: 16 }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} style={{ overflowY: 'auto', padding: '8px 32px 32px', flex: 1, WebkitOverflowScrolling: 'touch' }} className="tos-body">

          <div className="tos-callout">
            <p style={{ margin: 0 }}>Please read these Terms carefully before using {COMPANY}. By creating an account or accessing any part of the platform, you agree to be bound by these Terms. If you do not agree, do not use the platform.</p>
          </div>

          <h2>1. Acceptance of Terms</h2>
          <p>These Terms of Service ("Terms") constitute a legally binding agreement between you and <strong>{COMPANY}</strong> governing your use of the {COMPANY} platform, including all web, mobile, and API interfaces. These Terms apply to all users — individuals, ministry leaders, counsellors, and administrators.</p>

          <h2>2. Eligibility</h2>
          <ul>
            <li>You must be at least 13 years old to use {COMPANY}.</li>
            <li>If you are between 13 and 18, you must have parental or guardian consent.</li>
            <li>By creating an account you confirm that the information you provide is accurate and complete.</li>
            <li>If you create a ministry account, you represent that you have authority to bind that ministry to these Terms.</li>
          </ul>

          <h2>3. Account Registration</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> if you suspect unauthorised access. We reserve the right to terminate accounts that violate these Terms.</p>

          <h2>4. Subscription Plans and Payments</h2>

          <h3>4.1 Individual Plans</h3>
          <p>We offer Free, Premium ($9.99/month), and Premium Plus ($19.99/month) individual subscription tiers. Features available on each tier are described on our pricing page and subject to change with reasonable notice.</p>

          <h3>4.2 Ministry Plans</h3>
          <p>Ministry subscriptions are available at Starter ($49/month), Growth ($149/month), and Enterprise ($299/month) tiers. The White-Label add-on ($2,000/year) is available exclusively on the Enterprise plan and requires a separate written agreement.</p>

          <h3>4.3 Billing</h3>
          <ul>
            <li>Subscriptions are billed monthly or annually in advance.</li>
            <li>Payments are processed by Stripe or Paystack. By providing payment details you authorise recurring charges.</li>
            <li>All prices are in USD unless otherwise stated. You are responsible for any currency conversion fees or local taxes.</li>
            <li>Failed payments will result in a grace period of 7 days before access is downgraded.</li>
          </ul>

          <h3>4.4 Refund Policy</h3>
          <p>If you are not satisfied within the first 7 days of a new paid subscription, contact us for a full refund. After 7 days, subscriptions are non-refundable for the current billing period. Annual subscribers who cancel after 30 days receive a pro-rated refund for unused months at our discretion.</p>

          <h3>4.5 Changes to Pricing</h3>
          <p>We will provide at least 30 days' notice before increasing subscription prices. Your continued use after the notice period constitutes acceptance of the new pricing.</p>

          <h2>5. Acceptable Use</h2>
          <p>You agree to use {COMPANY} only for lawful purposes and in a manner consistent with its faith-focused mission. You must not:</p>
          <ul>
            <li>Post content that is abusive, hateful, discriminatory, sexually explicit, or promotes violence</li>
            <li>Harass, threaten, or intimidate other users, counsellors, or ministry leaders</li>
            <li>Impersonate another person, ministry, or organisation</li>
            <li>Use the platform to spread theological content that is deliberately misleading or cult-like in nature</li>
            <li>Spam other users through any channel (WhatsApp, Messenger, Instagram, email, or in-app)</li>
            <li>Use automated scripts, bots, or scrapers to access the platform</li>
            <li>Attempt to reverse-engineer, hack, or disrupt the platform or its infrastructure</li>
            <li>Use the evangelism inbox channels to send unsolicited commercial messages unrelated to your ministry's faith activities</li>
            <li>Circumvent subscription feature gates through technical means</li>
          </ul>

          <h2>6. Community and Content Standards</h2>
          <p>{COMPANY} is built around authentic Christian faith and community. Content shared on the platform — revelations, testimonies, prayer requests, Q&amp;A, and ministry announcements — should reflect genuine faith expression, respect for others, and the diversity of the Christian tradition.</p>
          <p>We reserve the right to remove content that violates these standards or our Acceptable Use policy without prior notice. Repeated violations may result in account suspension or termination.</p>

          <h2>7. Ministry Leaders</h2>
          <p>If you operate a ministry space on {COMPANY}, you additionally agree to:</p>
          <ul>
            <li>Obtain necessary consents from your members before sending WhatsApp, Messenger, or email broadcasts</li>
            <li>Respect member opt-out requests promptly</li>
            <li>Use the evangelism inbox only for genuine outreach and pastoral care — not bulk commercial marketing</li>
            <li>Not grant inbox access to members for purposes unrelated to ministry activity</li>
            <li>Ensure that counsellors listed under your ministry are appropriately qualified and vetted</li>
            <li>Comply with applicable data protection laws (including NDPR, GDPR, and POPIA) in relation to your members' data</li>
          </ul>

          <h2>8. Counsellors</h2>
          <p>Counsellors listed on the platform must be verified through our verification process. You represent that your qualifications and experience are accurately stated. {COMPANY} provides the booking infrastructure but is not a party to the counselling relationship. Counsellors are responsible for their professional conduct, session confidentiality, and compliance with applicable professional standards.</p>

          <h2>9. AI-Powered Features</h2>
          <p>AI features including gospel response suggestions and AI-generated content are provided for assistance only. They do not constitute professional pastoral, theological, medical, legal, or counselling advice. Use AI suggestions with discernment. We are not responsible for any reliance placed on AI-generated content.</p>

          <h2>10. Intellectual Property</h2>

          <h3>10.1 Our Content</h3>
          <p>The {COMPANY} platform, its design, code, branding, and any content we create (including book summaries, devotional templates, and curated resources) are owned by or licensed to {COMPANY} and protected by copyright and other intellectual property laws. You may not reproduce, redistribute, or create derivative works without our written permission.</p>

          <h3>10.2 Your Content</h3>
          <p>You retain ownership of content you create on the platform (journal entries, revelations, testimonies, etc.). By posting content you grant {COMPANY} a non-exclusive, royalty-free licence to display and distribute that content within the platform for the purpose of delivering the service. We do not claim ownership of your content.</p>

          <h2>11. Third-Party Services</h2>
          <p>The platform integrates with third-party services including Twilio, Meta (Facebook/Instagram), Stripe, Paystack, and Anthropic. Your use of connected channels is subject to those providers' own terms. We are not responsible for the actions or availability of third-party services.</p>

          <h2>12. Disclaimers</h2>
          <div className="tos-callout">
            <p style={{ margin: 0 }}>{COMPANY} is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the platform will be uninterrupted, error-free, or free from viruses. Faith content, counselling, and community posts are provided by users and do not represent the views of {COMPANY}.</p>
          </div>

          <h2>13. Limitation of Liability</h2>
          <p>To the maximum extent permitted by applicable law, {COMPANY} and its affiliates, officers, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform, including loss of data, loss of revenue, or harm arising from community interactions or counselling sessions. Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.</p>

          <h2>14. Indemnification</h2>
          <p>You agree to indemnify and hold harmless {COMPANY} from any claims, losses, or damages (including legal fees) arising from your violation of these Terms, your content, or your use of the evangelism channels in breach of applicable laws or messaging platform policies.</p>

          <h2>15. Termination</h2>
          <p>You may delete your account at any time from your account settings. We may suspend or terminate your account immediately if you violate these Terms, engage in fraudulent activity, or if we are required to do so by law. Upon termination, your right to access the platform ceases and we will handle your data as described in our Privacy Policy.</p>

          <h2>16. Governing Law and Disputes</h2>
          <p>These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict of law principles. Any dispute arising from these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved, disputes shall be referred to mediation in Lagos, Nigeria before any court proceedings are initiated.</p>

          <h2>17. Changes to These Terms</h2>
          <p>We may update these Terms from time to time. We will provide at least 14 days' notice of material changes via email or in-app notification. Continued use of the platform after the effective date of the updated Terms constitutes your acceptance.</p>

          <h2>18. Contact</h2>
          <p>For questions about these Terms, please contact:</p>
          <p>
            <strong>{COMPANY}</strong><br />
            Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a><br />
            Website: <a href={`https://${WEBSITE}`} target="_blank" rel="noopener noreferrer">{WEBSITE}</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
