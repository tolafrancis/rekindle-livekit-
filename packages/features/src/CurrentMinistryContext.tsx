import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { getUserMinistries, type MinistrySummary } from '@rekindle/auth/tenantMiddleware';
import { resolveMinistryFromHostname } from './ministryHostname';
import { useAuth } from './AuthContext';

// Phase 3 — authoritative "which ministry am I acting in right now" context.
// A member can belong to many ministries; this holds the full list + the current
// selection (persisted), with a single-ministry fast path. Every ministry-scoped
// query should read currentMinistryId from here.

const STORAGE_KEY = 'rekindle.currentMinistryId';

interface CurrentMinistryContextValue {
  ministries: MinistrySummary[];
  currentMinistry: MinistrySummary | null;
  currentMinistryId: string | null;
  setCurrentMinistry: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CurrentMinistryContext = createContext<CurrentMinistryContextValue | undefined>(undefined);

export function useCurrentMinistry(): CurrentMinistryContextValue {
  const ctx = useContext(CurrentMinistryContext);
  if (!ctx) throw new Error('useCurrentMinistry must be used within CurrentMinistryProvider');
  return ctx;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function CurrentMinistryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ministries, setMinistries] = useState<MinistrySummary[]>([]);
  const [currentMinistryId, setCurrentMinistryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const userId = user?.id;
    if (!userId) {
      setMinistries([]);
      setCurrentMinistryId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let list = await getUserMinistries(userId);
    // Self-heal a known race: right after login/page-load there's a brief
    // window where the Supabase client's session isn't fully attached yet,
    // so this can come back empty even for a user who really has ministries
    // (see getUserMinistries — that path now throws instead of swallowing,
    // but a transient RLS-denied empty result is still indistinguishable
    // from "really has none" at this layer). One short retry covers it
    // automatically instead of requiring the user to navigate elsewhere and
    // back to trigger a fresh fetch.
    if (list.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      list = await getUserMinistries(userId);
    }
    setMinistries(list);
    // Resolve current, in precedence order:
    //  1) the ministry this HOSTNAME maps to (church.yourproduct.com / custom domain),
    //     if the member belongs to it — a ministry-specific site pins its own tenant;
    //  2) the persisted choice, if still valid;
    //  3) single-membership fast path / first ministry.
    const host = await resolveMinistryFromHostname();
    const hostMatch = host && list.some((m) => m.id === host.id) ? host.id : null;
    const stored = readStored();
    const next =
      hostMatch ?? list.find((m) => m.id === stored)?.id ?? (list[0]?.id ?? null);
    setCurrentMinistryId(next);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCurrentMinistry = useCallback((id: string) => {
    setCurrentMinistryId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore storage failures */
    }
  }, []);

  const currentMinistry = ministries.find((m) => m.id === currentMinistryId) ?? null;

  return (
    <CurrentMinistryContext.Provider
      value={{
        ministries,
        currentMinistry,
        currentMinistryId,
        setCurrentMinistry,
        loading,
        refresh: load,
      }}
    >
      {children}
    </CurrentMinistryContext.Provider>
  );
}
