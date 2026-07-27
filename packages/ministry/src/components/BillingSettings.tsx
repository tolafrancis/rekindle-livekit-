import { useEffect, useState, type ReactNode } from 'react';
import { useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { useMinistryBranding } from '@rekindle/features/ministryBranding';
import { useMinistryEntitlements } from '@rekindle/features/useMinistryEntitlements';
import { detectRegion, COUNTRY_OPTIONS } from '@rekindle/features/regionDetection';
import {
  fetchMinistryPartnerPlans,
  resolvePlanPricing,
  startMinistryCheckout,
  openMinistryBillingPortal,
  fetchAddonCatalog,
  fetchMinistryAddons,
  purchaseAddon,
  type MinistryPartnerPlan,
  type MinistryAddonCatalogItem,
  type MinistryAddon,
  type BillingProvider,
  type BillingCycle,
} from '@rekindle/features/ministryBilling';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';

// Ministry Partner subscription flow. Region-routed: Nigeria pays via Paystack
// (NGN, real recurring subscription), everywhere else via Stripe (USD, real
// recurring subscription) or PayPal (hosted billing link — no live webhook yet,
// an admin confirms manually after checking PayPal). Pricing/plan IDs come
// entirely from ministry_partner_plans (admin-configurable, no code changes
// needed to adjust prices or payment links).

const money = (amount: number, currency: string) =>
  currency === 'NGN' ? `₦${amount.toLocaleString()}` : `$${amount.toLocaleString()}`;

export default function BillingSettings() {
  const { currentMinistryId } = useCurrentMinistry();
  const { name: ministryName } = useMinistryBranding();
  const { entitlements, loading: entitlementsLoading } = useMinistryEntitlements();

  const [plans, setPlans] = useState<MinistryPartnerPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [country, setCountry] = useState('US');
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [selectedPlan, setSelectedPlan] = useState<MinistryPartnerPlan | null>(null);
  const [provider, setProvider] = useState<BillingProvider>('stripe');
  const [busy, setBusy] = useState(false);

  const [addonCatalog, setAddonCatalog] = useState<MinistryAddonCatalogItem[]>([]);
  const [myAddons, setMyAddons] = useState<MinistryAddon[]>([]);
  const [buyingAddonId, setBuyingAddonId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ plans: fetchedPlans }, region] = await Promise.all([fetchMinistryPartnerPlans(), detectRegion()]);
      setPlans(fetchedPlans);
      setCountry(region.countryCode);
      setPlansLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { items } = await fetchAddonCatalog();
      setAddonCatalog(items);
    })();
  }, []);

  useEffect(() => {
    if (!currentMinistryId) return;
    (async () => {
      const { addons } = await fetchMinistryAddons(currentMinistryId);
      setMyAddons(addons);
    })();
  }, [currentMinistryId]);

  const buyAddon = async (item: MinistryAddonCatalogItem) => {
    if (!currentMinistryId) return;
    setBuyingAddonId(item.id);
    const res = await purchaseAddon({
      ministryId: currentMinistryId,
      catalogId: item.id,
      provider: country === 'NG' ? 'paystack' : 'stripe',
      country,
    });
    setBuyingAddonId(null);
    if (res.error) {
      return toast({ title: 'Could not purchase add-on', description: res.error, variant: 'destructive' });
    }
    if (res.url) {
      window.location.href = res.url;
      return;
    }
    toast({ title: 'Add-on purchased', description: item.label });
    const { addons } = await fetchMinistryAddons(currentMinistryId);
    setMyAddons(addons);
  };

  const currentSlug = entitlements.tierSlug;
  const isPaid = currentSlug !== 'free';
  const isNigeria = country === 'NG';

  const selectPlan = (plan: MinistryPartnerPlan) => {
    setSelectedPlan(plan);
    setProvider(isNigeria ? 'paystack' : plan.stripePriceIdMonthly || !plan.paypalBillingLinkMonthly ? 'stripe' : 'paypal');
    setStep('confirm');
  };

  const onCountryChange = (code: string) => {
    setCountry(code);
    if (selectedPlan) setProvider(code === 'NG' ? 'paystack' : 'stripe');
  };

  const confirmAndPay = async () => {
    if (!currentMinistryId || !selectedPlan) return;
    setBusy(true);
    const res = await startMinistryCheckout({
      ministryId: currentMinistryId, plan: selectedPlan.slug, provider, cycle, country,
    });
    setBusy(false);
    if (res.error || !res.url) {
      return toast({ title: 'Could not start checkout', description: res.error ?? 'No checkout URL', variant: 'destructive' });
    }
    window.location.href = res.url;
  };

  const manage = async () => {
    if (!currentMinistryId) return;
    setBusy(true);
    const res = await openMinistryBillingPortal(currentMinistryId);
    setBusy(false);
    if (res.error || !res.url) {
      return toast({ title: 'Could not open billing portal', description: res.error ?? '—', variant: 'destructive' });
    }
    window.location.href = res.url;
  };

  if (plansLoading || entitlementsLoading) {
    return <div className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">Loading plans…</div>;
  }

  // ── Confirmation step ────────────────────────────────────────────────
  if (step === 'confirm' && selectedPlan) {
    const { currency, amount } = resolvePlanPricing(selectedPlan, country, cycle);
    const availableProviders: BillingProvider[] = isNigeria
      ? ['paystack']
      : (['stripe', 'paypal'] as BillingProvider[]).filter((p) =>
          p === 'stripe' ? true : !!(cycle === 'annual' ? selectedPlan.paypalBillingLinkAnnual : selectedPlan.paypalBillingLinkMonthly)
        );

    return (
      <div className="mx-auto max-w-lg p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Confirm your subscription</h1>
        <Card>
          <CardContent className="pt-6 space-y-4 text-sm">
            <Row label="Ministry" value={ministryName ?? '—'} />
            <Row
              label="Country"
              value={
                <Select value={country} onValueChange={onCountryChange}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              }
            />
            <Row label="Currency" value={currency} />
            <Row
              label="Payment provider"
              value={
                availableProviders.length > 1 ? (
                  <Select value={provider} onValueChange={(v) => setProvider(v as BillingProvider)}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((p) => (
                        <SelectItem key={p} value={p}>{p === 'stripe' ? 'Stripe (card)' : p === 'paypal' ? 'PayPal' : 'Paystack'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  provider === 'paystack' ? 'Paystack' : provider === 'paypal' ? 'PayPal' : 'Stripe (card)'
                )
              }
            />
            <Row label="Plan" value={selectedPlan.name} />
            <Row label="Billing" value={`${money(amount, currency)} / ${cycle === 'annual' ? 'year' : 'month'}`} />
          </CardContent>
        </Card>
        {provider === 'paypal' && (
          <p className="text-xs text-muted-foreground">
            You'll complete payment on PayPal. Your subscription is marked pending until our team confirms the
            payment — this is usually quick, but access won't be immediate the way Stripe/Paystack are.
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep('select')} disabled={busy}>Back</Button>
          <Button className="flex-1" onClick={confirmAndPay} disabled={busy}>
            {busy ? 'Redirecting…' : `Confirm & Pay ${money(amount, currency)}`}
          </Button>
        </div>
      </div>
    );
  }

  // ── Tier selection step ──────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Ministry Partner</h1>
        {isPaid && <Badge>{entitlements.tierName} · {entitlements.status}</Badge>}
        {isPaid && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={manage} disabled={busy}>
            {busy ? 'Opening…' : 'Manage billing'}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Billing</span>
        <div className="inline-flex rounded-md border p-0.5">
          {(['monthly', 'annual'] as BillingCycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-3 py-1 rounded capitalize ${cycle === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {c}{c === 'annual' ? ' (2 months free)' : ''}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground ml-4">Pricing for</span>
        <Select value={country} onValueChange={onCountryChange}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COUNTRY_OPTIONS.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const { currency, amount } = resolvePlanPricing(plan, country, cycle);
          const isCurrent = plan.slug === currentSlug;
          const memberRange = plan.maxMembers ? `${plan.minMembers}–${plan.maxMembers} members` : `${plan.minMembers}+ members`;
          return (
            <Card key={plan.slug} className={isCurrent ? 'border-primary' : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrent && <Badge>Current</Badge>}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{memberRange}</p>
                <div className="text-2xl font-semibold">
                  {money(amount, currency)}
                  <span className="text-sm font-normal text-muted-foreground">/{cycle === 'annual' ? 'yr' : 'mo'}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {plan.features.map((f) => <li key={f}>• {f}</li>)}
                </ul>
                <Button className="w-full" variant={isCurrent ? 'outline' : 'default'} disabled={isCurrent} onClick={() => selectPlan(plan)}>
                  {isCurrent ? 'Current plan' : isPaid ? 'Switch' : 'Select'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Nigeria pays in Naira via Paystack; everywhere else pays in USD via Stripe or PayPal. Your plan activates
        automatically after payment (PayPal is confirmed manually — see note at checkout).
      </p>

      {isPaid && addonCatalog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add-ons</CardTitle>
            <p className="text-sm text-muted-foreground">
              Extra storage or members on top of your plan. Billed monthly alongside your subscription.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {myAddons.length > 0 && (
              <ul className="space-y-1 text-sm">
                {myAddons.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span>{a.addonType === 'storage_pack' ? `+${a.unitGb} GB storage` : a.addonType === 'member_block' ? `+${a.unitMembers} members` : 'Gift Aid & HMRC submission'}</span>
                    <Badge variant="secondary">Active — ${a.priceUsd}/mo</Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {addonCatalog.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">${item.priceUsd}/mo</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={buyingAddonId === item.id}
                    onClick={() => buyAddon(item)}
                  >
                    {buyingAddonId === item.id ? 'Buying…' : 'Buy'}
                  </Button>
                </div>
              ))}
            </div>
            {country !== 'NG' && (
              <p className="text-xs text-muted-foreground">
                Add-ons are charged to the card on file for your plan (Stripe) — subscribe with a card first if you haven't.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
