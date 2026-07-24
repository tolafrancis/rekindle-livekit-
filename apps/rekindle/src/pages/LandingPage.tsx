import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { PAYPAL_LINKS } from '@/lib/givingLinks';
import { useLanguage } from '@/contexts/LanguageContext';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

// The Ministry app is a separate deployment (see project docs) — Ministry
// Partner checkout lives there, gated behind its own login, not in this app.
const MINISTRY_APP_URL = import.meta.env.VITE_MINISTRY_APP_URL || 'https://rekindlebc.com';

const LandingPage: React.FC<LandingPageProps> = ({ onSignIn, onSignUp }) => {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('rk-visible'); }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.rk-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        .rk-reveal { opacity:0; transform:translateY(28px); transition:opacity .65s ease,transform .65s ease; }
        .rk-reveal.rk-visible { opacity:1; transform:translateY(0); }
        @keyframes rk-up { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .rk-a  { animation: rk-up .7s ease both; }
        .rk-d1 { animation-delay:.1s; }
        .rk-d2 { animation-delay:.2s; }
        .rk-d3 { animation-delay:.3s; }
        .rk-d4 { animation-delay:.45s; }
        .rk-input:focus { border-color:rgba(167,139,250,.5) !important; background:rgba(255,255,255,.1) !important; }
        .rk-card:hover { transform:translateY(-4px); box-shadow:0 8px 40px rgba(91,45,158,.18) !important; }
        .rk-btn-ghost:hover { border-color:rgba(255,255,255,.45) !important; color:#fff !important; }
        .rk-desktop-nav { display: flex; }
        .rk-mobile-trigger { display: none; }
        @media (max-width: 767px) {
          .rk-desktop-nav { display: none; }
          .rk-mobile-trigger { display: flex; }
        }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#fdf9f3', color: '#4a3f6b', overflowX: 'hidden' }}>

        {/* NAV */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '18px 0',
          background: scrolled ? 'rgba(15,10,30,.93)' : 'transparent',
          backdropFilter: scrolled ? 'blur(14px)' : 'none',
          boxShadow: scrolled ? '0 1px 0 rgba(167,139,250,.12)' : 'none',
          transition: 'all .3s',
        }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.6rem', fontWeight: 700, color: '#fff', letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>
              Re<span style={{ color: '#a78bfa' }}>Kindle</span> BC
            </span>
            <div className="rk-desktop-nav" style={{ alignItems: 'center', justifyContent: 'flex-end', gap: '12px 18px' }}>
              {[[t('landing', 'navFeatures', "Features"),'features'],[t('landing', 'navMinistryCrm', "Ministry CRM"),'ministry-crm'],[t('landing', 'navGiftAid', "Gift Aid"),'gift-aid'],[t('landing', 'navPartner', "Partner"),'pricing']].map(([l, id]) => (
                <button key={l} onClick={() => scrollTo(id)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.65)', fontSize: '.9rem', fontWeight: 500, cursor: 'pointer' }}
                  onMouseOver={e => (e.currentTarget.style.color = '#fff')}
                  onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.65)')}
                >{l}</button>
              ))}
              {/* Prominent Sign In — visible from every part of the page */}
              <button onClick={onSignIn}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.85)', fontSize: '.9rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                onMouseOver={e => (e.currentTarget.style.color = '#fff')}
                onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.85)')}
              >{t('landing', 'signIn', "Sign In")}</button>
              {/* Prominent Sign Up call to action */}
              <button onClick={onSignUp}
                style={{ background: 'linear-gradient(135deg,#7c3aed,#9333ea)', border: 'none', color: '#fff', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: '9px 20px', borderRadius: 100, boxShadow: '0 4px 16px rgba(124,58,237,.4)' }}
                onMouseOver={e => (e.currentTarget.style.opacity = '.9')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              >{t('landing', 'signUp', "Sign Up")}</button>
            </div>
            <div className="rk-mobile-trigger" style={{ alignItems: 'center', gap: '12px' }}>
              <button onClick={onSignUp}
                style={{ background: 'linear-gradient(135deg,#7c3aed,#9333ea)', border: 'none', color: '#fff', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: '9px 20px', borderRadius: 100, boxShadow: '0 4px 16px rgba(124,58,237,.4)' }}
                onMouseOver={e => (e.currentTarget.style.opacity = '.9')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              >{t('landing', 'signUp', "Sign Up")}</button>
              <button onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}
              >
                <Menu style={{ width: 24, height: 24 }} />
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile Slide-Out Panel */}
        {mobileMenuOpen && (
          <div style={{
            position: 'fixed', top: 0, right: 0, height: '100vh', width: '80%', maxWidth: 320,
            background: 'rgba(15,10,30,.98)', backdropFilter: 'blur(16px)', zIndex: 200,
            padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '-8px 0 32px rgba(0,0,0,.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}
              >
                <X style={{ width: 24, height: 24 }} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {[[t('landing', 'navFeatures', "Features"),'features'],[t('landing', 'navPartner', "Partner"),'pricing']].map(([l, id]) => (
                <button key={l} onClick={() => { scrollTo(id); setMobileMenuOpen(false); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.85)', fontSize: '1.1rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}
                >{l}</button>
              ))}
              <button onClick={() => { onSignIn(); setMobileMenuOpen(false); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.85)', fontSize: '1.1rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}
              >{t('landing', 'signIn', "Sign In")}</button>
            </div>
          </div>
        )}

        {/* HERO — waitlist form above the fold */}
        <section style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%,rgba(124,58,237,.35) 0%,transparent 70%),radial-gradient(ellipse 40% 40% at 80% 80%,rgba(200,151,58,.12) 0%,transparent 60%),linear-gradient(160deg,#0f0a1e 0%,#1e1040 40%,#2d1f5e 70%,#1a0d3d 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          textAlign: 'center', padding: '130px 24px 80px',
        }}>
          <div className="rk-a" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(167,139,250,.15)', border: '1px solid rgba(167,139,250,.3)', color: '#a78bfa', padding: '6px 16px', borderRadius: 100, fontSize: '.82rem', fontWeight: 500, marginBottom: 28 }}>
            {t('landing', 'heroBadge', "✦ Now Live — Free for Every Believer")}
          </div>
          <h1 className="rk-a rk-d1" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2.8rem,6.5vw,5rem)', fontWeight: 700, color: '#fff', lineHeight: 1.1, maxWidth: 760, marginBottom: 18 }}>
            {t('landing', 'heroTitleLine', "Your Faith Journey,")}{' '}
            <em style={{ color: '#a78bfa' }}>{t('landing', 'heroDeeply', "Deeply")}</em>{' '}
            <span style={{ color: '#fde68a' }}>{t('landing', 'heroRekindled', "Rekindled")}</span>
          </h1>
          <p className="rk-a rk-d2" style={{ maxWidth: 500, color: 'rgba(255,255,255,.6)', fontSize: '1.05rem', fontWeight: 300, marginBottom: 40 }}>
            {t('landing', 'heroSubtitle', "A faith-tech platform where believers grow, ministries thrive, and counsellors connect. Create your free account and start today.")}
          </p>

          {/* Production CTAs — create a free account or sign in */}
          <div className="rk-a rk-d3" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={onSignUp} style={{
              background: 'linear-gradient(135deg,#7c3aed,#9333ea)', color: '#fff',
              padding: '15px 34px', borderRadius: 100, fontSize: '1.02rem', fontWeight: 600,
              border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              boxShadow: '0 4px 24px rgba(124,58,237,.45)', transition: 'opacity .2s',
            }}
              onMouseOver={e => (e.currentTarget.style.opacity = '.9')}
              onMouseOut={e => (e.currentTarget.style.opacity = '1')}
            >{t('landing', 'ctaGetStarted', "Get Started Free →")}</button>
            <button onClick={onSignIn} className="rk-btn-ghost" style={{
              background: 'transparent', color: 'rgba(255,255,255,.8)',
              padding: '15px 30px', borderRadius: 100, fontSize: '1.02rem', fontWeight: 500,
              border: '1.5px solid rgba(255,255,255,.25)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              transition: 'all .2s',
            }}>{t('landing', 'ctaHaveAccount', "I already have an account")}</button>
          </div>
          <p className="rk-a rk-d3" style={{ fontSize: '.82rem', color: 'rgba(255,255,255,.35)', marginTop: 18 }}>
            {t('landing', 'freeForever', "Free forever · No credit card required")}
          </p>

          {/* Stats */}
          <div className="rk-a rk-d4" style={{ display: 'flex', gap: 44, justifyContent: 'center', marginTop: 52, flexWrap: 'wrap' }}>
            {[['6+',t('landing', 'statChannels', "Content Channels")],['AI',t('landing', 'statCompanion', "Spiritual Companion")],['5',t('landing', 'statPlans', "Plans from $0")],['∞',t('landing', 'statDevotionals', "Daily Devotionals")]].map(([n,l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.2rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: '.76rem', color: 'rgba(255,255,255,.38)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PROBLEM */}
        <section style={{ background: '#fff', padding: '80px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 2 }}>
              {[
                ['01',t('landing', 'prob1Title', "Faith without structure fades"),t('landing', 'prob1Desc', "Most believers want to grow spiritually but have no system. Intentions don't become habits without tools built for the journey.")],
                ['02',t('landing', 'prob2Title', "Ministries lack digital infrastructure"),t('landing', 'prob2Desc', "Churches struggle to communicate, broadcast, and disciple at scale with fragmented tools not built for faith communities.")],
                ['03',t('landing', 'prob3Title', "Spiritual care is hard to access"),t('landing', 'prob3Desc', "Counselling, prayer accountability, and community are scattered across apps and WhatsApp groups. ReKindle unifies them.")],
              ].map(([num, title, desc], i) => (
                <div key={num} className="rk-reveal" style={{ padding: '48px 36px', borderRight: i < 2 ? '1px solid #f0edf7' : 'none' }}>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '4rem', fontWeight: 700, color: '#ede9fe', lineHeight: 1, marginBottom: 16 }}>{num}</div>
                  <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.35rem', color: '#0f0a1e', marginBottom: 10 }}>{title}</h3>
                  <p style={{ color: '#7c6fa0', fontSize: '.95rem', lineHeight: 1.7 }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" style={{ background: '#fdf9f3', padding: '100px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <p className="rk-reveal" style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>{t('landing', 'featuresEyebrow', "Everything you need")}</p>
            <h2 className="rk-reveal" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0f0a1e', maxWidth: 600 }}>{t('landing', 'featuresTitle', "Built for every part of your faith life")}</h2>
            <p className="rk-reveal" style={{ color: '#7c6fa0', fontSize: '1.05rem', maxWidth: 520, marginTop: 14 }}>{t('landing', 'featuresSubtitle', "From personal devotion to ministry-scale broadcasting — ReKindle covers the full journey.")}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 24, marginTop: 56 }}>
              {[
                { icon: '📖', title: t('landing', 'feat1Title', "Daily Devotionals"),          desc: t('landing', 'feat1Desc', "Rich, curated devotional series with Scripture, reflections, action steps, and guided prayer — a fresh word for every day of your walk.") },
                { icon: '🎧', title: t('landing', 'feat2Title', "Audio Devotionals"),          desc: t('landing', 'feat2Desc', "Listen instead of read. Every devotional is auto-narrated with gentle background music, so you can grow on the commute, at the gym, or before bed.") },
                { icon: '⬇️', title: t('landing', 'feat3Title', "Offline Access"),             desc: t('landing', 'feat3Desc', "Download devotionals and read or listen anywhere — no signal needed. Your progress syncs automatically the moment you reconnect.") },
                { icon: '🤖', title: t('landing', 'feat4Title', "GraceCounsel AI"),            desc: t('landing', 'feat4Desc', "An AI spiritual companion powered by OpenAI — faith-grounded guidance, scriptural insight, and prayerful reflection at any hour.") },
                { icon: '🔴', title: t('landing', 'feat5Title', "Live Channels & Meetings"),   desc: t('landing', 'feat5Desc', "Host live prayer sessions, Bible studies, and interactive meetings. Schedule recurring sessions and record replays.") },
                { icon: '🙏', title: t('landing', 'feat6Title', "Prayer Communities"),         desc: t('landing', 'feat6Desc', "Join prayer challenges, maintain streaks, share on the community prayer wall, and hold each other accountable in faith.") },
                { icon: '📢', title: t('landing', 'feat7Title', "Ministry Broadcast Tools"),   desc: t('landing', 'feat7Desc', "Send WhatsApp, email, and push broadcasts to your congregation. Approved templates, subscriber management, and analytics.") },
                { icon: '💬', title: t('landing', 'feat8Title', "Counsellor Access"),          desc: t('landing', 'feat8Desc', "Book one-on-one sessions with verified Christian counsellors. Video sessions with reminders, notes, and follow-up care.") },
                { icon: '🟢', title: t('landing', 'feat9Title', "WhatsApp Reminders & Alerts"),desc: t('landing', 'feat9Desc', "Receive daily devotionals, prayer reminders, streak nudges, and announcements directly on WhatsApp. Choose exactly what you want and opt out anytime.") },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="rk-reveal rk-card"
                  style={{ background: '#fff', borderRadius: 16, padding: '36px 28px', border: '1px solid rgba(124,58,237,.08)', transition: 'transform .25s, box-shadow .25s', cursor: 'default' }}>
                  <div style={{ width: 48, height: 48, background: '#ede9fe', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: 20 }}>{icon}</div>
                  <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.2rem', color: '#0f0a1e', marginBottom: 10 }}>{title}</h3>
                  <p style={{ color: '#7c6fa0', fontSize: '.9rem', lineHeight: 1.7 }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SPLIT */}
        <section style={{ background: '#fff', padding: '100px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <p className="rk-reveal" style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>{t('landing', 'splitEyebrow', "Two audiences, one platform")}</p>
            <h2 className="rk-reveal" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0f0a1e' }}>{t('landing', 'splitTitle', "Built for believers. Scaled for ministries.")}</h2>
            <div className="rk-reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 3, borderRadius: 24, overflow: 'hidden', boxShadow: '0 8px 40px rgba(91,45,158,.15)', marginTop: 60 }}>
              <div style={{ padding: '60px 48px', background: 'linear-gradient(145deg,#1a0d3d,#2d1f5e)' }}>
                <span style={{ display: 'inline-block', background: 'rgba(167,139,250,.2)', color: '#a78bfa', fontSize: '.75rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 100, marginBottom: 24 }}>{t('landing', 'forIndividuals', "For Individuals")}</span>
                <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2rem', color: '#fff', marginBottom: 16 }}>{t('landing', 'indivTitle', "Your personal sanctuary for spiritual growth")}</h2>
                <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.98rem', lineHeight: 1.75, marginBottom: 28 }}>{t('landing', 'indivDesc', "Whether you are a new believer or a seasoned disciple, ReKindle gives you the structure and community to deepen your walk with God daily.")}</p>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[t('landing', 'indiv1', "Daily devotional library with unlimited access"),t('landing', 'indiv2', "Audio devotionals — listen anywhere, hands-free"),t('landing', 'indiv3', "Offline access — download and read without a signal"),t('landing', 'indiv4', "GraceCounsel AI spiritual companion"),t('landing', 'indiv5', "Prayer streak tracking & accountability"),t('landing', 'indiv6', "Scripture memory & Bible reading plans"),t('landing', 'indiv7', "Book a Christian counsellor anytime")].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, color: 'rgba(255,255,255,.75)', fontSize: '.92rem' }}>
                      <span style={{ background: 'rgba(167,139,250,.2)', color: '#a78bfa', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', flexShrink: 0, marginTop: 2 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ padding: '60px 48px', background: '#ede9fe' }}>
                <span style={{ display: 'inline-block', background: 'rgba(124,58,237,.12)', color: '#7c3aed', fontSize: '.75rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 100, marginBottom: 24 }}>{t('landing', 'forMinistries', "For Ministries")}</span>
                <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2rem', color: '#0f0a1e', marginBottom: 16 }}>{t('landing', 'minTitle', "Everything your ministry needs to reach and disciple")}</h2>
                <p style={{ color: '#4a3f6b', fontSize: '.98rem', lineHeight: 1.75, marginBottom: 28 }}>{t('landing', 'minDesc', "Give your church or ministry the infrastructure to communicate at scale, host live events, and disciple your congregation.")}</p>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[t('landing', 'min1', "WhatsApp broadcast with Meta WABA or Twilio"),t('landing', 'min2', "Email & push broadcast messaging"),t('landing', 'min3', "Live broadcast with recordings & replays"),t('landing', 'min9', "Stream live on YouTube & Facebook"),t('landing', 'min4', "Team management with role permissions"),t('landing', 'min5', "Ministry branding & custom dashboard"),t('landing', 'min6', "Advanced analytics & CSV exports"),t('landing', 'min7', "Ministry CRM: members, volunteers, donors & events"),t('landing', 'min8', "UK Gift Aid claims with direct HMRC submission")].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, color: '#4a3f6b', fontSize: '.92rem' }}>
                      <span style={{ background: 'rgba(124,58,237,.12)', color: '#7c3aed', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', flexShrink: 0, marginTop: 2 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
                  <button onClick={() => scrollTo('ministry-crm')} style={{
                    background: '#7c3aed', color: '#fff', padding: '11px 22px', borderRadius: 100,
                    fontSize: '.88rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    transition: 'opacity .2s',
                  }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '.88')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                  >{t('landing', 'crmCta', "Explore Ministry CRM")} →</button>
                  <button onClick={() => scrollTo('gift-aid')} style={{
                    background: 'transparent', color: '#7c3aed', padding: '11px 22px', borderRadius: 100,
                    fontSize: '.88rem', fontWeight: 600, border: '1.5px solid rgba(124,58,237,.3)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    transition: 'all .2s',
                  }}
                    onMouseOver={e => { e.currentTarget.style.background = '#ede9fe'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                  >{t('landing', 'giftAidCta', "Learn about Gift Aid")} →</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MINISTRY CRM */}
        <section id="ministry-crm" style={{ background: '#fff', padding: '100px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <p className="rk-reveal" style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>{t('landing', 'crmEyebrow', "Ministry CRM")}</p>
            <h2 className="rk-reveal" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0f0a1e', maxWidth: 640 }}>{t('landing', 'crmTitle', "One CRM to run your entire church, ministry, or charity")}</h2>
            <p className="rk-reveal" style={{ color: '#7c6fa0', fontSize: '1.05rem', maxWidth: 560, marginTop: 14 }}>{t('landing', 'crmSubtitle', "Replace spreadsheets and disconnected tools with a Ministry CRM purpose-built for churches and faith-based charities — members, volunteers, giving, events, and outreach, all in one place.")}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 24, marginTop: 56 }}>
              {[
                { icon: '👥', title: t('landing', 'crmFeat1Title', "Member & Visitor Management"), desc: t('landing', 'crmFeat1Desc', "Maintain a complete directory of members, visitors, and first-timers with household groupings, custom fields, tags, and follow-up pipelines.") },
                { icon: '🤝', title: t('landing', 'crmFeat2Title', "Volunteer Management"), desc: t('landing', 'crmFeat2Desc', "Recruit, schedule, and track volunteers across ministries and teams — from serving rotas to availability and skills.") },
                { icon: '💷', title: t('landing', 'crmFeat3Title', "Donor & Contribution Tracking"), desc: t('landing', 'crmFeat3Desc', "Record giving by fund or campaign, generate giving statements, and see donor history at a glance — fully linked to Gift Aid.") },
                { icon: '📅', title: t('landing', 'crmFeat4Title', "Event & Attendance Management"), desc: t('landing', 'crmFeat4Desc', "Plan services and events, manage RSVPs and check-in, and track attendance trends across your congregation over time.") },
                { icon: '✉️', title: t('landing', 'crmFeat5Title', "Communication Tools"), desc: t('landing', 'crmFeat5Desc', "Reach your congregation by WhatsApp, email, SMS, and push notification — segmented lists, templates, and delivery analytics.") },
                { icon: '📡', title: t('landing', 'crmFeat6Title', "Multi-Platform Live Broadcasting"), desc: t('landing', 'crmFeat6Desc', "Connect your ministry to YouTube and Facebook and go live straight from OBS or any RTMP encoder — simulcast one stream everywhere your congregation gathers.") },
                { icon: '🔗', title: t('landing', 'crmFeat7Title', "Integration With Every Module"), desc: t('landing', 'crmFeat7Desc', "Members, giving, Gift Aid, events, and broadcasting all share one record — no duplicate data entry, no disconnected systems.") },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="rk-reveal rk-card"
                  style={{ background: '#fdf9f3', borderRadius: 16, padding: '36px 28px', border: '1px solid rgba(124,58,237,.08)', transition: 'transform .25s, box-shadow .25s', cursor: 'default' }}>
                  <div style={{ width: 48, height: 48, background: '#ede9fe', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: 20 }}>{icon}</div>
                  <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.2rem', color: '#0f0a1e', marginBottom: 10 }}>{title}</h3>
                  <p style={{ color: '#7c6fa0', fontSize: '.9rem', lineHeight: 1.7 }}>{desc}</p>
                </div>
              ))}
            </div>
            <div className="rk-reveal" style={{ marginTop: 48, textAlign: 'center' }}>
              <button onClick={onSignUp} style={{
                background: 'linear-gradient(135deg,#7c3aed,#9333ea)', color: '#fff',
                padding: '15px 34px', borderRadius: 100, fontSize: '1.02rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                boxShadow: '0 4px 24px rgba(124,58,237,.45)', transition: 'opacity .2s',
              }}
                onMouseOver={e => (e.currentTarget.style.opacity = '.9')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              >{t('landing', 'crmCta', "Explore Ministry CRM")} →</button>
            </div>
          </div>
        </section>

        {/* GIFT AID */}
        <section id="gift-aid" style={{ background: '#fdf9f3', padding: '100px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 60, alignItems: 'start' }}>
              <div>
                <p className="rk-reveal" style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>{t('landing', 'giftAidEyebrow', "For UK Ministries & Charities")}</p>
                <h2 className="rk-reveal" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0f0a1e' }}>{t('landing', 'giftAidTitle', "Gift Aid, fully managed — from declaration to HMRC")}</h2>
                <p className="rk-reveal" style={{ color: '#7c6fa0', fontSize: '1.02rem', lineHeight: 1.8, marginTop: 20 }}>
                  {t('landing', 'giftAidIntro1', "Gift Aid lets UK charities and churches reclaim 25p from HMRC for every £1 given by a UK taxpayer — at no extra cost to the donor. It's one of the simplest ways to grow your ministry's income, but the paperwork of declarations, eligibility checks, and claims can be a real burden.")}
                </p>
                <p className="rk-reveal" style={{ color: '#7c6fa0', fontSize: '1.02rem', lineHeight: 1.8, marginTop: 14 }}>
                  {t('landing', 'giftAidIntro2', "ReKindle manages the entire Gift Aid lifecycle for your ministry or charity — so every eligible donation is captured and claimed, automatically.")}
                </p>
                <div className="rk-reveal" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 32 }}>
                  <button onClick={onSignUp} style={{
                    background: 'linear-gradient(135deg,#7c3aed,#9333ea)', color: '#fff',
                    padding: '15px 34px', borderRadius: 100, fontSize: '1.02rem', fontWeight: 600,
                    border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    boxShadow: '0 4px 24px rgba(124,58,237,.45)', transition: 'opacity .2s',
                  }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '.9')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                  >{t('landing', 'giftAidCta', "Learn about Gift Aid")} →</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { icon: '✍️', title: t('landing', 'giftAidFeat1Title', "Donor Declaration Management"), desc: t('landing', 'giftAidFeat1Desc', "Collect, store, and manage Gift Aid declarations digitally — donors sign once and every future gift is automatically covered.") },
                  { icon: '✅', title: t('landing', 'giftAidFeat2Title', "Automatic Eligibility & Claim Calculation"), desc: t('landing', 'giftAidFeat2Desc', "Every donation is checked against active declarations and HMRC eligibility rules, with claim values calculated automatically.") },
                  { icon: '🏛️', title: t('landing', 'giftAidFeat3Title', "Direct Submission to HMRC"), desc: t('landing', 'giftAidFeat3Desc', "Submit Gift Aid claims straight to HMRC from your ministry dashboard — no separate spreadsheets, no manual Government Gateway uploads.") },
                  { icon: '📊', title: t('landing', 'giftAidFeat4Title', "Reporting & Audit Trail"), desc: t('landing', 'giftAidFeat4Desc', "Real-time claim status, donor-level history, and exportable reports keep your ministry ready for HMRC compliance checks at any time.") },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="rk-reveal rk-card" style={{ background: '#fff', borderRadius: 16, padding: '24px 26px', border: '1px solid rgba(124,58,237,.08)', display: 'flex', gap: 18, alignItems: 'flex-start', transition: 'transform .25s, box-shadow .25s' }}>
                    <div style={{ width: 44, height: 44, flexShrink: 0, background: '#ede9fe', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>{icon}</div>
                    <div>
                      <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: '#0f0a1e', marginBottom: 6 }}>{title}</h3>
                      <p style={{ color: '#7c6fa0', fontSize: '.88rem', lineHeight: 1.6 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" style={{ background: '#fdf9f3', padding: '100px 0' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <p className="rk-reveal" style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12 }}>{t('landing', 'pricingEyebrow', "Free for everyone")}</p>
            <h2 className="rk-reveal" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0f0a1e' }}>{t('landing', 'pricingTitle', "Free to use. Powered by partners.")}</h2>
            <p className="rk-reveal" style={{ color: '#7c6fa0', fontSize: '1.05rem', maxWidth: 520, marginTop: 14 }}>{t('landing', 'pricingSubtitle', "ReKindle BC is completely free. If it blesses you, partner with us to help keep the mission growing and reaching more people.")}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 20, marginTop: 56, alignItems: 'start' }}>
              {[
                { name: t('landing', 'tierFreeName', "Free"),               price: '$0',      unit: t('landing', 'tierFreeUnit', "forever"),        desc: t('landing', 'tierFreeDesc', "Everything you need for your daily walk"),      popular: false, cta: t('landing', 'tierFreeCta', "Get Started"),          features: [t('landing', 'tierFree1', "Daily devotionals with audio"),t('landing', 'tierFree2', "Offline access to devotionals"),t('landing', 'tierFree3', "Community prayer wall"),t('landing', 'tierFree4', "Join live channels"),t('landing', 'tierFree5', "GraceCounsel AI companion"),t('landing', 'tierFree6', "Prayer streaks & Scripture memory"),t('landing', 'tierFree7', "Book a counsellor")] },
                { name: t('landing', 'tierIndivName', "Individual Partner"), price: t('landing', 'tierIndivPrice', "Give"),    unit: t('landing', 'tierIndivUnit', "any amount"),     desc: t('landing', 'tierIndivDesc', "For believers who want to sow into the mission"), popular: true,  cta: t('landing', 'tierIndivCta', "Become a Partner"),      href: PAYPAL_LINKS.custom,    features: [t('landing', 'tierIndiv1', "Everything in Free"),t('landing', 'tierIndiv2', "Help keep ReKindle free for all"),t('landing', 'tierIndiv3', "Supporter badge"),t('landing', 'tierIndiv4', "Priority support"),t('landing', 'tierIndiv5', "Early access to new features"),t('landing', 'tierIndiv6', "Create your own live channel"),t('landing', 'tierIndiv7', "Video Conferencing & Meetings")] },
                { name: t('landing', 'tierMinName', "Ministry Partner"),   price: t('landing', 'tierMinPrice', "Partner"), unit: t('landing', 'tierMinUnit', "your ministry"),  desc: t('landing', 'tierMinDesc', "For churches, ministries & networks"),          popular: false, cta: t('landing', 'tierMinCta', "Partner Your Ministry"), externalHref: `${MINISTRY_APP_URL}/settings/billing`, features: [t('landing', 'tierMin1', "Create & host live channels"),t('landing', 'tierMin2', "Broadcast & WhatsApp outreach"),t('landing', 'tierMin3', "Team & member management"),t('landing', 'tierMin4', "Ministry branding"),t('landing', 'tierMin5', "Devotional & prayer campaigns"),t('landing', 'tierMin6', "Full Ministry CRM suite"),t('landing', 'tierMin7', "UK Gift Aid claims & direct HMRC submission"),t('landing', 'tierMin8', "Simulcast to YouTube & Facebook via OBS"),t('landing', 'tierMin9', "Video Conferencing & Meetings")] },
              ].map(({ name, price, unit, desc, popular, cta, href, externalHref, features }, i) => (
                <div key={name} className="rk-reveal" style={{
                  background: popular ? 'linear-gradient(145deg,#2d1f5e,#1a0d3d)' : '#fff',
                  border: popular ? 'none' : '1px solid rgba(124,58,237,.1)',
                  borderRadius: 16, padding: '28px 20px', position: 'relative',
                  transform: popular ? 'translateY(-8px)' : undefined,
                  boxShadow: popular ? '0 12px 48px rgba(124,58,237,.35)' : undefined,
                  transitionDelay: `${i * .08}s`,
                }}>
                  {popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg,#c8973a,#f59e0b)', color: '#78350f', fontSize: '.7rem', fontWeight: 700, padding: '4px 14px', borderRadius: 100, letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t('landing', 'mostPopular', "Most Popular")}</div>}
                  <div style={{ fontSize: '.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: popular ? '#a78bfa' : '#7c6fa0', marginBottom: 12 }}>{name}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.2rem', fontWeight: 700, color: popular ? '#fff' : '#0f0a1e', lineHeight: 1 }}>
                    {price}<span style={{ fontSize: '1rem', fontWeight: 400, color: popular ? 'rgba(255,255,255,.4)' : '#7c6fa0', marginLeft: 6 }}>{unit}</span>
                  </div>
                  <div style={{ fontSize: '.82rem', color: popular ? 'rgba(255,255,255,.5)' : '#7c6fa0', margin: '8px 0 18px', lineHeight: 1.5 }}>{desc}</div>
                  <div style={{ height: 1, background: popular ? 'rgba(255,255,255,.1)' : 'rgba(124,58,237,.08)', marginBottom: 16 }} />
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                    {features.map(f => (
                      <li key={f} style={{ fontSize: '.83rem', color: popular ? 'rgba(255,255,255,.7)' : '#4a3f6b', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ color: popular ? '#a78bfa' : '#7c3aed', fontWeight: 700, flexShrink: 0 }}>·</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => externalHref ? (window.location.href = externalHref) : href ? window.open(href, '_blank', 'noopener,noreferrer') : onSignUp()}
                    style={{ width: '100%', padding: '10px', borderRadius: 100, fontSize: '.85rem', fontWeight: 600, border: popular ? 'none' : '1.5px solid rgba(124,58,237,.3)', background: popular ? '#7c3aed' : 'transparent', color: popular ? '#fff' : '#7c3aed', cursor: 'pointer', transition: 'all .2s' }}
                    onMouseOver={e => { e.currentTarget.style.background = popular ? '#6d28d9' : '#ede9fe'; }}
                    onMouseOut={e => { e.currentTarget.style.background = popular ? '#7c3aed' : 'transparent'; }}
                  >{cta} →</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ background: '#070413', padding: '56px 0 32px', borderTop: '1px solid rgba(167,139,250,.08)' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 48, marginBottom: 48 }}>
              <div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.6rem', fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                  Re<span style={{ color: '#a78bfa' }}>Kindle</span> BC
                </div>
                <p style={{ fontSize: '.88rem', color: 'rgba(255,255,255,.35)', lineHeight: 1.7, maxWidth: 240 }}>{t('landing', 'footerTagline', "A faith-tech platform for believers, ministries, and counsellors. Deepen your walk. Reach your congregation.")}</p>
              </div>
              {[
                { heading: t('landing', 'footPlatform', "Platform"), links: [[t('landing', 'navFeatures', "Features"),'#features'],[t('landing', 'navPartner', "Partner"),'#pricing']] },
                { heading: t('landing', 'footLegal', "Legal"),    links: [[t('landing', 'footTerms', "Terms of Service"),'/terms'],[t('landing', 'footPrivacy', "Privacy Policy"),'/privacy'],[t('landing', 'footRefund', "Refund Policy"),'mailto:legal@rekindlebc.com?subject=Refund Request']] },
                { heading: t('landing', 'footContact', "Contact"),  links: [['hello@rekindlebc.com','mailto:hello@rekindlebc.com'],['support@rekindlebc.com','mailto:support@rekindlebc.com']] },
              ].map(({ heading, links }) => (
                <div key={heading}>
                  <h4 style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginBottom: 16 }}>{heading}</h4>
                  {links.map(([label, href]) => (
                    href.startsWith('/') ? (
                      <Link key={label} to={href} style={{ display: 'block', fontSize: '.88rem', color: 'rgba(255,255,255,.4)', textDecoration: 'none', marginBottom: 10 }}
                        onMouseOver={e => (e.currentTarget.style.color = 'rgba(255,255,255,.75)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.4)')}
                      >{label}</Link>
                    ) : (
                      <a key={label} href={href} style={{ display: 'block', fontSize: '.88rem', color: 'rgba(255,255,255,.4)', textDecoration: 'none', marginBottom: 10 }}
                        onMouseOver={e => (e.currentTarget.style.color = 'rgba(255,255,255,.75)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.4)')}
                      >{label}</a>
                    )
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.05)' }}>
              <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.2)' }}>{t('landing', 'copyright', "© 2026 ReKindle BC. All rights reserved.")}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.2)' }}>{t('landing', 'builtWith', "Built with faith & purpose ✦")}</p>
                {/* Discreet admin sign-in link in footer */}
                <button onClick={onSignIn} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.15)', fontSize: '.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  onMouseOver={e => (e.currentTarget.style.color = 'rgba(255,255,255,.4)')}
                  onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.15)')}
                >{t('landing', 'admin', "Admin")}</button>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
};

export default LandingPage;
