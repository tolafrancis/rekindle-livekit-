import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Loader2 } from 'lucide-react';
import { usePageMeta } from '../usePageMeta';
import { devotionalPath, REKINDLE_DEVOTIONAL_STREAM_ID } from '../devotionalLinks';
import { formatDevotionalDate } from './PublicDevotionalPage';
import { PublicPageShell } from './PublicPageShell';

// /devotionals — Rekindle's own published devotionals, newest first, each
// linking to its public page.
type Row = { id: number; title: string | null; theme: string | null; schedule_date: string | null };

const PublicDevotionalIndexPage: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);

  usePageMeta({
    title: 'Daily Devotionals with Scripture and Prayer',
    description: 'Short daily devotionals from ReKindle BC: a Bible verse, a message, reflection questions and a prayer to start your day with God.',
  });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase.from('devotionals').select('id, title, theme, schedule_date')
      .eq('is_published', true).eq('stream_id', REKINDLE_DEVOTIONAL_STREAM_ID)
      .or(`schedule_date.is.null,schedule_date.lte.${today}`)
      .order('schedule_date', { ascending: false, nullsFirst: false })
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, []);

  return (
    <PublicPageShell>
      <h1 className="text-3xl font-bold text-gray-900">Daily devotionals</h1>
      <p className="mt-2 text-gray-600">A Bible verse, a short message, questions to reflect on and a prayer. Open one to read it.</p>
      {!rows ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div>
      ) : (
        <ul className="mt-6 divide-y">
          {rows.map((d) => (
            <li key={d.id} className="py-4">
              {d.schedule_date && <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{formatDevotionalDate(d.schedule_date)}</p>}
              <Link to={devotionalPath(d)} className="font-semibold text-purple-800 hover:underline">{d.title}</Link>
              {d.theme && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{d.theme}</p>}
            </li>
          ))}
        </ul>
      )}
    </PublicPageShell>
  );
};

export default PublicDevotionalIndexPage;
