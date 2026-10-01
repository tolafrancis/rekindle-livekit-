import { Captions, CaptionsOff, Loader2, Type } from 'lucide-react';
import type { CaptionSize, CaptionStatus } from '../useLiveCaptions';

/** CC toggle + caption text-size control, styled to match the other floating
 *  call buttons (FloatingSpeakerButton, the Raise Hand button) that sit
 *  bottom-center above the control bar. Any participant can use it — no host
 *  action needed (see useLiveCaptions). */

interface CaptionsButtonProps {
  enabled: boolean;
  status: CaptionStatus;
  size: CaptionSize;
  onToggle: () => void;
  onSizeChange: (size: CaptionSize) => void;
}

const NEXT_SIZE: Record<CaptionSize, CaptionSize> = { sm: 'md', md: 'lg', lg: 'sm' };
const SIZE_LABEL: Record<CaptionSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

const baseClass = 'flex h-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors';

export function CaptionsButton({ enabled, status, size, onToggle, onSizeChange }: CaptionsButtonProps) {
  const busy = enabled && status === 'starting';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={enabled}
        title={enabled ? 'Turn captions off' : 'Turn captions on'}
        className={`${baseClass} w-10 ${enabled ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-900/70 text-white hover:bg-gray-800/80'}`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : enabled ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
      </button>
      {enabled && (
        <button
          type="button"
          onClick={() => onSizeChange(NEXT_SIZE[size])}
          title={`Caption size: ${SIZE_LABEL[size]} (tap to change)`}
          aria-label={`Caption size: ${SIZE_LABEL[size]}. Tap to change.`}
          className={`${baseClass} gap-0.5 px-2.5 bg-gray-900/70 text-white hover:bg-gray-800/80`}
        >
          <Type className={size === 'sm' ? 'h-3.5 w-3.5' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5'} />
          <span className="text-[10px] font-semibold">{size.toUpperCase()}</span>
        </button>
      )}
    </div>
  );
}

export default CaptionsButton;
