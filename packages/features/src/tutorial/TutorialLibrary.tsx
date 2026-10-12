// The tutorial library: every tutorial this user can take, by category, with
// time, level, status and a Start / Resume / Restart button. Shared by the
// Rekindle shell and the ministry space; each passes its own category order.
import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, PlayCircle, RotateCcw, Search, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@rekindle/ui/sheet';
import { Input } from '@rekindle/ui/input';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { useIsMobile } from '@rekindle/ui/use-mobile';
import { useTutorials } from './TutorialProvider';
import type { TutorialDefinition, TutorialStatus } from './types';

const STATUS_STYLE: Record<TutorialStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  skipped: 'bg-gray-100 text-gray-500',
};

export const TutorialLibrary: React.FC<{ categories?: readonly string[] }> = ({ categories = [] }) => {
  const { tutorials, libraryOpen, setLibraryOpen, statusOf, savedStepOf, start, availabilityOf, tr } = useTutorials();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const l = (key: string, fallback: string) => tr(`library.${key}`, fallback);

  const statusLabel: Record<TutorialStatus, string> = {
    not_started: l('statusNotStarted', 'Not started'),
    in_progress: l('statusInProgress', 'In progress'),
    completed: l('statusCompleted', 'Completed'),
    skipped: l('statusSkipped', 'Skipped'),
  };

  const title = (t: TutorialDefinition) => tr(`${t.id}.title`, t.title);
  const description = (t: TutorialDefinition) => tr(`${t.id}.description`, t.description);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: TutorialDefinition) =>
      !q || `${title(t)} ${description(t)} ${t.category}`.toLowerCase().includes(q);
    const cats = [...categories, ...new Set(tutorials.map((t) => t.category))]
      .filter((c, i, a) => a.indexOf(c) === i);
    return cats
      .map((cat) => ({ cat, items: tutorials.filter((t) => t.category === cat && match(t)) }))
      .filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorials, query, tr, categories]);

  return (
    <Sheet open={libraryOpen} onOpenChange={(v) => { setLibraryOpen(v); if (!v) setQuery(''); }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[88dvh] overflow-y-auto' : 'w-full overflow-y-auto sm:max-w-md'}
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-xl text-purple-800">{l('title', 'Tutorials')}</SheetTitle>
          <SheetDescription>
            {l('subtitle', 'Short guided walkthroughs on the real screens. Start, pause and come back any time.')}
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={l('search', 'Search tutorials')}
            aria-label={l('search', 'Search tutorials')}
            className="pl-9"
          />
        </div>

        <div className="mt-4 space-y-6 pb-6">
          {grouped.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">{l('none', 'No tutorials match your search.')}</p>
          )}
          {grouped.map(({ cat, items }) => (
            <section key={cat} aria-label={tr(`category.${cat}`, cat)}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{tr(`category.${cat}`, cat)}</h3>
              <ul className="space-y-2">
                {items.map((t) => {
                  const status = statusOf(t.id);
                  const gated = availabilityOf(t) === 'gated';
                  const step = savedStepOf(t.id);
                  const canResume = status === 'in_progress' && step > 0;
                  return (
                    <li key={t.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900">{title(t)}</p>
                        <Badge variant="secondary" className={`shrink-0 ${STATUS_STYLE[status]}`}>
                          {status === 'completed' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {statusLabel[status]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-600">{description(t)}</p>
                      {gated && t.gatedNote && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                          <Lock className="h-3 w-3" />{tr(`${t.id}.gatedNote`, t.gatedNote)}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {l('minutes', '{n} min').replace('{n}', String(t.minutes))}
                        </span>
                        {t.level && <span>{tr(`level.${t.level}`, t.level)}</span>}
                        <span>{l('steps', '{n} steps').replace('{n}', String(t.steps.length))}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canResume ? (
                          <>
                            <Button size="sm" className="min-h-[40px] bg-purple-600 hover:bg-purple-700" onClick={() => start(t.id)}>
                              <PlayCircle className="mr-1 h-4 w-4" />{l('resume', 'Resume')}
                            </Button>
                            <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => start(t.id, { restart: true })}>
                              <RotateCcw className="mr-1 h-4 w-4" />{l('startOver', 'Start over')}
                            </Button>
                          </>
                        ) : status === 'completed' || status === 'skipped' ? (
                          <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => start(t.id, { restart: true })}>
                            <RotateCcw className="mr-1 h-4 w-4" />{l('restart', 'Restart')}
                          </Button>
                        ) : (
                          <Button size="sm" className="min-h-[40px] bg-purple-600 hover:bg-purple-700" onClick={() => start(t.id, { restart: true })}>
                            <PlayCircle className="mr-1 h-4 w-4" />{l('start', 'Start')}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};
