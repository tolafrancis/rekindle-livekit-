import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { Progress } from '@rekindle/ui/progress';
import { Button } from '@rekindle/ui/button';
import { Sparkles, X } from 'lucide-react';

interface Props {
  ministryId: string;
  ministryName?: string;
  slug?: string;            // used for the default "open profile" link
  onOpen?: () => void;      // optional custom handler
  threshold?: number;       // hide when completion >= threshold (default 100)
}

/**
 * Small in-app nudge that appears when the member's profile for a ministry is
 * incomplete. Renders nothing if there's no profile, it's complete, or dismissed.
 */
const ProfileCompletionPrompt: React.FC<Props> = ({ ministryId, ministryName, slug, onOpen, threshold = 100 }) => {
  const { user } = useAuth();
  const [pct, setPct] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user || !ministryId) return;
      const { data } = await supabase
        .from('ministry_member_profiles')
        .select('profile_completion_percentage')
        .eq('ministry_id', ministryId).eq('user_id', user.id).maybeSingle();
      if (data) setPct(data.profile_completion_percentage ?? 0);
    })();
  }, [user, ministryId]);

  if (dismissed || pct === null || pct >= threshold) return null;

  const open = () => (onOpen ? onOpen() : slug ? (window.location.href = `/my-membership/${slug}`) : undefined);

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 relative">
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-purple-300 hover:text-purple-500"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles className="h-4 w-4 text-purple-600" />
        <p className="text-sm font-medium text-purple-900">
          Your {ministryName || 'membership'} profile is {pct}% complete
        </p>
      </div>
      <Progress value={pct} className="h-1.5 mb-3" />
      <Button size="sm" onClick={open}>Finish my profile</Button>
    </div>
  );
};

export default ProfileCompletionPrompt;
