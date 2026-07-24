import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

/**
 * Keeps a live video meeting mounted across in-app navigation (Option A).
 *
 * The meetings screen builds the fully-configured meeting element and hands it to
 * `startCall`. That element is stored HERE — in a provider that lives ABOVE the tab
 * router — so when the user switches tabs (which unmounts the meetings screen), the
 * meeting element keeps rendering under <ActiveCallHost/> and the LiveKit room stays
 * connected. The user can minimize it into a floating mini-player and keep browsing.
 */
export interface ActiveCallInfo {
  /** Meeting id — lets the list show "you're in this meeting" and dedupe. */
  id: string;
  title?: string;
  /** The fully-configured meeting element (e.g. <EnhancedVideoCallWrapper .../>). */
  node: React.ReactNode;
  /** Leaves the call properly (DB cleanup) THEN clears it. Used by the mini-player's
   *  leave button; the in-meeting controls call it too. */
  onLeave?: () => void | Promise<void>;
}

interface ActiveCallContextValue {
  call: ActiveCallInfo | null;
  minimized: boolean;
  isSystemPiP: boolean;
  startCall: (call: ActiveCallInfo) => void;
  /** Clear the call from the host (does NOT run onLeave — callers that need DB
   *  cleanup should call the call's onLeave, which ends by calling this). */
  endCall: () => void;
  minimize: () => void;
  maximize: () => void;
}

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null);

export const ActiveCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [call, setCall] = useState<ActiveCallInfo | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [isSystemPiP, setIsSystemPiP] = useState(false);

  const startCall = useCallback((c: ActiveCallInfo) => {
    setCall(c);
    setMinimized(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('call:active', { detail: true }));
    }
  }, []);
  const endCall = useCallback(() => {
    setCall(null);
    setMinimized(false);
    setIsSystemPiP(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('call:active', { detail: false }));
    }
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);
  const maximize = useCallback(() => setMinimized(false), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePipChange = (e: Event) => {
      const isInPiP = (e as CustomEvent).detail?.isInPiP;
      setIsSystemPiP(!!isInPiP);
    };
    window.addEventListener('pipModeChanged', handlePipChange);
    return () => {
      window.removeEventListener('pipModeChanged', handlePipChange);
    };
  }, []);

  const value = useMemo(
    () => ({ call, minimized, isSystemPiP, startCall, endCall, minimize, maximize }),
    [call, minimized, isSystemPiP, startCall, endCall, minimize, maximize],
  );
  return <ActiveCallContext.Provider value={value}>{children}</ActiveCallContext.Provider>;
};

/** Throws if used outside the provider (for the host + meetings screens). */
export function useActiveCall(): ActiveCallContextValue {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error('useActiveCall must be used within <ActiveCallProvider>');
  return ctx;
}

/** Null if there's no provider — for shared components (DailyVideoCall) that may
 *  render outside a call host (e.g. the standalone meeting page). */
export function useActiveCallOptional(): ActiveCallContextValue | null {
  return useContext(ActiveCallContext);
}
