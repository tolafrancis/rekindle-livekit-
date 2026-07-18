import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { useAuth } from '../AuthContext';
import { BookOpen, HandHeart, Sparkles, Flame, ArrowRight, Users, Radio, Settings } from 'lucide-react';

export interface Tip {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
}

interface OnboardingTipsProps {
  onNavigate?: (tab: string) => void;
  /** Modal heading. Defaults to "Welcome to ReKindle" (consumer). */
  title?: string;
  subtitle?: string;
  /** Which tips to show. Defaults to the consumer set. */
  tips?: Tip[];
  /** Distinct dismissal key so e.g. ministry-leader onboarding tracks separately. */
  storageKey?: string;
  /** Primary footer action. undefined = consumer default ("Explore Ministries");
   *  null = only the "Got it" button. */
  primaryAction?: { label: React.ReactNode; onClick: () => void } | null;
}

const STORAGE_PREFIX = 'rekindle_tips_seen_v1';

/** Consumer onboarding — members using the main app. */
export const CONSUMER_TIPS: Tip[] = [
  {
    icon: <BookOpen className="h-5 w-5 text-purple-600" />,
    iconBg: 'bg-purple-100',
    title: 'Choose your devotional stream',
    body: 'On the home screen, open "Devotional stream" and pick the daily devotional you want to follow. You can switch between streams any time.',
  },
  {
    icon: <BookOpen className="h-5 w-5 text-blue-600" />,
    iconBg: 'bg-blue-100',
    title: "Read today's devotional",
    body: 'Your daily devotional sits on the home screen. Read it to the end and mark it complete.',
  },
  {
    icon: <HandHeart className="h-5 w-5 text-rose-600" />,
    iconBg: 'bg-rose-100',
    title: 'Pray through the Prayer Library',
    body: 'Find guided prayer series in the Prayer Library and pray through them day by day.',
  },
  {
    icon: <Sparkles className="h-5 w-5 text-amber-600" />,
    iconBg: 'bg-amber-100',
    title: 'Speak the daily declaration and affirmation',
    body: 'Each day you get a fresh declaration and affirmation on the home screen to speak over your life.',
  },
  {
    icon: <Flame className="h-5 w-5 text-orange-600" />,
    iconBg: 'bg-orange-100',
    title: 'Build your faithfulness streak',
    body: 'Completing a devotional or a prayer day keeps your streak alive. Show up daily and watch it grow.',
  },
];

/** Ministry LEADER onboarding — shown once to a leader after creating a ministry.
 *  Leader-oriented setup guidance (no consumer devotional-stream tip). */
export const MINISTRY_LEADER_TIPS: Tip[] = [
  {
    icon: <BookOpen className="h-5 w-5 text-purple-600" />,
    iconBg: 'bg-purple-100',
    title: 'Add your devotionals',
    body: 'In The Word → Devotionals, write your ministry’s daily devotional or choose a ReKindle stream for your members to follow.',
  },
  {
    icon: <Users className="h-5 w-5 text-blue-600" />,
    iconBg: 'bg-blue-100',
    title: 'Invite your members',
    body: 'Share your ministry’s join link or QR code so members can register and follow along.',
  },
  {
    icon: <Radio className="h-5 w-5 text-rose-600" />,
    iconBg: 'bg-rose-100',
    title: 'Go live',
    body: 'Start a live broadcast or an interactive meeting from Live so your members can join in real time.',
  },
  {
    icon: <Sparkles className="h-5 w-5 text-amber-600" />,
    iconBg: 'bg-amber-100',
    title: 'Set daily declarations & affirmations',
    body: 'Choose the daily declaration and affirmation your members speak over their lives from the home screen.',
  },
  {
    icon: <Settings className="h-5 w-5 text-gray-600" />,
    iconBg: 'bg-gray-100',
    title: 'Manage your ministry',
    body: 'Open Manage Ministry to handle members, content, donations, and your white-label settings.',
  },
];

export const OnboardingTips: React.FC<OnboardingTipsProps> = ({
  onNavigate,
  title = 'Welcome to ReKindle',
  subtitle = 'A few things to help you get started.',
  tips = CONSUMER_TIPS,
  storageKey = STORAGE_PREFIX,
  primaryAction,
}) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const seen = localStorage.getItem(`${storageKey}_${user.id}`);
      if (!seen) setOpen(true);
    } catch {
      // localStorage unavailable; show once for this session
      setOpen(true);
    }
  }, [user?.id, storageKey]);

  const dismiss = () => {
    try {
      if (user?.id) localStorage.setItem(`${storageKey}_${user.id}`, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  // Resolve the primary action: undefined → consumer default; null → none.
  const resolvedPrimary =
    primaryAction === undefined
      ? { label: (<>Explore Ministries<ArrowRight className="h-4 w-4 ml-1" /></>), onClick: () => onNavigate?.('ministries') }
      : primaryAction;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      {/* flex column with a fixed header/footer and a scrollable tips list so
          the action buttons stay visible on short mobile screens. */}
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col overflow-hidden gap-0 p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-4 py-1">
          {tips.map((tip, i) => (
            <div key={i} className="flex gap-3">
              <div className={`${tip.iconBg} rounded-full p-2 flex-shrink-0 h-9 w-9 flex items-center justify-center`}>
                {tip.icon}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900">{tip.title}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{tip.body}</p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 p-6 pt-3 border-t bg-white">
          <Button variant="ghost" onClick={dismiss} className="w-full sm:w-auto">
            Got it
          </Button>
          {resolvedPrimary && (
            <Button
              onClick={() => { dismiss(); resolvedPrimary.onClick(); }}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
            >
              {resolvedPrimary.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingTips;
