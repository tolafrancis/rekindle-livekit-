// src/components/OfflineIndicator.tsx
// Visual indicator for offline status and sync progress

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Cloud, CloudOff } from 'lucide-react';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';

export const OfflineIndicator: React.FC = () => {
  const {
    isOnline,
    isSyncing,
    lastSyncTime,
    syncStatus,
    syncOfflineData,
    getPendingSyncCount,
    getFailedSyncCount,
    retryFailedMutations,
    clearFailedMutations,
  } = useOfflineStorage();

  const [showPopover, setShowPopover] = useState(false);
  const pendingCount = getPendingSyncCount();
  const failedCount = getFailedSyncCount();

  // Auto-show popover when going offline
  useEffect(() => {
    if (!isOnline) {
      setShowPopover(true);
      const timer = setTimeout(() => setShowPopover(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const handleSync = async () => {
    await syncOfflineData();
  };

  const handleRetry = () => {
    retryFailedMutations();
  };

  const handleClearFailed = () => {
    clearFailedMutations();
  };

  // Don't show anything if online and no pending changes
  if (isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative flex items-center gap-2 ${
            !isOnline 
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' 
              : failedCount > 0 
                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                : pendingCount > 0
                  ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                  : ''
          }`}
        >
          {isSyncing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : !isOnline ? (
            <WifiOff className="h-4 w-4" />
          ) : failedCount > 0 ? (
            <AlertCircle className="h-4 w-4" />
          ) : pendingCount > 0 ? (
            <Cloud className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          
          {/* Badge for pending/failed count */}
          {(pendingCount > 0 || failedCount > 0) && (
            <span className={`absolute -top-1 -right-1 h-4 w-4 rounded-full text-xs flex items-center justify-center text-white ${
              failedCount > 0 ? 'bg-red-500' : 'bg-blue-500'
            }`}>
              {pendingCount + failedCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-600">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-amber-600" />
                  <span className="font-medium text-amber-600">Offline</span>
                </>
              )}
            </div>
            <span className="text-sm text-gray-500">
              Last sync: {formatLastSync(lastSyncTime)}
            </span>
          </div>

          {/* Sync Progress */}
          {isSyncing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing changes...</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          )}

          {/* Pending Changes */}
          {pendingCount > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <Cloud className="h-4 w-4" />
                <span className="font-medium">
                  {pendingCount} pending change{pendingCount > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                {isOnline 
                  ? 'Will sync automatically' 
                  : 'Will sync when you reconnect'}
              </p>
            </div>
          )}

          {/* Failed Changes */}
          {failedCount > 0 && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">
                  {failedCount} failed change{failedCount > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-sm text-red-600 mt-1">
                These changes could not be synced after multiple attempts.
              </p>
              <div className="flex gap-2 mt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleRetry}
                  className="text-red-600 border-red-300 hover:bg-red-100"
                >
                  Retry
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleClearFailed}
                  className="text-red-600 hover:bg-red-100"
                >
                  Discard
                </Button>
              </div>
            </div>
          )}

          {/* Offline Mode Info */}
          {!isOnline && (
            <div className="p-3 bg-amber-50 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700">
                <CloudOff className="h-4 w-4" />
                <span className="font-medium">Working Offline</span>
              </div>
              <p className="text-sm text-amber-600 mt-1">
                Your changes are being saved locally and will sync when you're back online.
              </p>
            </div>
          )}

          {/* All Synced */}
          {isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing && (
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">All changes synced</span>
              </div>
            </div>
          )}

          {/* Manual Sync Button */}
          {isOnline && (pendingCount > 0 || failedCount > 0) && (
            <Button 
              onClick={handleSync} 
              disabled={isSyncing}
              className="w-full"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default OfflineIndicator;
