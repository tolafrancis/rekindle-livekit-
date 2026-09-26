import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const COMPANY = 'ReKindle BC';
const WEBSITE = 'rekindlebc.com';
const CONTACT_NAME = 'Tola Francis';
const CONTACT_EMAIL = 'tolafrancis@rekindlebc.com';
const CONTACT_PHONE = '+84 91 831 6417';

// Screenshots live in each app's public/tutorial/ folder (same file names in
// apps/rekindle and apps/ministry). scripts/capture-tutorial-screenshots.mjs
// regenerates them against a running app with a demo account.
const SHOT_BASE = '/tutorial/';

interface TutorialStep {
  text: React.ReactNode;
  shot?: string;
  alt?: string;
}

interface TutorialSectionProps {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  path?: string[];
  steps: TutorialStep[];
  tip?: string;
}

// A screenshot framed like a device screen. If the image hasn't been captured
// yet it renders nothing, so the tutorial still reads cleanly step by step.
const Screenshot: React.FC<{ file: string; alt: string }> = ({ file, alt }) => {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <figure className="shot">
      <img src={`${SHOT_BASE}${file}`} alt={alt} loading="lazy" onError={() => setMissing(true)} />
      <figcaption>{alt}</figcaption>
    </figure>
  );
};

// Same visual language as RekindleGuidePage's FeatureSection, but built around
// "where to go" (the path) and numbered steps, each with its own screenshot.
const TutorialSection: React.FC<TutorialSectionProps> = ({ id, eyebrow, title, intro, path, steps, tip }) => (
  <section id={id} className="guide-section">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2>{title}</h2>
    {intro && <p>{intro}</p>}
    {path && path.length > 0 && (
      <>
        <p className="kicker">Where to find it</p>
        <div className="path">
          {path.map((p, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="path-sep">›</span>}
              <span className="path-item">{p}</span>
            </React.Fragment>
          ))}
        </div>
      </>
    )}
    <p className="kicker">Step by step</p>
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i}>
          <div>
            <div>{s.text}</div>
            {s.shot && <Screenshot file={s.shot} alt={s.alt ?? ''} />}
          </div>
        </li>
      ))}
    </ol>
    {tip && <div className="note">{tip}</div>}
  </section>
);

const PILL_LINKS: Array<[string, string]> = [
  ['sign-up', 'Get started'],
  ['member-devotionals', 'Read a devotional'],
  ['member-live', 'Watch live'],
  ['leader-create', 'Create a ministry'],
  ['leader-meetings', 'Run a meeting'],
  ['leader-translation', 'Live translation'],
];

const TOC_GROUPS: Array<[string, Array<[string, string]>]> = [
  ['Getting started', [
    ['sign-up', 'Create your account'],
    ['install', 'Install the app on your phone'],
    ['find-your-way', 'Find your way around'],
    ['join-ministry', 'Join your ministry'],
    ['notifications', 'Choose your notifications'],
  ]],
  ['For members', [
    ['member-devotionals', 'Read today’s devotional'],
    ['member-prayer', 'Share a prayer request'],
    ['member-journal', 'Keep a prayer journal'],
    ['member-live', 'Watch a live service'],
    ['member-captions', 'Follow a service in your language'],
    ['member-meeting', 'Join a video meeting'],
    ['member-groups', 'Join a small group'],
    ['member-give', 'Give with Gift Aid'],
  ]],
  ['For ministry leaders', [
    ['leader-create', 'Create your ministry'],
    ['leader-people', 'Add and manage members'],
    ['leader-qr', 'Set up QR self-registration'],
    ['leader-kiosk', 'Turn a tablet into a check-in kiosk'],
    ['leader-devotional', 'Publish a devotional'],
    ['leader-live', 'Go live'],
    ['leader-meetings', 'Schedule an interactive meeting'],
    ['leader-webinar', 'Host a webinar'],
    ['leader-groups', 'Create a small group'],
    ['leader-video', 'Send a pastoral video message'],
    ['leader-translation', 'Run live translation'],
    ['leader-giving', 'Set up giving and Gift Aid'],
  ]],
];

const RekindleTutorialPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0d0a1e 0%, #0a0718 100%)', color: '#fff' }}>
      <style>{`
        .guide-body h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.6rem; font-weight: 700; color: #fff; margin: 0 0 .9rem; }
        .guide-body h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 2rem; font-weight: 700; color: #fff; margin: 0 0 .4rem; }
        .guide-body p { font-size: .92rem; color: rgba(255,255,255,.65); line-height: 1.85; margin-bottom: .9rem; }
        .guide-body .eyebrow { font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #a78bfa; margin: 0 0 .5rem; }
        .guide-body .kicker { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.35); margin: 1.4rem 0 .6rem; }
        .guide-body .steps { list-style: none; padding: 0; margin: 0 0 .9rem; display: flex; flex-direction: column; gap: 1rem; counter-reset: step; }
        .guide-body .steps li { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); gap: .65rem; font-size: .92rem; color: rgba(255,255,255,.65); line-height: 1.6; counter-increment: step; }
        .guide-body .steps li::before { content: counter(step); font-family: 'Cormorant Garamond', serif; font-weight: 700; font-size: .9rem; color: #a78bfa; width: 1.6rem; height: 1.6rem; border-radius: 999px; border: 1px solid rgba(167,139,250,.35); display: flex; align-items: center; justify-content: center; }
        .guide-body .steps strong { color: #fff; font-weight: 600; }
        .guide-body .note { margin-top: .8rem; padding: .9rem 1.05rem; background: rgba(167,139,250,.06); border: 1px solid rgba(167,139,250,.15); border-left: 3px solid #a78bfa; border-radius: 6px; font-size: .87rem; color: rgba(255,255,255,.6); line-height: 1.7; }
        .guide-body .path { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin-bottom: .4rem; }
        .guide-body .path-item { font-size: .8rem; font-weight: 600; padding: .3em .8em; border-radius: 6px; background: rgba(167,139,250,.1); border: 1px solid rgba(167,139,250,.25); color: #ddd6fe; }
        .guide-body .path-sep { color: rgba(167,139,250,.6); font-size: .9rem; }
        .guide-body .shot { margin: .8rem 0 .2rem; padding: 0; }
        .guide-body .shot img { display: block; width: 100%; max-width: 320px; height: auto; border-radius: 10px; border: 1px solid rgba(167,139,250,.2); box-shadow: 0 10px 30px rgba(0,0,0,.35); background: #fff; }
        .guide-body .shot figcaption { font-size: .75rem; color: rgba(255,255,255,.35); margin-top: .45rem; }
        .guide-part { margin: 0 0 2.2rem; padding: 1.4rem 1.5rem; border-radius: 10px; background: linear-gradient(135deg, rgba(167,139,250,.12), rgba(167,139,250,.03)); border: 1px solid rgba(167,139,250,.2); }
        .guide-part p { margin-bottom: 0; }
        .guide-section { padding-bottom: 2.6rem; margin-bottom: 2.6rem; border-bottom: 1px solid rgba(167,139,250,.1); }
        .guide-section:last-of-type { border-bottom: none; margin-bottom: 0; }
        .guide-toc-group + .guide-toc-group { margin-top: 1rem; }
        .guide-toc-label { font-size: .7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #a78bfa; margin-bottom: .5rem; }
        .guide-toc { display: flex; flex-wrap: wrap; gap: .5rem; }
        .guide-toc a { font-size: .82rem; font-weight: 600; padding: .4em .9em; border-radius: 999px; border: 1px solid rgba(167,139,250,.2); background: rgba(167,139,250,.05); color: rgba(255,255,255,.65); text-decoration: none; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
        .guide-toc a:hover { background: rgba(167,139,250,.18); border-color: rgba(167,139,250,.5); color: #fff; }
        .guide-pill { font-size: .78rem; font-weight: 600; padding: .35em .85em; border-radius: 999px; border: 1px solid rgba(167,139,250,.25); color: rgba(255,255,255,.7); text-decoration: none; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
        .guide-pill:hover { background: rgba(167,139,250,.18); border-color: rgba(167,139,250,.5); color: #fff; }
        .guide-contact { margin-top: 1.6rem; padding: 1.3rem 1.5rem; background: rgba(255,255,255,.03); border: 1px solid rgba(167,139,250,.15); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .guide-contact strong { display: block; font-family: 'Cormorant Garamond', serif; font-size: 1.05rem; color: #fff; }
        .guide-contact span { font-size: .85rem; color: rgba(255,255,255,.5); }
        .guide-verse { margin: 2.2rem 0 0; padding-top: 1.6rem; border-top: 1px solid rgba(167,139,250,.15); font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 600; font-size: 1.15rem; line-height: 1.55; color: #c4b5fd; }
        .guide-verse cite { display: block; font-style: normal; font-family: system-ui, sans-serif; font-weight: 700; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.35); margin-top: .6rem; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(167,139,250,.1)', position: 'sticky', top: 0, background: 'rgba(10,7,24,.95)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,.5)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.85rem', padding: 0 }}
            onMouseOver={e => (e.currentTarget.style.color = '#fff')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,.5)')}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.1)' }} />
          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{COMPANY}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 10 }}>Tutorial</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.6rem', fontWeight: 700, color: '#fff', marginBottom: 12 }}>Using Rekindle, step by step</h1>
          <p style={{ fontSize: '.95rem', color: 'rgba(255,255,255,.55)', maxWidth: 560, lineHeight: 1.7 }}>
            Exactly where to tap, in order, for everything members and leaders do most. Follow along with the app open beside you.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
            {PILL_LINKS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="guide-pill">{label}</a>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 40, padding: '1.3rem 1.5rem', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(167,139,250,.12)', borderRadius: 10 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 12 }}>Contents</p>
          {TOC_GROUPS.map(([label, items]) => (
            <div key={label} className="guide-toc-group">
              <p className="guide-toc-label">{label}</p>
              <nav className="guide-toc">
                {items.map(([id, itemLabel]) => (
                  <a key={id} href={`#${id}`}>{itemLabel}</a>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="guide-body">
          {/* ───────────────────────── Part 1 ───────────────────────── */}
          <div className="guide-part">
            <p className="eyebrow">Part 1</p>
            <h3>Getting started</h3>
            <p>Everyone starts here, members and leaders alike. It takes about five minutes.</p>
          </div>

          <TutorialSection
            id="sign-up" eyebrow="Getting started" title="Create your account"
            path={['rekindlebc.com', 'Get Started Free']}
            steps={[
              { text: <>Open <strong>{WEBSITE}</strong> in your phone or computer’s browser and tap <strong>Get Started Free</strong> (or <strong>Sign Up</strong> in the top corner).</>, shot: 'landing.png', alt: 'The Rekindle welcome page' },
              { text: <>On <strong>Create your account</strong>, tap <strong>Sign up with Google</strong> or <strong>Sign up with Facebook</strong>, or fill in your Full Name, Email, Password and Confirm Password, then tap <strong>Create Account</strong>.</>, shot: 'sign-up.png', alt: 'Create your account' },
              { text: <>If you signed up with email, check your inbox for the confirmation email and tap the link inside it.</> },
              { text: <>Next time, tap <strong>I already have an account</strong> on the welcome page, enter your email and password and tap <strong>Sign In</strong>. Forgot it? Tap <strong>Forgot password?</strong> on the same screen.</>, shot: 'sign-in.png', alt: 'Welcome back, the sign-in screen' },
            ]}
            tip="Didn’t get the email? Check your spam or promotions folder. Signing in with Google or Facebook skips the email step entirely."
          />

          <TutorialSection
            id="install" eyebrow="Getting started" title="Install the app on your phone"
            intro="Rekindle installs straight from the browser, so there is no app store to search. Once installed it opens full-screen with its own icon, just like any other app."
            steps={[
              { text: <><strong>iPhone (Safari):</strong> tap the <strong>Share</strong> button at the bottom of the screen, scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</> },
              { text: <><strong>Android (Chrome):</strong> tap the <strong>⋮</strong> menu in the top corner, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.</> },
              { text: <><strong>Computer (Chrome or Edge):</strong> click the small install icon at the right end of the address bar, then <strong>Install</strong>.</> },
              { text: <>Open Rekindle from its new icon. You stay signed in.</> },
            ]}
          />

          <TutorialSection
            id="find-your-way" eyebrow="Getting started" title="Find your way around"
            intro="Every screen in this tutorial starts from the main navigation. On a computer it runs along the top; on a phone, tap the menu button to open it."
            steps={[
              { text: <><strong>Home</strong>: your dashboard, streak and today’s highlights.</>, shot: 'home.png', alt: 'The Home screen and main navigation' },
              { text: <><strong>The Word</strong>: Devotionals, Reading Plan, Scripture Memory and Books.</> },
              { text: <><strong>Prayer</strong>: Prayer Library, Prayer Journal and Prayer Wall.</> },
              { text: <><strong>Ministries</strong>: My Ministries (the churches you belong to) and Manage (for leaders).</> },
              { text: <><strong>Live Broadcast</strong>: Discover, Events, Following, My Channels and Meetings.</> },
              { text: <><strong>Community</strong>: Feed, Revelations, Challenges and Music.</> },
              { text: <>Your <strong>profile icon</strong> in the top right opens your account: Profile (settings), Billing and Donate.</> },
            ]}
          />

          <TutorialSection
            id="join-ministry" eyebrow="Getting started" title="Join your ministry"
            path={['Ministries', 'My Ministries']}
            steps={[
              { text: <>The quickest way is the link or QR code your church shares. Scan the code (or tap the link) and you’ll see your ministry’s welcome page.</> },
              { text: <>Fill in the short form, tick the consent boxes you’re happy with, and tap to join.</>, shot: 'join-ministry.png', alt: 'A ministry’s join page' },
              { text: <>No link? From the main navigation tap <strong>Ministries</strong>, search for your church, open it and tap <strong>Join</strong>.</>, shot: 'ministries.png', alt: 'The Ministries page' },
              { text: <>Some ministries approve new members by hand. You’ll get a notification as soon as a leader lets you in.</> },
              { text: <>Once you’re in, <strong>Ministries › My Ministries</strong> takes you straight to your church’s own space: its devotionals, live services, prayer requests and announcements.</> },
            ]}
          />

          <TutorialSection
            id="notifications" eyebrow="Getting started" title="Choose your notifications"
            path={['Profile icon', 'Profile', 'Notifications']}
            steps={[
              { text: <>Tap your <strong>profile icon</strong> in the top right, then <strong>Profile</strong>.</> },
              { text: <>Scroll to the <strong>Notifications</strong> group.</>, shot: 'notifications.png', alt: 'Notification settings' },
              { text: <>Switch on the ones you want: <strong>In-app &amp; Email</strong>, <strong>Push</strong>, <strong>WhatsApp</strong> and <strong>Daily Reminders</strong>. Each has its own toggle.</> },
              { text: <>When your phone asks whether Rekindle may send notifications, tap <strong>Allow</strong>, otherwise push notifications can’t reach you.</> },
            ]}
            tip="You can change these at any time. Your choices are recorded as your consent, so your ministry only contacts you in the ways you’ve agreed to."
          />

          {/* ───────────────────────── Part 2 ───────────────────────── */}
          <div className="guide-part">
            <p className="eyebrow">Part 2</p>
            <h3>For members</h3>
            <p>The everyday things: reading, praying, watching and giving.</p>
          </div>

          <TutorialSection
            id="member-devotionals" eyebrow="Members" title="Read today’s devotional"
            path={['The Word', 'Devotionals']}
            steps={[
              { text: <>From the main navigation tap <strong>The Word</strong>, then <strong>Devotionals</strong>.</>, shot: 'devotionals.png', alt: 'The Devotionals library' },
              { text: <>Choose the source at the top: the daily devotional, or <strong>My Ministry</strong> for the ones your church publishes.</> },
              { text: <>Tap a devotional to open it. It plays slide by slide: the teaching, the Scripture passage, then a second Bible passage.</>, shot: 'devotional-reader.png', alt: 'A devotional open in the reader' },
              { text: <>Longer readings scroll on their own, so you can read hands-free. Swipe or tap the arrows to move at your own pace.</> },
              { text: <>The devotional closes in a guided prayer. Finishing it counts towards your daily streak on Home.</> },
            ]}
          />

          <TutorialSection
            id="member-prayer" eyebrow="Members" title="Share a prayer request"
            path={['Prayer', 'Prayer Wall']}
            steps={[
              { text: <>From the main navigation tap <strong>Prayer</strong>, then <strong>Prayer Wall</strong>.</>, shot: 'prayer-wall.png', alt: 'The Community Prayer Wall' },
              { text: <>Tap to add a new request. Give it a short title, write your request and pick a category (for example Healing, Family, Guidance or Gratitude).</> },
              { text: <>Choose <strong>Anonymous</strong> if you’d rather your name isn’t shown, then post it.</> },
              { text: <>To stand with someone else, open their request and tap to pray. They see how many people are praying for them.</> },
              { text: <>When God answers, open your own request and mark it <strong>Answered</strong> so others can rejoice with you.</> },
            ]}
          />

          <TutorialSection
            id="member-journal" eyebrow="Members" title="Keep a prayer journal and memorise Scripture"
            path={['Prayer', 'Prayer Journal']}
            steps={[
              { text: <>From the main navigation tap <strong>Prayer</strong>, then <strong>Prayer Journal</strong>.</>, shot: 'journal.png', alt: 'The Prayer Journal' },
              { text: <>Add an entry for what you’re praying about. Only you can see your journal.</> },
              { text: <>Come back and mark prayers as answered to build a record of God’s faithfulness.</> },
              { text: <>To memorise a verse, go to <strong>The Word › Scripture Memory</strong>, choose a verse and practise it a little each day.</> },
              { text: <>For guided prayer, open <strong>Prayer › Prayer Library</strong> and pick a topic or series to pray through.</> },
            ]}
          />

          <TutorialSection
            id="member-live" eyebrow="Members" title="Watch a live service"
            path={['Live Broadcast', 'Discover']}
            steps={[
              { text: <>From the main navigation tap <strong>Live Broadcast</strong>.</>, shot: 'live-discover.png', alt: 'Live Broadcast › Discover' },
              { text: <>Under <strong>Discover</strong>, anything live right now is shown at the top. Tap it to start watching.</> },
              { text: <>To find your own church’s stream quickly, tap <strong>Following</strong> after you’ve followed their channel, or open the link they shared.</> },
              { text: <>Missed it? Past broadcasts stay on the channel, so you can tap any earlier service to catch up.</> },
              { text: <>Check <strong>Events</strong> for upcoming services and tap to be reminded when they start.</> },
            ]}
          />

          <TutorialSection
            id="member-captions" eyebrow="Members" title="Follow a service in your own language"
            intro="If your ministry uses Live Translation, you can read, and often hear, the sermon in your own language as it happens."
            steps={[
              { text: <>Open the live stream as in the step above.</> },
              { text: <>Tap the <strong>language / subtitles</strong> picker on the viewer screen and choose your language.</>, shot: 'live-captions.png', alt: 'Choosing a caption language on a live stream' },
              { text: <>Translated subtitles roll along the bottom of the video as the speaker talks.</> },
              { text: <>At an in-person service, your church may give you a <strong>listener link</strong> or a QR code instead. Open it on your phone, pick your language, and follow along there.</> },
            ]}
          />

          <TutorialSection
            id="member-meeting" eyebrow="Members" title="Join a video meeting"
            path={['Live Broadcast', 'Meetings']}
            steps={[
              { text: <>Tap the meeting link your leader sent. You can also go to <strong>Live Broadcast › Meetings</strong> and open it from there.</> },
              { text: <>Allow the browser to use your camera and microphone when asked.</> },
              { text: <>Check how you look and sound, then tap to join.</>, shot: 'meeting.png', alt: 'Inside an interactive meeting' },
              { text: <>Use the controls at the bottom to mute, turn your camera off, open chat or send a reaction.</> },
              { text: <>For captions in your language, tap the <strong>Translate / captions</strong> button in the controls and choose your language.</> },
            ]}
          />

          <TutorialSection
            id="member-groups" eyebrow="Members" title="Join a small group"
            path={['My Ministries', 'Small Groups', 'Discover']}
            steps={[
              { text: <>Open your ministry’s space (<strong>Ministries › My Ministries</strong>) and go to <strong>Small Groups</strong>, then <strong>Discover</strong>.</>, shot: 'small-groups.png', alt: 'Discovering small groups' },
              { text: <>Browse by day, location or category and open a group to see when and where it meets.</> },
              { text: <>Tap to request to join. You’re notified as soon as the group leader approves you.</> },
              { text: <>Your groups then appear under <strong>My Groups</strong>, where you’ll see new meetings, updates and discussion.</> },
              { text: <>Want WhatsApp reminders too? Switch them on inside the group (only if your ministry has connected WhatsApp).</> },
            ]}
          />

          <TutorialSection
            id="member-give" eyebrow="Members" title="Give, with Gift Aid"
            path={['Profile icon', 'Donate']}
            steps={[
              { text: <>Tap your <strong>profile icon</strong> in the top right, then <strong>Donate</strong>.</> },
              { text: <>Choose your ministry, the amount, and whether it’s a one-off or regular gift.</>, shot: 'give.png', alt: 'The giving form' },
              { text: <>UK taxpayers: tick the <strong>Gift Aid</strong> declaration so your church can claim an extra 25% at no cost to you.</> },
              { text: <>Enter your card details on the secure payment screen and confirm. You’ll get a receipt by email.</> },
            ]}
            tip="Your card details are handled by a regulated payment provider and never touch the app itself."
          />

          {/* ───────────────────────── Part 3 ───────────────────────── */}
          <div className="guide-part">
            <p className="eyebrow">Part 3</p>
            <h3>For ministry leaders</h3>
            <p>Everything here happens in your ministry’s dashboard: <strong>Ministries › Manage</strong>. The dashboard’s own menu has Live, Ministry and Settings groups, and Settings is split into Overview, General, People, Content, Engagement and Finance &amp; Billing.</p>
          </div>

          <TutorialSection
            id="leader-create" eyebrow="Leaders" title="Create your ministry"
            path={['Profile icon', 'Billing', 'Partner Your Ministry']}
            steps={[
              { text: <>First become a Ministry Partner: tap your <strong>profile icon</strong>, then <strong>Billing</strong>, and choose <strong>Partner Your Ministry</strong>. The Create Ministry button only appears once this is active.</>, shot: 'billing.png', alt: 'Billing, with Partner Your Ministry' },
              { text: <>From the main navigation tap <strong>Ministries</strong>, then <strong>Create Ministry</strong> at the top of the page.</> },
              { text: <>Enter the <strong>Ministry Name</strong>, then shorten the <strong>Web Address</strong> it fills in for you, for example <em>grace</em> instead of <em>gracecommunitychurch</em>.</>, shot: 'create-ministry.png', alt: 'The Create Ministry form' },
              { text: <>Add a Description, Logo and Featured Image, Category, Location and <strong>Country</strong>. Choosing United Kingdom is what unlocks Gift Aid.</> },
              { text: <>Write a Welcome Message, pick a Theme Colour, and choose a Join Method: Open, Approval Required or Invite Only.</> },
              { text: <>Tap <strong>Create Ministry</strong>. You land in your new dashboard as its leader.</> },
            ]}
            tip="Double-check the Web Address and Country before you save. Both are harder to change later."
          />

          <TutorialSection
            id="leader-people" eyebrow="Leaders" title="Add and manage members"
            path={['Ministries', 'Manage', 'Settings', 'People']}
            steps={[
              { text: <>Open <strong>Ministries › Manage</strong>, then <strong>Settings › People</strong>.</>, shot: 'people.png', alt: 'Settings › People, the members list' },
              { text: <>The Members list shows everyone, including people who registered themselves, with their role, status and attendance.</> },
              { text: <>Review new sign-ups here. Likely duplicates are flagged for you, so approve or merge them.</> },
              { text: <>Open a member to change their role: Leader, Admin, Content editor or Member.</> },
              { text: <>Use import to bring in an existing spreadsheet of members, or export to download everyone at any time.</> },
            ]}
          />

          <TutorialSection
            id="leader-qr" eyebrow="Leaders" title="Set up QR self-registration"
            path={['Manage', 'Settings', 'General', 'Member Registration']}
            steps={[
              { text: <>In your dashboard go to <strong>Settings › General</strong> and find <strong>Member Registration</strong>.</>, shot: 'registration.png', alt: 'Member Registration settings' },
              { text: <>Set your join address, choose whether to <strong>Require admin approval</strong>, and tap <strong>Save registration settings</strong>.</> },
              { text: <>Your <strong>Join QR code</strong> appears. Tap <strong>Print SVG</strong> to print it for the welcome desk or slides, or <strong>Copy link</strong> to share it online.</> },
              { text: <>Newcomers scan it, fill in the short form on their own phone, and appear under <strong>Settings › People</strong>.</> },
              { text: <>If a code is ever shared too widely, tap <strong>Regenerate</strong>. Old codes and links stop working straight away.</> },
            ]}
          />

          <TutorialSection
            id="leader-kiosk" eyebrow="Leaders" title="Turn a tablet into a check-in kiosk"
            path={['Manage', 'Settings', 'General', 'Kiosk check-in mode']}
            steps={[
              { text: <>In <strong>Settings › General</strong>, set a <strong>Kiosk PIN (4 digits)</strong> and switch on <strong>Kiosk check-in mode</strong>. Save.</> },
              { text: <>On the tablet you’ll leave at the door, sign in and open the same screen, then tap <strong>Use this device</strong>. The kiosk opens full-screen.</>, shot: 'kiosk.png', alt: 'The kiosk check-in screen' },
              { text: <>Members check in with their phone number or email, which records their attendance. First-time visitors register on the spot.</> },
              { text: <>Each person’s details clear before the next, and the kiosk can only be closed with your PIN, so it’s safe to leave unattended.</> },
              { text: <>You’ll see every active kiosk under <strong>Active kiosk devices</strong>, with when it was last seen.</> },
            ]}
          />

          <TutorialSection
            id="leader-devotional" eyebrow="Leaders" title="Publish a devotional"
            path={['Manage', 'Settings', 'Content']}
            steps={[
              { text: <>In your dashboard go to <strong>Settings › Content</strong> and open the devotional creator.</>, shot: 'devotional-creator.png', alt: 'The devotional creator' },
              { text: <>Write the title and the message.</> },
              { text: <>Add the Scripture reference and a second Bible passage, choose a Bible version, and tap <strong>Load</strong> to pull the verse text in automatically.</> },
              { text: <>Preview it, then publish now or schedule it for a date.</> },
              { text: <>Members find it under <strong>The Word › Devotionals › My Ministry</strong>.</> },
            ]}
          />

          <TutorialSection
            id="leader-live" eyebrow="Leaders" title="Go live"
            path={['Manage', 'Live', 'Live Channel']}
            steps={[
              { text: <>In your dashboard open <strong>Live › Live Channel</strong>.</>, shot: 'live-channel.png', alt: 'Your ministry’s Live Channel' },
              { text: <><strong>From a phone or laptop:</strong> tap <strong>Go Live</strong>, allow camera and microphone, give the broadcast a title and start.</> },
              { text: <><strong>From OBS or a video mixer:</strong> tap <strong>Broadcast setup (OBS / encoder)</strong>, open <strong>Advanced</strong> for the OBS / encoder details, copy them into your software and start streaming from there. The same screen lets you restream to YouTube Live and Facebook Live and turn recording on or off.</> },
              { text: <>Share your channel link. Viewers don’t need to sign in to watch.</> },
              { text: <>When you end the broadcast, the recording is saved to the channel for catch-up.</> },
            ]}
          />

          <TutorialSection
            id="leader-meetings" eyebrow="Leaders" title="Schedule an interactive meeting"
            path={['Manage', 'Interactive Meetings']}
            steps={[
              { text: <>In your dashboard open <strong>Interactive Meetings</strong>.</>, shot: 'meetings.png', alt: 'Interactive Meetings' },
              { text: <>Create an <strong>Instant Meeting</strong> to start now, or a <strong>Scheduled Meeting</strong> for later, and choose who can join: Public, Members Only or Leaders Only.</> },
              { text: <>Before it starts, tap <strong>Rec On</strong> if you want it recorded. This can’t be changed once the meeting is live.</> },
              { text: <>Tap the copy-link button on the meeting card and send the link by WhatsApp, email or message.</> },
              { text: <>Afterwards, use the buttons on the card: <strong>Recordings</strong> to watch back, <strong>Participants</strong> to see who came and for how long, and <strong>Insights</strong> for an AI summary.</> },
            ]}
          />

          <TutorialSection
            id="leader-webinar" eyebrow="Leaders" title="Host a webinar"
            path={['Manage', 'Live', 'Webinars']}
            steps={[
              { text: <>In your dashboard open <strong>Live › Webinars</strong> and tap <strong>New webinar</strong>.</>, shot: 'webinar-new.png', alt: 'Creating a new webinar' },
              { text: <>Add a title, description and cover image. Set the date, time, timezone, duration and maximum attendees.</> },
              { text: <>Choose whether it’s Public and whether people must register. Switch on Recording, Captions or Live translation if you need them.</> },
              { text: <>Under Audience interaction choose Chat, Q&amp;A and Polls, and invite any speakers or co-hosts.</> },
              { text: <>Share the link from the webinar’s card. At the start time, start it from the card and confirm.</> },
              { text: <>After it ends, open the <strong>Past</strong> tab for <strong>Participants</strong> and <strong>Analytics</strong>.</> },
            ]}
          />

          <TutorialSection
            id="leader-groups" eyebrow="Leaders" title="Create a small group"
            path={['Manage', 'Small Groups']}
            steps={[
              { text: <>In your dashboard open <strong>Small Groups</strong> and tap <strong>Create Group</strong>.</>, shot: 'small-group-create.png', alt: 'Creating a small group' },
              { text: <>Enter the <strong>Group Name</strong> and description, then the Meeting Day, Meeting Time and Meeting Frequency.</> },
              { text: <>Choose the Location Type (Physical, Online or Hybrid) and add the address or an Online Meeting Link.</> },
              { text: <>Save, then use <strong>Assign a Small Group Coordinator</strong> to add the people who’ll run it.</> },
              { text: <>Approve join requests from inside the group, schedule meetings and post updates. Members are notified each time.</> },
            ]}
          />

          <TutorialSection
            id="leader-video" eyebrow="Leaders" title="Send a pastoral video message"
            path={['Manage', 'Settings', 'Content', 'New Video Message']}
            steps={[
              { text: <>In your dashboard go to <strong>Settings › Content</strong> and tap <strong>New Video Message</strong>.</>, shot: 'video-message.png', alt: 'New Video Message' },
              { text: <>Record on the spot or upload a video.</> },
              { text: <>Add a title, speaker and category.</> },
              { text: <>Publish now, schedule it, or save it as a draft. On publish every member gets a push notification.</> },
              { text: <>Pin it to keep it at the top of the list for the week.</> },
            ]}
          />

          <TutorialSection
            id="leader-translation" eyebrow="Leaders" title="Run live translation"
            path={['Manage', 'Live', 'Live Translation', 'Service']}
            steps={[
              { text: <>In your dashboard open <strong>Live › Live Translation</strong>. You’ll see three tabs: <strong>Service</strong>, <strong>Devices</strong> and <strong>Settings</strong>.</>, shot: 'translation-service.png', alt: 'Live Translation › Service' },
              { text: <>On <strong>Service</strong>, tap <strong>Start Service</strong>.</> },
              { text: <>Enter a <strong>Service name</strong>, pick the <strong>Speaker’s language</strong> (choosing it is more accurate than Auto-detect) and the <strong>Target language</strong>, and leave the engine on <strong>Auto</strong>.</>, shot: 'translation-start.png', alt: 'Starting a translation service' },
              { text: <>You get two links. Send the <strong>Speaker link</strong> to whoever is preaching, and share the <strong>Listener link</strong> (or its QR code) with the congregation.</> },
              { text: <>The speaker opens their link and allows the microphone. Translation starts as soon as they speak. They can tap a misheard word to teach it for next time.</> },
              { text: <>Streaming with OBS? Use the <strong>Captions in OBS</strong> button on the session to get a caption overlay for your broadcast.</> },
              { text: <>When the service ends, tap the stop button on the session.</> },
            ]}
            tip="Under Settings › Approved Vocabulary, add names, places and church phrases your pastor uses often. The translation engine listens out for them, which cuts down on misheard words."
          />

          <TutorialSection
            id="leader-giving" eyebrow="Leaders" title="Set up giving and Gift Aid"
            path={['Manage', 'Settings', 'Finance & Billing']}
            steps={[
              { text: <>In your dashboard go to <strong>Settings › Finance &amp; Billing</strong>.</>, shot: 'finance.png', alt: 'Finance & Billing settings' },
              { text: <>Connect a payment provider so members can give by card.</> },
              { text: <>UK ministries: open the Gift Aid settings and enter your charity details.</> },
              { text: <>Gifts with a Gift Aid declaration are tracked for you. Review eligible donations and export them to claim from HMRC.</> },
              { text: <>Track one-off and regular giving under <strong>Ministry › Donations</strong>.</> },
            ]}
          />

          <section id="help" className="guide-section">
            <p className="eyebrow">Need a hand?</p>
            <h2>We’re here to help</h2>
            <p>If a screen looks different from what’s described here, or you get stuck on a step, get in touch and we’ll walk you through it. For an overview of what each feature is for, see <a href="/guide" style={{ color: '#c4b5fd' }}>The Rekindle Guide</a>.</p>
            <div className="guide-contact">
              <div>
                <strong>Rekindle Digital Missions</strong>
                <span>{WEBSITE}</span>
              </div>
              <div>
                <strong>{CONTACT_NAME}</strong>
                <span>{CONTACT_EMAIL} &middot; {CONTACT_PHONE}</span>
              </div>
            </div>
            <blockquote className="guide-verse">
              &ldquo;Your word is a lamp to my feet and a light to my path.&rdquo;
              <cite>Psalm 119:105</cite>
            </blockquote>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RekindleTutorialPage;
