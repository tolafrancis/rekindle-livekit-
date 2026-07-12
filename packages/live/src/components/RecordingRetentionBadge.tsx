import React from 'react';
import { Clock } from 'lucide-react';
import { recordingExpiryInfo, type RecordingKind } from '../recordingRetention';

/**
 * Shows how long a recording remains available before auto-deletion, e.g.
 * "Available until 4 Aug 2026", turning amber near expiry and red once expired.
 * Prompts leaders to download in time.
 */
export const RecordingRetentionBadge: React.FC<{
  createdAt: string;
  kind: RecordingKind;
  className?: string;
}> = ({ createdAt, kind, className = '' }) => {
  const info = recordingExpiryInfo(createdAt, kind);
  const color = info.expired
    ? 'bg-red-50 text-red-700 border-red-200'
    : info.soon
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span
      title={`Recordings are kept for ${kind === 'broadcast' ? 90 : 30} days, then removed automatically.`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color} ${className}`}
    >
      <Clock className="h-3 w-3" />
      {info.label}
    </span>
  );
};

export default RecordingRetentionBadge;
