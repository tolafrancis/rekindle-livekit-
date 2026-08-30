import React from 'react';
import { Mic, Volume2 } from 'lucide-react';

interface AudioVUMeterProps {
  inputLevel: number; // 0 to 1
  outputLevel: number; // 0 to 1
}

export const AudioVUMeter: React.FC<AudioVUMeterProps> = ({
  inputLevel,
  outputLevel,
}) => {
  // Segmented meter: 20 LED bars
  const totalSegments = 24;

  const renderSegments = (level: number, activeColor: string) => {
    const activeCount = Math.round(Math.min(1, Math.max(0, level)) * totalSegments);

    return (
      <div className="flex items-center space-x-1 w-full">
        {Array.from({ length: totalSegments }).map((_, i) => {
          const isActive = i < activeCount;
          // Top 3 bars are red (clipping zone), next 5 are amber, rest are green/color
          let color = activeColor;
          if (i >= totalSegments - 3) {
            color = 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]';
          } else if (i >= totalSegments - 7) {
            color = 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]';
          }

          return (
            <div
              key={i}
              className={`h-4 flex-1 rounded-xs transition-all duration-75 ${
                isActive ? color : 'bg-slate-800/80 border border-slate-900'
              }`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-surface p-4 rounded-xl border border-surface-border space-y-4">
      {/* Input Channel (Mixer -> LiveKit) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-1.5 text-slate-300 font-semibold uppercase tracking-wider">
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>PA Mixer Input (AUX SEND &rarr; PC)</span>
          </div>
          <span className="font-mono text-slate-400 text-[10px]">
            {inputLevel > 0.02 ? `${Math.round(inputLevel * 100)}% SIGNAL` : 'NO AUDIO'}
          </span>
        </div>
        {renderSegments(inputLevel, 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]')}
      </div>

      {/* Output Channel (LiveKit Bot -> Mixer AUX RETURN) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-1.5 text-slate-300 font-semibold uppercase tracking-wider">
            <Volume2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Translated Return (PC &rarr; AUX RETURN)</span>
          </div>
          <span className="font-mono text-slate-400 text-[10px]">
            {outputLevel > 0.02 ? `${Math.round(outputLevel * 100)}% ACTIVE` : 'IDLE'}
          </span>
        </div>
        {renderSegments(outputLevel, 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.7)]')}
      </div>
    </div>
  );
};
