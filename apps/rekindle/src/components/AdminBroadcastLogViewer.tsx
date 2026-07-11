import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Send, RefreshCw, CheckCircle2, XCircle, Users,
  Search, Radio, Smartphone, MessageSquare, Filter, Clock,
  TrendingUp, AlertCircle, DollarSign,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BroadcastLog {
  id: string;
  title?: string;
  message?: string;
  channel: string;
  sender_name?: string;
  // push / zalo use these
  recipients_count?: number;
  successful_sends?: number;
  failed_sends?: number;
  sent_at?: string;
  // whatsapp uses these
  total_recipients?: number;
  successful?: number;
  failed?: number;
  error_details?: unknown;
  created_at?: string;
  // wallet billing
  credits_used?: number;
  usd_cost?: number;
}

interface NormalisedLog {
  id: string;
  title: string;
  message: string;
  channel: string;
  senderName: string;
  recipients: number;
  successful: number;
  failed: number;
  timestamp: string;
  creditsUsed?: number;
  usdCost?: number;
  errorDetails?: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(raw: BroadcastLog): NormalisedLog {
  const recipients = raw.recipients_count ?? raw.total_recipients ?? 0;
  const successful = raw.successful_sends ?? raw.successful ?? 0;
  const failed     = raw.failed_sends     ?? raw.failed     ?? 0;
  const timestamp  = raw.sent_at ?? raw.created_at ?? '';

  return {
    id:           raw.id,
    title:        raw.title   || '(no title)',
    message:      raw.message || '',
    channel:      raw.channel || 'unknown',
    senderName:   raw.sender_name || '',
    recipients,
    successful,
    failed,
    timestamp,
    creditsUsed:  raw.credits_used,
    usdCost:      raw.usd_cost,
    errorDetails: raw.error_details,
  };
}

const CHANNEL_META: Record<string, { label: string; icon: React.ElementType; colour: string }> = {
  push:      { label: 'Push',     icon: Smartphone,    colour: 'bg-blue-100 text-blue-700 border-blue-200'   },
  whatsapp:  { label: 'WhatsApp', icon: MessageSquare,  colour: 'bg-green-100 text-green-700 border-green-200' },
  zalo:      { label: 'Zalo',     icon: Radio,          colour: 'bg-sky-100 text-sky-700 border-sky-200'      },
  email:     { label: 'Email',    icon: Send,           colour: 'bg-purple-100 text-purple-700 border-purple-200' },
};

function channelMeta(ch: string) {
  return CHANNEL_META[ch.toLowerCase()] ?? {
    label: ch,
    icon: Send,
    colour: 'bg-gray-100 text-gray-600 border-gray-200',
  };
}

function successRate(log: NormalisedLog): number {
  if (!log.recipients) return 0;
  return Math.round((log.successful / log.recipients) * 100);
}

function formatTs(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? ts
    : d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
}

// ─── Summary cards ───────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, value, sub, colour,
}: { icon: React.ElementType; label: string; value: string | number; sub?: string; colour: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-5 pb-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${colour}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function LogRow({ log, onClick }: { log: NormalisedLog; onClick: () => void }) {
  const meta   = channelMeta(log.channel);
  const ChannelIcon = meta.icon;
  const rate   = successRate(log);
  const allOk  = log.failed === 0;
  const allFail= log.successful === 0 && log.recipients > 0;
  const isWhatsApp = log.channel === 'whatsapp';

  return (
    <tr
      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Channel */}
      <td className="py-3 px-4">
        <Badge variant="outline" className={`gap-1.5 text-xs font-medium ${meta.colour}`}>
          <ChannelIcon className="w-3 h-3" />
          {meta.label}
        </Badge>
      </td>

      {/* Title + sender */}
      <td className="py-3 px-4 max-w-[200px]">
        <p className="font-medium text-sm truncate">{log.title}</p>
        {log.senderName && (
          <p className="text-xs text-purple-600 truncate mt-0.5">From: {log.senderName}</p>
        )}
        {log.message && !log.senderName && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{log.message}</p>
        )}
      </td>

      {/* Recipients */}
      <td className="py-3 px-4 text-center">
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          {log.recipients.toLocaleString()}
        </span>
      </td>

      {/* Success / Fail */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 justify-center">
          <span className="inline-flex items-center gap-0.5 text-sm text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {log.successful.toLocaleString()}
          </span>
          {log.failed > 0 && (
            <span className="inline-flex items-center gap-0.5 text-sm text-red-500 font-medium">
              <XCircle className="w-3.5 h-3.5" />
              {log.failed.toLocaleString()}
            </span>
          )}
        </div>
      </td>

      {/* Rate bar */}
      <td className="py-3 px-4 hidden md:table-cell">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allOk ? 'bg-emerald-500' : allFail ? 'bg-red-400' : 'bg-amber-400'}`}
              style={{ width: `${rate}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{rate}%</span>
        </div>
      </td>

      {/* Cost (WhatsApp only) */}
      <td className="py-3 px-4 hidden md:table-cell text-center">
        {isWhatsApp && log.creditsUsed != null ? (
          <div className="inline-flex flex-col items-center">
            <span className="text-xs font-semibold text-green-700">
              {log.creditsUsed.toLocaleString()} cr
            </span>
            <span className="text-[10px] text-muted-foreground">
              ${log.usdCost != null ? log.usdCost.toFixed(2) : (log.creditsUsed * 0.03).toFixed(2)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Timestamp */}
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTs(log.timestamp)}
        </span>
      </td>
    </tr>
  );
}

// ─── Detail drawer / modal ────────────────────────────────────────────────────

function LogDetail({ log, onClose }: { log: NormalisedLog; onClose: () => void }) {
  const meta = channelMeta(log.channel);
  const ChannelIcon = meta.icon;
  const rate = successRate(log);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <Badge variant="outline" className={`gap-1.5 text-xs font-medium mb-2 ${meta.colour}`}>
              <ChannelIcon className="w-3 h-3" />
              {meta.label}
            </Badge>
            <h3 className="text-lg font-semibold">{log.title}</h3>
            {log.senderName && (
              <p className="text-xs text-purple-600 mt-0.5">From: {log.senderName}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground -mr-1">✕</Button>
        </div>

        {log.message && (
          <p className="text-sm text-muted-foreground bg-gray-50 rounded-lg p-3 mb-4">{log.message}</p>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Recipients', value: log.recipients.toLocaleString(), cls: 'text-gray-700' },
            { label: 'Delivered',  value: log.successful.toLocaleString(), cls: 'text-emerald-600' },
            { label: 'Failed',     value: log.failed.toLocaleString(),     cls: log.failed > 0 ? 'text-red-500' : 'text-gray-400' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${cls}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* WhatsApp billing row */}
        {log.channel === 'whatsapp' && log.creditsUsed != null && (
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Credits charged</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-green-700">{log.creditsUsed.toLocaleString()} credits</p>
              <p className="text-xs text-muted-foreground">
                ${log.usdCost != null ? log.usdCost.toFixed(2) : (log.creditsUsed * 0.03).toFixed(2)} · $0.03/msg
              </p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Delivery rate</span>
            <span className="font-semibold">{rate}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${rate === 100 ? 'bg-emerald-500' : rate > 60 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${rate}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          {formatTs(log.timestamp)}
        </div>

        {log.errorDetails && (
          <details className="mt-4">
            <summary className="text-xs text-red-500 cursor-pointer flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Error details
            </summary>
            <pre className="mt-2 text-xs bg-red-50 text-red-700 rounded-lg p-3 overflow-auto max-h-32">
              {JSON.stringify(log.errorDetails, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminBroadcastLogViewer() {
  const [logs,      setLogs]      = useState<NormalisedLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [channel,   setChannel]   = useState('all');
  const [selected,  setSelected]  = useState<NormalisedLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('broadcast_logs')
      .select('*')
      .order('sent_at', { ascending: false, nullsFirst: false });

    if (err) {
      // Fallback: try ordering by created_at
      const { data: data2, error: err2 } = await supabase
        .from('broadcast_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (err2) {
        setError('Could not load broadcast logs.');
        setLoading(false);
        return;
      }
      setLogs((data2 ?? []).map(normalise));
    } else {
      setLogs((data ?? []).map(normalise));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Unique channels for filter
  const channels = Array.from(new Set(logs.map(l => l.channel))).sort();

  const filtered = logs.filter(l => {
    const matchesChannel = channel === 'all' || l.channel === channel;
    const q = search.toLowerCase();
    const matchesSearch = !q
      || l.title.toLowerCase().includes(q)
      || l.message.toLowerCase().includes(q)
      || l.channel.toLowerCase().includes(q);
    return matchesChannel && matchesSearch;
  });

  // Aggregate stats (from filtered set)
  const totalRecipients  = filtered.reduce((s, l) => s + l.recipients,  0);
  const totalSuccessful  = filtered.reduce((s, l) => s + l.successful,  0);
  const totalFailed      = filtered.reduce((s, l) => s + l.failed,      0);
  const totalWhatsAppSpend = filtered
    .filter(l => l.channel === 'whatsapp' && l.usdCost != null)
    .reduce((s, l) => s + (l.usdCost ?? 0), 0);
  const overallRate = totalRecipients
    ? Math.round((totalSuccessful / totalRecipients) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-600" />
            Broadcast History
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Delivery records for all outgoing broadcasts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={Send}         label="Total Broadcasts"  value={filtered.length}                  colour="bg-purple-100 text-purple-600" />
        <SummaryCard icon={Users}        label="Total Recipients"  value={totalRecipients.toLocaleString()} colour="bg-blue-100 text-blue-600" />
        <SummaryCard icon={CheckCircle2} label="Delivered"         value={totalSuccessful.toLocaleString()} colour="bg-emerald-100 text-emerald-600" />
        <SummaryCard
          icon={TrendingUp}
          label="Delivery Rate"
          value={`${overallRate}%`}
          sub={totalFailed > 0 ? `${totalFailed.toLocaleString()} failed` : 'No failures'}
          colour={overallRate >= 90 ? 'bg-emerald-100 text-emerald-600' : overallRate >= 60 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}
        />
      </div>

      {/* WhatsApp spend card — only shown when there are WhatsApp logs with cost data */}
      {totalWhatsAppSpend > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-green-100">
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total WhatsApp spend (filtered)</p>
                <p className="text-lg font-bold text-green-700">${totalWhatsAppSpend.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">$0.03 / message</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by title or message…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channels.map(c => (
                <SelectItem key={c} value={c}>
                  {channelMeta(c).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="border shadow-sm overflow-hidden">
        {error ? (
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchLogs} className="mt-3">Retry</Button>
          </CardContent>
        ) : loading ? (
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground mx-auto mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">Loading logs…</p>
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent className="py-12 text-center">
            <Send className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {logs.length === 0 ? 'No broadcasts have been sent yet.' : 'No results match your filter.'}
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel</th>
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title / Sender</th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipients</th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent / Failed</th>
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Rate</th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Cost</th>
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Sent at</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <LogRow key={log.id} log={log} onClick={() => setSelected(log)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail modal */}
      {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
