import { useState, useEffect, useRef, useCallback } from 'react';
import { deviceHeartbeat } from '../api/supabase';

export interface UseHeartbeatOptions {
  bearerToken: string;
  intervalMs?: number;
  enabled?: boolean;
  onFailed?: (consecutiveFailures: number) => void;
}

export function useHeartbeat({
  bearerToken,
  intervalMs = 60000, // 60 seconds
  enabled = true,
  onFailed,
}: UseHeartbeatOptions) {
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [isHealthy, setIsHealthy] = useState(true);
  const consecutiveFailuresRef = useRef(0);
  const intervalRef = useRef<any>(null);

  const ping = useCallback(async () => {
    if (!bearerToken || !enabled) return;

    try {
      const ok = await deviceHeartbeat(bearerToken);
      if (ok) {
        setLastHeartbeat(new Date());
        setIsHealthy(true);
        consecutiveFailuresRef.current = 0;
      } else {
        consecutiveFailuresRef.current += 1;
        setIsHealthy(false);
        onFailed?.(consecutiveFailuresRef.current);
      }
    } catch (err) {
      consecutiveFailuresRef.current += 1;
      setIsHealthy(false);
      onFailed?.(consecutiveFailuresRef.current);
      console.warn('[useHeartbeat] Heartbeat failed:', err);
    }
  }, [bearerToken, enabled, onFailed]);

  useEffect(() => {
    if (!enabled || !bearerToken) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Immediate ping on enable
    ping();

    intervalRef.current = setInterval(() => {
      ping();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, bearerToken, intervalMs, ping]);

  return {
    lastHeartbeat,
    isHealthy,
    triggerNow: ping,
  };
}
