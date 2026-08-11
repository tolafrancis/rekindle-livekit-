import React from 'react';
import { Volume2 } from 'lucide-react';
import { AudioOutputButton } from './AudioOutputButton';

/** Speaker/audio-output trigger styled to match the floating Reactions + Raise
 *  Hand + Background pill that sits bottom-center, just above the control bar
 *  — moved out of the bar entirely so it doesn't push buttons off-screen on
 *  mobile. Renders nothing where the browser doesn't support output-device
 *  switching (Safari/iOS) — AudioOutputButton already no-ops in that case.
 *  Native builds don't need this: EffectsButton (rendered by
 *  FloatingBackgroundButton) already bundles the same audio-output picker. */
export const FloatingSpeakerButton: React.FC = () => (
  <AudioOutputButton
    align="center"
    trigger={
      <button
        type="button"
        title="Speaker"
        className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm bg-gray-900/70 text-white hover:bg-gray-800/80 transition-colors"
      >
        <Volume2 className="h-5 w-5" />
      </button>
    }
  />
);

export default FloatingSpeakerButton;
