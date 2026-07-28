import React, { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { Sparkles, Ban, Check, ImagePlus, Loader2, Volume2, Bluetooth, Headphones, Smartphone } from 'lucide-react';
import { useAudioOutput } from '../AudioOutputContext';

const MAX_BG_BYTES = 10 * 1024 * 1024; // 10 MB

// Photographic-style backdrops shipped in each app's public/backgrounds/. They
// MUST be same-origin so the LiveKit VirtualBackground canvas isn't CORS-tainted;
// blur needs no image at all. To add real licensed photos, drop 1280x720 images
// into apps/*/public/backgrounds/ and list them here.
const PRESETS: { label: string; url: string }[] = [
  { label: 'Studio', url: '/backgrounds/studio.png' },
  { label: 'Office', url: '/backgrounds/office.png' },
  { label: 'Warm', url: '/backgrounds/warm.png' },
  { label: 'Nature', url: '/backgrounds/nature.png' },
];

// The Web Audio Output Devices API only gives free-text labels, no structured
// device type — this is the same best-effort categorization Meet/Teams are
// bound to by the same browser API, not a gap specific to this implementation.
function iconFor(label: string): React.ReactNode {
  const l = label.toLowerCase();
  if (l.includes('bluetooth')) return <Bluetooth className="h-4 w-4" />;
  if (l.includes('headphone') || l.includes('headset') || l.includes('earbud') || l.includes('airpods')) {
    return <Headphones className="h-4 w-4" />;
  }
  if (l.includes('earpiece') || l.includes('receiver')) return <Smartphone className="h-4 w-4" />;
  return <Volume2 className="h-4 w-4" />;
}

interface Props {
  value: string;             // virtual background value
  onChange: (mode: string) => void;
  trigger: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

export const EffectsButton: React.FC<Props> = ({ value, onChange, trigger, align = 'center' }) => {
  const { isSupported: audioSupported, devices, selectedDeviceId, selectDevice } = useAudioOutput();
  
  const cell = 'relative h-12 rounded-lg border flex items-center justify-center text-xs font-medium overflow-hidden transition-all';
  const sel = (on: boolean) => (on ? 'border-purple-500 ring-2 ring-purple-400' : 'border-gray-200 hover:border-gray-300');

  // A user-supplied image. Kept as a local blob: URL — the background is applied
  // to the LOCAL camera before publishing, so it never needs uploading, and a
  // same-origin blob URL avoids the canvas CORS taint a remote URL would cause.
  const fileRef = useRef<HTMLInputElement>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The segmentation model behind blur/virtual-background has to load and warm
  // up on first use — that can take a few seconds on a slower device, so this
  // gives visible feedback instead of the picker looking like the click did
  // nothing (matches the reattach retry window in useDailyRoom's setVideoBackground).
  const [applying, setApplying] = useState(false);
  useEffect(() => () => { if (customUrl) URL.revokeObjectURL(customUrl); }, [customUrl]);

  const select = (mode: string) => {
    setApplying(mode !== 'none');
    onChange(mode);
    setTimeout(() => setApplying(false), 3200);
  };

  const onUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Not an image', description: 'Choose a JPG or PNG image.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_BG_BYTES) {
      toast({ title: 'Image too large', description: 'Background images must be 10 MB or less.', variant: 'destructive' });
      return;
    }
    if (customUrl) URL.revokeObjectURL(customUrl);
    const url = URL.createObjectURL(file);
    setCustomUrl(url);
    select(url);
    if (fileRef.current) fileRef.current.value = '';
  };

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const audioSel = (on: boolean) => (on ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-100');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-3 max-h-[70vh] overflow-y-auto">
        <p className="text-xs font-semibold text-gray-700 mb-2">Background</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => select('none')} className={`${cell} ${sel(value === 'none')} bg-gray-50 text-gray-600`}>
            <Ban className="h-4 w-4 mr-1" /> None
            {value === 'none' && <Check className="absolute top-1 right-1 h-3 w-3 text-purple-600" />}
          </button>
          <button type="button" onClick={() => select('blur')} className={`${cell} ${sel(value === 'blur')} bg-gradient-to-br from-gray-200 to-gray-400 text-gray-700 backdrop-blur`}>
            <Sparkles className="h-4 w-4 mr-1" /> Blur
            {value === 'blur' && (applying ? <Loader2 className="absolute top-1 right-1 h-3 w-3 text-purple-600 animate-spin" /> : <Check className="absolute top-1 right-1 h-3 w-3 text-purple-600" />)}
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => select(p.url)}
              title={p.label}
              className={`${cell} ${sel(value === p.url)} bg-cover bg-center`}
              style={{ backgroundImage: `url(${p.url})` }}
            >
              {value === p.url && (applying ? <Loader2 className="absolute top-1 right-1 h-3 w-3 text-white animate-spin drop-shadow" /> : <Check className="absolute top-1 right-1 h-3 w-3 text-white drop-shadow" />)}
            </button>
          ))}

          {/* The user's uploaded image (once chosen) becomes a reselectable tile. */}
          {customUrl && (
            <button
              type="button"
              onClick={() => select(customUrl)}
              title="Your image"
              className={`${cell} ${sel(value === customUrl)} bg-cover bg-center`}
              style={{ backgroundImage: `url(${customUrl})` }}
            >
              {value === customUrl && (applying ? <Loader2 className="absolute top-1 right-1 h-3 w-3 text-white animate-spin drop-shadow" /> : <Check className="absolute top-1 right-1 h-3 w-3 text-white drop-shadow" />)}
            </button>
          )}

          {/* Upload your own */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0] || undefined)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Upload your own image"
            className={`${cell} border-dashed bg-gray-50 text-gray-500 hover:border-purple-400 hover:text-purple-600`}
          >
            <ImagePlus className="h-4 w-4 mr-1" /> Upload
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          {applying
            ? 'Applying — this can take a few seconds the first time on this device…'
            : 'Applies to your camera. Turn the camera on to see it. Uploads stay on your device.'}
        </p>
        
        {audioSupported && (
          <>
            <div className="h-px bg-gray-200 my-3" />
            <p className="text-xs font-semibold text-gray-700 mb-1">Audio output</p>
            <div className="max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => selectDevice('')}
                className={`${row} ${audioSel(selectedDeviceId === '')}`}
              >
                <Volume2 className="h-4 w-4" />
                <span className="flex-1 truncate">System default</span>
                {selectedDeviceId === '' && <Check className="h-3.5 w-3.5 text-purple-600" />}
              </button>
              {devices.map((d) => (
                <button
                  key={d.deviceId}
                  type="button"
                  onClick={() => selectDevice(d.deviceId)}
                  className={`${row} ${audioSel(selectedDeviceId === d.deviceId)}`}
                  title={d.label}
                >
                  {iconFor(d.label)}
                  <span className="flex-1 truncate">{d.label}</span>
                  {selectedDeviceId === d.deviceId && <Check className="h-3.5 w-3.5 text-purple-600" />}
                </button>
              ))}
            </div>
            {devices.length === 0 && (
              <p className="text-[10px] text-gray-400 pt-1">No other output devices detected.</p>
            )}
          </>
        )}

        <Button type="button" size="sm" className="w-full mt-3 bg-purple-600 hover:bg-purple-700" onClick={() => setOpen(false)}>
          Done
        </Button>
      </PopoverContent>
    </Popover>
  );
};

export default EffectsButton;
