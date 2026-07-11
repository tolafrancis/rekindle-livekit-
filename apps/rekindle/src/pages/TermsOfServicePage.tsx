import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const EFFECTIVE_DATE = 'May 10, 2026';
const COMPANY = 'ReKindle BC';
const EMAIL = 'legal@rekindlebc.com';
const WEBSITE = 'rekindlebc.com';

const TermsOfServicePage: React.FC = () => {
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
        .legal-callout { background: rgba(167,139,250,.06); border: 1px solid rgba(167,139,250,.15); border-radius: 8px; padding: 14px 18px; margin: 1rem 0; }
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
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.4rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>Terms of Service</h1>
          <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.3)' }}>Effective date: {EFFECTIVE_DATE} · {COMPANY}</p>
        </div>

        <div className="legal-body">
          <div className="legal-callout">
            <p style={{ margin: 0 }}>Please read these Terms carefully before using {COMPANY}. By creating an account or accessing any part of the platform, you agree to be bound by these Terms.</p>
          </div>

          <h2>1. Acceptance of Terms</h2>
          <p>These Terms of Service ("Terms") constitute a legally binding agreement between you and <strong>{COMPANY}</strong> governing your use of the platform. These Terms apply to all users — individuals, ministry leaders, counsellors, and administrators.</p>

          <h2>2. Eligibility</h2>
          <ul>
            <li>You must be at least 13 years old to use {COMPANY}.</li>
            <li>If you are between 13 and 18, you must have parental or guardian consent.</li>
            <li>By creating an account you confirm that the information you provide is accurate and complete.</li>
            <li>If you create a ministry account, you represent that you have authority to bind that ministry to these Terms.</li>
          </ul>

          <h2>3. Account Registration</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us immediately at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> if you suspect unauthorised access.</p>

          <h2>4. Subscription Plans and Payments</h2>
          <h3>4.1 Individual Plans</h3>
          <p>Free, Premium ($9.99/month), and Premium Plus ($19.99/month) individual subscription tiers.</p>
          <h3>4.2 Ministry Plans</h3>
          <p>Starter ($49/month), Growth ($149/month), and Enterprise ($299/month). The White-Label add-on ($2,000/year) is available exclusively on Enterprise and requires a separate written agreement.</p>
          <h3>4.3 Billing</h3>
          <ul>
            <li>Subscriptions are billed monthly or annually in advance.</li>
            <li>Payments are processed by Stripe or Paystack. By providing payment details you authorise recurring charges.</li>
            <li>All prices are in USD unless otherwise stated.</li>
            <li>Failed payments result in a 7-day grace period before access is downgraded.</li>
          </ul>
          <h3>4.4 Refund Policy</h3>
          <p>If you are not satisfied within the first 7 days of a new paid subscription, contact us for a full refund. After 7 days, subscriptions are non-refundable for the current billing period.</p>
          <h3>4.5 Changes to Pricing</h3>
          <p>We will provide at least 30 days' notice before increasing subscription prices.</p>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Post content that is abusive, hateful, discriminatory, sexually explicit, or promotes violence</li>
            <li>Harass, threaten, or intimidate other users, counsellors, or ministry leaders</li>
            <li>Impersonate another person, ministry, or organisation</li>
            <li>Spam other users through any channel</li>
            <li>Use automated scripts, bots, or scrapers to access the platform</li>
            <li>Attempt to reverse-engineer, hack, or disrupt the platform</li>
            <li>Use the evangelism inbox to send unsolicited commercial messages unrelated to your ministry's faith activities</li>
            <li>Circumvent subscription feature gates through technical means</li>
          </ul>

          <h2>6. Community and Content Standards</h2>
          <p>Content shared on the platform should reflect genuine faith expression, respect for others, and the diversity of the Christian tradition. We reserve the right to remove content that violates these standards without prior notice.</p>

          <h2>7. Ministry Leaders</h2>
          <p>If you operate a ministry space on {COMPANY}, you additionally agree to:</p>
          <ul>
            <li>Obtain necessary consents from your members before sending broadcasts</li>
            <li>Respect member opt-out requests promptly</li>
            <li>Use the evangelism inbox only for genuine outreach and pastoral care</li>
            <li>Ensure that counsellors listed under your ministry are appropriately qualified and vetted</li>
            <li>Comply with applicable data protection laws (NDPR, GDPR, POPIA) in relation to your members' data</li>
          </ul>

          <h2>8. Counsellors</h2>
          <p>Counsellors must be verified through our verification process. {COMPANY} provides the booking infrastructure but is not a party to the counselling relationship. Counsellors are responsible for their professional conduct and compliance with applicable professional standards.</p>

          <h2>9. AI-Powered Features</h2>
          <p>AI features are provided for assistance only and do not constitute professional pastoral, theological, medical, legal, or counselling advice. Use AI suggestions with discernment.</p>

          <h2>10. Intellectual Property</h2>
          <h3>10.1 Our Content</h3>
          <p>The {COMPANY} platform, its design, code, and branding are owned by or licensed to {COMPANY}. You may not reproduce or redistribute without our written permission.</p>
          <h3>10.2 Your Content</h3>
          <p>You retain ownership of content you create. By posting content you grant {COMPANY} a non-exclusive, royalty-free licence to display and distribute it within the platform for the purpose of delivering the service.</p>

          <h2>11. Third-Party Services</h2>
          <p>The platform integrates with Twilio, Meta, Stripe, Paystack, and Anthropic. Your use of connected channels is subject to those providers' own terms.</p>

          <h2>12. Disclaimers</h2>
          <div className="legal-callout">
            <p style={{ margin: 0 }}>{COMPANY} is provided "as is" and "as available" without warranties of any kind. We do not warrant that the platform will be uninterrupted or error-free.</p>
          </div>

          <h2>13. Limitation of Liability</h2>
          <p>To the maximum extent permitted by applicable law, {COMPANY} shall not be liable for any indirect, incidental, or consequential damages. Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.</p>

          <h2>14. Indemnification</h2>
          <p>You agree to indemnify and hold harmless {COMPANY} from any claims arising from your violation of these Terms, your content, or your use of evangelism channels in breach of applicable laws.</p>

          <h2>15. Termination</h2>
          <p>You may delete your account at any time from your account settings. We may suspend or terminate your account immediately if you violate these Terms.</p>

          <h2>16. Governing Law and Disputes</h2>
          <p>These Terms are governed by the laws of the Federal Republic of Nigeria. Any unresolved disputes shall be referred to mediation in Lagos, Nigeria before any court proceedings.</p>

          <h2>17. Changes to These Terms</h2>
          <p>We will provide at least 14 days' notice of material changes via email or in-app notification.</p>

          <h2>18. Contact</h2>
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

export default TermsOfServicePage;
