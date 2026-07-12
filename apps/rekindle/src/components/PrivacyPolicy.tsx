import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EFFECTIVE_DATE = 'May 10, 2026';
const COMPANY = 'ReKindle BC';
const EMAIL = 'privacy@rekindlebc.com';
const WEBSITE = 'rekindlebc.com';

export const PrivacyPolicy: React.FC<Props> = ({ open, onClose }) => {
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
        animation: 'ppFadeIn .2s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes ppFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes ppSlideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        .pp-modal { animation: ppSlideUp .25s ease; }
        .pp-body h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.25rem; font-weight: 700; color: #e2d9f3; margin: 2rem 0 .6rem; padding-bottom: .4rem; border-bottom: 1px solid rgba(167,139,250,.15); }
        .pp-body h3 { font-size: .9rem; font-weight: 600; color: #c4b5fd; margin: 1.25rem 0 .4rem; }
        .pp-body p, .pp-body li { font-size: .88rem; color: rgba(255,255,255,.55); line-height: 1.8; margin-bottom: .6rem; }
        .pp-body ul { padding-left: 1.4rem; margin-bottom: .8rem; }
        .pp-body li { margin-bottom: .3rem; }
        .pp-body a { color: #a78bfa; text-decoration: none; }
        .pp-body strong { color: rgba(255,255,255,.75); font-weight: 600; }
      `}</style>

      <div
        className="pp-modal"
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
              Privacy Policy
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
        <div ref={scrollRef} style={{ overflowY: 'auto', padding: '8px 32px 32px', flex: 1, WebkitOverflowScrolling: 'touch' }} className="pp-body">

          <p>This Privacy Policy describes how <strong>{COMPANY}</strong> ("we", "us", or "our") collects, uses, and protects your information when you use our platform at <strong>{WEBSITE}</strong> and related applications. By using {COMPANY} you agree to the practices described here.</p>

          <h2>1. Information We Collect</h2>

          <h3>1.1 Information You Provide</h3>
          <ul>
            <li><strong>Account information</strong> — name, email address, password, profile photo, and role (individual, ministry leader, counsellor)</li>
            <li><strong>Ministry information</strong> — ministry name, description, location, member lists, and branding assets uploaded by leaders</li>
            <li><strong>Faith content</strong> — devotional notes, prayer journal entries, scripture memory cards, testimonies, revelations, and community Q&amp;A posts you choose to share</li>
            <li><strong>Counselling data</strong> — session booking details, session notes (where applicable), and feedback provided through the platform</li>
            <li><strong>Payment information</strong> — billing details processed securely by Stripe or Paystack; we do not store raw card data</li>
            <li><strong>Communications</strong> — messages sent via the evangelism inbox channels (WhatsApp, Messenger, Instagram, website chat) and in-app messages</li>
          </ul>

          <h3>1.2 Information Collected Automatically</h3>
          <ul>
            <li>Device type, operating system, browser, and IP address</li>
            <li>Pages viewed, features used, and interaction timestamps</li>
            <li>Push notification token (if you grant permission)</li>
            <li>Streak and progress data for devotionals, reading plans, and prayer sessions</li>
          </ul>

          <h3>1.3 Information from Third Parties</h3>
          <ul>
            <li><strong>Meta platforms</strong> — if you connect Facebook Messenger or Instagram DMs to your ministry inbox, we receive message content, sender IDs, and profile names via the Meta Graph API</li>
            <li><strong>Twilio</strong> — WhatsApp message content and sender phone numbers routed through Twilio's platform</li>
            <li><strong>Authentication providers</strong> — if you sign in via a social provider, we receive your name and email from that provider</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To create and manage your account and subscription</li>
            <li>To deliver the core platform features: devotionals, prayer library, live channels, counselling, community, and evangelism inbox</li>
            <li>To send notifications you have opted into (push, email, in-app) including ministry announcements, prayer reminders, and community activity</li>
            <li>To process payments and manage subscription billing</li>
            <li>To provide ministry analytics to authorised leaders</li>
            <li>To improve the platform through aggregated, anonymised usage analysis</li>
            <li>To comply with legal obligations and enforce our Terms of Service</li>
            <li>To respond to support requests</li>
          </ul>

          <h2>3. AI-Powered Features</h2>
          <p>Some features use third-party AI services (including Anthropic Claude) to generate gospel response suggestions in the evangelism inbox, AI-assisted devotional content, and book summaries. Content you provide as input to these features may be processed by the underlying AI provider subject to their privacy terms. We do not use your personal faith content to train AI models.</p>

          <h2>4. Sharing Your Information</h2>
          <p>We do not sell your personal information. We share information only in these circumstances:</p>
          <ul>
            <li><strong>With your ministry</strong> — if you are a ministry member, your profile name and activity visible within that ministry is accessible to ministry leaders</li>
            <li><strong>With service providers</strong> — Supabase (database and auth), Stripe and Paystack (payments), Twilio (WhatsApp messaging), Meta (Messenger and Instagram), Anthropic (AI features), and cloud hosting providers — each bound by data processing agreements</li>
            <li><strong>With counsellors</strong> — booking details and session context shared with your chosen counsellor</li>
            <li><strong>Legal requirements</strong> — if required by law, court order, or to protect the rights and safety of our users</li>
            <li><strong>Business transfers</strong> — in the event of a merger or acquisition, with appropriate notice to users</li>
          </ul>

          <h2>5. Community Content</h2>
          <p>Revelations, testimonies, and Q&amp;A posts you mark as public are visible to other members of the community or your ministry. Prayer journal entries and personal notes are private and visible only to you. Think carefully before sharing personal or sensitive information in community features.</p>

          <h2>6. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. If you delete your account, we remove your personal data within 30 days, except where retention is required by law or for legitimate business purposes (e.g. payment records required for tax compliance). Anonymised aggregate data may be retained indefinitely.</p>

          <h2>7. Your Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul>
            <li><strong>Access</strong> — request a copy of the data we hold about you</li>
            <li><strong>Correction</strong> — update inaccurate or incomplete information (most data can be updated directly in your profile settings)</li>
            <li><strong>Deletion</strong> — request deletion of your account and personal data</li>
            <li><strong>Portability</strong> — request an export of your data in a machine-readable format</li>
            <li><strong>Objection</strong> — object to processing based on legitimate interests</li>
            <li><strong>Withdraw consent</strong> — turn off notification preferences at any time in your notification settings</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We will respond within 30 days.</p>

          <h2>8. Security</h2>
          <p>We use industry-standard security measures including AES-GCM encryption for sensitive credentials, TLS in transit, row-level security on our database, and regular security reviews. No method of transmission over the internet is 100% secure; we cannot guarantee absolute security but we take it seriously and will notify you promptly of any breach affecting your data.</p>

          <h2>9. Children's Privacy</h2>
          <p>{COMPANY} is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it promptly.</p>

          <h2>10. International Data Transfers</h2>
          <p>Our servers and service providers may be located outside your country. By using {COMPANY} you consent to the transfer of your information to countries that may have different data protection laws than your own. Where required, we implement appropriate safeguards such as standard contractual clauses.</p>

          <h2>11. Compliance with NDPR, GDPR, and POPIA</h2>
          <p>We are committed to compliance with the Nigeria Data Protection Regulation (NDPR), the EU General Data Protection Regulation (GDPR), and the South Africa Protection of Personal Information Act (POPIA) where applicable. Our lawful basis for processing is primarily contractual necessity and, for optional features, your consent.</p>

          <h2>12. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or an in-app notification at least 14 days before they take effect. Continued use after the effective date constitutes acceptance of the updated policy.</p>

          <h2>13. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy or how we handle your data, please contact us at:</p>
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

export default PrivacyPolicy;
