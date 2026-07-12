import { useEffect, useState } from 'react';
import {
  getMinistryEntitlements,
  FREE_ENTITLEMENTS,
  type MinistryEntitlements,
  type MinistryCaps,
} from '@rekindle/auth/ministryEntitlements';
import { useCurrentMinistry } from './CurrentMinistryContext';
import { resolveModulesForTier } from './ministryModules';

// Phase 6 — React entitlements for the CURRENT ministry. Combines the tenant's
// module toggles (Phase 3) with the subscription tier's capability gates so surfaces
// can gate by "is this module on AND does the plan allow it".

export function useMinistryEntitlements(): {
  entitlements: MinistryEntitlements;
  loading: boolean;
} {
  const { currentMinistryId } = useCurrentMinistry();
  const [entitlements, setEntitlements] = useState<MinistryEntitlements>(FREE_ENTITLEMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMinistryEntitlements(currentMinistryId).then((e) => {
      if (!active) return;
      setEntitlements(e);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [currentMinistryId]);

  return { entitlements, loading };
}

/** True if the current ministry's tier grants a capability (branding, whiteLabel, …). */
export function useCanUse(cap: keyof MinistryCaps): boolean {
  const { entitlements } = useMinistryEntitlements();
  return !!entitlements.caps[cap];
}

/**
 * Resolved module map for the current ministry: tenant toggle AND tier cap.
 * `loading` is true until the subscription is resolved (defaults to free meanwhile).
 */
export function useEntitledModules(): { modules: Record<string, boolean>; loading: boolean } {
  const { currentMinistry } = useCurrentMinistry();
  const { entitlements, loading } = useMinistryEntitlements();
  const modules = resolveModulesForTier(
    currentMinistry?.modules ?? null,
    entitlements.caps as unknown as Record<string, boolean>,
  );
  return { modules, loading };
}
