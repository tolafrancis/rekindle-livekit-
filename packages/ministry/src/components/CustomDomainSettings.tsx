import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { useMinistryEntitlements } from '@rekindle/features/useMinistryEntitlements';
import {
  addCustomDomain,
  checkCustomDomainStatus,
  removeCustomDomain,
  type CustomDomainResult,
  type DomainStatus,
} from '@rekindle/features/customDomain';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { toast } from '@rekindle/ui/use-toast';

// Phase 6 (6d) — custom-domain settings. A ministry admin points their own domain at
// the product: enter host -> provision (Cloudflare) -> add the shown DNS records ->
// verify until active. Gated on the tier's customDomain capability.

const STATUS_LABEL: Record<DomainStatus, string> = {
  none: 'Not set',
  pending: 'Pending DNS',
  verifying: 'Verifying…',
  active: 'Active',
  error: 'Needs attention',
};

function DnsRow({ label, name, type, value }: { label: string; name: string; type: string; value: string }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="font-medium">{label}</div>
      <div className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <span>Type</span><span className="font-mono">{type}</span>
        <span>Name</span><span className="font-mono break-all">{name}</span>
        <span>Value</span><span className="font-mono break-all">{value}</span>
      </div>
    </div>
  );
}

export default function CustomDomainSettings() {
  const { currentMinistryId, currentMinistry } = useCurrentMinistry();
  const { entitlements, loading: entLoading } = useMinistryEntitlements();
  const canUse = entitlements.caps.customDomain;

  const [host, setHost] = useState('');
  const [status, setStatus] = useState<DomainStatus>('none');
  const [dns, setDns] = useState<CustomDomainResult['dns'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load the ministry's current domain + refresh its live status.
  const load = useCallback(async () => {
    if (!currentMinistryId) return;
    const { data } = await supabase
      .from('ministry_groups')
      .select('white_label_domain, domain_status')
      .eq('id', currentMinistryId)
      .maybeSingle();
    const existing = (data as { white_label_domain?: string; domain_status?: string } | null) ?? null;
    if (existing?.white_label_domain) {
      setHost(existing.white_label_domain);
      setStatus((existing.domain_status as DomainStatus) ?? 'pending');
      const res = await checkCustomDomainStatus(currentMinistryId);
      if (res?.status) setStatus(res.status);
      if (res?.dns) setDns(res.dns);
    }
    setLoaded(true);
  }, [currentMinistryId]);

  useEffect(() => { void load(); }, [load]);

  const provisioned = status !== 'none';

  const onAdd = async () => {
    if (!currentMinistryId || !host.trim()) return;
    setBusy(true);
    const res = await addCustomDomain(currentMinistryId, host.trim().toLowerCase());
    setBusy(false);
    if (res?.error) return toast({ title: 'Could not add domain', description: res.error, variant: 'destructive' });
    setStatus(res.status);
    setDns(res.dns ?? null);
    toast({ title: 'Domain added', description: 'Add the DNS records below, then Verify.' });
  };

  const onVerify = async () => {
    if (!currentMinistryId) return;
    setBusy(true);
    const res = await checkCustomDomainStatus(currentMinistryId);
    setBusy(false);
    if (res?.status) setStatus(res.status);
    if (res?.dns) setDns(res.dns);
    toast({
      title: res?.status === 'active' ? 'Domain is live' : 'Not verified yet',
      description: res?.status === 'active' ? 'Your custom domain is active.' : 'DNS may take a while to propagate.',
    });
  };

  const onRemove = async () => {
    if (!currentMinistryId) return;
    setBusy(true);
    await removeCustomDomain(currentMinistryId);
    setBusy(false);
    setHost(''); setStatus('none'); setDns(null);
    toast({ title: 'Domain removed' });
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Custom domain
            {provisioned && (
              <Badge variant={status === 'active' ? 'default' : status === 'error' ? 'destructive' : 'secondary'}>
                {STATUS_LABEL[status]}
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Serve {currentMinistry?.name ?? 'your ministry'} on your own domain (e.g. worship.yourchurch.org).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!entLoading && !canUse ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Custom domains are available on a paid plan. Upgrade to connect your own domain.
              A free <span className="font-mono">{currentMinistry?.name ? '…' : ''}</span> subdomain is always included.
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dom">Domain</Label>
                <div className="flex gap-2">
                  <Input
                    id="dom"
                    value={host}
                    disabled={provisioned || busy || !canUse}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="worship.yourchurch.org"
                  />
                  {!provisioned ? (
                    <Button onClick={onAdd} disabled={busy || !canUse || !host.trim()}>
                      {busy ? 'Adding…' : 'Add domain'}
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={onVerify} disabled={busy}>Verify</Button>
                      <Button variant="ghost" onClick={onRemove} disabled={busy}>Remove</Button>
                    </>
                  )}
                </div>
              </div>

              {provisioned && dns && status !== 'active' && (
                <div className="space-y-2">
                  <p className="text-sm">Add these records at your DNS provider, then click Verify:</p>
                  <DnsRow label="Point your domain here" type="CNAME" name={dns.cname.name} value={dns.cname.value} />
                  {dns.ownership && (
                    <DnsRow label="Ownership verification" type={dns.ownership.type} name={dns.ownership.name} value={dns.ownership.value} />
                  )}
                  {dns.ssl?.map((r, i) => (
                    <DnsRow key={i} label="SSL validation" type="TXT" name={r.txt_name ?? '—'} value={r.txt_value ?? r.http_url ?? '—'} />
                  ))}
                </div>
              )}

              {status === 'active' && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">{host}</span> is live and serving your ministry.
                </p>
              )}
              {loaded && !provisioned && canUse && (
                <p className="text-xs text-muted-foreground">
                  You'll get DNS records to add after you submit your domain.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
