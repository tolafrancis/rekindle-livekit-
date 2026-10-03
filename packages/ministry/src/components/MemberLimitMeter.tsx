import { useEffect, useState } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import {
  getMinistryMemberUsage,
  MEMBER_LIMIT_WARN_RATIO,
  type MinistryMemberUsage,
} from '@rekindle/auth/ministryEntitlements';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';

// Members-vs-plan-cap meter. `card` (billing page) always shows the count;
// `banner` (admin dashboard) only appears from MEMBER_LIMIT_WARN_RATIO up, so
// admins hear about the cap before new members start getting turned away by
// enforce_ministry_member_limit.
// Billing lives in the standalone Ministry app; the consumer app (which also
// renders the ministry dashboard) sets VITE_MINISTRY_APP_URL to reach it.
const BILLING_URL = (() => {
  const env = (import.meta as any).env || {};
  if (env.VITE_APP_TYPE === 'ministry') return '/settings/billing';
  const base = env.VITE_MINISTRY_APP_URL;
  return typeof base === 'string' && base.trim() ? `${base.trim().replace(/\/+$/, '')}/settings/billing` : '/settings/billing';
})();

export function MemberLimitMeter({ ministryId, variant }: { ministryId?: string | null; variant: 'card' | 'banner' }) {
  const [usage, setUsage] = useState<MinistryMemberUsage | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMinistryMemberUsage(ministryId).then((u) => { if (!cancelled) setUsage(u); });
    return () => { cancelled = true; };
  }, [ministryId]);

  if (!usage) return null;
  const unlimited = usage.limit === -1;
  const full = !unlimited && usage.count >= usage.limit;
  const warn = !unlimited && usage.ratio >= MEMBER_LIMIT_WARN_RATIO;
  if (variant === 'banner' && !warn) return null;

  const pct = unlimited ? 0 : Math.min(100, Math.round(usage.ratio * 100));
  const barColor = full ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-primary';

  if (variant === 'banner') {
    return (
      <Card className={full ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <AlertTriangle className={`h-5 w-5 shrink-0 ${full ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-gray-900">
              {full
                ? `Your ministry has reached its member limit (${usage.limit.toLocaleString()}).`
                : `You're at ${pct}% of your member limit (${usage.count.toLocaleString()} of ${usage.limit.toLocaleString()}).`}
            </p>
            <p className="text-gray-600">
              {full ? "New members can't join until you upgrade." : 'Upgrade before new members are turned away.'}
            </p>
          </div>
          <Button asChild size="sm" variant={full ? 'destructive' : 'default'}>
            <a href={BILLING_URL}>Upgrade plan</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Members</span>
          <span className="font-medium">
            {usage.count.toLocaleString()} / {unlimited ? 'Unlimited' : usage.limit.toLocaleString()}
          </span>
        </div>
        {!unlimited && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {full && <p className="text-xs text-red-600">Member limit reached. New members can't join until you upgrade.</p>}
        {!full && warn && <p className="text-xs text-amber-700">You're at {pct}% of your member limit.</p>}
      </CardContent>
    </Card>
  );
}
