import React, { useState } from 'react';
import { Mic, Volume2, Globe2, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAudioDevices } from '../../hooks/useAudioDevices';

interface Step2AudioLanguageProps {
  initialInputId: string;
  initialOutputId: string;
  initialSourceLang: string;
  initialTargetLang: string;
  onBack: () => void;
  onSuccess: (data: {
    inputDeviceId: string;
    outputDeviceId: string;
    sourceLanguage: string;
    targetLanguage: string;
  }) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Vietnamese (Tiếng Việt)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'tl', name: 'Tagalog (Filipino)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'th', name: 'Thai (ไทย)' },
  { code: 'zh', name: 'Chinese (Mandarin / 中文)' },
  { code: 'ko', name: 'Korean (한국어)' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'ru', name: 'Russian (Русский)' },
  { code: 'yo', name: 'Yoruba (Èdè Yorùbá)' },
  { code: 'en', name: 'English' },
];

const SOURCE_LANGUAGES = [
  { code: 'en', name: 'English (Default)' },
  { code: 'auto', name: 'Auto-detect Spoken Language' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'vi', name: 'Vietnamese' },
];

export const Step2AudioLanguage: React.FC<Step2AudioLanguageProps> = ({
  initialInputId,
  initialOutputId,
  initialSourceLang,
  initialTargetLang,
  onBack,
  onSuccess,
}) => {
  const { inputs, outputs, loading, error, requestPermissions, refreshDevices } = useAudioDevices();

  const [inputDeviceId, setInputDeviceId] = useState(initialInputId || 'default');
  const [outputDeviceId, setOutputDeviceId] = useState(initialOutputId || 'default');
  const [sourceLanguage, setSourceLanguage] = useState(initialSourceLang || 'en');
  const [targetLanguage, setTargetLanguage] = useState(initialTargetLang || 'vi');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSuccess({
      inputDeviceId,
      outputDeviceId,
      sourceLanguage,
      targetLanguage,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-blue-500" />
          Step 2: Sound Board I/O & Languages
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Select which audio channels connect to your church PA mixer and set the translation language pair.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Audio Input Device */}
        <div className="bg-surface p-4 rounded-xl border border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Microphone / Line In (AUX SEND)
            </label>
            <button
              type="button"
              onClick={() => refreshDevices()}
              title="Refresh audio device list"
              className="text-slate-400 hover:text-slate-200 p-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <select
            value={inputDeviceId}
            onChange={(e) => setInputDeviceId(e.target.value)}
            className="w-full bg-surface-elevated border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="default">Windows Default Recording Device</option>
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            Connects to your mixer's AUX SEND bus carrying the pastor's raw sermon voice.
          </p>
        </div>

        {/* Audio Output Device */}
        <div className="bg-surface p-4 rounded-xl border border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-blue-400" />
              PA Return / Speakers (AUX RETURN)
            </label>
            <button
              type="button"
              onClick={() => refreshDevices()}
              title="Refresh audio device list"
              className="text-slate-400 hover:text-slate-200 p-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <select
            value={outputDeviceId}
            onChange={(e) => setOutputDeviceId(e.target.value)}
            className="w-full bg-surface-elevated border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="default">Windows Default Playback Device</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            Routes translated audio back into the sound mixer for local congregation playback.
          </p>
        </div>
      </div>

      {inputs.length === 0 && !loading && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Audio permissions needed to view hardware device names.</span>
          </div>
          <button
            type="button"
            onClick={() => requestPermissions()}
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs transition-colors"
          >
            Enable Device Access
          </button>
        </div>
      )}

      {/* Language Pair Configuration */}
      <div className="bg-surface p-4 rounded-xl border border-surface-border space-y-4">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Live Translation Language Pair
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Speaker Language (Source)
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="w-full bg-surface-elevated border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            >
              {SOURCE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Translated Language (Target PA Return)
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="w-full bg-surface-elevated border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sound engineer tip */}
      <div className="p-3 rounded-lg bg-surface-elevated border border-slate-800 flex items-start gap-2.5 text-slate-400 text-xs">
        <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-300">Sound Booth Best Practice: </span>
          Ensure the USB interface channel is set to standard line-level gain on your mixer, with phantom power (+48V) disabled on AUX lines.
        </div>
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
          type="submit"
          className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-blue-600/20 transition-all"
        >
          <span>Continue to Output Test</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
};
