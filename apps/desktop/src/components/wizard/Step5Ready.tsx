import React from 'react';
import { CheckCircle2, ShieldCheck, ArrowLeft, Radio, ArrowRight, Mic, Volume2, Globe2 } from 'lucide-react';
import type { AppSettings } from '../../utils/secureStore';

interface Step5ReadyProps {
  settings: AppSettings;
  onBack: () => void;
  onComplete: () => void;
}

export const Step5Ready: React.FC<Step5ReadyProps> = ({
  settings,
  onBack,
  onComplete,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          Step 5: Setup Complete & Ready
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Review your configured hardware routing before entering Daily Service Mode.
        </p>
      </div>

      <div className="bg-surface p-5 rounded-xl border border-surface-border space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Configuration Summary
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Device Pairing */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 font-medium">Paired Device ID</div>
            <div className="font-mono text-slate-200 truncate">
              {settings.deviceId || 'Verified Hardware Device'}
            </div>
            <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Active Bearer Token Stored
            </div>
          </div>

          {/* Languages */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Globe2 className="w-3.5 h-3.5 text-blue-400" />
              Translation Language Pair
            </div>
            <div className="font-bold text-slate-200 text-sm">
              {settings.sourceLanguage.toUpperCase()} &rarr; {settings.targetLanguage.toUpperCase()}
            </div>
            <div className="text-[10px] text-slate-400">
              Source: {settings.sourceLanguage} | Target: {settings.targetLanguage}
            </div>
          </div>

          {/* Audio Input */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Line In (Sermon Audio)
            </div>
            <div className="font-mono text-slate-200 truncate text-[11px]">
              {settings.inputDeviceId === 'default'
                ? 'Windows Default Recording Device'
                : settings.inputDeviceId}
            </div>
            <div className="text-[10px] text-emerald-400">
              Raw line-in (filters disabled for pro audio)
            </div>
          </div>

          {/* Audio Output */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-blue-400" />
              Line Out (Translated Return)
            </div>
            <div className="font-mono text-slate-200 truncate text-[11px]">
              {settings.outputDeviceId === 'default'
                ? 'Windows Default Playback Device'
                : settings.outputDeviceId}
            </div>
            <div className="text-[10px] text-blue-400">
              Direct feed to PA Mixer AUX RETURN
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center space-x-2 text-blue-300 text-xs">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>Credentials are securely encrypted on this PC using Windows SafeStorage DPAPI.</span>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-surface-elevated hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Adjust Settings</span>
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all"
        >
          <span>Launch Translator Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
