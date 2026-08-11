import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const EFFECTIVE_DATE = 'May 10, 2026';
const COMPANY = 'ReKindle BC';
const EMAIL = 'privacy@rekindlebc.com';
const WEBSITE = 'rekindlebc.com';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0d0a1e 0%, #0a0718 100%)', color: '#fff' }}>
      <style>{`
        .legal-body h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.3rem; font-weight: 700; color: #e2d9f3; margin: 2rem 0 .6rem; padding-bottom: .4rem; border-bottom: 1px solid rgba(167,139,250,.15); }
        .legal-body h3 { font-size: .95rem; font-weight: 600; color: #c4b5fd; margin: 1.25rem 0 .4rem; }
        .legal-body p, .legal-body li { font-size: .9rem; color: rgba(255,255,255,.6); line-height: 1.85; margin-bottom: .6rem; }
        .legal-body ul { padding-left: 1.4rem; margin-bottom: .8rem; }
        .legal-body li { margin-bottom: .3rem; }
        .legal-body a { color: #a78bfa; text-decoration: none; }
        .legal-body a:hover { text-decoration: underline; }
        .legal-body strong { color: rgba(255,255,255,.8); font-weight: 600; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(167,139,250,.1)', position: 'sticky', top: 0, background: 'rgba(10,7,24,.95)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/landing" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: '.85rem' }}
            onMouseOver={e => (e.currentTarget.style.color = '#fff')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.5)')}
          >
            <ArrowLeft size={15} /> Back
          </Link>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.1)' }} />
          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{COMPANY}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.4rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>Privacy Policy</h1>
          <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.3)' }}>Effective date: {EFFECTIVE_DATE} · {COMPANY}</p>
        </div>

        <div className="legal-body">
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
            <li>To send notifications you have opted into (push, email, in-app)</li>
            <li>To process payments and manage subscription billing</li>
            <li>To provide ministry analytics to authorised leaders</li>
            <li>To improve the platform through aggregated, anonymised usage analysis</li>
            <li>To comply with legal obligations and enforce our Terms of Service</li>
            <li>To respond to support requests</li>
          </ul>

          <h2>3. AI-Powered Features</h2>
          <p>Some features use third-party AI services (including Anthropic Claude) to generate gospel response suggestions, AI-assisted devotional content, and book summaries. Content you provide as input to these features may be processed by the underlying AI provider subject to their privacy terms. We do not use your personal faith content to train AI models.</p>

          <h2>4. Sharing Your Information</h2>
          <p>We do not sell your personal information. We share information only in these circumstances:</p>
          <ul>
            <li><strong>With your ministry</strong> — if you are a ministry member, your profile name and activity visible within that ministry is accessible to ministry leaders</li>
            <li><strong>With service providers</strong> — Supabase, Stripe, Paystack, Twilio, Meta, Anthropic, and cloud hosting providers — each bound by data processing agreements</li>
            <li><strong>With counsellors</strong> — booking details and session context shared with your chosen counsellor</li>
            <li><strong>Legal requirements</strong> — if required by law, court order, or to protect the rights and safety of our users</li>
            <li><strong>Business transfers</strong> — in the event of a merger or acquisition, with appropriate notice</li>
          </ul>

          <h2>5. Community Content</h2>
          <p>Revelations, testimonies, and Q&amp;A posts you mark as public are visible to other members of the community or your ministry. Prayer journal entries and personal notes are private and visible only to you.</p>

          <h2>6. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. If you delete your account, we remove your personal data within 30 days, except where retention is required by law. Anonymised aggregate data may be retained indefinitely.</p>

          <h2>7. Your Rights</h2>
          <ul>
            <li><strong>Access</strong> — request a copy of the data we hold about you</li>
            <li><strong>Correction</strong> — update inaccurate or incomplete information</li>
            <li><strong>Deletion</strong> — request deletion of your account and personal data</li>
            <li><strong>Portability</strong> — request an export of your data in a machine-readable format</li>
            <li><strong>Withdraw consent</strong> — turn off notification preferences at any time in your notification settings</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

          <h2>8. Security</h2>
          <p>We use industry-standard security measures including AES-GCM encryption for sensitive credentials, TLS in transit, row-level security on our database, and regular security reviews.</p>

          <h2>9. Children's Privacy</h2>
          <p>{COMPANY} is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>

          <h2>10. International Data Transfers</h2>
          <p>Our servers and service providers may be located outside your country. By using {COMPANY} you consent to the transfer of your information internationally.</p>

          <h2>11. Compliance with NDPR, GDPR, and POPIA</h2>
          <p>We are committed to compliance with the Nigeria Data Protection Regulation (NDPR), the EU General Data Protection Regulation (GDPR), and the South Africa Protection of Personal Information Act (POPIA) where applicable.</p>

          <h2>12. Changes to This Policy</h2>
          <p>We will notify you of material changes via email or in-app notification at least 14 days before they take effect.</p>

          <h2>13. Contact Us</h2>
          <p>
            <strong>{COMPANY}</strong><br />
            Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a><br />
            Website: <a href={`https://${WEBSITE}`} target="_blank" rel="noopener noreferrer">{WEBSITE}</a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(167,139,250,.08)', padding: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.2)' }}>© 2026 {COMPANY}. All rights reserved.</p>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
