import { useState } from 'react';
import { useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { useMinistryEntitlements } from '@rekindle/features/useMinistryEntitlements';
import {
  MINISTRY_PLANS,
  startMinistryCheckout,
  openMinistryBillingPortal,
  type BillingProvider,
  type BillingCycle,
  type MinistryPlanSlug,
} from '@rekindle/features/ministryBilling';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { toast } from '@rekindle/ui/use-toast';

// Phase 6 (6b) — ministry billing. Shows the current plan (from entitlements) and the
// sellable ministry plans; subscribing/upgrading opens the provider's hosted checkout
// (ministry-checkout fn); the webhook then activates ministry_subscriptions.

export default function BillingSettings() {
  const { currentMinistryId } = useCurrentMinistry();
  const { entitlements, loading } = useMinistryEntitlements();
  const [provider, setProvider] = useState<BillingProvider>('stripe');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  const currentSlug = entitlements.tierSlug;
  const isPaid = currentSlug !== 'free';

  const subscribe = async (plan: MinistryPlanSlug) => {
    if (!currentMinistryId) return;
    setBusy(plan);
    const res = await startMinistryCheckout({ ministryId: currentMinistryId, plan, provider, cycle });
    setBusy(null);
    if (res.error || !res.url) {
      return toast({ title: 'Could not start checkout', description: res.error ?? 'No checkout URL', variant: 'destructive' });
    }
    window.location.href = res.url;
  };

  const manage = async () => {
    if (!currentMinistryId) return;
    setBusy('portal');
    const res = await openMinistryBillingPortal(currentMinistryId);
    setBusy(null);
    if (res.error || !res.url) {
      return toast({ title: 'Could not open billing portal', description: res.error ?? '—', variant: 'destructive' });
    }
    window.location.href = res.url;
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Billing</h1>
        {!loading && (
          <Badge variant={isPaid ? 'default' : 'secondary'}>
            {isPaid ? `${entitlements.tierName} · ${entitlements.status}` : 'Free plan'}
          </Badge>
        )}
        {isPaid && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={manage} disabled={busy === 'portal'}>
            {busy === 'portal' ? 'Opening…' : 'Manage billing'}
          </Button>
        )}
      </div>

      {/* Provider + cycle controls */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Pay with</span>
          <div className="inline-flex rounded-md border p-0.5">
            {(['stripe', 'paystack'] as BillingProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`px-3 py-1 rounded ${provider === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {p === 'stripe' ? 'Card (Stripe)' : 'Paystack'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Billing</span>
          <div className="inline-flex rounded-md border p-0.5">
            {(['monthly', 'yearly'] as BillingCycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-3 py-1 rounded capitalize ${cycle === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {c}{c === 'yearly' ? ' (2 months free)' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {MINISTRY_PLANS.map((plan) => {
          const price = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
          const isCurrent = plan.slug === currentSlug;
          return (
            <Card key={plan.slug} className={isCurrent ? 'border-primary' : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrent && <Badge>Current</Badge>}
                </CardTitle>
                <div className="text-2xl font-semibold">
                  ${price}
                  <span className="text-sm font-normal text-muted-foreground">/{cycle === 'yearly' ? 'yr' : 'mo'}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {plan.highlights.map((h) => <li key={h}>• {h}</li>)}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? 'outline' : 'default'}
                  disabled={isCurrent || busy === plan.slug}
                  onClick={() => subscribe(plan.slug)}
                >
                  {isCurrent ? 'Current plan' : busy === plan.slug ? 'Starting…' : isPaid ? 'Switch' : 'Subscribe'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Secure checkout via {provider === 'stripe' ? 'Stripe' : 'Paystack'}. Your plan activates automatically
        after payment. A free subdomain is always included; custom domains + white-label are on Enterprise.
      </p>
    </div>
  );
}
