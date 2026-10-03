import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { setPlatformSetting } from './platformSettings';

// Admin feature toggles, by nav group (migration 0394).
//
//   * GLOBAL switch: one platform_settings key per group. Off hides the group
//     everywhere (consumer app and every ministry space).
//   * PER-MINISTRY switch: a ministry_feature_overrides row. Off hides the
//     group in that ministry's space only. Writable by platform admins only.
//
// A group shows only when both allow it. Anything unset, still loading, or
// unreadable (e.g. the migration not applied yet) counts as ON, so a failure
// here can never hide features by accident. This is UI gating, not
// enforcement: it hides entry points the way the original Ministries switch
// does.

export type FeatureApp = 'consumer' | 'ministry';

export interface FeatureGroup {
  key: string;
  label: string;
  description: string;
  /** platform_settings key for the global switch. */
  settingKey: string;
  /** NAV_GROUPS id in apps/rekindle AppLayout, when the group exists there. */
  consumerNavId?: string;
  /** GROUPS id in packages/ministry MinistrySpace, when the group exists there. */
  ministryNavId?: string;
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: 'word',
    label: 'The Word',
    description: 'Devotionals, reading plan, scripture memory and books.',
    settingKey: 'feature_word_enabled',
    consumerNavId: 'the-word',
    ministryNavId: 'word',
  },
  {
    key: 'prayer',
    label: 'Prayer',
    description: 'Prayer library, journal and prayer wall.',
    settingKey: 'feature_prayer_enabled',
    consumerNavId: 'prayer',
    ministryNavId: 'prayer',
  },
  {
    key: 'community',
    label: 'Community',
    description: 'Feed, revelations, Q&A, challenges and music.',
    settingKey: 'feature_community_enabled',
    consumerNavId: 'community',
    ministryNavId: 'community',
  },
  {
    key: 'live',
    label: 'Live',
    description: 'Live broadcast, channels, webinars, meetings and live translation.',
    settingKey: 'feature_live_enabled',
    consumerNavId: 'live-channels',
    ministryNavId: 'live',
  },
  {
    key: 'ministries',
    label: 'Ministries tab',
    description:
      "The Ministries tab in the consumer app's navigation. Members who already belong to a ministry keep access through direct links.",
    // Original key from migration 0266, kept so the current setting carries over.
    settingKey: 'consumer_ministries_tab_enabled',
    consumerNavId: 'ministries',
  },
  {
    key: 'small_groups',
    label: 'Small Groups',
    description: 'Discover, join and manage small groups inside a ministry.',
    settingKey: 'feature_small_groups_enabled',
    ministryNavId: 'groups',
  },
  {
    key: 'ministry_tools',
    label: 'Ministry tools',
    description: 'Announcements, broadcast, rules, prayer requests, testimonies, donations and meetings.',
    settingKey: 'feature_ministry_tools_enabled',
    ministryNavId: 'admin',
  },
];

/** Groups that can be switched off for a single ministry (they appear in the ministry space). */
export const MINISTRY_FEATURE_GROUPS = FEATURE_GROUPS.filter((g) => !!g.ministryNavId);

export type FeatureFlags = Record<string, boolean>;

// Stored values come back as text ('false') on the live table and as JSON on
// a fresh one. Only an explicit false switches a group off.
function isExplicitFalse(raw: unknown): boolean {
  if (raw === false) return true;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'false';
  return false;
}

// ── Global switches (shared, cached for the session) ───────────────────

let globalCache: Promise<FeatureFlags> | null = null;
const globalListeners = new Set<() => void>();

async function fetchGlobalFlags(): Promise<FeatureFlags> {
  const keys = FEATURE_GROUPS.map((g) => g.settingKey);
  const { data, error } = await supabase.from('platform_settings').select('key, value').in('key', keys);
  const flags: FeatureFlags = {};
  if (error) {
    console.error('[featureToggles] loading global switches failed:', error.message);
    return flags;
  }
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    const group = FEATURE_GROUPS.find((g) => g.settingKey === row.key);
    if (group && isExplicitFalse(row.value)) flags[group.key] = false;
  }
  return flags;
}

export function loadGlobalFeatureFlags(force = false): Promise<FeatureFlags> {
  if (!globalCache || force) {
    globalCache = fetchGlobalFlags().catch((e) => {
      console.error('[featureToggles] loading global switches failed:', e);
      return {};
    });
  }
  return globalCache;
}

/** Platform admin: switch a group on or off for everyone. */
export async function setGlobalFeatureEnabled(key: string, enabled: boolean): Promise<{ error?: string }> {
  const group = FEATURE_GROUPS.find((g) => g.key === key);
  if (!group) return { error: `Unknown feature: ${key}` };
  const res = await setPlatformSetting(group.settingKey, enabled);
  if (!res.error) {
    globalCache = null;
    globalListeners.forEach((fn) => fn());
  }
  return res;
}

// ── Per-ministry switches ──────────────────────────────────────────────

export async function loadMinistryFeatureFlags(ministryId: string): Promise<FeatureFlags> {
  const flags: FeatureFlags = {};
  try {
    const { data, error } = await supabase
      .from('ministry_feature_overrides')
      .select('feature_key, enabled')
      .eq('ministry_id', ministryId);
    if (error) {
      console.error('[featureToggles] loading ministry switches failed:', error.message);
      return flags;
    }
    for (const row of (data ?? []) as { feature_key: string; enabled: boolean }[]) {
      if (row.enabled === false) flags[row.feature_key] = false;
    }
  } catch (e) {
    console.error('[featureToggles] loading ministry switches failed:', e);
  }
  return flags;
}

/** Platform admin: switch a group on or off for one ministry. */
export async function setMinistryFeatureEnabled(
  ministryId: string,
  key: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ministry_feature_overrides')
    .upsert(
      {
        ministry_id: ministryId,
        feature_key: key,
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: 'ministry_id,feature_key' },
    );
  if (error) return { error: error.message };
  return {};
}

// ── React ──────────────────────────────────────────────────────────────

/** Global switches only. Everything reads as on until loaded. */
export function useGlobalFeatureFlags(): { flags: FeatureFlags; loaded: boolean } {
  const [state, setState] = useState<{ flags: FeatureFlags; loaded: boolean }>({ flags: {}, loaded: false });
  useEffect(() => {
    let active = true;
    const load = () => {
      loadGlobalFeatureFlags().then((flags) => {
        if (active) setState({ flags, loaded: true });
      });
    };
    load();
    globalListeners.add(load);
    return () => {
      active = false;
      globalListeners.delete(load);
    };
  }, []);
  return state;
}

/**
 * Resolved switches for a surface. Pass a ministry id inside a ministry space
 * to apply that ministry's switches on top of the global ones.
 * `isNavGroupOn(app, navId)` answers for a nav group id; ids that are not a
 * toggleable group (Home, Settings…) are always on.
 */
export function useFeatureToggles(ministryId?: string | null): {
  isOn: (key: string) => boolean;
  isNavGroupOn: (app: FeatureApp, navId: string) => boolean;
  loaded: boolean;
} {
  const { flags: globalFlags, loaded: globalLoaded } = useGlobalFeatureFlags();
  const [ministryState, setMinistryState] = useState<{ id: string | null; flags: FeatureFlags }>({ id: null, flags: {} });

  useEffect(() => {
    if (!ministryId) return;
    let active = true;
    loadMinistryFeatureFlags(ministryId).then((flags) => {
      if (active) setMinistryState({ id: ministryId, flags });
    });
    return () => {
      active = false;
    };
  }, [ministryId]);

  const ministryReady = !ministryId || ministryState.id === ministryId;
  // Memoised so callers can list these in effect dependencies.
  const { isOn, isNavGroupOn } = useMemo(() => {
    const ministryFlags = ministryId && ministryState.id === ministryId ? ministryState.flags : {};
    const on = (key: string) => globalFlags[key] !== false && ministryFlags[key] !== false;
    const navOn = (app: FeatureApp, navId: string) => {
      const group = FEATURE_GROUPS.find((g) => (app === 'consumer' ? g.consumerNavId : g.ministryNavId) === navId);
      return group ? on(group.key) : true;
    };
    return { isOn: on, isNavGroupOn: navOn };
  }, [globalFlags, ministryId, ministryState]);
  return { isOn, isNavGroupOn, loaded: globalLoaded && ministryReady };
}
