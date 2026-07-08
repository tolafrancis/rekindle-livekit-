// FILE: src/components/AdminSystemHealthDashboard.tsx

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdminSystemHealthDashboard: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<"online" | "offline">("offline");
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [sessionState, setSessionState] = useState<any>(null);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [schemaValidation, setSchemaValidation] = useState<"valid" | "invalid" | "unknown">("unknown");

  // ---------- CHECK SUPABASE CONNECTION ----------
  const testConnection = async () => {
    const start = performance.now();
    try {
      const { error } = await supabase.from("user_profiles").select("id").limit(1);
      const end = performance.now();

      if (!error) {
        setConnectionStatus("online");
        setDbLatency(Math.round(end - start));
      } else {
        setConnectionStatus("offline");
      }
    } catch (e) {
      setConnectionStatus("offline");
    }
  };

  // ---------- CHECK AUTH SESSION ----------
  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    setSessionState(data?.session || null);
  };

  // ---------- SIMULATED OFFLINE MUTATION COUNTS ----------
  const loadOfflineStats = () => {
    const failed = Number(localStorage.getItem("failed_sync") || 0);
    const pending = Number(localStorage.getItem("pending_mutations") || 0);
    setFailedSyncCount(failed);
    setPendingMutations(pending);
  };

  // ---------- SCHEMA VALIDATION ----------
  const validateSchema = async () => {
    try {
      const { error } = await supabase.from("devotionals").select("id").limit(1);
      setSchemaValidation(error ? "invalid" : "valid");
    } catch {
      setSchemaValidation("invalid");
    }
  };

  // ---------- ACTION BUTTONS ----------
  const clearFailedSync = () => {
    localStorage.setItem("failed_sync", "0");
    loadOfflineStats();
  };

  const clearPendingMutations = () => {
    localStorage.setItem("pending_mutations", "0");
    loadOfflineStats();
  };

  const forceSessionRefresh = async () => {
    await supabase.auth.refreshSession();
    loadSession();
  };

  // ---------- INITIAL LOAD ----------
  useEffect(() => {
    testConnection();
    loadSession();
    loadOfflineStats();
    validateSchema();
  }, []);

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Health Dashboard</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* Connection Status */}
          <div>
            <strong>Connection Status:</strong>{" "}
            <span className={connectionStatus === "online" ? "text-green-600" : "text-red-600"}>
              {connectionStatus}
            </span>
          </div>

          {/* Database Latency */}
          <div>
            <strong>Database Latency:</strong>{" "}
            {dbLatency !== null ? `${dbLatency} ms` : "N/A"}
          </div>

          {/* Auth Session */}
          <div>
            <strong>Auth Session:</strong>{" "}
            {sessionState ? "Active" : "No Active Session"}
          </div>

          {/* Offline Stats */}
          <div>
            <strong>Pending Mutations:</strong> {pendingMutations}
          </div>
          <div>
            <strong>Failed Sync Attempts:</strong> {failedSyncCount}
          </div>

          {/* Schema Validation */}
          <div>
            <strong>Schema Status:</strong>{" "}
            {schemaValidation === "valid" ? (
              <span className="text-green-600">Valid</span>
            ) : schemaValidation === "invalid" ? (
              <span className="text-red-600">Invalid</span>
            ) : (
              "Unknown"
            )}
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Button onClick={testConnection}>Reload Connection</Button>
            <Button onClick={validateSchema}>Validate Schema</Button>
            <Button onClick={clearPendingMutations}>Clear Pending Mutations</Button>
            <Button onClick={clearFailedSync}>Clear Failed Sync</Button>
            <Button onClick={forceSessionRefresh}>Refresh Session</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSystemHealthDashboard;
