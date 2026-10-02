import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { blockUser, fetchBlockedUserIds, unblockUser } from './moderation';

// The signed-in user's block list, fetched once per sign-in and shared by
// every feed/chat that hides blocked authors. block()/unblock() update it
// optimistically so content disappears (or comes back) immediately.

interface ModerationContextType {
  blockedIds: ReadonlySet<string>;
  isBlocked: (userId: string | null | undefined) => boolean;
  /** Drop items whose author is blocked. `getAuthorId` picks the author field. */
  filterBlocked: <T>(items: T[], getAuthorId: (item: T) => string | null | undefined) => T[];
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY: ReadonlySet<string> = new Set();

const ModerationContext = createContext<ModerationContextType | undefined>(undefined);

export const ModerationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId: string | undefined = user?.id;
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<string>>(EMPTY);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBlockedIds(EMPTY);
      return;
    }
    try {
      setBlockedIds(new Set(await fetchBlockedUserIds()));
    } catch (err) {
      // Not fatal: content just isn't filtered until the next refresh.
      console.warn('[Moderation] could not load block list:', err);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const block = useCallback(async (target: string) => {
    setBlockedIds((prev) => new Set(prev).add(target));
    try {
      await blockUser(target);
    } catch (err) {
      setBlockedIds((prev) => {
        const next = new Set(prev);
        next.delete(target);
        return next;
      });
      throw err;
    }
  }, []);

  const unblock = useCallback(async (target: string) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      next.delete(target);
      return next;
    });
    try {
      await unblockUser(target);
    } catch (err) {
      setBlockedIds((prev) => new Set(prev).add(target));
      throw err;
    }
  }, []);

  const value = useMemo<ModerationContextType>(() => ({
    blockedIds,
    isBlocked: (id) => !!id && blockedIds.has(id),
    filterBlocked: (items, getAuthorId) =>
      blockedIds.size === 0 ? items : items.filter((item) => {
        const id = getAuthorId(item);
        return !id || !blockedIds.has(id);
      }),
    block,
    unblock,
    refresh,
  }), [blockedIds, block, unblock, refresh]);

  return <ModerationContext.Provider value={value}>{children}</ModerationContext.Provider>;
};

// Outside a provider (e.g. a public page) nothing is filtered and blocking
// isn't available — callers don't need to guard.
const FALLBACK: ModerationContextType = {
  blockedIds: EMPTY,
  isBlocked: () => false,
  filterBlocked: (items) => items,
  block: async () => { throw new Error('Blocking is not available here.'); },
  unblock: async () => { throw new Error('Blocking is not available here.'); },
  refresh: async () => {},
};

export const useModeration = (): ModerationContextType => useContext(ModerationContext) ?? FALLBACK;
