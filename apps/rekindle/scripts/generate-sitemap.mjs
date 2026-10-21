// Writes public/sitemap.xml before each build: the static public pages plus
// one URL per published prayer topic (/prayers/<id>/<slug>) and per published
// Rekindle devotional (/devotionals/<id>/<slug>). Reads with the public anon key. If Supabase can't be
// reached the committed sitemap is left as it is, so a build never fails here.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = 'https://app.rekindlebc.com';
const SUPABASE_URL = 'https://vpnpembyqbbaaiynfvli.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8';
const OUT = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));

// Same rule as packages/features/src/prayerTopicLinks.ts.
const slugify = (title) =>
  (title || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'prayer';

// Same id as REKINDLE_DEVOTIONAL_STREAM_ID in packages/features/src/devotionalLinks.ts.
const REKINDLE_STREAM = '81ab9262-e7e8-4975-840d-1b8d09bd4c84';

const today = new Date().toISOString().slice(0, 10);
const STATIC = [
  ['/devotionals', 'daily', '0.9', today],
  ['/prayers', 'weekly', '0.9', today],
  ['/guide', 'monthly', '0.8', today],
  ['/faq', 'monthly', '0.7', today],
  ['/write-for-us', 'monthly', '0.5', today],
];

const entry = ([path, freq, priority, lastmod]) => `  <url>
    <loc>${SITE}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;

const get = async (query) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

try {
  const topics = await get('prayer_topics?select=id,title,updated_at,created_at&is_published=eq.true&order=title');
  const devotionals = await get(
    `devotionals?select=id,title,schedule_date,updated_at,created_at&is_published=eq.true&stream_id=eq.${REKINDLE_STREAM}` +
    `&or=(schedule_date.is.null,schedule_date.lte.${today})&order=schedule_date.desc`,
  );
  const urls = [
    ...STATIC,
    ...devotionals.map((d) => [`/devotionals/${d.id}/${slugify(d.title || 'devotional')}`, 'yearly', '0.6', (d.updated_at || d.schedule_date || d.created_at).slice(0, 10)]),
    ...topics.map((t) => [`/prayers/${t.id}/${slugify(t.title)}`, 'monthly', '0.6', (t.updated_at || t.created_at).slice(0, 10)]),
  ];
  writeFileSync(OUT, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(entry).join('')}</urlset>\n`);
  console.log(`[sitemap] wrote ${urls.length} URLs (${topics.length} prayer topics, ${devotionals.length} devotionals)`);
} catch (err) {
  console.warn(`[sitemap] kept the existing sitemap: ${err.message}`);
}
