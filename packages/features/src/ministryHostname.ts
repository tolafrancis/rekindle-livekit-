import { supabase } from '@rekindle/supabase';

// Phase 6 (6d) — resolve which ministry a hostname maps to (subdomain via slug, or a
// custom domain via white_label_domain), using the public-safe get_ministry_by_hostname
// RPC. Lets the standalone app serve a church at church.yourproduct.com (or its own
// domain) and land visitors straight in that ministry's world.

export interface HostnameMinistry {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  domainStatus: string;
}

// Hosts that never map to a tenant (dev + the bare apex/marketing host).
const NON_TENANT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** True for a hostname that could carry a tenant subdomain/custom domain. */
export function isTenantHost(host: string): boolean {
  if (!host || NON_TENANT_HOSTS.has(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false; // raw IPv4
  return true;
}

/**
 * Resolve the ministry for a hostname (defaults to the current window host). Returns
 * null for dev/apex hosts or when nothing matches. Safe for anon (RPC is definer).
 */
export async function resolveMinistryFromHostname(
  host?: string,
): Promise<HostnameMinistry | null> {
  const h = (host ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!isTenantHost(h)) return null;
  try {
    const { data, error } = await supabase.rpc('get_ministry_by_hostname', { p_host: h });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url ?? null,
      themeColor: row.theme_color ?? null,
      domainStatus: row.domain_status ?? 'none',
    };
  } catch {
    return null;
  }
}
