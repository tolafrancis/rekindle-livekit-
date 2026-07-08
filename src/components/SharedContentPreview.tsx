import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { marked } from 'marked';
import { supabase } from '@/lib/supabase';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  BookOpen, Calendar, Star, Lock, ArrowRight, Heart, Sparkles,
  Quote, Loader2, User, CheckCircle, Flame, Building2,
} from 'lucide-react';

interface SharedContentPreviewProps {
  onSignUp: () => void;
  onSignIn: () => void;
}

type Kind = 'devotional-series' | 'prayer-series' | 'prayer-topics' | 'prayer-watch' | 'daily-devotional' | 'ministry-devotional' | 'ministry-prayer' | 'books';

const KIND_LABEL: Record<string, string> = {
  'devotional-series': 'Devotional',
  'daily-devotional': 'Daily Devotional',
  'ministry-devotional': 'Ministry Devotional',
  'prayer-series': 'Prayer Series',
  'prayer-topics': 'Prayer',
  'prayer-watch': 'Prayer Watch',
  'ministry-prayer': 'Prayer',
  'books': 'Book Summary',
};

// Prayer-watch entries live in the same prayer_topics table (is_prayer_watch),
// so they share the topic preview treatment.
const isPrayerTopic = (k: string) => k === 'prayer-topics' || k === 'prayer-watch';

// Single-day devotional kinds render the same taste (scripture + content excerpt).
const isSingleDevotional = (k: string) => k === 'daily-devotional' || k === 'ministry-devotional';

// prayer_points / other fields may arrive as JSON strings.
const parseMaybeJson = (value: any): any => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};

// A free-taste excerpt of up to `maxChars` characters (a genuine taste, not the
// whole thing). Uses slice so the original line/paragraph breaks are preserved,
// and cuts on a sentence or word boundary near the limit.
const previewExcerpt = (text: string, maxChars: number): { excerpt: string; truncated: boolean } => {
  const clean = (text || '').trim();
  if (clean.length <= maxChars) return { excerpt: clean, truncated: false };
  let cut = clean.lastIndexOf('. ', maxChars);
  if (cut < maxChars * 0.5) cut = clean.lastIndexOf(' ', maxChars);
  if (cut <= 0) cut = maxChars;
  return { excerpt: clean.slice(0, cut + 1).trim(), truncated: true };
};

const dayField = (day: any, keys: string[]): string => {
  for (const k of keys) {
    if (day?.[k]) return day[k];
  }
  return '';
};

/**
 * Public, no-account preview shown when a logged-out visitor opens a shared link
 * (/devotional-series/:id, /prayer-series/:id, /books/:id). It gives a genuine
 * free taste — the full first day of a devotional, or the opening of a book
 * summary — then invites the reader to create a free account to go deeper. After
 * sign-up the deep-link bridge resumes them straight into the item.
 */
export const SharedContentPreview: React.FC<SharedContentPreviewProps> = ({ onSignUp, onSignIn }) => {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const kind = segments[0] as Kind;
  const id = segments[1];

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<any | null>(null);
  const [day1, setDay1] = useState<any | null>(null);
  const [ministryName, setMinistryName] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        if (kind === 'devotional-series') {
          const { data: series, error: e1 } = await supabase
            .from('devotional_series').select('*').eq('id', id).single();
          if (e1) throw e1;
          const { data: entry } = await supabase
            .from('devotional_entries').select('*')
            .eq('series_id', id).eq('day_number', 1).maybeSingle();
          if (active) { setItem(series); setDay1(entry); }
        } else if (kind === 'daily-devotional') {
          const { data, error: e1 } = await supabase
            .from('devotionals').select('*').eq('id', id).single();
          if (e1) throw e1;
          if (active) setItem(data);
        } else if (kind === 'ministry-devotional') {
          const { data, error: e1 } = await supabase
            .from('ministry_devotionals').select('*').eq('id', id).single();
          if (e1) throw e1;
          if (active) setItem(data);
          // Resolve the ministry's name (name-only RPC — no other columns exposed).
          if (data?.ministry_id) {
            const { data: mn } = await supabase.rpc('get_ministry_name', { mid: data.ministry_id });
            if (active && mn) setMinistryName(typeof mn === 'string' ? mn : (mn as any));
          }
        } else if (kind === 'prayer-series') {
          const { data: series, error: e1 } = await supabase
            .from('prayer_series').select('*').eq('id', id).single();
          if (e1) throw e1;
          if (active) setItem(series);
        } else if (isPrayerTopic(kind)) {
          const { data, error: e1 } = await supabase
            .from('prayer_topics').select('*').eq('id', id).single();
          if (e1) throw e1;
          if (active) setItem({ ...data, prayer_points: parseMaybeJson(data?.prayer_points) || [] });
        } else if (kind === 'ministry-prayer') {
          const { data, error: e1 } = await supabase
            .from('ministry_prayer_library').select('*').eq('id', id).single();
          if (e1) throw e1;
          if (active) setItem(data);
          if (data?.ministry_id) {
            const { data: mn } = await supabase.rpc('get_ministry_name', { mid: data.ministry_id });
            if (active && mn) setMinistryName(typeof mn === 'string' ? mn : (mn as any));
          }
        } else if (kind === 'books') {
          const { data: book, error: e1 } = await supabase
            .from('book_summaries').select('*').eq('id', id).single();
          if (e1) throw e1;
          if (active) setItem(book);
        }
      } catch (err) {
        console.warn('[SharedContentPreview] load failed:', err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [kind, id]);

  const title = item?.title || 'A gift for you';
  const author = item?.author || item?.author_name;
  const cover = item?.cover_image_url || item?.image_url;
  const totalDays = item?.total_days;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-700 to-indigo-900">
        <Loader2 className="h-10 w-10 animate-spin text-white/90" />
      </div>
    );
  }

  const CTA = ({ className = '' }: { className?: string }) => (
    <div className={`rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-6 text-center shadow-sm ${className}`}>
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-purple-600 text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="font-serif text-xl font-bold text-gray-900">
        {kind === 'books' ? 'Read the full summary — free'
          : (isPrayerTopic(kind) || kind === 'ministry-prayer') ? 'Begin praying — free'
          : isSingleDevotional(kind) ? "Finish today's devotional — free"
          : kind === 'prayer-series' ? 'Start this prayer journey — free'
          : `Continue all ${totalDays || ''} days — free`}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
        Create your free account to keep reading, pray along, save your place, and track your journey.
      </p>
      <Button
        onClick={onSignUp}
        className="mt-4 h-11 w-full max-w-xs rounded-full bg-purple-600 text-base font-semibold text-white hover:bg-purple-700"
      >
        Create free account
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <p className="mt-3 text-xs text-gray-500">
        Already have an account?{' '}
        <button onClick={onSignIn} className="font-semibold text-purple-700 underline">Sign in</button>
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative overflow-hidden bg-cover bg-center"
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      >
        <div className="bg-gradient-to-b from-purple-900/80 via-purple-900/85 to-purple-950/95 px-4 pb-10 pt-14">
          <div className="mx-auto max-w-2xl text-center text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <Heart className="h-3.5 w-3.5 text-rose-300" />
              A friend shared this with you
            </div>
            <Badge className="mb-3 bg-amber-500/90 text-white">{KIND_LABEL[kind] || 'Shared'}</Badge>
            <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
            {ministryName && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white backdrop-blur">
                <Building2 className="h-4 w-4 text-amber-300" /> From {ministryName}
              </p>
            )}
            {author && author !== ministryName && <p className="mt-2 text-white/80">by {author}</p>}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              {totalDays ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                  <Calendar className="h-3.5 w-3.5" /> {totalDays}-day journey
                </span>
              ) : null}
              {item?.category && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                  <BookOpen className="h-3.5 w-3.5" /> {item.category}
                </span>
              )}
              {item?.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                  <Star className="h-3.5 w-3.5 text-amber-300" /> Featured
                </span>
              )}
            </div>
            {item?.description && (
              <p className="mx-auto mt-5 max-w-xl text-white/85">{item.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Free taste */}
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {error && (
          <div className="rounded-2xl border bg-white p-6 text-center">
            <p className="text-gray-600">We couldn't load this preview, but you can still read it in the app.</p>
          </div>
        )}

        {/* Universal fallback — never leave a shared link showing a blank page.
            Covers content kinds without a bespoke preview and loads that
            returned nothing, so the visitor always gets a clear next step. */}
        {!item && !error && (
          <div className="rounded-2xl border bg-white p-6 text-center">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-purple-500" />
            <p className="font-medium text-gray-800">Someone shared this with you on Rekindle.</p>
            <p className="mt-1 text-sm text-gray-500">
              Create your free account to open it and explore devotionals, prayer, and community.
            </p>
          </div>
        )}

        {/* Devotional — series Day 1 or a single daily devotional: scripture + a
            content taste, then locked (same free-taste treatment as books). */}
        {(kind === 'devotional-series' || isSingleDevotional(kind)) && (() => {
          const src = kind === 'devotional-series' ? day1 : item;
          if (!src) return null;
          const body = dayField(src, ['main_content', 'content', 'devotional_text', 'body', 'message']);
          const { excerpt, truncated } = previewExcerpt(body, 1400);
          return (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-purple-700">
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5">
                  {kind === 'devotional-series' ? 'Day 1 · Free' : 'Today · Free'}
                </span>
                {kind === 'devotional-series' && totalDays && <span className="text-gray-400">of {totalDays}</span>}
              </div>
              {src.title && <h2 className="mb-3 font-serif text-2xl font-bold text-gray-900">{src.title}</h2>}

              {(src.scripture_reference || src.scripture_text) && (
                <div className="mb-5 rounded-xl bg-amber-50 p-4">
                  {src.scripture_reference && <p className="mb-1 font-semibold text-amber-800">{src.scripture_reference}</p>}
                  {src.scripture_text && <p className="italic leading-relaxed text-gray-700">"{src.scripture_text}"</p>}
                </div>
              )}

              {excerpt && (
                <div className="relative">
                  <div className="whitespace-pre-wrap leading-relaxed text-gray-700">{excerpt}</div>
                  {truncated && (
                    <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-20 bg-gradient-to-b from-transparent to-white" />
                  )}
                </div>
              )}

              {truncated ? (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-400">
                  <Lock className="h-4 w-4" /> Sign up free to keep reading
                  {kind === 'devotional-series' && totalDays ? ` — plus ${totalDays - 1} more days` : ''}
                </div>
              ) : (
                <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {kind === 'devotional-series' ? "You've finished Day 1" : "You've read today's devotional"}
                </div>
              )}
            </div>
          );
        })()}

        {/* Prayer topic — scripture + a taste of the first prayer point, then a
            "Begin praying" gate (mirrors the topic's Begin Prayer dialog). */}
        {isPrayerTopic(kind) && item && (() => {
          const points = Array.isArray(item.prayer_points) ? item.prayer_points : [];
          const first = points[0];
          const firstTitle = first && typeof first === 'object' ? (first.title || '') : '';
          const firstText = typeof first === 'string' ? first : (first?.content || first?.text || '');
          const { excerpt, truncated } = previewExcerpt(firstText, 700);
          return (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-purple-700">
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5">Prayer preview</span>
                {points.length > 0 && <span className="text-gray-400">{points.length} prayer point{points.length > 1 ? 's' : ''}</span>}
              </div>

              {(item.scripture_reference || item.scripture_text) && (
                <div className="mb-5 rounded-xl bg-amber-50 p-4">
                  {item.scripture_reference && <p className="mb-1 font-semibold text-amber-800">{item.scripture_reference}</p>}
                  {item.scripture_text && <p className="italic leading-relaxed text-gray-700">"{item.scripture_text}"</p>}
                </div>
              )}

              {first && (
                <div className="rounded-xl bg-purple-50 p-4">
                  {firstTitle && <p className="mb-1 font-semibold text-purple-800">{firstTitle}</p>}
                  <div className="relative">
                    <p className="whitespace-pre-wrap leading-relaxed text-gray-700">{excerpt || 'Take a moment to still your heart and pray.'}</p>
                    {truncated && (
                      <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-16 bg-gradient-to-b from-transparent to-purple-50" />
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-gray-400">
                <Lock className="h-4 w-4" /> Sign up free to pray through {points.length > 1 ? `all ${points.length} points` : 'this prayer'}
              </div>
            </div>
          );
        })()}

        {/* Ministry prayer — scripture + a taste of the prayer, then Begin praying */}
        {kind === 'ministry-prayer' && item && (() => {
          const { excerpt, truncated } = previewExcerpt(item.content || '', 900);
          return (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-purple-700">
                <Quote className="h-4 w-4" /> Prayer preview
              </div>

              {(item.scripture_reference || item.scripture_text) && (
                <div className="mb-5 rounded-xl bg-amber-50 p-4">
                  {item.scripture_reference && <p className="mb-1 font-semibold text-amber-800">{item.scripture_reference}</p>}
                  {item.scripture_text && <p className="italic leading-relaxed text-gray-700">"{item.scripture_text}"</p>}
                </div>
              )}

              <div className="relative rounded-xl bg-purple-50 p-4">
                <p className="whitespace-pre-wrap leading-relaxed text-gray-700">{excerpt || 'Take a moment to still your heart and pray.'}</p>
                {truncated && (
                  <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-16 bg-gradient-to-b from-transparent to-purple-50" />
                )}
              </div>

              {truncated && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-gray-400">
                  <Lock className="h-4 w-4" /> Sign up free to pray this prayer in full
                </div>
              )}
            </div>
          );
        })()}

        {/* Prayer series (metadata preview only) */}
        {kind === 'prayer-series' && !error && (
          <div className="rounded-2xl border bg-white p-6 text-center text-gray-600">
            <Flame className="mx-auto mb-2 h-8 w-8 text-amber-500" />
            Begin this journey and grow one day at a time.
          </div>
        )}

        {/* Book: short summary intro (free taste), then locked */}
        {kind === 'books' && item?.summary && (() => {
          const { excerpt, truncated } = previewExcerpt(item.summary, 1400);
          return (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-purple-700">
                <Quote className="h-4 w-4" /> Summary preview
              </div>
              <div className="relative">
                <div
                  className="prose prose-sm max-w-none text-gray-700 prose-headings:font-bold prose-p:my-3"
                  dangerouslySetInnerHTML={{ __html: marked.parse(excerpt, { async: false, gfm: true, breaks: true }) as string }}
                />
                {/* Fade the last lines to signal there's more behind the account */}
                {truncated && (
                  <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-20 bg-gradient-to-b from-transparent to-white" />
                )}
              </div>
              {truncated && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-400">
                  <Lock className="h-4 w-4" /> Sign up free to read the full summary
                </div>
              )}
              {Array.isArray(item.key_takeaways) && item.key_takeaways.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <p className="mb-2 font-semibold text-gray-900">Key takeaways</p>
                  <ul className="space-y-2">
                    {item.key_takeaways.slice(0, 1).map((t: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-gray-700">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" /> {t}
                      </li>
                    ))}
                    {item.key_takeaways.length > 1 && (
                      <li className="flex items-center gap-2 text-gray-400">
                        <Lock className="h-4 w-4" /> +{item.key_takeaways.length - 1} more with a free account
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        <CTA />

        <p className="pb-10 text-center text-xs text-gray-400">
          Shared via Rekindle — grow in prayer, the Word, and community.
        </p>
      </div>
    </div>
  );
};

export default SharedContentPreview;
