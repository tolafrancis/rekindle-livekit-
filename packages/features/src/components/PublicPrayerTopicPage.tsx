import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { BookOpen, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { usePageMeta } from '../usePageMeta';
import { prayerTopicPath } from '../prayerTopicLinks';
import { PublicPageShell } from './PublicPageShell';

// /prayers/:id/:slug — a prayer topic as a public page search engines can index.
// Everyone sees the description, the Scripture and every prayer point's
// heading and verse; the first point is open in full and the rest unlock with
// a free account, matching the shared-link preview (SharedContentPreview).
// Signed-in people go straight to the topic in the app.

interface PrayerPoint { title?: string; content?: string; scripture?: string; scriptureText?: string }
interface Scripture { reference?: string; text?: string }
interface Topic {
  id: string; title: string; description: string | null; cover_image_url: string | null;
  scripture_reference: string | null; scripture_text: string | null;
  prayer_points: PrayerPoint[] | string | null; scriptures: Scripture[] | string | null;
  updated_at: string | null; created_at: string;
}

const parseList = <T,>(value: T[] | string | null): T[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
};

const PublicPrayerTopicPage: React.FC = () => {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [related, setRelated] = useState<Array<{ id: string; title: string }>>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('prayer_topics')
        .select('id, title, description, cover_image_url, scripture_reference, scripture_text, prayer_points, scriptures, updated_at, created_at')
        .eq('id', id).eq('is_published', true).maybeSingle();
      if (cancelled) return;
      if (!data) { setState('missing'); return; }
      setTopic(data as Topic);
      setState('ready');
      const { data: more } = await supabase.from('prayer_topics')
        .select('id, title').eq('is_published', true).neq('id', id)
        .order('created_at', { ascending: false }).limit(6);
      if (!cancelled) setRelated((more as Array<{ id: string; title: string }>) ?? []);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const points = parseList<PrayerPoint>(topic?.prayer_points ?? null);
  const scriptures = parseList<Scripture>(topic?.scriptures ?? null);
  usePageMeta(topic ? {
    title: `${topic.title}: ${points.length > 1 ? `${points.length} Prayer Points` : 'Prayer'} with Scripture`,
    description: (topic.description || `Pray through ${topic.title} with Scripture.`).slice(0, 158),
    image: topic.cover_image_url || undefined,
  } : null);

  if (user && id) return <Navigate to={`/prayer-topics/${id}`} replace />;

  if (state === 'loading') {
    return <PublicPageShell><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div></PublicPageShell>;
  }
  if (state === 'missing' || !topic) {
    return (
      <PublicPageShell>
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold">This prayer isn't available</h1>
          <p className="mt-2 text-gray-500">It may have been moved or unpublished.</p>
          <Link to="/prayers" className="mt-6 inline-block font-semibold text-purple-700 hover:underline">Browse all prayers</Link>
        </div>
      </PublicPageShell>
    );
  }

  const appPath = `/prayer-topics/${topic.id}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: topic.title,
    description: topic.description || undefined,
    image: topic.cover_image_url || undefined,
    datePublished: topic.created_at,
    dateModified: topic.updated_at || topic.created_at,
    author: { '@type': 'Organization', name: 'ReKindle BC', url: 'https://rekindlebc.com' },
    publisher: { '@type': 'Organization', name: 'ReKindle BC', logo: { '@type': 'ImageObject', url: 'https://rekindlebc.com/icon-192.png' } },
    mainEntityOfPage: `https://app.rekindlebc.com${prayerTopicPath(topic)}`,
  };

  return (
    <PublicPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/prayers" className="hover:underline">Prayers</Link> <span aria-hidden>›</span> <span>{topic.title}</span>
      </nav>

      <article className="mt-4 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold leading-tight text-gray-900">{topic.title}</h1>
          {topic.description && <p className="text-lg leading-relaxed text-gray-600">{topic.description}</p>}
        </header>

        {topic.scripture_reference && (
          <blockquote className="rounded-xl border-l-4 border-purple-400 bg-purple-50 p-5">
            {topic.scripture_text && <p className="whitespace-pre-line italic text-gray-800">{topic.scripture_text}</p>}
            <cite className="mt-2 block text-sm font-semibold not-italic text-purple-800">{topic.scripture_reference}</cite>
          </blockquote>
        )}

        {points.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {points.length > 1 ? `${points.length} prayer points` : 'Prayer'}
            </h2>
            <ol className="space-y-6">
              {points.map((p, i) => (
                <li key={i} className="rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900">{i + 1}. {p.title || `Prayer point ${i + 1}`}</h3>
                  {p.scripture && (
                    <p className="mt-2 text-sm text-gray-600">
                      <BookOpen className="mr-1 inline h-3.5 w-3.5 text-purple-500" />
                      <span className="font-medium text-purple-800">{p.scripture}</span>
                      {p.scriptureText && <span className="whitespace-pre-line">: {p.scriptureText}</span>}
                    </p>
                  )}
                  {i === 0 && p.content && <p className="mt-3 whitespace-pre-line leading-relaxed text-gray-800">{p.content}</p>}
                  {i > 0 && p.content && (
                    <Link to={appPath} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 hover:underline">
                      <Lock className="h-3.5 w-3.5" /> Pray this point in full, free
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {scriptures.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">More Scripture to pray</h2>
            <ul className="space-y-3">
              {scriptures.map((s, i) => (
                <li key={i} className="text-gray-700">
                  <span className="font-medium text-purple-800">{s.reference}</span>{s.text ? `: ${s.text}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl bg-gradient-to-br from-purple-700 to-purple-900 p-6 text-white">
          <h2 className="text-xl font-semibold">Pray this every day</h2>
          <p className="mt-1 text-purple-100">Get every prayer point in full, daily reminders and a prayer journal. Free on ReKindle.</p>
          <Button asChild className="mt-4 bg-white text-purple-800 hover:bg-purple-50">
            <Link to={appPath}>Start praying, free</Link>
          </Button>
        </section>
      </article>

      {related.length > 0 && (
        <aside className="mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold text-gray-900">More prayers</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}><Link to={prayerTopicPath(r)} className="text-purple-700 hover:underline">{r.title}</Link></li>
            ))}
          </ul>
          <Link to="/prayers" className="mt-4 inline-block text-sm font-semibold text-gray-600 hover:underline">All prayers</Link>
        </aside>
      )}
    </PublicPageShell>
  );
};

export default PublicPrayerTopicPage;
