import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Bluetooth, Check, Headphones, Smartphone, Volume2 } from 'lucide-react';
import { useAudioOutput } from '../AudioOutputContext';

interface Props {
  /** The button element that opens the picker (styled by the caller's control bar). */
  trigger: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

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

/** Audio output (speaker/headset/Bluetooth) picker for an active call — mirrors
 *  VirtualBackgroundButton's Popover pattern. Renders nothing if the browser
 *  doesn't support HTMLMediaElement.setSinkId (Safari/iOS, some WebViews). */
export const AudioOutputButton: React.FC<Props> = ({ trigger, align = 'center' }) => {
  const { isSupported, devices, selectedDeviceId, selectDevice } = useAudioOutput();

  if (!isSupported) return null;

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const sel = (on: boolean) => (on ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-100');

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-2">
        <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1">Audio output</p>
        <div className="max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => selectDevice('')}
            className={`${row} ${sel(selectedDeviceId === '')}`}
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
              className={`${row} ${sel(selectedDeviceId === d.deviceId)}`}
              title={d.label}
            >
              {iconFor(d.label)}
              <span className="flex-1 truncate">{d.label}</span>
              {selectedDeviceId === d.deviceId && <Check className="h-3.5 w-3.5 text-purple-600" />}
            </button>
          ))}
        </div>
        {devices.length === 0 && (
          <p className="text-[10px] text-gray-400 px-2.5 pt-1">No other output devices detected.</p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default AudioOutputButton;
