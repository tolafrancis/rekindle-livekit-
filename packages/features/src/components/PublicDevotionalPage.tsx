import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { usePageMeta } from '../usePageMeta';
import { devotionalPath, REKINDLE_DEVOTIONAL_STREAM_ID } from '../devotionalLinks';
import { PublicPageShell } from './PublicPageShell';

// /devotionals/:id/:slug — one of Rekindle's own devotionals as a public page
// search engines can index. Signed-in people go to it in the app.

interface Devotional {
  id: number; title: string | null; theme: string | null; schedule_date: string | null;
  scripture_reference: string | null; scripture_text: string | null; scripture_version: string | null;
  message: string | null; content: string | null; prayer: string | null;
  reflection_questions: string[] | string | null;
  bible_passage_reference: string | null; bible_passage_text: string | null;
  cover_image_url: string | null; image_url: string | null;
  created_at: string; updated_at: string | null;
}

const parseList = (value: string[] | string | null): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
};

export const formatDevotionalDate = (date: string | null) =>
  date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

const today = () => new Date().toISOString().slice(0, 10);

const PublicDevotionalPage: React.FC = () => {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [related, setRelated] = useState<Array<{ id: number; title: string | null }>>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('devotionals')
        .select('id, title, theme, schedule_date, scripture_reference, scripture_text, scripture_version, message, content, prayer, reflection_questions, bible_passage_reference, bible_passage_text, cover_image_url, image_url, created_at, updated_at')
        .eq('id', id).eq('is_published', true).eq('stream_id', REKINDLE_DEVOTIONAL_STREAM_ID)
        .or(`schedule_date.is.null,schedule_date.lte.${today()}`)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setState('missing'); return; }
      setDevotional(data as Devotional);
      setState('ready');
      const { data: more } = await supabase.from('devotionals')
        .select('id, title').eq('is_published', true).eq('stream_id', REKINDLE_DEVOTIONAL_STREAM_ID).neq('id', id)
        .lte('schedule_date', today()).order('schedule_date', { ascending: false }).limit(6);
      if (!cancelled) setRelated((more as Array<{ id: number; title: string | null }>) ?? []);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const body = devotional?.message || devotional?.content || '';
  const image = devotional?.cover_image_url || devotional?.image_url || undefined;
  usePageMeta(devotional ? {
    title: `${devotional.title || 'Daily Devotional'}${devotional.scripture_reference ? ` (${devotional.scripture_reference})` : ''}: Daily Devotional`,
    description: (devotional.theme || body).replace(/\s+/g, ' ').slice(0, 158),
    image,
  } : null);

  if (user && id) return <Navigate to={`/daily-devotional/${id}`} replace />;

  if (state === 'loading') {
    return <PublicPageShell><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div></PublicPageShell>;
  }
  if (state === 'missing' || !devotional) {
    return (
      <PublicPageShell>
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold">This devotional isn't available</h1>
          <p className="mt-2 text-gray-500">It may have been moved or unpublished.</p>
          <Link to="/devotionals" className="mt-6 inline-block font-semibold text-purple-700 hover:underline">Browse all devotionals</Link>
        </div>
      </PublicPageShell>
    );
  }

  const questions = parseList(devotional.reflection_questions);
  const published = devotional.schedule_date || devotional.created_at.slice(0, 10);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: devotional.title,
    description: devotional.theme || undefined,
    image,
    datePublished: published,
    dateModified: devotional.updated_at || published,
    author: { '@type': 'Organization', name: 'ReKindle BC', url: 'https://rekindlebc.com' },
    publisher: { '@type': 'Organization', name: 'ReKindle BC', logo: { '@type': 'ImageObject', url: 'https://rekindlebc.com/icon-192.png' } },
    mainEntityOfPage: `https://app.rekindlebc.com${devotionalPath(devotional)}`,
  };

  return (
    <PublicPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/devotionals" className="hover:underline">Devotionals</Link> <span aria-hidden>›</span> <span>{devotional.title}</span>
      </nav>

      <article className="mt-4 space-y-8">
        <header className="space-y-2">
          {devotional.schedule_date && <p className="text-sm font-medium uppercase tracking-wide text-purple-700">{formatDevotionalDate(devotional.schedule_date)}</p>}
          <h1 className="text-3xl font-bold leading-tight text-gray-900">{devotional.title}</h1>
          {devotional.theme && <p className="text-lg leading-relaxed text-gray-600">{devotional.theme}</p>}
        </header>

        {devotional.scripture_reference && (
          <blockquote className="rounded-xl border-l-4 border-purple-400 bg-purple-50 p-5">
            {devotional.scripture_text && <p className="whitespace-pre-line italic text-gray-800">{devotional.scripture_text}</p>}
            <cite className="mt-2 block text-sm font-semibold not-italic text-purple-800">
              {devotional.scripture_reference}{devotional.scripture_version ? ` (${devotional.scripture_version})` : ''}
            </cite>
          </blockquote>
        )}

        {body && <div className="whitespace-pre-line text-lg leading-relaxed text-gray-800">{body}</div>}

        {devotional.bible_passage_reference && (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">Bible reading: {devotional.bible_passage_reference}</h2>
            {devotional.bible_passage_text && <p className="whitespace-pre-line text-gray-700">{devotional.bible_passage_text}</p>}
          </section>
        )}

        {questions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">Reflect</h2>
            <ul className="list-disc space-y-1 pl-5 text-gray-700">
              {questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </section>
        )}

        {devotional.prayer && (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">Prayer</h2>
            <p className="whitespace-pre-line italic text-gray-800">{devotional.prayer}</p>
          </section>
        )}

        <section className="rounded-2xl bg-gradient-to-br from-purple-700 to-purple-900 p-6 text-white">
          <h2 className="text-xl font-semibold">Get a devotional every morning</h2>
          <p className="mt-1 text-purple-100">Listen hands-free, keep your streak and get daily reminders. Free on ReKindle.</p>
          <Button asChild className="mt-4 bg-white text-purple-800 hover:bg-purple-50">
            <Link to={`/daily-devotional/${devotional.id}`}>Start free</Link>
          </Button>
        </section>
      </article>

      {related.length > 0 && (
        <aside className="mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold text-gray-900">More devotionals</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}><Link to={devotionalPath(r)} className="text-purple-700 hover:underline">{r.title}</Link></li>
            ))}
          </ul>
          <Link to="/devotionals" className="mt-4 inline-block text-sm font-semibold text-gray-600 hover:underline">All devotionals</Link>
        </aside>
      )}
    </PublicPageShell>
  );
};

export default PublicDevotionalPage;
