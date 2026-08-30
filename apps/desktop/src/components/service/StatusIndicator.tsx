import React from 'react';
import { Radio, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

export type ServiceStatus = 'idle' | 'connecting' | 'live' | 'error';

interface StatusIndicatorProps {
  status: ServiceStatus;
  errorMessage?: string | null;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  errorMessage,
}) => {
  const configs = {
    idle: {
      badgeBg: 'bg-slate-800/80 border-slate-700 text-slate-300',
      dot: 'bg-slate-400',
      title: 'Standby / Ready',
      desc: 'Audio bridge is idle. Click "Start Service" when preaching begins.',
    },
    connecting: {
      badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      dot: 'bg-amber-400 animate-ping',
      title: 'Connecting & Dispatching Bot...',
      desc: 'Minting LiveKit publish token and requesting cloud translation bot...',
    },
    live: {
      badgeBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
      dot: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)] animate-pulse',
      title: 'Live — Audio Bridge Active',
      desc: 'Publishing mixer line-in to room; streaming translated audio back to AUX RETURN.',
    },
    error: {
      badgeBg: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
      dot: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]',
      title: 'Service Error',
      desc: errorMessage || 'An unexpected error occurred in the live connection.',
    },
  };

  const current = configs[status];

  return (
    <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${current.badgeBg}`}>
      <div className="flex items-center space-x-3.5">
        <div className="relative flex items-center justify-center w-3 h-3">
          <span className={`w-2.5 h-2.5 rounded-full ${current.dot}`} />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider">
            {current.title}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {current.desc}
          </div>
        </div>
      </div>

      <div className="flex items-center text-[10px] uppercase font-mono tracking-widest px-2.5 py-1 rounded bg-black/30 border border-white/5">
        {status}
      </div>
    </div>
  );
};
