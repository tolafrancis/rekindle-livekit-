import React from 'react';
import { Wifi, WifiOff, Signal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionQualityIndicatorProps {
  quality: 'good' | 'fair' | 'poor' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const ConnectionQualityIndicator: React.FC<ConnectionQualityIndicatorProps> = ({
  quality,
  size = 'sm',
  showLabel = false,
  className
}) => {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const config = {
    good: {
      color: 'text-green-400',
      bgColor: 'bg-green-400/20',
      label: 'Good Connection',
      bars: 3,
      Icon: Wifi
    },
    fair: {
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/20',
      label: 'Fair Connection',
      bars: 2,
      Icon: Wifi
    },
    poor: {
      color: 'text-red-400',
      bgColor: 'bg-red-400/20',
      label: 'Poor Connection',
      bars: 1,
      Icon: Signal
    },
    offline: {
      color: 'text-gray-400',
      bgColor: 'bg-gray-400/20',
      label: 'Offline',
      bars: 0,
      Icon: WifiOff
    }
  };

  const { color, bgColor, label, bars, Icon } = config[quality];

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Signal bars visualization */}
      <div className="flex items-end gap-0.5">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-0.5 rounded-full transition-all',
              i < bars ? color : 'bg-gray-600',
              i === 0 && 'h-1',
              i === 1 && 'h-1.5',
              i === 2 && 'h-2'
            )}
          />
        ))}
      </div>

      {/* Icon (alternative visualization) */}
      {/* <Icon className={cn(sizeClasses[size], color)} /> */}

      {/* Label */}
      {showLabel && (
        <span className={cn('text-xs font-medium', color)}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ConnectionQualityIndicator;