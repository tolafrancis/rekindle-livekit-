import React, { useEffect, useState } from 'react';
import { Card } from '@rekindle/ui/card';
import { Flame } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { getStreakSummary, nextMilestone, StreakSummary } from '../streak';

export const StreakWidget: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<StreakSummary | null>(null);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;

    const refresh = () => {
      getStreakSummary(user.id).then(s => { if (active) setSummary(s); });
    };

    refresh();
    window.addEventListener('streak:updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('streak:updated', refresh);
    };
  }, [user?.id]);

  if (!summary) return null;

  const { current, longest, activeToday } = summary;
  const target = nextMilestone(current);
  const pct = Math.min(100, Math.round((current / target) * 100));

  const message =
    current === 0
      ? t('streak', 'msgBegin', 'Begin your walk today — read a devotional or pray.')
      : activeToday
        ? t('streak', 'msgActiveToday', "You've spent time with God today. Well done.")
        : t('streak', 'msgKeepAlive', 'Keep it alive — spend a moment with God today.');

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <div className="bg-gradient-to-br from-orange-500 to-amber-600 text-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-full flex-shrink-0 ${activeToday ? 'bg-white/25' : 'bg-white/10'}`}>
              <Flame className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold leading-none">{current}</span>
                <span className="text-sm opacity-90">{current === 1 ? t('streak', 'day', 'day') : t('streak', 'days', 'days')}</span>
              </div>
              <p className="text-xs uppercase tracking-widest opacity-80 mt-0.5">{t('streak', 'faithfulnessStreak', 'Faithfulness streak')}</p>
            </div>
          </div>
          {longest > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="text-base font-semibold leading-none">{longest}</p>
              <p className="text-[10px] uppercase tracking-wide opacity-70 mt-1">{t('streak', 'best', 'best')}</p>
            </div>
          )}
        </div>

        <p className="text-sm opacity-90 mt-3 leading-relaxed">{message}</p>

        {current > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] opacity-80 mb-1">
              <span>{t('streak', 'nextMilestone', 'Next milestone')}</span>
              <span>{t('streak', 'progress', '{current} / {target} days', { current, target })}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white/90 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default StreakWidget;
