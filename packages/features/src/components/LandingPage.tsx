import React, { useState, useEffect } from 'react';
import { FaqList } from './FaqList';
import { TestimonialsSection } from './TestimonialsSection';
import { Menu, X } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { isNativeApp, isDesktopApp } from '../platform';
import { DEFAULT_APP_DOWNLOAD_LINKS, loadAppDownloadLinks, type AppDownloadLinks } from '../appDownloadLinks';
import { fetchLaunchOfferStatus, type LaunchOfferStatus } from '../ministryBilling';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
  /** Which app is rendering this page — controls where the Ministry Partner and
   *  Individual Partner CTAs route to, since each app owns a different one of
   *  those two flows. Defaults to 'consumer' (apps/rekindle). */
  appContext?: 'consumer' | 'ministry';
}

// Shared marketing landing page — rendered by BOTH the consumer app
// (app.rekindlebc.com) and the standalone Ministry app (rekindlebc.com) for
// logged-out visitors, so both domains present the same marketing site.
const MINISTRY_APP_URL = import.meta.env.VITE_MINISTRY_APP_URL || 'https://rekindlebc.com';
const CONSUMER_APP_URL = import.meta.env.VITE_CONSUMER_APP_URL || 'https://app.rekindlebc.com';
// Store and download links come from Platform Admin → Settings → App download
// links (appDownloadLinks.ts); an empty link hides its button.
// Google Play logo mark for the store buttons.
const PlayIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path fill="#00d7fe" d="M3.6 1.8 13.4 12l-9.8 10.2c-.4-.2-.6-.7-.6-1.2V3c0-.5.2-1 .6-1.2Z" />
    <path fill="#00f076" d="m16.8 8.6-3.4 3.4-9.8-10.2c.2-.1.5-.2.8-.2.3 0 .6.1.9.3l11.5 6.7Z" />
    <path fill="#ff3a44" d="m16.8 15.4-11.5 6.7c-.3.2-.6.3-.9.3-.3 0-.6-.1-.8-.2l9.8-10.2 3.4 3.4Z" />
    <path fill="#ffd500" d="M20.4 12c0 .5-.3 1-.8 1.3l-2.8 2.1-3.4-3.4 3.4-3.4 2.8 2.1c.5.3.8.8.8 1.3Z" />
  </svg>
);

// Apple logo mark for the App Store buttons.
const AppleIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path fill="#fff" d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2-1.1 2.8-2.3.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-.9-2.5-3.8ZM14.1 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.7-1.3Z" />
  </svg>
);

// Windows logo mark for the desktop download buttons.
const WindowsIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path fill="#00a4ef" d="M2 4.3 10 3.2v7.6H2zM11 3l11-1.5v9.3H11zM2 12h8v7.7l-8-1.1zM11 12h11v9.5L11 20z" />
  </svg>
);

const StoreBadge: React.FC<{ href: string; caption: string; label: string; store?: 'play' | 'apple' | 'windows' }> = ({ href, caption, label, store = 'play' }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{
    display: 'inline-flex', alignItems: 'center', gap: 12,
    background: '#000', border: '1px solid rgba(255,255,255,.25)', color: '#fff',
    padding: '9px 20px 9px 16px', borderRadius: 12, textDecoration: 'none', textAlign: 'left',
    transition: 'border-color .2s',
  }}
    onMouseOver={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.6)')}
    onMouseOut={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.25)')}
  >
    {store === 'apple' ? <AppleIcon /> : store === 'windows' ? <WindowsIcon /> : <PlayIcon />}
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
      <span style={{ fontSize: '.66rem', letterSpacing: '.04em', opacity: .75 }}>{caption}</span>
      <span style={{ fontSize: '.98rem', fontWeight: 600 }}>{label}</span>
    </span>
  </a>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSignIn, onSignUp, appContext = 'consumer' }) => {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // The ministry app paints a dark first frame for this page (its
  // public/boot.js); hand the page back its normal background once we leave.
  useEffect(() => () => document.documentElement.classList.remove('rk-dark-boot'), []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  // Ministry Partner billing lives in the Ministry app; Individual Partner
  // billing lives in the consumer app. Whichever app ISN'T currently showing
  // this page sends the visitor to the other app for that specific flow.
  const ministryPartnerHref = appContext === 'ministry' ? '/settings/billing' : `${MINISTRY_APP_URL}/settings/billing`;
  const individualPartnerHref = appContext === 'ministry' ? CONSUMER_APP_URL : null;
  const legalBaseUrl = appContext === 'ministry' ? CONSUMER_APP_URL : '';
  const [links, setLinks] = useState<AppDownloadLinks>(DEFAULT_APP_DOWNLOAD_LINKS);
  useEffect(() => { loadAppDownloadLinks().then(setLinks).catch(() => {}); }, []);
  // Launch offer banner (0417). Not shown inside the store apps, which don't
  // advertise prices paid outside the store.
  const [launchOffer, setLaunchOffer] = useState<LaunchOfferStatus | null>(null);
  useEffect(() => {
    if (isNativeApp()) return;
    fetchLaunchOfferStatus().then(setLaunchOffer).catch(() => {});
  }, []);
  // Store buttons are for web visitors, not people already inside a native or desktop app.
  const showStores = !isNativeApp() && !isDesktopApp();
  const playCaption = t('landing', 'playGetItOn', "GET IT ON GOOGLE PLAY");
  const appleCaption = t('landing', 'appleDownloadOn', "DOWNLOAD ON THE APP STORE");
  const appCards = [
    { name: t('landing', 'playAppName', "ReKindle BC"), desc: t('landing', 'appsConsumerDesc', "For every believer. Daily devotionals, prayer, Scripture memory, GraceCounsel AI, live worship and Live Translation."), play: links.consumerPlayStore, apple: links.consumerAppStore, windows: links.consumerWindows, mac: links.consumerMac },
    { name: t('landing', 'playMinistryName', "ReKindle BC Ministry"), desc: t('landing', 'appsMinistryDesc', "For ministry leaders and members. Go live, run meetings, manage members and small groups, and care for your congregation."), play: links.ministryPlayStore, apple: links.ministryAppStore, windows: links.ministryWindows, mac: links.ministryMac },
    { name: t('landing', 'translatorAppName', "ReKindle Translator"), desc: t('landing', 'appsTranslatorDesc', "Desktop app that live-translates your services and meetings for every listener."), play: '', apple: '', windows: links.translatorWindows, mac: links.translatorMac },
  ].filter(a => a.play || a.apple || a.windows || a.mac);
  const hasStoreLinks = showStores && appCards.length > 0;
  const hasMobileStoreLinks = showStores && appCards.some(a => a.play || a.apple);
  const windowsCaption = t('landing', 'windowsGetIt', "DOWNLOAD FOR");


  // Photos live in each app's public/landing/ (both domains serve this page).
  const photo = (name: string) => `/landing/${name}.webp`;

  const navLinks: [string, string][] = [
    [t('landing', 'navFeatures', "Features"), 'features'],
    [t('landing', 'navChurches', "For churches"), 'ministry-crm'],
    [t('landing', 'navPartner', "Partner"), 'pricing'],
    [t('landing', 'navFaq', "FAQ"), 'faq'],
  ];

  // The main things a believer does in ReKindle, each with a real photo.
  const features = [
    { img: 'devotional', title: t('landing', 'feat1Title', "Daily Devotionals"), desc: t('landing', 'feat1DescShort', "A short reading each day with Scripture, a reflection and a prayer. Perfect if you are just starting out.") },
    { img: 'prayer', title: t('landing', 'featPrayerTitle', "Pray with others"), desc: t('landing', 'featPrayerDesc', "Guided prayers, a community prayer wall and gentle streaks that help prayer become a habit.") },
    { img: 'listen', title: t('landing', 'feat2Title', "Audio Devotionals"), desc: t('landing', 'feat2DescShort', "Listen on your commute or before bed. Download them and keep going with no signal.") },
    { img: 'worship', title: t('landing', 'featLiveTitle', "Live worship & meetings"), desc: t('landing', 'featLiveDesc', "Join services, Bible studies and prayer meetings live, in your own language with live translation.") },
    { img: 'guidance', title: t('landing', 'featGuidanceTitle', "Answers when you need them"), desc: t('landing', 'featGuidanceDesc', "Ask GraceCounsel AI questions about faith any time, or book a session with a Christian counsellor.") },
    { img: 'community', title: t('landing', 'featCommunityTitle', "Grow together"), desc: t('landing', 'featCommunityDesc', "Join your church on ReKindle, share devotionals with friends and get reminders on WhatsApp.") },
  ];

  const startSteps = [
    [t('landing', 'step1Title', "Create a free account"), t('landing', 'step1Desc', "It takes a minute. No card needed.")],
    [t('landing', 'step2Title', "Read today's devotional"), t('landing', 'step2Desc', "Five minutes of Scripture, reflection and prayer.")],
    [t('landing', 'step3Title', "Come back tomorrow"), t('landing', 'step3Desc', "A friendly reminder keeps you going, one day at a time.")],
  ];

  const ministryPoints = [
    t('landing', 'min3', "Live broadcast with recordings & replays"),
    t('landing', 'min9', "Stream live on YouTube & Facebook"),
    t('landing', 'minMeetings', "Video meetings, webinars & small groups"),
    t('landing', 'min1', "WhatsApp broadcast with Meta WABA or Twilio"),
    t('landing', 'min2', "Email & push broadcast messaging"),
    t('landing', 'min7', "Ministry CRM: members, volunteers, donors & events"),
    t('landing', 'minTranslation', "Live translation for every listener"),
    t('landing', 'min5', "Ministry branding & custom dashboard"),
  ];

  const giftAidPoints = [
    t('landing', 'giftAidFeat1Title', "Donor Declaration Management"),
    t('landing', 'giftAidFeat2Title', "Automatic Eligibility & Claim Calculation"),
    t('landing', 'giftAidFeat3Title', "Direct Submission to HMRC"),
    t('landing', 'giftAidFeat4Title', "Reporting & Audit Trail"),
  ];

  const tiers = [
    { name: t('landing', 'tierFreeName', "Free"), price: '$0', unit: t('landing', 'tierFreeUnit', "forever"), desc: t('landing', 'tierFreeDesc', "Everything you need for your daily walk"), popular: false, cta: t('landing', 'tierFreeCta', "Get Started"), features: [t('landing', 'tierFree1', "Daily devotionals with audio"), t('landing', 'tierFree2', "Offline access to devotionals"), t('landing', 'tierFree3', "Community prayer wall"), t('landing', 'tierFree4', "Join live channels"), t('landing', 'tierFree8', "Free Ministry Meetings — 10 hrs/month, up to 15 participants"), t('landing', 'tierFree5', "GraceCounsel AI companion"), t('landing', 'tierFree6', "Prayer streaks & Scripture memory"), t('landing', 'tierFree7', "Book a counsellor")] },
    { name: t('landing', 'tierIndivName', "Individual Partner"), price: t('landing', 'tierIndivPrice', "From $10"), unit: t('landing', 'tierIndivUnit', "/ month"), desc: t('landing', 'tierIndivDesc', "Your own live channel — broadcast, meet, and grow"), popular: true, cta: t('landing', 'tierIndivCta', "Become a Partner"), postAuthTab: appContext === 'consumer' ? 'subscription' : undefined, externalHref: individualPartnerHref, features: [t('landing', 'tierIndiv1', "Create your own live channel"), t('landing', 'tierIndiv2', "Live broadcast to your audience"), t('landing', 'tierIndiv3', "AI note taker for your meetings"), t('landing', 'tierIndiv4', "Unlimited video conferencing & interactive meetings"), t('landing', 'tierIndiv5', "Tier 2 adds meeting recording & replays"), t('landing', 'tierIndiv6', "Priced in NGN for Nigeria, USD elsewhere")] },
    { name: t('landing', 'tierMinName', "Ministry Partner"), price: t('landing', 'tierMinPrice', "Partner"), unit: t('landing', 'tierMinUnit', "your ministry"), desc: t('landing', 'tierMinDesc', "For churches, ministries & networks"), popular: false, cta: t('landing', 'tierMinCta', "Partner Your Ministry"), externalHref: ministryPartnerHref, features: [t('landing', 'tierMin1', "Create & host live channels"), t('landing', 'tierMin2', "Broadcast & WhatsApp outreach"), t('landing', 'tierMin3', "Team & member management"), t('landing', 'tierMin4', "Ministry branding"), t('landing', 'tierMin5', "Devotional & prayer campaigns"), t('landing', 'tierMin6', "Full Ministry CRM suite"), t('landing', 'tierMin7', "UK Gift Aid claims & direct HMRC submission"), t('landing', 'tierMin8b', "Go live from any device and simulcast to YouTube & Facebook"), t('landing', 'tierMin9', "Video Conferencing & Meetings")] },
  ] as { name: string; price: string; unit: string; desc: string; popular: boolean; cta: string; postAuthTab?: string; externalHref?: string | null; features: string[] }[];

  const Logo: React.FC<{ light?: boolean }> = ({ light }) => (
    <a href="/" className="rk-logo" aria-label="ReKindle BC home" style={{ color: light ? '#fff' : '#1c1530' }}>
      <img src="/icon-192.png" alt="" width={36} height={36} />
      <span>Re<span style={{ color: light ? '#c4b5fd' : '#7c3aed' }}>Kindle</span> BC</span>
    </a>
  );

  return (
    <>
      <style>{`
        .rk-lp, .rk-lp button, .rk-lp input { font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; }
        .rk-lp * { box-sizing: border-box; }
        .rk-lp h1, .rk-lp h2, .rk-lp h3, .rk-lp p { margin: 0; }
        .rk-wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
        .rk-sec { padding: 56px 0; }
        .rk-eyebrow { font-size: .78rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #7c3aed; margin-bottom: 8px; }
        .rk-h2 { font-size: clamp(1.6rem, 3vw, 2.1rem); font-weight: 700; letter-spacing: -.02em; line-height: 1.2; color: #1c1530; }
        .rk-lead { color: #5b5370; font-size: 1.02rem; line-height: 1.6; margin-top: 10px; max-width: 560px; }
        .rk-logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; font-family: Georgia, 'Times New Roman', serif; font-size: 1.35rem; font-weight: 700; white-space: nowrap; }
        .rk-logo img { width: 36px; height: 36px; border-radius: 10px; }
        .rk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 999px; font-weight: 600; font-size: .95rem; padding: 12px 24px; cursor: pointer; text-decoration: none; border: none; transition: background .2s, opacity .2s, border-color .2s; }
        .rk-btn-primary { background: #7c3aed; color: #fff; box-shadow: 0 4px 14px rgba(124,58,237,.3); }
        .rk-btn-primary:hover { background: #6d28d9; }
        .rk-btn-light { background: rgba(255,255,255,.14); color: #fff; border: 1.5px solid rgba(255,255,255,.5); }
        .rk-btn-light:hover { background: rgba(255,255,255,.24); }
        .rk-btn-outline { background: transparent; color: #7c3aed; border: 1.5px solid rgba(124,58,237,.35); }
        .rk-btn-outline:hover { background: #f3effe; }
        .rk-navlink { background: none; border: none; color: #4a4360; font-size: .92rem; font-weight: 500; cursor: pointer; text-decoration: none; padding: 6px 2px; }
        .rk-navlink:hover { color: #7c3aed; }
        .rk-desktop-nav { display: flex; }
        .rk-mobile-trigger { display: none; }
        .rk-hero { position: relative; min-height: min(620px, 82vh); display: flex; align-items: center; padding: 96px 0 48px; background: #2a1f4a center/cover no-repeat; }
        .rk-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(28,16,58,.86) 0%, rgba(28,16,58,.62) 45%, rgba(28,16,58,.15) 100%); }
        .rk-hero h1 { font-size: clamp(2.1rem, 5vw, 3.4rem); font-weight: 800; letter-spacing: -.03em; line-height: 1.08; color: #fff; }
        .rk-hero p.rk-sub { color: rgba(255,255,255,.88); font-size: 1.1rem; line-height: 1.6; margin-top: 16px; max-width: 520px; }
        .rk-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; }
        .rk-card { background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #eee8f7; transition: transform .2s, box-shadow .2s; }
        .rk-card:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(60,30,120,.12); }
        .rk-card img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #ede9fe; }
        .rk-card-body { padding: 16px 18px 18px; }
        .rk-card h3 { font-size: 1.08rem; font-weight: 700; color: #1c1530; }
        .rk-card p { color: #5b5370; font-size: .93rem; line-height: 1.55; margin-top: 6px; }
        .rk-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
        .rk-chip { background: #f3effe; color: #5b21b6; font-size: .84rem; font-weight: 500; padding: 6px 12px; border-radius: 999px; }
        .rk-split { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; }
        .rk-split-img { width: 100%; height: 100%; min-height: 300px; max-height: 420px; object-fit: cover; border-radius: 20px; display: block; }
        .rk-steps { list-style: none; padding: 0; margin: 24px 0 0; display: flex; flex-direction: column; gap: 16px; }
        .rk-steps li { display: flex; gap: 14px; align-items: flex-start; }
        .rk-step-num { flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; background: #7c3aed; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: .95rem; }
        .rk-checks { list-style: none; padding: 0; margin: 20px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
        .rk-checks li { display: flex; gap: 10px; align-items: flex-start; font-size: .93rem; color: #3f3856; line-height: 1.45; }
        .rk-checks li::before { content: '✓'; flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: #ede9fe; color: #7c3aed; font-size: .72rem; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
        .rk-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 28px; align-items: start; }
        .rk-tier { background: #fff; border: 1px solid #eee8f7; border-radius: 16px; padding: 22px 20px; position: relative; }
        .rk-tier.rk-popular { background: linear-gradient(150deg, #3b2a74, #21164a); border: none; box-shadow: 0 12px 36px rgba(91,45,158,.3); }
        .rk-apps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 16px; margin-top: 28px; text-align: left; }
        .rk-foot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 32px; margin-bottom: 32px; }
        .rk-foot-link { display: block; font-size: .88rem; color: rgba(255,255,255,.6); text-decoration: none; margin-bottom: 8px; }
        .rk-foot-link:hover { color: #fff; }
        @media (max-width: 900px) {
          .rk-grid3, .rk-tiers { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 767px) {
          .rk-desktop-nav { display: none; }
          .rk-mobile-trigger { display: flex; }
          .rk-sec { padding: 40px 0; }
          .rk-hero { min-height: 0; padding: 92px 0 40px; }
          .rk-hero::before { background: linear-gradient(180deg, rgba(28,16,58,.55) 0%, rgba(28,16,58,.85) 100%); }
          .rk-split { grid-template-columns: 1fr; gap: 24px; }
          .rk-split-img { min-height: 200px; max-height: 240px; }
          .rk-checks { grid-template-columns: 1fr; }
          .rk-tiers { grid-template-columns: 1fr; }
          .rk-tier.rk-popular { order: -1; }
        }
        @media (max-width: 560px) {
          .rk-grid3 { grid-template-columns: 1fr; gap: 14px; }
          .rk-card { display: grid; grid-template-columns: 112px 1fr; }
          .rk-card img { aspect-ratio: auto; height: 100%; min-height: 112px; }
          .rk-card-body { padding: 12px 14px; }
          .rk-card p { font-size: .88rem; }
          .rk-logo { font-size: 1.2rem; }
          .rk-logo img { width: 32px; height: 32px; }
        }
      `}</style>

      <div className="rk-lp" style={{ background: '#fbf8f3', color: '#1c1530', overflowX: 'hidden' }}>

        {/* NAV — always solid so the logo is easy to see */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '12px 0',
          background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(12px)',
          boxShadow: scrolled ? '0 2px 16px rgba(30,16,64,.08)' : '0 1px 0 #eee8f7',
          transition: 'box-shadow .3s',
        }}>
          <div className="rk-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <Logo />
            <div className="rk-desktop-nav" style={{ alignItems: 'center', gap: 22 }}>
              {navLinks.map(([l, id]) => (
                <button key={id} className="rk-navlink" onClick={() => scrollTo(id)}>{l}</button>
              ))}
              {/* rekindlebc.com is the main site; people without a ministry
                  belong in the individual app. A real link, so search
                  engines follow it too. */}
              {appContext === 'ministry' && (
                <a href={CONSUMER_APP_URL} className="rk-navlink">{t('landing', 'navIndividuals', "For individuals")}</a>
              )}
              <button className="rk-navlink" onClick={onSignIn} style={{ fontWeight: 600 }}>{t('landing', 'signIn', "Sign In")}</button>
              <button className="rk-btn rk-btn-primary" onClick={onSignUp} style={{ padding: '9px 20px', fontSize: '.9rem' }}>{t('landing', 'signUp', "Sign Up")}</button>
            </div>
            <div className="rk-mobile-trigger" style={{ alignItems: 'center', gap: 10 }}>
              <button className="rk-btn rk-btn-primary" onClick={onSignUp} style={{ padding: '8px 16px', fontSize: '.88rem' }}>{t('landing', 'signUp', "Sign Up")}</button>
              <button onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"
                style={{ background: 'none', border: 'none', color: '#1c1530', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <Menu style={{ width: 24, height: 24 }} />
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile slide-out menu */}
        {mobileMenuOpen && (
          <>
            <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.35)', zIndex: 199 }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, height: '100vh', width: '80%', maxWidth: 320,
              background: '#fff', zIndex: 200, padding: 20, display: 'flex', flexDirection: 'column', gap: 4,
              boxShadow: '-8px 0 32px rgba(0,0,0,.18)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Logo />
                <button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"
                  style={{ background: 'none', border: 'none', color: '#1c1530', cursor: 'pointer', padding: 4 }}>
                  <X style={{ width: 24, height: 24 }} />
                </button>
              </div>
              {navLinks.map(([l, id]) => (
                <button key={id} onClick={() => { scrollTo(id); setMobileMenuOpen(false); }}
                  style={{ background: 'none', border: 'none', color: '#1c1530', fontSize: '1.05rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', padding: '13px 0', borderBottom: '1px solid #f0ecf7' }}
                >{l}</button>
              ))}
              {appContext === 'ministry' && (
                <a href={CONSUMER_APP_URL}
                  style={{ color: '#1c1530', fontSize: '1.05rem', fontWeight: 500, textDecoration: 'none', padding: '13px 0', borderBottom: '1px solid #f0ecf7' }}
                >{t('landing', 'navIndividuals', "For individuals")}</a>
              )}
              <button onClick={() => { onSignIn(); setMobileMenuOpen(false); }}
                style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '1.05rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: '13px 0' }}
              >{t('landing', 'signIn', "Sign In")}</button>
            </div>
          </>
        )}

        {/* HERO */}
        <header className="rk-hero" style={{ backgroundImage: `url(${photo('hero')})` }}>
          <div className="rk-wrap" style={{ position: 'relative', width: '100%' }}>
            <div style={{ maxWidth: 580 }}>
              <h1>{t('landing', 'heroTitleNew', "Grow closer to God, one day at a time")}</h1>
              <p className="rk-sub">
                {t('landing', 'heroSubtitleNew', "Daily devotionals, guided prayer and a caring community. Whether you are new to faith or have walked with Jesus for years, ReKindle helps you keep going. Free for everyone.")}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26 }}>
                <button className="rk-btn rk-btn-primary" onClick={onSignUp} style={{ padding: '14px 28px', fontSize: '1rem' }}>
                  {t('landing', 'ctaStartFree', "Start for free")}
                </button>
                <button className="rk-btn rk-btn-light" onClick={onSignIn} style={{ padding: '14px 24px', fontSize: '1rem' }}>
                  {t('landing', 'ctaHaveAccount', "I already have an account")}
                </button>
              </div>
              <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.75)', marginTop: 14 }}>
                {t('landing', 'freeForever', "Free forever · No credit card required")}
              </p>
              {/* Mobile store buttons; desktop downloads are in the Get the apps section */}
              {hasMobileStoreLinks && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
                  {appCards.flatMap(a => [
                    a.play && <StoreBadge key={a.play} href={a.play} caption={playCaption} label={a.name} />,
                    a.apple && <StoreBadge key={a.apple} href={a.apple} caption={appleCaption} label={a.name} store="apple" />,
                  ])}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* FEATURES — real photos, short words */}
        <section id="features" className="rk-sec">
          <div className="rk-wrap">
            <p className="rk-eyebrow">{t('landing', 'featuresEyebrowNew', "What you can do")}</p>
            <h2 className="rk-h2">{t('landing', 'featuresTitleNew', "Everything you need for your walk with God")}</h2>
            <div className="rk-grid3">
              {features.map(f => (
                <div key={f.img} className="rk-card">
                  <img src={photo(f.img)} alt="" loading="lazy" />
                  <div className="rk-card-body">
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rk-chips">
              {[t('landing', 'chipOffline', "Offline reading"), t('landing', 'chipPlans', "Bible reading plans"), t('landing', 'chipMemory', "Scripture memory"), t('landing', 'chipJournal', "Prayer journal"), t('landing', 'chipWhatsapp', "WhatsApp reminders"), t('landing', 'chipLanguages', "Many languages"), t('landing', 'chipShare', "Share devotionals")].map(c => (
                <span key={c} className="rk-chip">{c}</span>
              ))}
            </div>
          </div>
        </section>

        {/* NEW TO FAITH — a simple way in */}
        <section className="rk-sec" style={{ background: '#fff' }}>
          <div className="rk-wrap rk-split">
            <img className="rk-split-img" src={photo('new-believer')} alt="" loading="lazy" style={{ objectPosition: 'center 60%' }} />
            <div>
              <p className="rk-eyebrow">{t('landing', 'newEyebrow', "New to faith?")}</p>
              <h2 className="rk-h2">{t('landing', 'newTitle', "Start small. We'll walk with you.")}</h2>
              <p className="rk-lead">{t('landing', 'newDesc', "You don't need to know the Bible to begin. ReKindle gives you one simple step each day, explained in plain words.")}</p>
              <ol className="rk-steps">
                {startSteps.map(([title, desc], i) => (
                  <li key={title}>
                    <span className="rk-step-num">{i + 1}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1c1530' }}>{title}</div>
                      <div style={{ color: '#5b5370', fontSize: '.93rem', marginTop: 2 }}>{desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <button className="rk-btn rk-btn-primary" onClick={onSignUp} style={{ marginTop: 24 }}>
                {t('landing', 'ctaStartFree', "Start for free")}
              </button>
            </div>
          </div>
        </section>

        {/* FOR MINISTRIES — CRM, live, Gift Aid in one compact block */}
        <section id="ministry-crm" className="rk-sec">
          <div className="rk-wrap rk-split">
            <div>
              <p className="rk-eyebrow">{t('landing', 'forMinistries', "For Ministries")}</p>
              <h2 className="rk-h2">{t('landing', 'minTitleNew', "Care for your church, all in one place")}</h2>
              <p className="rk-lead">{t('landing', 'minDescNew', "Go live, run meetings, reach your members on WhatsApp and email, and keep track of members, volunteers and giving.")}</p>
              <ul className="rk-checks">
                {ministryPoints.map(p => <li key={p}>{p}</li>)}
              </ul>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
                <a className="rk-btn rk-btn-primary" href={`${MINISTRY_APP_URL}/for-churches`}>{t('landing', 'minCtaNew', "See how it works for churches")}</a>
                {appContext === 'ministry' ? (
                  <a className="rk-btn rk-btn-outline" href={CONSUMER_APP_URL}>{t('landing', 'indivNotMinistryCtaShort', "Not part of a ministry?")}</a>
                ) : (
                  <button className="rk-btn rk-btn-outline" onClick={() => scrollTo('pricing')}>{t('landing', 'navPartner', "Partner")}</button>
                )}
              </div>
            </div>
            <img className="rk-split-img" src={photo('ministry')} alt="" loading="lazy" />
          </div>

          {/* Gift Aid (UK) — kept as its own anchor for existing links */}
          <div id="gift-aid" className="rk-wrap" style={{ marginTop: 32 }}>
            <div style={{ background: '#fff', border: '1px solid #eee8f7', borderRadius: 16, padding: '22px 22px', display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'center' }}>
              <div style={{ flex: '1 1 300px' }}>
                <p className="rk-eyebrow" style={{ marginBottom: 4 }}>{t('landing', 'giftAidEyebrow', "For UK Ministries & Charities")}</p>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{t('landing', 'giftAidTitleShort', "Gift Aid, from declaration to HMRC")}</h3>
                <p style={{ color: '#5b5370', fontSize: '.93rem', lineHeight: 1.55, marginTop: 6 }}>{t('landing', 'giftAidShort', "Claim 25p from HMRC on every £1 a UK taxpayer gives. ReKindle handles declarations, eligibility and claims for you.")}</p>
              </div>
              <ul className="rk-checks" style={{ flex: '1 1 320px', marginTop: 0 }}>
                {giftAidPoints.map(p => <li key={p}>{p}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="rk-sec" style={{ background: '#fff' }}>
          <div className="rk-wrap">
            <p className="rk-eyebrow">{t('landing', 'pricingEyebrow', "Free for everyone")}</p>
            <h2 className="rk-h2">{t('landing', 'pricingTitle', "Free to use. Powered by partners.")}</h2>
            <p className="rk-lead">{t('landing', 'pricingSubtitle', "ReKindle BC is completely free. If it blesses you, partner with us to help keep the mission growing and reaching more people.")}</p>
            {launchOffer?.isOpen && (
              <a href={ministryPartnerHref} style={{ display: 'inline-block', marginTop: 18, padding: '12px 18px', borderRadius: 14, background: '#fff7e6', border: '1px solid #f5c66b', color: '#1c1530', textDecoration: 'none', fontSize: '.95rem' }}>
                <strong>{t('landing', 'launchOfferTitle', "Founding Ministry offer:")}</strong>{' '}
                {t('landing', 'launchOfferBody', "your first {months} months at a launch price.").replace('{months}', String(launchOffer.introMonths))}{' '}
                {launchOffer.placesLeft > 0 && t('landing', 'launchOfferPlaces', "{n} places left.").replace('{n}', String(launchOffer.placesLeft))}
              </a>
            )}
            <div className="rk-tiers">
              {tiers.map(({ name, price, unit, desc, popular, cta, externalHref, postAuthTab, features: list }) => (
                <div key={name} className={`rk-tier${popular ? ' rk-popular' : ''}`}>
                  {popular && <div style={{ position: 'absolute', top: -11, left: 20, background: '#f59e0b', color: '#451a03', fontSize: '.7rem', fontWeight: 700, padding: '3px 12px', borderRadius: 100, letterSpacing: '.04em', textTransform: 'uppercase' }}>{t('landing', 'mostPopular', "Most Popular")}</div>}
                  <div style={{ fontSize: '.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: popular ? '#c4b5fd' : '#7c3aed' }}>{name}</div>
                  <div style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-.02em', color: popular ? '#fff' : '#1c1530', marginTop: 6 }}>
                    {price}<span style={{ fontSize: '.92rem', fontWeight: 500, color: popular ? 'rgba(255,255,255,.6)' : '#7a7290', marginLeft: 6 }}>{unit}</span>
                  </div>
                  <div style={{ fontSize: '.88rem', color: popular ? 'rgba(255,255,255,.75)' : '#5b5370', margin: '4px 0 14px' }}>{desc}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {list.map(f => (
                      <li key={f} style={{ fontSize: '.86rem', lineHeight: 1.45, color: popular ? 'rgba(255,255,255,.85)' : '#3f3856', display: 'flex', gap: 8 }}>
                        <span style={{ color: popular ? '#c4b5fd' : '#7c3aed', fontWeight: 700 }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`rk-btn ${popular ? 'rk-btn-primary' : 'rk-btn-outline'}`}
                    style={{ width: '100%', padding: '11px 16px', fontSize: '.9rem', ...(popular ? { background: '#fff', color: '#5b21b6', boxShadow: 'none' } : {}) }}
                    onClick={() => {
                      if (externalHref) { window.location.href = externalHref; return; }
                      if (postAuthTab) sessionStorage.setItem('rk_post_auth_tab', postAuthTab);
                      onSignUp();
                    }}
                  >{cta}</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GET THE APPS — store links for both apps (admin-managed) */}
        {hasStoreLinks && (
          <section id="apps" className="rk-sec" style={{ background: 'linear-gradient(150deg,#2a1d5c 0%,#1c1240 100%)' }}>
            <div className="rk-wrap" style={{ textAlign: 'center' }}>
              <p className="rk-eyebrow" style={{ color: '#c4b5fd' }}>{t('landing', 'appsEyebrow', "Get the apps")}</p>
              <h2 className="rk-h2" style={{ color: '#fff' }}>{t('landing', 'appsTitle', "Take ReKindle BC with you")}</h2>
              <div className="rk-apps">
                {appCards.map(({ name, desc, play, apple, windows, mac }) => (
                  <div key={name} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(196,181,253,.2)', borderRadius: 16, padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{name}</h3>
                    <p style={{ color: 'rgba(255,255,255,.72)', fontSize: '.9rem', lineHeight: 1.55, flex: 1 }}>{desc}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {play && <StoreBadge href={play} caption={playCaption} label={t('landing', 'playStoreName', "Google Play")} />}
                      {apple && <StoreBadge href={apple} caption={appleCaption} label={t('landing', 'appStoreName', "App Store")} store="apple" />}
                      {windows && <StoreBadge href={windows} caption={windowsCaption} label={t('landing', 'windowsName', "Windows")} store="windows" />}
                      {mac && <StoreBadge href={mac} caption={windowsCaption} label={t('landing', 'macName', "Mac")} store="apple" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Testimonials — published app_testimonials; renders nothing if none. */}
        <TestimonialsSection />

        {/* FAQ — admin-managed (faq_items); FaqList renders nothing if empty. */}
        <section id="faq" className="rk-sec" style={{ background: '#fff' }}>
          <div className="rk-wrap" style={{ maxWidth: 820 }}>
            <p className="rk-eyebrow">{t('landing', 'faqEyebrow', "Questions")}</p>
            <h2 className="rk-h2" style={{ marginBottom: 20 }}>{t('landing', 'faqTitle', "Frequently asked questions")}</h2>
            <FaqList />
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ background: '#140c2c', padding: '40px 0 24px' }}>
          <div className="rk-wrap">
            <div className="rk-foot-grid">
              <div>
                <Logo light />
                <p style={{ fontSize: '.86rem', color: 'rgba(255,255,255,.55)', lineHeight: 1.6, maxWidth: 240, marginTop: 10 }}>{t('landing', 'footerTagline', "A faith-tech platform for believers, ministries, and counsellors. Deepen your walk. Reach your congregation.")}</p>
              </div>
              {[
                { heading: t('landing', 'footPlatform', "Platform"), links: [[t('landing', 'navFeatures', "Features"), '#features'], [t('landing', 'navPartner', "Partner"), '#pricing'], [t('landing', 'navFaq', "FAQ"), '#faq']] },
                // Public pages on the individual app, linked from both domains so
                // search engines find them.
                { heading: t('landing', 'footResources', "Resources"), links: [[t('landing', 'footDevotionals', "Daily devotionals"), `${CONSUMER_APP_URL}/devotionals`], [t('landing', 'footPrayers', "Prayer points"), `${CONSUMER_APP_URL}/prayers`], [t('landing', 'footGuide', "The Rekindle Guide"), `${CONSUMER_APP_URL}/guide`], [t('landing', 'footFaqPage', "Help & FAQ"), `${CONSUMER_APP_URL}/faq`], [t('landing', 'footForChurches', "For churches"), 'https://rekindlebc.com/for-churches']] },
                ...(hasStoreLinks ? [{ heading: t('landing', 'footApps', "Get the apps"), links: appCards.map(a => [a.name, a.play || a.apple || a.windows || a.mac]) }] : []),
                { heading: t('landing', 'footLegal', "Legal"), links: [[t('landing', 'footTerms', "Terms of Service"), `${legalBaseUrl}/terms`], [t('landing', 'footPrivacy', "Privacy Policy"), `${legalBaseUrl}/privacy`], [t('landing', 'footRefund', "Refund Policy"), 'mailto:legal@rekindlebc.com?subject=Refund Request']] },
                { heading: t('landing', 'footContact', "Contact"), links: [['hello@rekindlebc.com', 'mailto:hello@rekindlebc.com'], ['support@rekindlebc.com', 'mailto:support@rekindlebc.com']] },
              ].map(({ heading, links: items }) => (
                <div key={heading}>
                  <h4 style={{ fontSize: '.76rem', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', margin: '0 0 12px' }}>{heading}</h4>
                  {items.map(([label, href]) => (
                    <a key={label} href={href} className="rk-foot-link">{label}</a>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.4)' }}>{t('landing', 'copyright', "© 2026 ReKindle BC. All rights reserved.")}</p>
              {/* Discreet admin sign-in link in footer */}
              <button onClick={onSignIn} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', fontSize: '.75rem', cursor: 'pointer' }}>{t('landing', 'admin', "Admin")}</button>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
};

export default LandingPage;
