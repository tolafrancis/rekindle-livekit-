// src/hooks/useOfflineStorage.ts
// Enhanced offline storage with mutation queue and conflict resolution

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, verifySession } from '@rekindle/supabase';
import { useToast } from '@rekindle/ui/use-toast';

// ============================================
// TYPES
// ============================================

interface OfflineData {
  devotionals: any[];
  prayerPoints: any[];
  bibleReadingPlans: any[];
  journalEntries: any[];
}

interface QueuedMutation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  data: any;
  conditions?: Record<string, any>;
  createdAt: string;
  retryCount: number;
  lastError?: string;
  conflictResolution?: 'server_wins' | 'client_wins' | 'merge';
}

interface SyncStatus {
  pending: number;
  syncing: number;
  failed: number;
  lastSync: Date | null;
}

// ============================================
// CONSTANTS
// ============================================

const CACHE_KEYS = {
  devotionals: 'offline_devotionals',
  prayerPoints: 'offline_prayer_points',
  bibleReadingPlans: 'offline_bible_plans',
  journalEntries: 'offline_prayer_journal',
  devotionalProgress: 'offline_devotional_progress',
  lastSync: 'offline_last_sync',
  mutationQueue: 'offline_mutation_queue',
  syncStatus: 'offline_sync_status',
};

const MAX_RETRIES = 3;
const SYNC_DEBOUNCE_MS = 2000;

// ============================================
// MAIN HOOK
// ============================================

export const useOfflineStorage = () => {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pending: 0,
    syncing: 0,
    failed: 0,
    lastSync: null,
  });
  
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  // ============================================
  // ONLINE/OFFLINE DETECTION
  // ============================================

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      debouncedSync();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'You are offline',
        description: 'Changes will be saved locally and synced when you reconnect.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load last sync time and status
    const lastSync = localStorage.getItem(CACHE_KEYS.lastSync);
    if (lastSync) {
      setLastSyncTime(new Date(lastSync));
    }
    
    updateSyncStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // ============================================
  // SYNC STATUS MANAGEMENT
  // ============================================

  const updateSyncStatus = useCallback(() => {
    const queue = getMutationQueue();
    const pending = queue.filter(m => m.retryCount < MAX_RETRIES).length;
    const failed = queue.filter(m => m.retryCount >= MAX_RETRIES).length;
    
    setSyncStatus(prev => ({
      ...prev,
      pending,
      failed,
      lastSync: lastSyncTime,
    }));
  }, [lastSyncTime]);

  // ============================================
  // MUTATION QUEUE MANAGEMENT
  // ============================================

  const getMutationQueue = useCallback((): QueuedMutation[] => {
    try {
      const queue = localStorage.getItem(CACHE_KEYS.mutationQueue);
      return queue ? JSON.parse(queue) : [];
    } catch {
      return [];
    }
  }, []);

  const saveMutationQueue = useCallback((queue: QueuedMutation[]) => {
    try {
      localStorage.setItem(CACHE_KEYS.mutationQueue, JSON.stringify(queue));
      updateSyncStatus();
    } catch (e) {
      console.error('[OFFLINE] Failed to save mutation queue:', e);
    }
  }, [updateSyncStatus]);

  const queueMutation = useCallback((
    table: string,
    operation: QueuedMutation['operation'],
    data: any,
    conditions?: Record<string, any>,
    conflictResolution: QueuedMutation['conflictResolution'] = 'client_wins'
  ): string => {
    const mutation: QueuedMutation = {
      id: `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      table,
      operation,
      data,
      conditions,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      conflictResolution,
    };

    const queue = getMutationQueue();
    queue.push(mutation);
    saveMutationQueue(queue);

    console.log('[OFFLINE] Mutation queued:', mutation.id);
    
    // Try to sync immediately if online
    if (isOnline) {
      debouncedSync();
    }

    return mutation.id;
  }, [getMutationQueue, saveMutationQueue, isOnline]);

  const removeMutation = useCallback((mutationId: string) => {
    const queue = getMutationQueue();
    const filtered = queue.filter(m => m.id !== mutationId);
    saveMutationQueue(filtered);
  }, [getMutationQueue, saveMutationQueue]);

  const updateMutationRetry = useCallback((mutationId: string, error: string) => {
    const queue = getMutationQueue();
    const updated = queue.map(m => {
      if (m.id === mutationId) {
        return { ...m, retryCount: m.retryCount + 1, lastError: error };
      }
      return m;
    });
    saveMutationQueue(updated);
  }, [getMutationQueue, saveMutationQueue]);

  // ============================================
  // OFFLINE MUTATION EXECUTION
  // ============================================

  const executeOfflineMutation = useCallback(async (mutation: QueuedMutation): Promise<{ success: boolean; error?: string }> => {
    try {
      let result;

      switch (mutation.operation) {
        case 'insert':
          result = await supabase.from(mutation.table).insert(mutation.data);
          break;
        
        case 'update':
          if (mutation.conditions) {
            let query = supabase.from(mutation.table).update(mutation.data);
            for (const [key, value] of Object.entries(mutation.conditions)) {
              query = query.eq(key, value);
            }
            result = await query;
          } else {
            return { success: false, error: 'Update requires conditions' };
          }
          break;
        
        case 'delete':
          if (mutation.conditions) {
            let query = supabase.from(mutation.table).delete();
            for (const [key, value] of Object.entries(mutation.conditions)) {
              query = query.eq(key, value);
            }
            result = await query;
          } else {
            return { success: false, error: 'Delete requires conditions' };
          }
          break;
        
        case 'upsert':
          result = await supabase.from(mutation.table).upsert(mutation.data);
          break;
        
        default:
          return { success: false, error: 'Unknown operation' };
      }

      if (result.error) {
        // Handle conflict resolution
        if (result.error.code === '23505' && mutation.conflictResolution === 'client_wins') {
          // Unique violation - try update instead
          if (mutation.operation === 'insert') {
            const updateResult = await supabase
              .from(mutation.table)
              .update(mutation.data)
              .eq('id', mutation.data.id);
            
            if (!updateResult.error) {
              return { success: true };
            }
          }
        }
        
        return { success: false, error: result.error.message };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }, []);

  // ============================================
  // SYNC LOGIC
  // ============================================

  const syncMutationQueue = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (isSyncingRef.current || !isOnline) {
      return { synced: 0, failed: 0 };
    }

    // Verify session before syncing
    const { valid } = await verifySession();
    if (!valid) {
      console.warn('[OFFLINE] Cannot sync - no valid session');
      return { synced: 0, failed: 0 };
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncStatus(prev => ({ ...prev, syncing: prev.pending }));

    const queue = getMutationQueue();
    let synced = 0;
    let failed = 0;

    for (const mutation of queue) {
      if (mutation.retryCount >= MAX_RETRIES) {
        failed++;
        continue;
      }

      const result = await executeOfflineMutation(mutation);

      if (result.success) {
        removeMutation(mutation.id);
        synced++;
      } else {
        updateMutationRetry(mutation.id, result.error || 'Unknown error');
        if (mutation.retryCount + 1 >= MAX_RETRIES) {
          failed++;
        }
      }
    }

    // Update sync time
    const now = new Date();
    localStorage.setItem(CACHE_KEYS.lastSync, now.toISOString());
    setLastSyncTime(now);

    isSyncingRef.current = false;
    setIsSyncing(false);
    updateSyncStatus();

    if (synced > 0) {
      toast({
        title: 'Sync complete',
        description: `${synced} change${synced > 1 ? 's' : ''} synced successfully.`,
      });
    }

    if (failed > 0) {
      toast({
        title: 'Sync issues',
        description: `${failed} change${failed > 1 ? 's' : ''} could not be synced.`,
        variant: 'destructive',
      });
    }

    return { synced, failed };
  }, [isOnline, getMutationQueue, executeOfflineMutation, removeMutation, updateMutationRetry, updateSyncStatus, toast]);

  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    syncTimeoutRef.current = setTimeout(() => {
      syncMutationQueue();
    }, SYNC_DEBOUNCE_MS);
  }, [syncMutationQueue]);

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  const cacheForOffline = useCallback(async () => {
    if (!isOnline) return;

    setIsSyncing(true);
    try {
      // Cache devotionals
      const { data: devotionals } = await supabase
        .from('devotionals')
        .select('*')
        .limit(50);
      if (devotionals) {
        localStorage.setItem(CACHE_KEYS.devotionals, JSON.stringify(devotionals));
      }

      // Cache prayer points
      const { data: prayerPoints } = await supabase
        .from('prayer_points')
        .select('*')
        .limit(100);
      if (prayerPoints) {
        localStorage.setItem(CACHE_KEYS.prayerPoints, JSON.stringify(prayerPoints));
      }

      // Update last sync time
      const now = new Date();
      localStorage.setItem(CACHE_KEYS.lastSync, now.toISOString());
      setLastSyncTime(now);
    } catch (error) {
      console.error('[OFFLINE] Error caching data:', error);
    }
    setIsSyncing(false);
  }, [isOnline]);

  const getCachedData = useCallback(<T>(key: keyof typeof CACHE_KEYS): T[] => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS[key]);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  }, []);

  // ============================================
  // OFFLINE SAVE HELPERS
  // ============================================

  const saveJournalEntryOffline = useCallback((entry: any) => {
    try {
      const existing = getCachedData<any>('journalEntries');
      const offlineEntry = { 
        ...entry, 
        id: entry.id || `offline_${Date.now()}`, 
        synced: false,
        created_at: new Date().toISOString(),
      };
      const updated = [...existing, offlineEntry];
      localStorage.setItem(CACHE_KEYS.journalEntries, JSON.stringify(updated));
      
      // Queue for sync
      queueMutation('prayer_journal', 'insert', offlineEntry, undefined, 'client_wins');
      
      return true;
    } catch {
      return false;
    }
  }, [getCachedData, queueMutation]);

  const saveProgressOffline = useCallback((devotionalId: string, moduleNumber: number, userId?: string) => {
    try {
      const existing = localStorage.getItem(CACHE_KEYS.devotionalProgress);
      const progress = existing ? JSON.parse(existing) : {};
      
      const progressData = {
        devotional_id: devotionalId,
        module_number: moduleNumber,
        completed_at: new Date().toISOString(),
        user_id: userId,
        synced: false,
      };
      
      progress[devotionalId] = progressData;
      localStorage.setItem(CACHE_KEYS.devotionalProgress, JSON.stringify(progress));
      
      // Queue for sync
      if (userId) {
        queueMutation('user_devotional_progress', 'upsert', progressData, undefined, 'client_wins');
      }
      
      return true;
    } catch {
      return false;
    }
  }, [queueMutation]);

  // ============================================
  // SYNC ALL OFFLINE DATA
  // ============================================

  const syncOfflineData = useCallback(async () => {
    if (!isOnline) return { success: false, message: 'No internet connection' };

    setIsSyncing(true);
    try {
      // First sync the mutation queue
      const { synced, failed } = await syncMutationQueue();

      // Then sync legacy offline data
      const journalEntries = getCachedData<any>('journalEntries');
      const unsyncedEntries = journalEntries.filter(e => !e.synced);
      
      for (const entry of unsyncedEntries) {
        const { id, synced, ...entryData } = entry;
        // Skip if already in queue
        if (!id.startsWith('offline_')) continue;
        
        const { error } = await supabase.from('prayer_journal').insert(entryData);
        if (!error) {
          entry.synced = true;
        }
      }

      // Mark entries as synced
      localStorage.setItem(CACHE_KEYS.journalEntries, JSON.stringify(journalEntries));

      // Sync devotional progress
      const progressData = localStorage.getItem(CACHE_KEYS.devotionalProgress);
      if (progressData) {
        const progress = JSON.parse(progressData);
        for (const [devotionalId, data] of Object.entries(progress)) {
          const progressEntry = data as any;
          if (!progressEntry.synced && progressEntry.user_id) {
            const { error } = await supabase.from('user_devotional_progress').upsert({
              devotional_id: devotionalId,
              module_number: progressEntry.module_number,
              completed_at: progressEntry.completed_at,
              user_id: progressEntry.user_id,
            });
            if (!error) {
              progressEntry.synced = true;
            }
          }
        }
        localStorage.setItem(CACHE_KEYS.devotionalProgress, JSON.stringify(progress));
      }

      // Re-cache fresh data
      await cacheForOffline();

      return { 
        success: true, 
        message: `Synced ${synced} changes. ${failed > 0 ? `${failed} failed.` : ''}` 
      };
    } catch (error) {
      console.error('[OFFLINE] Sync error:', error);
      return { success: false, message: 'Sync failed' };
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, syncMutationQueue, getCachedData, cacheForOffline]);

  // ============================================
  // CLEAR AND UTILITY FUNCTIONS
  // ============================================

  const clearOfflineData = useCallback(() => {
    Object.values(CACHE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    setLastSyncTime(null);
    setSyncStatus({
      pending: 0,
      syncing: 0,
      failed: 0,
      lastSync: null,
    });
  }, []);

  const getPendingSyncCount = useCallback(() => {
    const queue = getMutationQueue();
    return queue.filter(m => m.retryCount < MAX_RETRIES).length;
  }, [getMutationQueue]);

  const getFailedSyncCount = useCallback(() => {
    const queue = getMutationQueue();
    return queue.filter(m => m.retryCount >= MAX_RETRIES).length;
  }, [getMutationQueue]);

  const retryFailedMutations = useCallback(() => {
    const queue = getMutationQueue();
    const reset = queue.map(m => ({ ...m, retryCount: 0 }));
    saveMutationQueue(reset);
    debouncedSync();
  }, [getMutationQueue, saveMutationQueue, debouncedSync]);

  const clearFailedMutations = useCallback(() => {
    const queue = getMutationQueue();
    const filtered = queue.filter(m => m.retryCount < MAX_RETRIES);
    saveMutationQueue(filtered);
  }, [getMutationQueue, saveMutationQueue]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Status
    isOnline,
    isSyncing,
    lastSyncTime,
    syncStatus,
    
    // Cache operations
    cacheForOffline,
    getCachedData,
    
    // Offline saves
    saveJournalEntryOffline,
    saveProgressOffline,
    
    // Mutation queue
    queueMutation,
    getPendingSyncCount,
    getFailedSyncCount,
    
    // Sync operations
    syncOfflineData,
    syncMutationQueue,
    retryFailedMutations,
    clearFailedMutations,
    
    // Cleanup
    clearOfflineData,
  };
};

export default useOfflineStorage;
