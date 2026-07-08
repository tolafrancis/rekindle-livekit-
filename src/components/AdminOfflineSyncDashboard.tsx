import React, { useEffect } from "react";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { Button } from "@/components/ui/button";

export default function AdminOfflineSyncDashboard() {
  const {
    pendingMutations,
    syncStatus,
    lastSync,
    forceSync,
    clearQueue,
  } = useOfflineStorage();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Offline Sync Dashboard</h1>

      <div className="border p-4 rounded-lg mb-6">
        <p className="mb-2">
          <strong>Status:</strong>{" "}
          {syncStatus === "online" && "🟢 Online"}
          {syncStatus === "offline" && "🔴 Offline"}
          {syncStatus === "syncing" && "🟡 Syncing…"}
        </p>

        <p className="mb-2">
          <strong>Pending Mutations:</strong> {pendingMutations.length}
        </p>

        {lastSync && (
          <p className="mb-2">
            <strong>Last Sync:</strong> {new Date(lastSync).toLocaleString()}
          </p>
        )}

        <div className="flex gap-3 mt-4">
          <Button onClick={forceSync}>Force Sync</Button>
          <Button variant="destructive" onClick={clearQueue}>
            Clear Local Queue
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-3">Pending Changes</h2>
        {pendingMutations.length === 0 ? (
          <p className="text-gray-500">No pending mutations.</p>
        ) : (
          <div className="space-y-3">
            {pendingMutations.map((m, index) => (
              <div
                key={index}
                className="p-4 border rounded bg-gray-50 flex flex-col gap-1"
              >
                <strong>{m.operation.toUpperCase()}</strong>
                <span>Table: {m.table}</span>
                <span>Record ID: {m.recordId}</span>
                <pre className="text-sm bg-white p-2 rounded border">
                  {JSON.stringify(m.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
