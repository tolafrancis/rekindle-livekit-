import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, BookOpen, HandHeart, Sparkles, Flame, ArrowRight } from 'lucide-react';

interface OnboardingTipsProps {
  onNavigate: (tab: string) => void;
}

const STORAGE_PREFIX = 'rekindle_tips_seen_v1';

interface Tip {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
}

const tips: Tip[] = [
  {
    icon: <Building2 className="h-5 w-5 text-purple-600" />,
    iconBg: 'bg-purple-100',
    title: 'Join a ministry for their devotionals',
    body: 'Open the Ministries tab and join one to receive its devotionals, such as Open Heavens by Pastor E.A. Adeboye. Then set your Devotional source to "My Ministry" on the home screen.',
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

export const OnboardingTips: React.FC<OnboardingTipsProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const seen = localStorage.getItem(`${STORAGE_PREFIX}_${user.id}`);
      if (!seen) setOpen(true);
    } catch {
      // localStorage unavailable; show once for this session
      setOpen(true);
    }
  }, [user?.id]);

  const dismiss = () => {
    try {
      if (user?.id) localStorage.setItem(`${STORAGE_PREFIX}_${user.id}`, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const goToMinistries = () => {
    dismiss();
    onNavigate('ministries');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      {/* flex column with a fixed header/footer and a scrollable tips list so
          the action buttons stay visible on short mobile screens. */}
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col overflow-hidden gap-0 p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="text-xl">Welcome to ReKindle</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            A few things to help you get started.
          </p>
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
          <Button onClick={goToMinistries} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700">
            Explore Ministries
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingTips;
