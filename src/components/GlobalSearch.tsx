// src/components/GlobalSearch.tsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from './ui/button';
import { Loader2, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  type: 'devotional' | 'prayer' | 'counsellor' | 'scripture';
  meta?: any;
};

type GlobalSearchProps = {
  open: boolean;
  onClose: () => void;
};

const STORAGE_KEY = 'rk_recent_searches_v1';
const DEBOUNCE_MS = 300;

const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, onClose }) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, SearchResultItem[]>>({
    devotional: [],
    prayer: [],
    counsellor: [],
    scripture: []
  });
  const [filter, setFilter] = useState<'all' | SearchResultItem['type']>('all');
  const [recent, setRecent] = useState<string[]>([]);
  const mounted = useRef(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);

  // load recent searches from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  const saveRecent = useCallback((q: string) => {
    if (!q || !q.trim()) return;
    const normalized = q.trim();
    setRecent(prev => {
      const next = [normalized, ...prev.filter(p => p !== normalized)].slice(0, 10);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); setRecent([]); } catch (e) {}
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 1) {
      if (mounted.current) setResults({ devotional: [], prayer: [], counsellor: [], scripture: [] });
      return;
    }

    setLoading(true);

    try {
      const safeQ = q.trim();

      // Devotionals
      const devPromise = supabase
        .from('devotionals')
        .select('id, title, excerpt')
        .ilike('title', `%${safeQ}%`)
        .limit(8);

      // Prayer topics (assuming prayerTopics table)
      const prayerPromise = supabase
        .from('prayer_topics')
        .select('id, title, description')
        .ilike('title', `%${safeQ}%`)
        .limit(8);

      // Counsellors - now using the counsellors table
      const counsellorPromise = supabase
        .from('counsellors')
        .select('id, full_name, title, bio')
        .ilike('full_name', `%${safeQ}%`)
        .eq('is_active', true)
        .limit(8);

      // Scripture memory verses
      const scripturePromise = supabase
        .from('scripture_memory')
        .select('id, verse_ref, verse_text')
        .ilike('verse_text', `%${safeQ}%`)
        .limit(8);

      const [devRes, prayerRes, counsellorRes, scriptureRes] = await Promise.all([
        devPromise, prayerPromise, counsellorPromise, scripturePromise
      ]);

      const mapResults: Record<string, SearchResultItem[]> = {
        devotional: [],
        prayer: [],
        counsellor: [],
        scripture: []
      };

      if (devRes?.data) {
        mapResults.devotional = (devRes.data as any[]).map(d => ({
          id: d.id,
          title: d.title,
          subtitle: d.excerpt || '',
          type: 'devotional',
          meta: d
        }));
      }
      if (prayerRes?.data) {
        mapResults.prayer = (prayerRes.data as any[]).map(p => ({
          id: p.id,
          title: p.title,
          subtitle: p.description || '',
          type: 'prayer',
          meta: p
        }));
      }
      if (counsellorRes?.data) {
        mapResults.counsellor = (counsellorRes.data as any[]).map(c => ({
          id: c.id,
          title: c.full_name,
          subtitle: c.title || c.bio?.slice(0, 100) || '',
          type: 'counsellor',
          meta: c
        }));
      }
      if (scriptureRes?.data) {
        mapResults.scripture = (scriptureRes.data as any[]).map(s => ({
          id: s.id,
          title: s.verse_ref || s.id,
          subtitle: (s.verse_text || '').slice(0, 120),
          type: 'scripture',
          meta: s
        }));
      }

      if (mounted.current) {
        setResults(mapResults);
      }
    } catch (err: any) {
      console.error('[GlobalSearch] search error', err);
      toast({ title: t('globalSearch', 'searchError', 'Search error'), description: err?.message || t('globalSearch', 'failedToSearch', 'Failed to search') });
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Debounced query effect
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  // computed show list based on filter
  const displayed = useMemo(() => {
    if (filter === 'all') {
      return {
        devotional: results.devotional,
        prayer: results.prayer,
        counsellor: results.counsellor,
        scripture: results.scripture
      };
    }
    return {
      [filter]: results[filter]
    } as unknown as Record<string, SearchResultItem[]>;
  }, [filter, results]);

  const handleSelect = (item: SearchResultItem) => {
    saveRecent(query || item.title);
    // default behavior: navigate by type — we only emit an event by setting window.location
    try {
      if (item.type === 'devotional') {
        window.location.href = `/devotionals/${item.id}`;
      } else if (item.type === 'prayer') {
        window.location.href = `/prayers/${item.id}`;
      } else if (item.type === 'counsellor') {
        window.location.href = `/counsellors/${item.id}`;
      } else if (item.type === 'scripture') {
        window.location.href = `/scripture/${item.id}`;
      } else {
        window.location.href = '/';
      }
    } catch (e) {
      console.warn('[GlobalSearch] navigation failed', e);
      onClose();
    }
  };

  const handleRecentClick = (r: string) => {
    setQuery(r);
  };

  // reset query when modal opens/closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults({ devotional: [], prayer: [], counsellor: [], scripture: [] });
      setFilter('all');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-lg overflow-hidden z-70">
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="flex-1">
            <input
              className="w-full px-4 py-3 rounded-lg border focus:outline-none"
              placeholder={t('globalSearch', 'searchPlaceholder', 'Search devotionals, prayer topics, counsellors, scripture...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded px-3 py-2 border"
            >
              <option value="all">{t('globalSearch', 'filterAll', 'All')}</option>
              <option value="devotional">{t('globalSearch', 'devotionals', 'Devotionals')}</option>
              <option value="prayer">{t('globalSearch', 'prayerTopics', 'Prayer Topics')}</option>
              <option value="counsellor">{t('globalSearch', 'counsellors', 'Counsellors')}</option>
              <option value="scripture">{t('globalSearch', 'scripture', 'Scripture')}</option>
            </select>
            <Button variant="ghost" size="icon" onClick={() => { setQuery(''); setResults({ devotional: [], prayer: [], counsellor: [], scripture: [] }); }}>
              <X className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              {t('globalSearch', 'close', 'Close')}
            </Button>
          </div>
        </div>

        <div className="p-4 max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('globalSearch', 'searching', 'Searching...')}</span>
            </div>
          ) : (
            <>
              {/* Recent searches */}
              {(!query || query.trim().length === 0) && recent.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <strong>{t('globalSearch', 'recentSearches', 'Recent searches')}</strong>
                    <button className="text-sm underline" onClick={clearRecent}>{t('globalSearch', 'clear', 'Clear')}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map(r => (
                      <button
                        key={r}
                        className="px-3 py-1 rounded bg-gray-100 text-sm"
                        onClick={() => handleRecentClick(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              {Object.keys(displayed).map((sectionKey) => {
                const items = (displayed as any)[sectionKey] as SearchResultItem[];
                if (!items || items.length === 0) return null;
                const sectionTitle = sectionKey === 'devotional' ? t('globalSearch', 'devotionals', 'Devotionals') :
                  sectionKey === 'prayer' ? t('globalSearch', 'prayerTopics', 'Prayer Topics') :
                  sectionKey === 'counsellor' ? t('globalSearch', 'counsellors', 'Counsellors') : t('globalSearch', 'scripture', 'Scripture');
                return (
                  <div key={sectionKey} className="mb-4">
                    <h3 className="font-semibold mb-2">{sectionTitle}</h3>
                    <div className="space-y-2">
                      {items.map(it => (
                        <div key={it.id} className="p-3 rounded hover:bg-gray-50 cursor-pointer" onClick={() => handleSelect(it)}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{it.title}</div>
                              {it.subtitle && <div className="text-sm text-gray-500">{it.subtitle}</div>}
                            </div>
                            <div className="text-xs text-gray-400 capitalize">{it.type}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* No results */}
              {Object.values(displayed).every(arr => arr.length === 0) && (
                <div className="text-center text-sm text-gray-500 py-8">{t('globalSearch', 'noResults', 'No results')}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
