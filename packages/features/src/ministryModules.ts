import { useCurrentMinistry } from './CurrentMinistryContext';

// Phase 3, step 5 — per-ministry feature flags. Which bundled modules a ministry
// exposes is a config on the tenant (ministry_groups.settings.modules), merged
// over these catalog defaults. This is UI-level gating; RLS is the real
// enforcement boundary (Phase 4).

export interface MinistryModule {
  key: string;
  label: string;
  defaultEnabled: boolean;
}

export const MINISTRY_MODULES: MinistryModule[] = [
  { key: 'devotionals', label: 'Devotionals', defaultEnabled: true },
  { key: 'prayer', label: 'Prayer', defaultEnabled: true },
  { key: 'affirmations', label: 'Affirmations', defaultEnabled: true },
  { key: 'declarations', label: 'Declarations', defaultEnabled: true },
  { key: 'reading', label: 'Reading plans', defaultEnabled: true },
  { key: 'books', label: 'Books', defaultEnabled: true },
  { key: 'audio', label: 'Audio / TTS', defaultEnabled: true },
  { key: 'members', label: 'Members', defaultEnabled: true },
  { key: 'events', label: 'Events', defaultEnabled: true },
  { key: 'giving', label: 'Giving', defaultEnabled: true },
  { key: 'broadcasts', label: 'Broadcasts', defaultEnabled: true },
  { key: 'live', label: 'Live / meetings', defaultEnabled: true },
  { key: 'analytics', label: 'Analytics', defaultEnabled: true },
  { key: 'branding', label: 'Branding', defaultEnabled: false },
];

const DEFAULTS: Record<string, boolean> = Object.fromEntries(
  MINISTRY_MODULES.map((m) => [m.key, m.defaultEnabled]),
);

/** Merge a tenant's stored module config over the catalog defaults. */
export function resolveModules(
  config: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  return { ...DEFAULTS, ...(config ?? {}) };
}

// Phase 6 — which modules a subscription TIER must permit. A module listed here is
// available only when the tenant's tier grants the matching capability (see
// @rekindle/auth/ministryEntitlements MinistryCaps). Modules not listed are on all
// tiers (the free content bundle). This is UI gating; RLS/usage stay the hard limits.
export const MODULE_TIER_CAP: Record<string, string> = {
  broadcasts: 'broadcastMessaging',
  live: 'liveChannels',
  branding: 'branding',
  analytics: 'advancedAnalytics',
};

/**
 * A module is ON only if the tenant enabled it (toggle) AND the tier permits it (cap).
 * `caps` is MinistryEntitlements.caps; pass an all-true object to ignore tier gating.
 */
export function resolveModulesForTier(
  config: Record<string, boolean> | null | undefined,
  caps: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const out = resolveModules(config);
  if (!caps) return out;
  for (const [mod, cap] of Object.entries(MODULE_TIER_CAP)) {
    if (!caps[cap]) out[mod] = false;
  }
  return out;
}

/** Resolved module map for the current ministry. */
export function useMinistryModules(): Record<string, boolean> {
  const { currentMinistry } = useCurrentMinistry();
  return resolveModules(currentMinistry?.modules ?? null);
}

/** True if a module is enabled for the current ministry (unknown keys default on). */
export function useModuleEnabled(key: string): boolean {
  const modules = useMinistryModules();
  return modules[key] ?? true;
}
