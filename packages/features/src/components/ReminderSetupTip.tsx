// A dismissible "ReKindle Tip" on the home screen that nudges users to set up
// daily reminders. Only shows when the user has NOT enabled any reminder yet, so
// it disappears the moment they set one up (or dismiss it).

import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Bell, Sparkles, X, ArrowRight } from 'lucide-react';
import { Button } from '@rekindle/ui/button';

const DISMISS_KEY = 'reminderSetupTipDismissed';

interface Props {
  /** Take the user to the reminders screen (the Daily Reminders section). */
  onSetup: () => void;
}

export const ReminderSetupTip: React.FC<Props> = ({ onSetup }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch { /* ignore */ }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('daily_reminders')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const reminders = (data?.daily_reminders as { enabled?: boolean }[] | null) ?? [];
      const anyEnabled = Array.isArray(reminders) && reminders.some((r) => r?.enabled);
      setShow(!anyEnabled); // only nudge users who haven't turned any reminder on
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="relative rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-4 sm:p-5">
      <button
        onClick={dismiss}
        aria-label={t('reminderSetupTip', 'dismiss', 'Dismiss')}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-purple-600/10 p-2 shrink-0">
          <Bell className="h-5 w-5 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">
            <Sparkles className="h-3.5 w-3.5" /> {t('reminderSetupTip', 'badge', 'ReKindle Tip')}
          </div>
          <p className="font-semibold text-gray-900">
            {t('reminderSetupTip', 'title', 'Build a daily rhythm with reminders')}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {t('reminderSetupTip', 'body',
              'Consistency grows faith. Set a couple of daily reminders so the app nudges you at the right moments — try a morning devotional around 6:00 AM to start your day in the Word, and an evening prayer around 8:00 PM to close it. Add Bible reading or scripture memory as the habit grows.')}
          </p>
          <Button size="sm" onClick={onSetup} className="mt-3 bg-purple-600 hover:bg-purple-700">
            {t('reminderSetupTip', 'cta', 'Set up reminders')} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReminderSetupTip;
