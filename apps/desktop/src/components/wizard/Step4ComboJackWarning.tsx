import React, { useState } from 'react';
import { AlertTriangle, Usb, Headphones, Check, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';

interface Step4ComboJackWarningProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const Step4ComboJackWarning: React.FC<Step4ComboJackWarningProps> = ({
  onBack,
  onSuccess,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Step 4: Hardware & Combo Jack Safety
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Review critical audio wiring requirements to prevent feedback loops in church PA systems.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recommended: USB Audio Interface */}
        <div className="bg-surface p-5 rounded-xl border border-emerald-500/30 space-y-3 relative overflow-hidden">
          <div className="flex items-center space-x-2 text-emerald-400">
            <Usb className="w-5 h-5" />
            <span className="font-bold text-xs uppercase tracking-wider">
              Recommended: USB Audio Interface
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Uses dedicated dual RCA or 1/4" TRS jacks (e.g. <strong>Behringer UCA222</strong> (~$30) or <strong>Focusrite Scarlett Solo</strong>).
          </p>
          <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
            <li>True line-level input prevents distortion on loud preaching.</li>
            <li>Physically isolated input and output channels.</li>
            <li>Zero crosstalk or electrical feedback between channels.</li>
          </ul>
        </div>

        {/* High Risk: Shared 3.5mm Combo Jack */}
        <div className="bg-surface p-5 rounded-xl border border-rose-500/30 space-y-3">
          <div className="flex items-center space-x-2 text-rose-400">
            <Headphones className="w-5 h-5" />
            <span className="font-bold text-xs uppercase tracking-wider">
              High Risk: Single 3.5mm Laptop Jack
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Single 3.5mm TRRS headphone/mic combo ports found on modern laptops.
          </p>
          <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Mic contact is designed for headset mics, not hot line feeds.</li>
            <li>Prone to harsh distortion and channel bleeding.</li>
            <li>
              <strong className="text-rose-300">Mandatory:</strong> If your PC only has a single combo port, plug in a USB audio interface before going live.
            </li>
          </ul>
        </div>
      </div>

      {/* Safety Protocol Card */}
      <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>Sound Booth Line-Check Protocol:</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Before unmuting the translated AUX RETURN channel into the sanctuary main speakers, verify that the channel is excluded from the AUX SEND bus on your mixer to prevent an acoustic feedback loop.
        </p>
      </div>

      {/* Acknowledgment Checkbox */}
      <div className="flex items-start space-x-3 p-4 rounded-xl bg-surface border border-slate-800">
        <input
          type="checkbox"
          id="ack-checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-surface-elevated border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
        />
        <label htmlFor="ack-checkbox" className="text-xs text-slate-300 cursor-pointer select-none">
          I confirm that this PC is connected using an appropriate audio interface, and the mixer routing excludes the AUX RETURN channel from sending back into itself.
        </label>
      </div>

      {/* Navigation */}
      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-surface-elevated hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={onSuccess}
          className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-blue-600/20 transition-all"
        >
          <span>Acknowledge & Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
