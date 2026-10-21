// Cloudflare Pages advanced-mode worker. It runs only for the routes listed in
// _routes.json (public prayer and devotional pages); everything else is served
// as static files without touching it.
//
// WhatsApp, Facebook, X and LinkedIn don't run JavaScript, so on the SPA every
// shared link shows the same generic card. Here we fetch the app shell and
// rewrite its title, description, image and canonical for the one prayer topic
// or devotional in the URL, so each link previews with its own title.

const SITE = 'https://app.rekindlebc.com';
const SUPABASE_URL = 'https://vpnpembyqbbaaiynfvli.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8';
// Same id as REKINDLE_DEVOTIONAL_STREAM_ID in packages/features/src/devotionalLinks.ts.
const REKINDLE_STREAM = '81ab9262-e7e8-4975-840d-1b8d09bd4c84';
const BRAND = ' | ReKindle BC';

const clip = (text, n = 158) => {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

const rest = async (query) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(3000),
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
};

// Title, description and image for the page at this path, or null to leave
// the shell as it is.
const metaFor = async (pathname) => {
  let m = pathname.match(/^\/prayers\/([0-9a-f-]{36})(?:\/|$)/i);
  if (m) {
    const t = await rest(`prayer_topics?select=title,description,cover_image_url,prayer_points&id=eq.${m[1]}&is_published=eq.true`);
    if (!t) return null;
    const count = Array.isArray(t.prayer_points) ? t.prayer_points.length : 0;
    return {
      title: `${t.title}${count ? `: ${count} Prayer Points with Scripture` : ''}${BRAND}`,
      description: clip(t.description || `Prayer points with Scripture on ${t.title}.`),
      image: t.cover_image_url,
    };
  }
  m = pathname.match(/^\/devotionals\/(\d+)(?:\/|$)/);
  if (m) {
    const today = new Date().toISOString().slice(0, 10);
    const d = await rest(
      `devotionals?select=title,theme,message,content,scripture_reference,cover_image_url,image_url&id=eq.${m[1]}` +
      `&is_published=eq.true&stream_id=eq.${REKINDLE_STREAM}&or=(schedule_date.is.null,schedule_date.lte.${today})`,
    );
    if (!d) return null;
    return {
      title: `${d.title || 'Daily Devotional'}${d.scripture_reference ? ` (${d.scripture_reference})` : ''}: Daily Devotional${BRAND}`,
      description: clip(d.theme || d.message || d.content),
      image: d.cover_image_url || d.image_url,
      type: 'article',
    };
  }
  return null;
};

const setContent = (value) => ({ element(el) { el.setAttribute('content', value); } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The SPA shell. Asking for "/" (not the deep path) skips the SPA fallback.
    const shell = await env.ASSETS.fetch(new Request(new URL('/', url), request));
    if (request.method !== 'GET' || !(shell.headers.get('content-type') || '').includes('text/html')) return shell;

    let meta = null;
    try { meta = await metaFor(url.pathname); } catch { /* Supabase slow or down: serve the plain shell */ }
    if (!meta) return shell;

    const canonical = `${SITE}${url.pathname}`;
    let rewriter = new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(meta.title); } })
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', canonical); } })
      .on('meta[name="description"]', setContent(meta.description))
      .on('meta[property="og:title"]', setContent(meta.title))
      .on('meta[name="twitter:title"]', setContent(meta.title))
      .on('meta[property="og:description"]', setContent(meta.description))
      .on('meta[name="twitter:description"]', setContent(meta.description))
      .on('meta[property="og:url"]', setContent(canonical))
      .on('meta[property="og:type"]', setContent(meta.type || 'article'));
    if (meta.image) {
      rewriter = rewriter
        .on('meta[property="og:image"]', setContent(meta.image))
        .on('meta[name="twitter:image"]', setContent(meta.image))
        // The default image's size doesn't apply to a different picture.
        .on('meta[property="og:image:width"], meta[property="og:image:height"]', { element(el) { el.remove(); } });
    }
    const res = rewriter.transform(shell);
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return new Response(res.body, { status: 200, headers });
  },
};
