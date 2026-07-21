import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Sparkles, Ban, Check } from 'lucide-react';

// Same-origin SVG gradient "backgrounds" as data URIs — no image hosting and no
// canvas CORS taint (remote images would need CORS headers to be usable by the
// LiveKit VirtualBackground processor). Blur needs no image at all.
const grad = (a: string, b: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>` +
      `</linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>`,
  );

const PRESETS: { label: string; url: string; a: string; b: string }[] = [
  { label: 'Purple', a: '#7c3aed', b: '#4f46e5', url: grad('#7c3aed', '#4f46e5') },
  { label: 'Sunset', a: '#f59e0b', b: '#ef4444', url: grad('#f59e0b', '#ef4444') },
  { label: 'Ocean', a: '#0ea5e9', b: '#0f766e', url: grad('#0ea5e9', '#0f766e') },
  { label: 'Forest', a: '#22c55e', b: '#065f46', url: grad('#22c55e', '#065f46') },
];

interface Props {
  /** 'none' | 'blur' | <image URL> */
  value: string;
  onChange: (mode: string) => void;
  /** The button element that opens the picker (styled by the caller's control bar). */
  trigger: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

/** Virtual-background picker: None, Blur, or a gradient. Works in both the meeting
 *  room and the live broadcast (both drive useDailyRoom's setVideoBackground). */
export const VirtualBackgroundButton: React.FC<Props> = ({ value, onChange, trigger, align = 'center' }) => {
  const cell = 'relative h-12 rounded-lg border flex items-center justify-center text-xs font-medium overflow-hidden transition-all';
  const sel = (on: boolean) => (on ? 'border-purple-500 ring-2 ring-purple-400' : 'border-gray-200 hover:border-gray-300');

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-56 p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Background</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onChange('none')} className={`${cell} ${sel(value === 'none')} bg-gray-50 text-gray-600`}>
            <Ban className="h-4 w-4 mr-1" /> None
            {value === 'none' && <Check className="absolute top-1 right-1 h-3 w-3 text-purple-600" />}
          </button>
          <button type="button" onClick={() => onChange('blur')} className={`${cell} ${sel(value === 'blur')} bg-gradient-to-br from-gray-200 to-gray-400 text-gray-700 backdrop-blur`}>
            <Sparkles className="h-4 w-4 mr-1" /> Blur
            {value === 'blur' && <Check className="absolute top-1 right-1 h-3 w-3 text-purple-600" />}
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => onChange(p.url)}
              title={p.label}
              className={`${cell} ${sel(value === p.url)}`}
              style={{ backgroundImage: `linear-gradient(135deg, ${p.a}, ${p.b})` }}
            >
              {value === p.url && <Check className="absolute top-1 right-1 h-3 w-3 text-white drop-shadow" />}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">Applies to your camera. Turn the camera on to see it.</p>
      </PopoverContent>
    </Popover>
  );
};

export default VirtualBackgroundButton;
