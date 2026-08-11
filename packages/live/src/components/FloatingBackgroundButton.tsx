import React from 'react';
import { Sparkles } from 'lucide-react';
import { VirtualBackgroundButton } from './VirtualBackgroundButton';
import { EffectsButton } from './EffectsButton';

interface Props {
  isNative: boolean;
  value: string;
  onChange: (mode: string) => void;
}

/** Background/Effects trigger styled to match the floating Reactions + Raise Hand
 *  pill that sits bottom-center, just above the control bar. Picks EffectsButton
 *  (native — bundles the audio-output picker too) or VirtualBackgroundButton
 *  (web) depending on platform. Fed by DailyVideoCall's onBackgroundStateChange
 *  so callers don't have to reach into useDailyRoom themselves. */
export const FloatingBackgroundButton: React.FC<Props> = ({ isNative, value, onChange }) => {
  const trigger = (
    <button
      type="button"
      title="Background"
      className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors ${
        value !== 'none' ? 'bg-purple-600 text-white' : 'bg-gray-900/70 text-white hover:bg-gray-800/80'
      }`}
    >
      <Sparkles className="h-5 w-5" />
    </button>
  );

  return isNative ? (
    <EffectsButton value={value} onChange={onChange} trigger={trigger} />
  ) : (
    <VirtualBackgroundButton value={value} onChange={onChange} trigger={trigger} />
  );
};

export default FloatingBackgroundButton;
