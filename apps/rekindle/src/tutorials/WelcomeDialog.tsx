// The first-visit welcome: what Rekindle is, how the tour works, and a free
// choice to take it now or later. Until the member starts the tour or says
// "Don't show this again", it comes back the next day they visit, up to four
// times in all (MAX_REMIND_LATER reminders after the first).
import React, { useEffect, useState } from 'react';
import { BookOpen, HandHeart, Users, Compass, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTutorials } from '@rekindle/features/tutorial/TutorialProvider';
import { INTRO_TUTORIAL_ID } from './definitions';

interface Props {
  /** False while something else owns the screen (a deep link, a workspace). */
  allowed: boolean;
}

export const WelcomeDialog: React.FC<Props> = ({ allowed }) => {
  const { welcomeDue, setWelcome, start, tr, tutorials } = useTutorials();
  const [open, setOpen] = useState(false);
  const intro = tutorials.find((t) => t.id === INTRO_TUTORIAL_ID);

  useEffect(() => {
    if (!allowed || !welcomeDue) return;
    // Let the home screen settle first so the tour has real elements to show.
    const id = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(id);
  }, [allowed, welcomeDue]);

  if (!intro) return null;
  const w = (key: string, fallback: string) => tr(`welcome.${key}`, fallback);

  const startTour = () => {
    setOpen(false);
    // "dismissed" here means "answered": the welcome won't show again, and
    // finishing the tour records it as completed.
    setWelcome('dismissed');
    start(INTRO_TUTORIAL_ID, { restart: true });
  };
  const later = () => { setOpen(false); setWelcome('later'); };
  const never = () => { setOpen(false); setWelcome('dismissed'); };

  const points = [
    { icon: <BookOpen className="h-5 w-5 text-purple-600" />, bg: 'bg-purple-100', text: w('point1', 'Read a daily devotional and speak daily declarations and affirmations.') },
    { icon: <HandHeart className="h-5 w-5 text-rose-600" />, bg: 'bg-rose-100', text: w('point2', 'Pray with guided prayers, keep a prayer journal and share requests.') },
    { icon: <Users className="h-5 w-5 text-emerald-600" />, bg: 'bg-emerald-100', text: w('point3', 'Join your ministry, live services and the wider community.') },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && open) later(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-purple-800">
            {w('title', 'Welcome to Rekindle')}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {w('subtitle', 'A place to grow in your daily walk with God.')}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {points.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className={`${p.bg} flex h-9 w-9 shrink-0 items-center justify-center rounded-full`}>{p.icon}</span>
              <span className="text-sm leading-relaxed text-gray-700">{p.text}</span>
            </li>
          ))}
        </ul>

        <div className="rounded-xl bg-purple-50 p-3 text-sm text-purple-900">
          <p className="flex items-center gap-2 font-semibold">
            <Compass className="h-4 w-4" />{w('howTitle', 'How the tour works')}
          </p>
          <p className="mt-1 leading-relaxed">
            {w('howBody', 'We will highlight parts of the real screen and explain them one at a time. You can go back, skip or stop whenever you like.')}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-purple-700">
            <Clock className="h-3.5 w-3.5" />{w('time', 'About 2 minutes')}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={startTour} className="min-h-[44px] w-full bg-purple-600 hover:bg-purple-700">
            {w('start', 'Start Tutorial')}
          </Button>
          <Button variant="outline" onClick={later} className="min-h-[44px] w-full">
            {w('exploreForNow', 'Explore on My Own for Now')}
          </Button>
          <Button variant="ghost" onClick={never} className="min-h-[44px] w-full text-gray-600">
            {w('never', "Don't Show This Again")}
          </Button>
          <p className="text-center text-xs text-gray-500">
            {w('whereLater', 'You can start the tour any time from Help (?) at the top.')}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
