import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Input } from '@rekindle/ui/input';
import { Loader2, Search } from 'lucide-react';
import { usePageMeta } from '../usePageMeta';
import { prayerTopicPath } from '../prayerTopicLinks';
import { PublicPageShell } from './PublicPageShell';

// /prayers — every published prayer topic, linked, so search engines can reach
// each /prayers/:id/:slug page and people can browse them signed out.
const PublicPrayerIndexPage: React.FC = () => {
  const [topics, setTopics] = useState<Array<{ id: string; title: string; description: string | null }> | null>(null);
  const [query, setQuery] = useState('');

  usePageMeta({
    title: 'Prayer Points with Scripture for Every Need',
    description: 'Prayer points with Bible verses for healing, breakthrough, family, protection, guidance and more. Pray through each topic free on ReKindle.',
  });

  useEffect(() => {
    supabase.from('prayer_topics').select('id, title, description')
      .eq('is_published', true).order('title')
      .then(({ data }) => setTopics((data as Array<{ id: string; title: string; description: string | null }>) ?? []));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!topics || !q) return topics;
    return topics.filter((t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
  }, [topics, query]);

  return (
    <PublicPageShell>
      <h1 className="text-3xl font-bold text-gray-900">Prayer points with Scripture</h1>
      <p className="mt-2 text-gray-600">
        {topics ? `${topics.length} prayers` : 'Prayers'} for every season, each with Bible verses to stand on. Open one to start praying.
      </p>
      <div className="relative mt-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search prayers, e.g. healing" className="pl-9" aria-label="Search prayers" />
      </div>
      {!shown ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div>
      ) : shown.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No prayers match "{query}".</p>
      ) : (
        <ul className="mt-6 divide-y">
          {shown.map((t) => (
            <li key={t.id} className="py-4">
              <Link to={prayerTopicPath(t)} className="font-semibold text-purple-800 hover:underline">{t.title}</Link>
              {t.description && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{t.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </PublicPageShell>
  );
};

export default PublicPrayerIndexPage;
