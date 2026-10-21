import React from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, BookOpen, Church, Globe2, HandCoins, Languages, MessageCircle, QrCode, Radio, Users, Video, Heart,
} from 'lucide-react';
import { usePageMeta } from '../usePageMeta';

// /for-churches on rekindlebc.com: what ReKindle does for a church or
// ministry, written for people searching for church software. Public, so
// search engines can index it; the call to action opens sign-up.

const FEATURES: Array<{ icon: React.ElementType; title: string; body: string }> = [
  { icon: Radio, title: 'Go live without OBS', body: 'Stream your service from a phone or laptop with one tap, or from OBS and any RTMP encoder for bigger setups. Simulcast to YouTube and Facebook, and keep recordings and replays.' },
  { icon: Languages, title: 'Live translation for every listener', body: 'People follow your service or meeting in their own language on their phone, with live captions and audio. Bible verses appear on screen as they are quoted.' },
  { icon: HandCoins, title: 'Gift Aid, submitted to HMRC', body: 'Collect declarations digitally, check every gift against HMRC rules automatically and submit claims straight from your dashboard. No spreadsheets or manual Government Gateway uploads.' },
  { icon: Users, title: 'A church CRM', body: 'Members, visitors, households, volunteers, donors and events in one record, with custom fields, tags and follow-up pipelines for first-timers.' },
  { icon: QrCode, title: 'QR registration and check-in', body: 'Put a QR code on the screen or the welcome desk. Visitors register on their own phone, or at a kiosk, and land in your CRM ready for follow-up.' },
  { icon: MessageCircle, title: 'WhatsApp, email and push broadcasts', body: 'Reach your congregation with approved WhatsApp templates through Meta or Twilio, plus email and push, with segmented lists and delivery analytics.' },
  { icon: Video, title: 'Meetings and webinars', body: 'Host prayer meetings, Bible studies and webinars with guest speakers, background blur and recordings, all in the browser.' },
  { icon: Heart, title: 'Small groups', body: 'Give each small group its own space to meet, share and pray, with leaders who can look after their members.' },
  { icon: BookOpen, title: 'Your devotionals and prayer campaigns', body: 'Publish your own daily devotionals and prayer series, with audio narration and reminders, so members start each day with your church.' },
  { icon: Church, title: 'Your branding', body: 'Your name, logo and colours on your ministry dashboard and join pages, and your own domain if you want one.' },
  { icon: BarChart3, title: 'Analytics and exports', body: 'See attendance, engagement and giving trends over time, and export anything to CSV.' },
  { icon: Globe2, title: 'Apps for everyone', body: 'Members use ReKindle on the web or in the mobile app. Leaders run everything from the same account.' },
];

const FAQ: Array<[string, string]> = [
  ['How much does ReKindle cost for a church?', 'You can create a ministry and start for free. Larger needs, like more meeting hours or live channels, are covered by partner plans you can choose later.'],
  ['Do we need streaming equipment?', 'No. A phone or laptop is enough to go live. If you already use OBS or a hardware encoder, you can stream from that instead.'],
  ['Can we claim Gift Aid through ReKindle?', 'Yes, for UK charities and churches. ReKindle manages declarations, works out what can be claimed and submits the claim to HMRC for you.'],
  ['Can our members keep using WhatsApp?', 'Yes. You can send broadcasts and reminders to WhatsApp, and members can choose to get their daily devotional there too.'],
];

const ForChurchesPage: React.FC = () => {
  usePageMeta({
    title: 'Church Management Software with Live Streaming and Gift Aid',
    description: 'ReKindle gives churches live streaming without OBS, live translation, a church CRM, QR check-in, WhatsApp broadcasts and Gift Aid submitted to HMRC. Start free.',
  });

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const signUp = (label: string, className: string) => (
    <Link to="/auth" state={{ mode: 'signup' }} className={className}>{label}</Link>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-xl font-bold" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            Re<span className="text-purple-600">Kindle</span> BC
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link to="/auth" className="text-gray-600 hover:text-gray-900">Sign in</Link>
            {signUp('Start free', 'rounded-full bg-purple-600 px-4 py-1.5 text-white hover:bg-purple-700')}
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-gradient-to-b from-purple-50 to-white">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">For churches and ministries</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">Everything your church needs, in one place</h1>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              Stream your services, translate them live, look after your members, send WhatsApp broadcasts and claim Gift Aid,
              without stitching together five different tools.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {signUp('Create your ministry, free', 'rounded-full bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700')}
              <a href="#features" className="rounded-full border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50">See what's included</a>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <h2 className="text-center text-3xl font-bold">What your church gets</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border p-5">
                <Icon className="h-6 w-6 text-purple-600" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h2 className="text-3xl font-bold">How to get started</h2>
          <ol className="mt-6 space-y-4">
            {[
              ['Create your ministry', 'Sign up and add your church name, logo and colours. It takes a few minutes.'],
              ['Invite your members', 'Share your join link or QR code. Members join from their phone on the web or the app.'],
              ['Go live on Sunday', 'Start a live service from your phone or laptop, with translation and replays switched on.'],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 font-semibold text-white">{i + 1}</span>
                <div><h3 className="font-semibold">{title}</h3><p className="text-gray-600">{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h2 className="text-3xl font-bold">Questions churches ask</h2>
          <dl className="mt-6 divide-y">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-4">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-gray-600">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
          <div className="rounded-2xl bg-gradient-to-br from-purple-700 to-purple-900 p-8 text-center text-white">
            <h2 className="text-2xl font-bold">Bring your church onto ReKindle</h2>
            <p className="mt-2 text-purple-100">Start free. Add the rest as your ministry grows.</p>
            {signUp('Create your ministry', 'mt-6 inline-block rounded-full bg-white px-6 py-3 font-semibold text-purple-800 hover:bg-purple-50')}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-gray-500">
        <Link to="/" className="hover:underline">Home</Link>
        <span className="mx-2" aria-hidden>·</span>
        <a href="https://app.rekindlebc.com/guide" className="hover:underline">Guide</a>
        <span className="mx-2" aria-hidden>·</span>
        <Link to="/privacy" className="hover:underline">Privacy</Link>
        <span className="mx-2" aria-hidden>·</span>
        <a href="mailto:hello@rekindlebc.com" className="hover:underline">hello@rekindlebc.com</a>
      </footer>
    </div>
  );
};

export default ForChurchesPage;
