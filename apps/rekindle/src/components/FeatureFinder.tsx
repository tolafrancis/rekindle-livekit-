// src/components/FeatureFinder.tsx
//
// "Find a feature": a floating button on every screen (including inside a
// ministry's own space) that searches the app itself — where things are and
// how to use them — and takes the user there. Separate from GlobalSearch,
// which searches content (devotionals, prayers, scripture, counsellors).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Search, ChevronRight, CornerDownLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Badge } from './ui/badge';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { FEATURES, searchFeatures, type FeatureAction, type FeatureEntry } from '@/lib/featureIndex';

/** AppLayout listens for this and does the navigation. */
export const FEATURE_NAVIGATE_EVENT = 'rk:feature-navigate';
/** MinistrySpace listens for this while it's open and sets `handled`. */
export const MINISTRY_GO_EVENT = 'rk:ministry-go';

export interface MinistryGoDetail { group: string; child: string; handled: boolean }

const POPULAR_IDS = ['small-groups-manage', 'ministry-webinars', 'counsellors', 'prayer-wall', 'reading-plan', 'live-meetings', 'settings', 'join-ministry'];

const AUDIENCE_LABEL: Record<string, string> = { leader: 'Ministry leaders', counsellor: 'Counsellors', admin: 'Admins' };

interface FeatureFinderProps {
  isAdmin: boolean;
  /** Lift the button above the mobile bottom controls when they're showing. */
  className?: string;
}

const FeatureFinder: React.FC<FeatureFinderProps> = ({ isAdmin, className }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => FEATURES.filter((f) => f.audience !== 'admin' || isAdmin),
    [isAdmin],
  );
  const results = useMemo(() => {
    if (query.trim()) return searchFeatures(query, visible).slice(0, 12);
    return POPULAR_IDS.map((id) => visible.find((f) => f.id === id)).filter((f): f is FeatureEntry => !!f);
  }, [query, visible]);

  useEffect(() => { setHighlight(0); }, [query]);

  // Ctrl/Cmd + K opens it from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const go = useCallback((entry: FeatureEntry) => {
    const action = entry.action;
    setOpen(false);
    if (!action) return;

    if (action.kind === 'ministry') {
      // Inside a ministry already: MinistrySpace switches straight to it.
      const detail: MinistryGoDetail = { group: action.group, child: action.child, handled: false };
      window.dispatchEvent(new CustomEvent(MINISTRY_GO_EVENT, { detail }));
      if (detail.handled) return;
      const nav: FeatureAction = { kind: 'ministries', view: 'my-ministries' };
      window.dispatchEvent(new CustomEvent(FEATURE_NAVIGATE_EVENT, { detail: nav }));
      toast({
        title: t('featureFinder', 'openMinistryFirst', 'Open your ministry first'),
        description: `${t('featureFinder', 'thenGoTo', 'Then go to')} ${entry.path.slice(2).join(' › ')}.${
          entry.audience === 'leader' ? ` ${t('featureFinder', 'leadersOnly', 'This is only shown to ministry leaders.')}` : ''
        }`,
      });
      return;
    }
    window.dispatchEvent(new CustomEvent(FEATURE_NAVIGATE_EVENT, { detail: action }));
  }, [t]);

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && results[highlight]) { e.preventDefault(); go(results[highlight]); }
  };

  const label = t('featureFinder', 'button', 'Find a feature');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={`${label} (Ctrl+K)`}
        className={`fixed z-[60] flex items-center gap-2 rounded-full bg-white/95 text-purple-700 border border-purple-200 shadow-lg backdrop-blur px-3 py-2.5 hover:bg-purple-50 transition-colors ${className ?? ''}`}
      >
        <Compass className="h-5 w-5" />
        <span className="hidden sm:inline text-sm font-semibold">{label}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Compass className="h-5 w-5 text-purple-600" /> {label}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t('featureFinder', 'hint', 'Search for anything in the app, like "small groups", "go live" or "change password".')}
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 focus-within:border-purple-400">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={t('featureFinder', 'placeholder', 'What are you looking for?')}
                aria-label={label}
                className="h-10 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto border-t border-gray-100">
            {!query.trim() && (
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t('featureFinder', 'popular', 'Popular')}
              </p>
            )}
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                <p>{t('featureFinder', 'noMatch', 'No feature matches that.')}</p>
                <button
                  type="button"
                  className="mt-2 text-purple-600 font-medium hover:underline"
                  onClick={() => go({ ...FEATURES.find((f) => f.id === 'help-content-search')! })}
                >
                  {t('featureFinder', 'tryContentSearch', 'Search devotionals, prayers and scripture instead')}
                </button>
              </div>
            ) : (
              <ul className="py-1" role="listbox">
                {results.map((f, i) => (
                  <li key={f.id} role="option" aria-selected={i === highlight}>
                    <button
                      type="button"
                      onClick={() => go(f)}
                      onMouseEnter={() => setHighlight(i)}
                      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 ${i === highlight ? 'bg-purple-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900">{f.title}</span>
                          {f.audience && AUDIENCE_LABEL[f.audience] && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-gray-500">{AUDIENCE_LABEL[f.audience]}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{f.answer ?? f.description}</p>
                        <p className="text-[11px] text-purple-600 mt-1 flex flex-wrap items-center gap-0.5">
                          {f.path.map((step, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && <ChevronRight className="h-3 w-3 text-purple-300" />}
                              <span>{step}</span>
                            </React.Fragment>
                          ))}
                        </p>
                      </div>
                      {i === highlight && f.action && <CornerDownLeft className="h-4 w-4 text-purple-400 mt-1 shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FeatureFinder;
