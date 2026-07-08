import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AdminActivityLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadLogs();
  }, [typeFilter, dateFrom, dateTo]);

  async function loadLogs() {
    setLoading(true);

    let query = supabase
      .from("adminactivitylog")
      .select("*")
      .order("created_at", { ascending: false });

    if (typeFilter !== "all") {
      query = query.eq("action_type", typeFilter);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data, error } = await query;

    if (!error) {
      setLogs(data || []);
    }

    setLoading(false);
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Admin Activity Log</h2>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <select
          className="border p-2 rounded"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Actions</option>
          <option value="create">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>

        <input
          type="date"
          className="border p-2 rounded"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />

        <input
          type="date"
          className="border p-2 rounded"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      {/* Logs */}
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity...
        </div>
      ) : logs.length === 0 ? (
        <div className="text-gray-500">No activity found.</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-4 border rounded shadow-sm bg-white overflow-auto"
            >
              <div className="flex justify-between">
                <strong className="capitalize">{log.action_type}</strong>
                <span className="text-gray-400 text-sm">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>

              <div className="text-sm text-gray-600 mt-1">
                Admin: {log.admin_id}
                <br />
                Table: {log.table_name}
                <br />
                Record: {log.record_id}
              </div>

              {log.old_value && (
                <pre className="bg-gray-50 p-2 mt-2 text-xs rounded overflow-auto">
                  <strong>Old:</strong>
                  {" " + JSON.stringify(log.old_value, null, 2)}
                </pre>
              )}

              {log.new_value && (
                <pre className="bg-gray-50 p-2 mt-2 text-xs rounded overflow-auto">
                  <strong>New:</strong>
                  {" " + JSON.stringify(log.new_value, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
