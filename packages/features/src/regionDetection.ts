import { supabase } from '@rekindle/supabase';

// Resolves the visitor's country via the detect-region edge function, cached
// per browser session so repeat visits don't re-hit the lookup. Generic/
// reusable — first consumer is the Ministry Partner subscription flow.

export interface DetectedRegion {
  countryCode: string;
  countryName: string;
}

const CACHE_KEY = 'rk_detected_region';
const FALLBACK: DetectedRegion = { countryCode: 'US', countryName: 'United States' };

export async function detectRegion(): Promise<DetectedRegion> {
  if (typeof window !== 'undefined') {
    const cached = window.sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached) as DetectedRegion; } catch { /* fall through to re-detect */ }
    }
  }

  const { data, error } = await supabase.functions.invoke('detect-region', { method: 'GET' as never });
  const region: DetectedRegion = (!error && data?.country_code)
    ? { countryCode: data.country_code, countryName: data.country_name ?? data.country_code }
    : FALLBACK;

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(region));
  }
  return region;
}

// Common ISO-3166 country list for the "change country" picker on the
// confirmation screen. Kept short and focused rather than the full ~250-entry
// list — extend as needed.
export const COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AU', name: 'Australia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
];
