import React, { useState } from 'react';
import { Volume2, Play, Square, ArrowRight, ArrowLeft, Activity, CheckCircle2 } from 'lucide-react';
import { testTonePlayer } from '../../utils/testTone';

interface Step3TestToneProps {
  outputDeviceId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const Step3TestTone: React.FC<Step3TestToneProps> = ({
  outputDeviceId,
  onBack,
  onSuccess,
}) => {
  const [playing, setPlaying] = useState(false);
  const [testedOnce, setTestedOnce] = useState(false);
  const [volume, setVolume] = useState(0.4);

  const handlePlayTest = async () => {
    if (playing) {
      testTonePlayer.stop();
      setPlaying(false);
      return;
    }

    setPlaying(true);
    setTestedOnce(true);

    try {
      await testTonePlayer.play({
        frequency: 1000, // 1kHz standard calibration tone
        durationMs: 2000, // 2 seconds
        outputDeviceId,
        volume,
      });
    } finally {
      setPlaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          Step 3: PA Mixer Return Test
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Verify the sound board receives audio from this PC before starting a live service.
        </p>
      </div>

      <div className="bg-surface p-6 rounded-xl border border-surface-border space-y-5 text-center">
        <div className="max-w-md mx-auto space-y-3">
          <p className="text-xs text-slate-300">
            Pressing the button below emits a gentle <strong>1,000 Hz reference sine wave</strong> for 2 seconds.
            Look at your mixer’s input meter on the AUX RETURN / PC line channel.
          </p>

          {/* Sound wave animation */}
          <div className="h-16 flex items-center justify-center gap-1.5 py-2">
            {[40, 70, 90, 60, 100, 75, 45, 85, 95, 65, 30].map((height, i) => (
              <div
                key={i}
                style={{
                  height: playing ? `${height}%` : '8%',
                  transition: 'height 0.15s ease',
                }}
                className={`w-1.5 rounded-full ${
                  playing ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Test Button */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handlePlayTest}
              className={`px-6 py-3 rounded-xl text-sm font-semibold flex items-center space-x-2.5 shadow-lg transition-all ${
                playing
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25 ring-2 ring-rose-400'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25'
              }`}
            >
              {playing ? (
                <>
                  <Square className="w-4 h-4" />
                  <span>Stop Tone</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Play 1 kHz Test Tone</span>
                </>
              )}
            </button>
          </div>

          {/* Volume Slider */}
          <div className="flex items-center justify-center space-x-3 pt-3 max-w-xs mx-auto">
            <Volume2 className="w-4 h-4 text-slate-400" />
            <input
              type="range"
              min="0.05"
              max="0.8"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-xs font-mono text-slate-400 w-10">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {testedOnce && (
          <div className="pt-3 border-t border-slate-800 flex items-center justify-center space-x-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Tone emitted to selected playback device.</span>
          </div>
        )}
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            testTonePlayer.stop();
            onBack();
          }}
          className="px-4 py-2 rounded-lg bg-surface-elevated hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={() => {
            testTonePlayer.stop();
            onSuccess();
          }}
          className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-blue-600/20 transition-all"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
