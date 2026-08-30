import React, { useEffect, useState } from 'react';
import { Wifi, Clock, Globe2, HeartHandshake, ShieldCheck } from 'lucide-react';

interface LatencyDisplayProps {
  rttMs: number;
  sessionStartTime: Date | null;
  sourceLanguage: string;
  targetLanguage: string;
  roomName: string | null;
  lastHeartbeat: Date | null;
  isHeartbeatHealthy: boolean;
}

export const LatencyDisplay: React.FC<LatencyDisplayProps> = ({
  rttMs,
  sessionStartTime,
  sourceLanguage,
  targetLanguage,
  roomName,
  lastHeartbeat,
  isHeartbeatHealthy,
}) => {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (!sessionStartTime) {
      setElapsed('00:00:00');
      return;
    }

    const updateTimer = () => {
      const diffMs = Date.now() - sessionStartTime.getTime();
      const totalSecs = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      const pad = (n: number) => n.toString().padStart(2, '0');
      setElapsed(`${pad(hours)}:${pad(mins)}:${pad(secs)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  // Color code for round trip time
  const getLatencyColor = (ms: number) => {
    if (ms <= 0) return 'text-slate-500';
    if (ms < 75) return 'text-emerald-400';
    if (ms < 150) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Round Trip Latency */}
      <div className="bg-surface p-3.5 rounded-xl border border-surface-border space-y-1">
        <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5 text-blue-400" />
          <span>WebRTC Latency</span>
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className={`text-xl font-bold font-mono ${getLatencyColor(rttMs)}`}>
            {rttMs > 0 ? `${rttMs}` : '--'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">ms</span>
        </div>
      </div>

      {/* Elapsed Session Duration */}
      <div className="bg-surface p-3.5 rounded-xl border border-surface-border space-y-1">
        <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Service Duration</span>
        </div>
        <div className="text-xl font-bold font-mono text-slate-200">
          {elapsed}
        </div>
      </div>

      {/* Language Pair */}
      <div className="bg-surface p-3.5 rounded-xl border border-surface-border space-y-1">
        <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Language Pair</span>
        </div>
        <div className="text-xl font-bold font-mono text-slate-200">
          {sourceLanguage.toUpperCase()} &rarr; {targetLanguage.toUpperCase()}
        </div>
      </div>

      {/* Heartbeat Status */}
      <div className="bg-surface p-3.5 rounded-xl border border-surface-border space-y-1">
        <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <HeartHandshake className="w-3.5 h-3.5 text-rose-400" />
          <span>Auth Keepalive</span>
        </div>
        <div className="flex items-center space-x-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isHeartbeatHealthy ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-rose-500'
            }`}
          />
          <span className="text-xs font-semibold text-slate-300">
            {isHeartbeatHealthy ? '60s Heartbeat OK' : 'Check Token'}
          </span>
        </div>
      </div>
    </div>
  );
};
