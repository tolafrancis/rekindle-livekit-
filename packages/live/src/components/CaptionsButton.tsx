import { useEffect, useRef, useState } from 'react';
import { Captions, CaptionsOff, Loader2, Type } from 'lucide-react';
import type { CaptionSize, CaptionStatus } from '../useLiveCaptions';
import {
  updateCaptionPrefs, useCaptionPrefs,
  type CaptionBackground, type CaptionColor, type CaptionPosition,
} from '../captionPrefs';

/** CC toggle + caption style menu (size, background, colour, position), styled to match the other floating
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

const SIZE_LABEL: Record<CaptionSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };
const BACKGROUND_LABEL: Record<CaptionBackground, string> = {
  solid: 'Solid', semi: 'See-through', outline: 'Outline', none: 'None',
};
const COLOR_SWATCH: Record<CaptionColor, string> = {
  white: 'bg-white', yellow: 'bg-yellow-300', cyan: 'bg-cyan-300', green: 'bg-green-400',
};
const POSITION_LABEL: Record<Exclude<CaptionPosition, 'custom'>, string> = { bottom: 'Bottom', top: 'Top' };

const chipClass = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'
  }`;

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
      {enabled && <CaptionStyleMenu size={size} onSizeChange={onSizeChange} />}
    </div>
  );
}

/** Caption look, saved per device (captionPrefs) and applied by
 *  CaptionOverlay everywhere captions show. */
function CaptionStyleMenu({ size, onSizeChange }: { size: CaptionSize; onSizeChange: (size: CaptionSize) => void }) {
  const prefs = useCaptionPrefs();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Caption style"
        aria-label="Caption style"
        className={`${baseClass} gap-0.5 px-2.5 ${open ? 'bg-indigo-600' : 'bg-gray-900/70 hover:bg-gray-800/80'} text-white`}
      >
        <Type className={size === 'sm' ? 'h-3.5 w-3.5' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5'} />
        <span className="text-[10px] font-semibold">{size.toUpperCase()}</span>
      </button>
      {open && (
        <div className="absolute bottom-12 left-1/2 z-50 w-64 -translate-x-1/2 space-y-3 rounded-xl bg-gray-900/95 p-3 text-white shadow-xl backdrop-blur-sm">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">Size</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SIZE_LABEL) as CaptionSize[]).map((s) => (
                <button key={s} type="button" className={chipClass(size === s)} onClick={() => onSizeChange(s)}>{SIZE_LABEL[s]}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">Background</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(BACKGROUND_LABEL) as CaptionBackground[]).map((b) => (
                <button key={b} type="button" className={chipClass(prefs.background === b)} onClick={() => updateCaptionPrefs({ background: b })}>
                  {BACKGROUND_LABEL[b]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">Text colour</p>
            <div className="flex gap-2">
              {(Object.keys(COLOR_SWATCH) as CaptionColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={prefs.color === c}
                  title={c}
                  onClick={() => updateCaptionPrefs({ color: c })}
                  className={`h-7 w-7 rounded-full ${COLOR_SWATCH[c]} ${prefs.color === c ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-900' : ''}`}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">Position</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(POSITION_LABEL) as Array<keyof typeof POSITION_LABEL>).map((p) => (
                <button key={p} type="button" className={chipClass(prefs.position === p)} onClick={() => updateCaptionPrefs({ position: p })}>
                  {POSITION_LABEL[p]}
                </button>
              ))}
              {prefs.position === 'custom' && <span className={chipClass(true)}>Custom</span>}
            </div>
            <p className="mt-1.5 text-[11px] text-white/60">Or drag the captions anywhere on the video.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CaptionsButton;
