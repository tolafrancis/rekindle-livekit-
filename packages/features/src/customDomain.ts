import { supabase } from '@rekindle/supabase';

// Phase 6 (6d) — client wrapper for the cloudflare-custom-hostname edge function.
// A ministry admin adds/checks/removes their custom domain; the function authorizes
// (is_group_admin), talks to Cloudflare for SaaS, and mirrors state onto
// ministry_groups.white_label_domain + domain_status. Gate the UI on the
// entitlements `customDomain` cap (paid tier) before calling add().

export type DomainStatus = 'none' | 'pending' | 'verifying' | 'active' | 'error';

export interface DomainDnsRecords {
  cname: { name: string; value: string };
  ownership: { name: string; type: string; value: string } | null;
  ssl: Array<{ txt_name?: string; txt_value?: string; http_url?: string; http_body?: string }> | null;
}

export interface CustomDomainResult {
  ok?: boolean;
  status: DomainStatus;
  dns?: DomainDnsRecords;
  error?: string;
  details?: unknown;
}

async function call(action: 'add' | 'status' | 'remove', ministryId: string, hostname?: string) {
  const { data, error } = await supabase.functions.invoke('cloudflare-custom-hostname', {
    body: { action, ministryId, hostname },
  });
  if (error) return { status: 'error' as DomainStatus, error: error.message };
  return data as CustomDomainResult;
}

/** Provision a custom domain; returns the DNS/verification records the church must add. */
export const addCustomDomain = (ministryId: string, hostname: string) =>
  call('add', ministryId, hostname);

/** Refresh verification/SSL status from Cloudflare and mirror it to domain_status. */
export const checkCustomDomainStatus = (ministryId: string) => call('status', ministryId);

/** Remove the custom domain (deletes the Cloudflare custom hostname, clears the field). */
export const removeCustomDomain = (ministryId: string) => call('remove', ministryId);
