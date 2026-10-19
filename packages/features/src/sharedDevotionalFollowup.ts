// Notes the first shared devotional a person opens on the web, so the
// send-shared-devotional-followup job can email them the next morning's
// devotional and the app's store link (migration 0401). The job decides
// whether they are a new sign-up and whether they allow email; inside the
// native or desktop apps there's nothing to record.

import { supabase } from '@rekindle/supabase';
import { isNativeApp, isDesktopApp } from './platform';

export function recordSharedDevotionalOpen(
  userId: string | null | undefined,
  kind: 'daily' | 'ministry',
  devotionalId: string,
  app: 'consumer' | 'ministry',
): void {
  if (!userId || !devotionalId || isNativeApp() || isDesktopApp()) return;
  // One row per person; later shared links leave the first one alone.
  void supabase
    .from('shared_devotional_followups')
    .upsert({ user_id: userId, kind, devotional_id: devotionalId, app }, { onConflict: 'user_id', ignoreDuplicates: true })
    .then(({ error }) => {
      if (error) console.warn('[sharedDevotionalFollowup] record failed:', error.message);
    });
}
