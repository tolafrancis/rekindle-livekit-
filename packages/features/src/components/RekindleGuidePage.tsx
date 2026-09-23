import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const COMPANY = 'ReKindle BC';
const WEBSITE = 'rekindlebc.com';
const CONTACT_NAME = 'Tola Francis';
const CONTACT_EMAIL = 'tolafrancis@rekindlebc.com';
const CONTACT_PHONE = '+84 91 831 6417';

interface FeatureSectionProps {
  id: string;
  eyebrow?: string;
  title: string;
  what?: string;
  how?: string[];
  cases?: string[];
  note?: string;
}

// One "WHAT IT IS / HOW TO USE IT / USE CASES" feature block — mirrors the
// structure every feature page in the original Rekindle Guide PDF uses, so
// this reads as the same document, not a redesign.
const FeatureSection: React.FC<FeatureSectionProps> = ({ id, eyebrow, title, what, how, cases, note }) => (
  <section id={id} className="guide-section">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2>{title}</h2>
    {what && (
      <>
        <p className="kicker">What it is</p>
        <p>{what}</p>
      </>
    )}
    {how && how.length > 0 && (
      <>
        <p className="kicker">How to use it</p>
        <ol className="steps">
          {how.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </>
    )}
    {cases && cases.length > 0 && (
      <>
        <p className="kicker">Use cases &amp; where to use it</p>
        <ul className="cases">
          {cases.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </>
    )}
    {note && <div className="note">{note}</div>}
  </section>
);

// The quick-jump pills shown right under the subtitle — a curated subset of
// TOC_ITEMS' ids, so they scroll to the same sections.
const PILL_LINKS: Array<[string, string]> = [
  ['prayer', 'Prayer'],
  ['devotionals', 'Devotionals'],
  ['live-channels', 'Live Channels'],
  ['crm', 'Ministry CRM'],
  ['small-groups', 'Small Groups'],
  ['giving', 'Giving & Gift Aid'],
];

const TOC_ITEMS: Array<[string, string]> = [
  ['welcome', 'Welcome to Rekindle'],
  ['why', 'Why Rekindle fits a ministry'],
  ['creating-ministry', 'Creating Your Ministry'],
  ['devotionals', 'Daily Devotionals'],
  ['prayer', 'Prayer Wall & Prayer Library'],
  ['live-channels', 'Live Channels'],
  ['video', 'Interactive Meetings'],
  ['webinars', 'Webinars'],
  ['crm', 'Ministry Management (CRM)'],
  ['qr', 'QR Self-Registration'],
  ['kiosk', 'Kiosk Check-in'],
  ['inbox', 'Evangelism Inbox'],
  ['giving', 'Giving & Gift Aid'],
  ['notifications', 'Notifications & Consent'],
  ['discipleship', 'Discipleship Tools'],
  ['small-groups', 'Small Groups'],
  ['whatsapp-setup', 'Connect WhatsApp — Step by Step'],
  ['pastoral', 'Pastoral Messages'],
  ['translation', 'Live Translation'],
  ['where', 'Where to use Rekindle'],
  ['privacy', 'Data protection & safeguarding'],
  ['bringing', 'Bringing Rekindle to your ministry'],
];

const RekindleGuidePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0d0a1e 0%, #0a0718 100%)', color: '#fff' }}>
      <style>{`
        .guide-body h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.6rem; font-weight: 700; color: #fff; margin: 0 0 .9rem; }
        .guide-body p { font-size: .92rem; color: rgba(255,255,255,.65); line-height: 1.85; margin-bottom: .9rem; }
        .guide-body .eyebrow { font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #a78bfa; margin: 0 0 .5rem; }
        .guide-body .kicker { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.35); margin: 1.4rem 0 .6rem; }
        .guide-body .steps, .guide-body .cases { list-style: none; padding: 0; margin: 0 0 .9rem; display: flex; flex-direction: column; gap: .6rem; }
        .guide-body .steps li { display: grid; grid-template-columns: 1.6rem 1fr; gap: .65rem; font-size: .92rem; color: rgba(255,255,255,.65); line-height: 1.6; counter-increment: step; }
        .guide-body .steps { counter-reset: step; }
        .guide-body .steps li::before { content: counter(step); font-family: 'Cormorant Garamond', serif; font-weight: 700; font-size: .9rem; color: #a78bfa; width: 1.6rem; height: 1.6rem; border-radius: 999px; border: 1px solid rgba(167,139,250,.35); display: flex; align-items: center; justify-content: center; }
        .guide-body .cases li { padding-left: 1rem; position: relative; font-size: .92rem; color: rgba(255,255,255,.65); line-height: 1.6; }
        .guide-body .cases li::before { content: ''; position: absolute; left: 0; top: .6em; width: 5px; height: 5px; border-radius: 999px; background: #a78bfa; }
        .guide-body .note { margin-top: .8rem; padding: .9rem 1.05rem; background: rgba(167,139,250,.06); border: 1px solid rgba(167,139,250,.15); border-left: 3px solid #a78bfa; border-radius: 6px; font-size: .87rem; color: rgba(255,255,255,.6); line-height: 1.7; }
        .guide-section { padding-bottom: 2.6rem; margin-bottom: 2.6rem; border-bottom: 1px solid rgba(167,139,250,.1); }
        .guide-section:last-of-type { border-bottom: none; margin-bottom: 0; }
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
          <p style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 10 }}>Guide &amp; proposal</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.6rem', fontWeight: 700, color: '#fff', marginBottom: 12 }}>The Rekindle Guide</h1>
          <p style={{ fontSize: '.95rem', color: 'rgba(255,255,255,.55)', maxWidth: 560, lineHeight: 1.7 }}>
            Connect your congregation. Disciple your members. Rekindle the fire.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
            {PILL_LINKS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="guide-pill">{label}</a>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 40, padding: '1.3rem 1.5rem', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(167,139,250,.12)', borderRadius: 10 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 12 }}>Contents</p>
          <nav className="guide-toc">
            {TOC_ITEMS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>{label}</a>
            ))}
          </nav>
        </div>

        <div className="guide-body">
          <section id="welcome" className="guide-section">
            <p className="eyebrow">Introduction</p>
            <h2>Welcome to Rekindle</h2>
            <p>Rekindle is a complete digital home for your ministry. Instead of stitching together a video-calling tool, a giving page, a members’ spreadsheet, a social media inbox and a devotional broadcast, Rekindle brings them into one warm, easy-to-use app that works on any phone, tablet or computer — and installs to the home screen like a native app.</p>
            <p>It has been built from the ground up for ministry rhythms: gathering people to pray, feeding them daily in the Word, broadcasting services and teachings, welcoming and caring for members, reaching the lost, and receiving generous giving — including reclaiming Gift Aid. Everything is bilingual-ready and designed to be affordable and simple enough for a small team to run.</p>
          </section>

          <section id="why" className="guide-section">
            <p className="eyebrow">The case for Rekindle</p>
            <h2>Why Rekindle fits a global ministry</h2>
            <ul className="cases">
              <li><strong>One platform</strong> — replace several disconnected tools with a single, joined-up system your whole ministry can use.</li>
              <li><strong>Works everywhere</strong> — available on all platforms; no app-store download needed, it installs straight from the web to any device.</li>
              <li><strong>Bilingual</strong> — present everything in English and a second language, ideal for multicultural and diaspora congregations.</li>
              <li><strong>Privacy and safeguarding first</strong> — consent is recorded for every contact, in line with UK GDPR.</li>
            </ul>
            <p className="kicker">Why Rekindle fits a UK ministry</p>
            <ul className="cases">
              <li><strong>Gift Aid built in</strong> — capture declarations and (once HMRC recognition is complete) submit claims to HMRC directly from the app.</li>
              <li><strong>Privacy and safeguarding first</strong> — consent is recorded for every contact, in line with UK GDPR.</li>
              <li><strong>Works everywhere</strong> — no app-store download needed; it installs straight from the web to any device.</li>
              <li><strong>Bilingual</strong> — present everything in English and a second language, ideal for multicultural and diaspora congregations.</li>
            </ul>
            <p className="kicker">Getting started</p>
            <p>Setting up takes minutes. Members create a free account, and your leaders are given administrative access to your ministry’s space.</p>
            <ol className="steps">
              <li>Open the app and tap <strong>Sign up</strong> to create an account with an email and password.</li>
              <li>Confirm your email, then sign in.</li>
              <li>Add the app to your home screen when prompted, so it opens full-screen like a normal app.</li>
              <li>Leaders: create your ministry space and invite your team.</li>
            </ol>
          </section>

          <FeatureSection
            id="creating-ministry" eyebrow="Setup Guide" title="Creating Your Ministry"
            what="A ministry is your church or organisation's own space inside Rekindle — its own subdomain (e.g. grace.rekindlebc.com), branding, members and everything covered in the rest of this guide. Creating one isn't available on the free plan: you need to be a Ministry Partner (a paid tier) or a platform admin. Becoming a Partner is a personal account upgrade, separate from any one ministry's own settings."
            how={[
              'Become a Ministry Partner first: tap your profile icon, then Billing (or go directly to Settings → Billing), and choose "Partner Your Ministry" to subscribe. Until this is active, the Create Ministry button won’t appear anywhere in the app.',
              'From the main navigation, tap Ministries — a Create Ministry button now appears at the top of the page.',
              'Fill in the form: Ministry Name, Web Address (this becomes your subdomain — you can connect your own custom domain later), Description, a Logo and Featured Image, Category and Location, and Country (choosing United Kingdom is what unlocks Gift Aid later). The Web Address auto-fills from your Ministry Name, so remember to edit it down to something short — left untouched, "Grace Community Church" becomes gracecommunitychurch.rekindlebc.com instead of a shorter, easier link like grace.rekindlebc.com.',
              'Add a Welcome Message for new members and pick a Theme Colour for your ministry’s branding.',
              'Choose your Join Method: Open (anyone can join immediately), Approval Required, or Invite Only.',
              'Tap Create Ministry. You land in your new ministry’s dashboard as its leader, ready to invite your team and set up devotionals, giving, QR self-registration and everything else in this guide.',
            ]}
            cases={[
              'A church planting its first digital presence.',
              'A ministry network creating a dedicated space for a new campus, chapter or language group.',
            ]}
            note="Country matters beyond display: it drives region-specific features like UK Gift Aid, so choose carefully — it isn't just a label. Also double-check the Web Address before saving — it can't be changed as easily later, so a short, memorable slug now saves an awkward link forever."
          />

          <FeatureSection
            id="devotionals" eyebrow="Feature" title="Daily Devotionals"
            what="A beautiful daily devotional reader. Your ministry can publish its own devotionals — each with a teaching, a Scripture passage and a second Bible passage — and members read them in a gentle, slide-by-slide experience that scrolls hands-free for longer readings and closes in guided prayer."
            how={[
              'Leaders: from the main navigation, tap Ministries, open Manage, then go to Settings → Content — the devotional creator is there. Write the title and message, add the Scripture and Bible passages, and tap "Load" to pull in the verse text automatically in your chosen Bible version.',
              'Members: from the main navigation, tap The Word, then Devotionals — choose the source (the daily devotional or "My Ministry") and read.',
            ]}
            cases={[
              'A daily word for the whole congregation between Sundays.',
              'A devotional series tied to a sermon series or season (Advent, Lent, a fast).',
              'Small groups reading the same devotional and discussing it midweek.',
            ]}
          />

          <FeatureSection
            id="prayer" eyebrow="Feature" title="Prayer Wall & Prayer Library"
            what="The Prayer Wall lets members share prayer requests and stand with one another — wherever they are. The Prayer Library offers guided prayer topics and declarations to pray through, and members can build a habit with Scripture memory and a personal prayer journal."
            how={[
              'From the main navigation, tap Prayer, then Prayer Wall to post a request or pray for others.',
              'Still under Prayer, open Prayer Library to pray through guided topics, or Journal to set a verse to memorise and keep a personal prayer journal.',
            ]}
            cases={[
              'Sharing a need and inviting the whole ministry to pray, any time of day.',
              'Intercession — standing with requests from across the congregation, even a national or diaspora network.',
              'Personal devotion — a quiet place to pray, journal and memorise Scripture.',
            ]}
          />

          <FeatureSection
            id="live-channels" eyebrow="Feature" title="Live Channels — broadcasting your services"
            what="Live Channels is your ministry’s broadcasting home. Go live to your congregation straight from a phone or computer camera, or stream a polished production from professional software (OBS or any encoder). Your audience watches a smooth, one-to-many livestream — so a service can reach an unlimited number of viewers, and past broadcasts are saved automatically for catch-up."
            how={[
              'Members: from the main navigation, tap Live Broadcast, then Discover to find live and past broadcasts, or My Channels to watch your ministry’s stream.',
              'Leaders: open Live Broadcast and tap Go Live to broadcast from your camera, or use Broadcast setup (OBS / encoder) for a studio-quality stream.',
              'Share the channel link; members open it and watch live — no sign-in barrier to viewing.',
              'After the service, the recording is available to re-watch.',
            ]}
            cases={[
              'Streaming Sunday services to members who are unwell, travelling or housebound.',
              'Reaching seekers and the wider community far beyond your building.',
              'Conferences, revival nights and guest-speaker events broadcast to other parishes.',
            ]}
          />

          <FeatureSection
            id="video" eyebrow="Feature" title="Interactive Meetings"
            what="Face-to-face video meetings for teams, groups and classes. Everyone in the call can see and hear one another, chat and send live reactions. Ministry leaders can record the meeting, get AI insights afterwards, and see a record of who attended — who joined, when, and for how long."
            how={[
              'In your ministry’s dashboard (Ministries → Manage), open the Interactive Meetings tab.',
              'Create a meeting — an Instant Meeting to start now, or a Scheduled Meeting for later — and choose who can join: Public, Members Only or Leaders Only.',
              'Use the copy-link button on the meeting card to share the invite by message, email or WhatsApp.',
              'Recording: on the meeting card, tap Rec On / Rec Off to choose whether the meeting is recorded. Set this before the meeting starts — it can’t be changed while the meeting is live. Once a meeting has been recorded, tap Recordings on the card to watch it back.',
              'Participants record: on the meeting card, tap Participants to see who attended. The list shows the total number of participants and, for each person, their name, when they joined and how long they were in the call. Guests are labelled “(guest)”, and anyone still in a live meeting is marked “in call”.',
              'Tap Insights on the card to see AI insights from previous sessions of the meeting.',
            ]}
            cases={[
              'Leadership and ministry-team meetings.',
              'Bible studies, membership classes and new-believer courses.',
              'Taking attendance for classes and courses without a register — the Participants list records it for you.',
            ]}
            note="The Rec On/Off, Recordings, Insights and Participants buttons are only shown to ministry leaders. The Participants list contains members’ personal information, so it’s kept private to the people running the meeting."
          />

          <FeatureSection
            id="webinars" eyebrow="Feature" title="Webinars"
            what="A broadcast format for larger gatherings. The host, plus any speakers and co-hosts they invite, present to an audience. The audience watches and joins in through chat, Q&A, polls and live reactions, and can raise a hand to be invited up to speak. Webinars can be recorded, captioned and translated live. After a webinar, leaders can see analytics and a full record of who attended."
            how={[
              'In your ministry’s dashboard (Ministries → Manage), open the Webinars tab and tap New webinar.',
              'Add a title, description and cover image, then pick the date, time, timezone and duration, and set a maximum number of attendees.',
              'Choose whether the webinar is Public and whether attendees must register first.',
              'Recording: switch Recording on, and choose its visibility — Private (host & admins only) or Public (shown in the ministry’s Recordings tab). You can also switch on Captions and Live translation and pick a default language.',
              'Under Audience interaction, choose which of Chat, Q&A and Polls to allow, and add any speakers or co-hosts.',
              'Share the webinar with the copy-link button on its card. When it’s time, start the webinar from its card and confirm — attendees can then join.',
              'Participants record: after the webinar, open the Past tab and tap the Participants button (the people icon) on its card. You’ll see everyone who actually attended — their name, when they joined and how long they stayed — whether or not registration was required.',
              'Tap Analytics on a past webinar’s card to see attendance, engagement and replay figures. If registration was on, you’ll also see a registrants table showing each registrant’s status and how long they stayed.',
              'Recorded webinars appear in the Recordings tab of the Webinars page.',
            ]}
            cases={[
              'Q&A evenings, conferences and guest-speaker events.',
              'Training for volunteers and leaders.',
              'Following up attendees afterwards — use the Participants list to see who came and for how long.',
            ]}
            note="The Participants list and Analytics are only available to ministry leaders, and only once the webinar has finished."
          />

          <FeatureSection
            id="crm" eyebrow="Feature" title="Ministry Management (CRM) — Members & Ministries"
            what="A proper ministry management system. Organise your ministry into groups, keep rich member records, assign leaders and roles, and see at a glance how your congregation is growing — total members, who is active, who is new this month, and attendance over time."
            how={[
              'From the main navigation, tap Ministries, then Manage to open your ministry’s dashboard, and create your ministries and invite or add members.',
              'Go to Settings → People to open the Members list and view everyone — including those who registered themselves — with roles, status and attendance.',
              'Assign roles (Leader, Admin, Content editor, Member), and import or export your membership as a spreadsheet at any time.',
            ]}
            cases={[
              'A single, reliable record of your congregation — no more scattered spreadsheets.',
              'Delegating responsibility clearly across ministry leaders.',
              'Understanding engagement and following up with members who have drifted.',
            ]}
          />

          <FeatureSection
            id="qr" eyebrow="Feature" title="QR Self-Registration"
            what="A printed QR code that lets new people register themselves in seconds. They scan, fill in a short form — including the consent choices your ministry needs — and they are added to your records, ready for you to welcome and follow up."
            how={[
              'In your ministry’s dashboard (Ministries → Manage), go to Settings → General to find your QR Self-Registration code — generate it and display or print it for services and events.',
              'Newcomers scan it and complete the short registration form on their own phone.',
              'Leaders review new sign-ups in Settings → People, where likely duplicates are flagged automatically, and approve them into the membership.',
            ]}
            cases={[
              'A welcome desk for first-time visitors.',
              'Sign-up for events, courses, camps and conventions.',
              'Capturing contacts at outreach events for follow-up.',
            ]}
          />

          <FeatureSection
            id="kiosk" eyebrow="Feature" title="Kiosk Check-in"
            what="Turn a tablet at your entrance into a self-service welcome desk. As people arrive, regulars check themselves in with their phone number or email — and their attendance is recorded automatically — while first-time visitors register on the spot. No volunteer with a clipboard, no data to type up afterwards: it all flows straight into your ministry records."
            how={[
              'In your ministry’s dashboard (Ministries → Manage), go to Settings → General to set a short kiosk PIN and enable kiosk mode.',
              'On the tablet you want to use, open your ministry’s kiosk link and tap Activate this device — it opens the full-screen kiosk.',
              'At the door, members tap to check in (recording their attendance) or register if they are new.',
              'The kiosk clears each person’s details before the next, and can only be closed with your PIN — so it is safe to leave unattended.',
            ]}
            cases={[
              'Self-service attendance at the entrance to your Sunday service.',
              'A welcome point where visitors register themselves.',
              'Check-in for midweek meetings, youth gatherings, conferences and camps.',
            ]}
            note="Because attendance is captured automatically, your leaders can see who is attending regularly, who is new, and who may need a pastoral call — insight a paper sign-in sheet could never give."
          />

          <FeatureSection
            id="inbox" eyebrow="Feature" title="Multi-Channel Evangelism Inbox"
            what="Every message your ministry receives across WhatsApp, Facebook Messenger and Instagram, gathered into one inbox. Your team can respond from a single place, and conversations that need spiritual care can be passed to a counsellor for follow-up — so no seeker slips through the cracks."
            how={[
              'In your ministry’s dashboard (Ministries → Manage), go to Settings → Engagement to find the Evangelism Inbox and connect your ministry’s messaging channels.',
              'Respond to incoming messages from one shared inbox.',
              'Escalate significant conversations to a designated counsellor.',
            ]}
            cases={[
              'Following up enquiries from social-media outreach and adverts.',
              'Caring for seekers and new contacts through to a real conversation.',
              'Coordinating a team so replies are prompt and nothing is missed.',
            ]}
          />

          <FeatureSection
            id="giving" eyebrow="Feature" title="Giving & Gift Aid — direct to HMRC"
            what="Rekindle lets your members give easily — one-off or regularly — with secure card payments. For UK ministries, Gift Aid is built in: members add a Gift Aid declaration when they give, and the app keeps track of which gifts are eligible."
            note="In communication with HMRC. We are in active communication with HM Revenue & Customs and are completing HMRC’s Charities Online software-recognition process. Once recognition is in place, your ministry will be able to prepare and submit Gift Aid (R68) claims to HMRC directly from within Rekindle — no spreadsheets and no separate Government Gateway portal to wrestle with. Currently, you can extract manually and submit."
            how={[
              'Members: tap your profile icon in the top right, then Donate (Give) from the Account menu — add a Gift Aid declaration as you give, and the app stores it with your consent.',
              'Leaders: in your ministry’s dashboard (Ministries → Manage), go to Settings → Finance & Billing to connect a payment provider and manage Gift Aid.',
              'Rekindle works out which donations are eligible and assembles the claim for you.',
              'Before anything is sent, the claim is checked against HMRC’s rules so errors are caught early.',
              'With one step, the claim is submitted to HMRC from inside the app, and its progress is tracked.',
            ]}
            cases={[
              'Collecting tithes, offerings and one-off gifts online.',
              'Reclaiming the 25% Gift Aid uplift on eligible giving without manual paperwork.',
              'Keeping clean, auditable giving and Gift Aid records in one place.',
            ]}
          />

          <FeatureSection
            id="notifications" eyebrow="Feature" title="Notifications & Consent"
            what="Keep your ministry informed with notifications members actually want — and only those they have agreed to. Every member controls which messages they receive, and their consent is recorded, in keeping with UK data-protection expectations."
            how={[
              'Tap your profile icon in the top right, then Profile to open Settings.',
              'Go to the Notifications group to choose what you receive — In-app & Email, Push, WhatsApp, and Daily Reminders — each with its own toggle.',
            ]}
            cases={[
              'Reminders for services, prayer meetings and events.',
              'Letting members know when the ministry is live.',
              'Sharing the daily devotional or an urgent prayer request.',
            ]}
          />

          <FeatureSection
            id="discipleship" eyebrow="Feature" title="Discipleship Tools"
            what="Beyond Sundays, Rekindle helps members grow: a Scripture memory tool, reading plans to journey through the Bible, and a space to record and share what God is saying."
            how={[
              'From the main navigation, tap The Word, then Reading Plan, Scripture Memory or Books.',
              'To share what God is saying, tap Community, then Revelations.',
            ]}
            cases={[
              'Encouraging daily time in the Word with reading plans.',
              'Helping members hide Scripture in their hearts.',
              'Sharing testimonies and revelations to build up the body.',
            ]}
          />

          <FeatureSection
            id="small-groups" eyebrow="Feature" title="Small Groups"
            what="Small Groups brings your home groups, cell groups and Bible-study circles into Rekindle. Ministries create and organise their small groups, members discover and join the ones that fit them, and each group gets its own space to meet, discuss and grow together between Sundays."
            how={[
              'Leaders: from your ministry’s dashboard (Ministries → Manage), open Small Groups to create a group — its name, description and meeting rhythm — and assign coordinators to help run it.',
              'Members: from the main navigation, tap Small Groups, then Discover to browse and request to join the one that fits — or My Groups to see the ones you’re already in.',
              'Group leaders review and approve join requests; the member is notified the moment they’re in.',
              'Inside the group, leaders schedule meetings and post updates, and members discuss together — everyone active in the group is notified whenever a new meeting is set.',
              'A “Share to WhatsApp” button lets a member paste a ready-made invite straight into a WhatsApp group chat the ministry already uses — anyone who taps it joins the ministry (if they’re new) and lands directly inside that small group, no separate signup step.',
              'Members can also opt in to WhatsApp reminders for a group: once a ministry connects its own WhatsApp Business number, new meetings and announcements are sent individually to each opted-in member’s own WhatsApp — never a shared broadcast number — alongside the in-app notification.',
            ]}
            cases={[
              'Home groups and cell groups meeting midweek in members’ houses or online.',
              'Bible-study circles working through a book or a devotional series together.',
              'New-members’ groups walking newcomers through their first months.',
              'Giving every member a smaller, closer community inside a larger ministry.',
              'Inviting an existing WhatsApp group chat into the app without asking everyone to abandon WhatsApp — the app becomes the source of truth for scheduling, while WhatsApp stays the place people already check.',
            ]}
            note="Because small groups sit inside your ministry’s own membership, a leader always has one clear view of who is connected where — a member’s small group is just as visible as their attendance or their role. WhatsApp reminders are opt-in per member and sent from the ministry’s own verified WhatsApp Business number, once connected — never a shared or unverified number."
          />

          <FeatureSection
            id="whatsapp-setup" eyebrow="Setup Guide" title="Connect WhatsApp — Step by Step"
            what="Connecting a ministry's own WhatsApp Business Account (WABA) means every broadcast and Small Group reminder arrives from the ministry's own verified name and number, not a shared one. Setup happens in two places — Meta's own Business Manager, then Rekindle's Connect WhatsApp screen — and takes about 20 minutes, plus a few days waiting on Meta's business verification review before full sending unlocks."
            how={[
              'Create or open a Meta Business Manager account at business.facebook.com, and set up a Business Portfolio for the ministry if one doesn’t exist yet.',
              'At developers.facebook.com/apps, create a new app of type Business linked to that Business Portfolio, then add the WhatsApp product to it.',
              'On the app’s WhatsApp → API Setup page, note the test Phone Number ID and WhatsApp Business Account ID shown there. There’s also a temporary access token — good for trying the connection once, but it expires in 24 hours, so it isn’t the one to use for real.',
              'Register the ministry’s real phone number under WhatsApp → API Setup → Add phone number. It can’t already be active on regular WhatsApp or WhatsApp Business — Meta verifies it by SMS or a voice call. The Business Display Name entered here is permanent: it’s exactly what every recipient sees as the sender, so use the ministry’s real name.',
              'Generate a permanent access token: in Business Settings → Users → System Users, add a system user with Admin access to the WhatsApp Business Account, then generate a token for it with the whatsapp_business_messaging and whatsapp_business_management permissions and no expiry. Copy it immediately — Meta only shows it once.',
              'Start Business Verification under Business Settings → Security Center. This is a manual review by Meta that can take a few days, and is required before the account can message beyond a handful of test numbers.',
              'Add a payment method to the WABA itself, separate from Rekindle’s own billing — Meta charges the ministry directly for conversation costs once its free tier is used up.',
              'On the app’s WhatsApp → Configuration page, set up the webhook so replies people send you actually reach your Evangelism Inbox: Callback URL is https://vpnpembyqbbaaiynfvli.supabase.co/functions/v1/whatsapp-webhook, and Verify Token is a value Rekindle gives you (ask your contact for it — it isn’t something you choose yourself, since it has to match what’s configured on Rekindle’s side). After it verifies, subscribe the webhook to the “messages” field.',
              'While you’re in that app, copy the App Secret from Settings → Basic (click “Show” and confirm your password) — this is what lets Rekindle confirm an incoming message genuinely came from your WhatsApp Business Account, not just anyone who found your webhook URL.',
              'Back in Rekindle, from your ministry’s dashboard (Ministries → Manage), go to Settings → Engagement and open Connect WhatsApp, then choose a plan to unlock the connection screen.',
              'On the Connection tab, choose Enter Credentials Manually and paste in the WABA ID, Phone Number ID, the verified phone number, the Business Display Name, the permanent access token, and the App Secret gathered above (App Secret is optional — without it your Evangelism Inbox still works, just unverified).',
              'Save Credentials, then click Verify — Rekindle confirms the phone number and token directly with Meta and marks the connection Connected once it succeeds.',
              'Once connected, pick an approved message template under Settings → Small Group Notifications (WhatsApp requires one for any message a business sends first), and members can subscribe to ministry-wide WhatsApp updates from their own ministry space.',
            ]}
            note="Two separate bills exist here, and both need to stay funded: Meta charges the ministry directly for WhatsApp conversation costs once its free tier runs out (the payment method added in step 7), while Rekindle separately bills for the platform plan and any broadcast overage beyond what the plan includes. One doesn’t cover the other."
          />

          <FeatureSection
            id="pastoral" eyebrow="Feature" title="Pastoral Messages (Video Messages)"
            what="Pastoral Messages gives your pastor or senior leader a dedicated, direct channel to speak into the lives of every member — beyond Sunday. A pastoral message is a short video, recorded on the spot or uploaded, sent straight to the congregation and delivered as a notification to every member’s phone. In the app itself this feature is labelled Video Messages. Unlike Announcements (which are ministry-wide notices) or the Evangelism Inbox (inbound messages from seekers), a Pastoral Message is a one-to-many word of care, encouragement, direction, or prayer — from shepherd to flock."
            how={[
              'From your ministry’s dashboard (Ministries → Manage), go to Settings → Content, then tap New Video Message.',
              'Record on the spot or upload a video, add a title, speaker and category, and save as a draft or publish immediately (or schedule it).',
              'On publish, every member of the ministry receives a push notification, and the message can be pinned to the top of the list.',
              'Past messages are stored in a searchable, filterable archive — a record of pastoral leadership over time.',
            ]}
            cases={[
              'A midweek word of encouragement or prophetic declaration to the whole ministry.',
              'Urgent pastoral care — reaching every member instantly in a crisis or time of need.',
              'Post-service follow-up from Sunday’s sermon, with a personal reflection or prayer point.',
              'Seasonal messages — Christmas, Easter, fasting seasons, and special occasions.',
              'A short video from the pastor while travelling or on mission.',
            ]}
            note="Every Pastoral Message is logged with a date and time stamp, creating an ongoing record of the spiritual care and direction given to the congregation — useful for accountability, handover, and heritage."
          />

          <section id="translation" className="guide-section">
            <p className="eyebrow">Feature</p>
            <h2>Live Translation — Broadcast &amp; Meetings</h2>
            <p className="kicker">What it is</p>
            <p>Rekindle’s Live Translation brings the power of real-time AI translation directly into your broadcasts and video meetings — so every member can hear and read your service in their own language, without any delay or separate interpreter. Rekindle Live Translation (RLT) listens to a speaker in one language and delivers the translation as live audio and live text to anyone who needs it — whether they are sitting in the same room, joining a meeting online, or watching a broadcast from home.</p>
            <p className="kicker">Broadcast Translation</p>
            <p>As your pastor or speaker preaches live, Rekindle transcribes the audio in real time and displays a rolling translated subtitle at the bottom of the viewer’s screen. Viewers choose their preferred language from a list before or during the stream. Translations are powered by AI and rendered instantly — no human interpreter required.</p>
            <p><em>To use it:</em> from the main navigation, tap Live Broadcast and open a live stream — the language/subtitle picker is on the viewer screen.</p>
            <p className="kicker">Meeting Translation</p>
            <p>During video conferencing and webinars, each participant can enable live captions in their chosen language. When someone speaks, their words appear as translated captions for every other participant who has enabled a different language — enabling truly multilingual leadership meetings, Bible studies, Bible College School of Disciples and prayer sessions.</p>
            <p><em>To use it:</em> inside a video meeting (Live Broadcast → Meetings), tap the Translate/captions button in the call controls and choose your language.</p>
            <p className="kicker">Edge Agent (in-venue hardware, premium add-on)</p>
            <p>An <strong>edge agent</strong> is a small piece of software installed on a dedicated computer at your venue and wired directly into your sound mixer. It runs the same live transcription and translation as Broadcast and Meeting Translation, but delivers the translated audio as its own feed through your venue's sound system — a dedicated language channel a congregant can listen to on the spot — alongside the same translated text everyone can follow on their own phone. It's the physical, in-room counterpart to Rekindle's cloud-based translation: built for ministries that want translated audio available through their existing PA setup, not only on-screen.</p>
            <p><em>Leader setup:</em> from your ministry's dashboard (Ministries → Manage), tap Live, then Live Translation.</p>
          </section>

          <section id="where" className="guide-section">
            <p className="eyebrow">Everyday use</p>
            <h2>Where to use Rekindle</h2>
            <p>Rekindle is designed to be woven through the whole life of your ministry:</p>
            <ul className="cases">
              <li><strong>Sunday services</strong> — broadcast the service on Live Channels and check members in at the door with the kiosk.</li>
              <li><strong>Midweek</strong> — share requests on the Prayer Wall, send out the daily devotional, run a Bible study by video.</li>
              <li><strong>Welcome &amp; follow-up</strong> — register newcomers by QR, care for them, and keep their details safely on file.</li>
              <li><strong>Outreach</strong> — meet seekers in the evangelism inbox and lead them toward a counsellor and a community.</li>
              <li><strong>Giving</strong> — receive tithes and offerings online and reclaim Gift Aid.</li>
              <li><strong>Events</strong> — conferences, camps, conventions and revival nights, broadcast and managed end to end.</li>
            </ul>
          </section>

          <section id="privacy" className="guide-section">
            <p className="eyebrow">Trust</p>
            <h2>Data protection, privacy &amp; safeguarding</h2>
            <p>Caring for people includes caring for their data. Rekindle is built with UK ministries in mind:</p>
            <ul className="cases">
              <li>Consent is recorded for every contact and notification channel, in line with UK GDPR.</li>
              <li>Card payments are handled by trusted, regulated payment providers — card details never touch the app.</li>
              <li>Access is controlled by role, so members only see what they should, and sensitive records are protected.</li>
              <li>Members can request their information and ask to be removed at any time.</li>
              <li>Conversations and member records are kept private to your ministry.</li>
            </ul>
          </section>

          <section id="bringing" className="guide-section">
            <p className="eyebrow">Next</p>
            <h2>Bringing Rekindle to your ministry</h2>
            <p>We would love to help your ministry get started. A typical first step is a short walk-through with your leadership, after which we set up your ministry space, help you publish your first devotional, run a test broadcast, and prepare your giving and Gift Aid.</p>
            <p className="kicker">Next steps</p>
            <ol className="steps">
              <li>Arrange a brief demonstration for your leadership team.</li>
              <li>We create your ministry space and add your initial leaders.</li>
              <li>Together we go live with devotionals, a first broadcast, and giving.</li>
              <li>We support you as your congregation comes on board.</li>
            </ol>
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
              &ldquo;&hellip;that you may proclaim the praises of Him who called you out of darkness into His marvellous light.&rdquo;
              <cite>1 Peter 2:9</cite>
            </blockquote>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RekindleGuidePage;
