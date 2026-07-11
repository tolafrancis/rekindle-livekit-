/**
 * useOnboardingTips — delivers feature-discovery tips to new users on a
 * gentle cadence (one tip every few days), using the existing notify()
 * dispatcher so each tip appears in the in-app feed (and push, if opted in).
 *
 * Progress is tracked per user in `user_onboarding_tips` (run onboarding-tips.sql).
 * At most ONE tip fires per app session, and only when the next tip is due,
 * so returning users are never spammed with a backlog.
 *
 * Disable for a user by setting user_onboarding_tips.enabled = false.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from './AuthContext';
import { notify } from './notify';
import { ONBOARDING_TIPS, localizeTip } from './onboardingTips';

// Gentle cadence: ~1 tip every 3 days
const TIP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

export function useOnboardingTips(language: string = 'en') {
  const { user } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!user?.id || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        // Load (or create) this user's tip-series state
        let { data: state } = await supabase
          .from('user_onboarding_tips')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!state) {
          const { data: created, error } = await supabase
            .from('user_onboarding_tips')
            .insert({
              user_id: user.id,
              next_index: 0,
              next_tip_at: new Date().toISOString(), // first tip is due immediately
              enabled: true,
              completed: false,
            })
            .select()
            .maybeSingle();
          if (error) {
            console.error('[onboardingTips] could not initialise state:', error.message);
            return;
          }
          state = created;
        }

        if (!state || !state.enabled || state.completed) return;

        // Not due yet
        if (new Date(state.next_tip_at).getTime() > Date.now()) return;

        const idx: number = state.next_index ?? 0;

        // Series finished
        if (idx >= ONBOARDING_TIPS.length) {
          await supabase
            .from('user_onboarding_tips')
            .update({ completed: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          return;
        }

        const tip = ONBOARDING_TIPS[idx];
        const { title, body } = localizeTip(tip, language);

        // Deliver via the unified dispatcher (in-app feed + push if opted in)
        await notify({
          type: 'onboarding_tip',
          userId: user.id,
          title,
          body,
          link: tip.link,
          senderName: 'ReKindle Tips',
        });

        const nextIndex = idx + 1;
        await supabase
          .from('user_onboarding_tips')
          .update({
            next_index: nextIndex,
            next_tip_at: new Date(Date.now() + TIP_INTERVAL_MS).toISOString(),
            completed: nextIndex >= ONBOARDING_TIPS.length,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch (e) {
        console.error('[onboardingTips] failed:', e);
      }
    })();
  }, [user?.id, language]);
}
