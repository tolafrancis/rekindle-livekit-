import React from 'react';
import { Clock } from 'lucide-react';
import { recordingExpiryInfo, retentionDays, type RecordingKind } from '../recordingRetention';

/**
 * Shows how long a recording remains available before auto-deletion, e.g.
 * "Available until 4 Aug 2026", turning amber near expiry and red once expired.
 * Prompts leaders to download in time.
 */
export const RecordingRetentionBadge: React.FC<{
  createdAt: string;
  kind: RecordingKind;
  className?: string;
  /** A storage_pack ministry's custom recording_retention_days: omit to use the
   *  kind's fixed default, a number for a custom window, or null for "Never
   *  delete" (the ministry's recording_retention_days column, verbatim). */
  retentionDaysOverride?: number | null;
}> = ({ createdAt, kind, className = '', retentionDaysOverride }) => {
  const info = recordingExpiryInfo(createdAt, kind, Date.now(), retentionDaysOverride);
  const color = info.neverExpires
    ? 'bg-gray-50 text-gray-600 border-gray-200'
    : info.expired
      ? 'bg-red-50 text-red-700 border-red-200'
      : info.soon
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-gray-50 text-gray-600 border-gray-200';
  const title = info.neverExpires
    ? 'This ministry keeps recordings indefinitely.'
    : `Recordings are kept for ${retentionDaysOverride ?? retentionDays(kind)} days, then removed automatically.`;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color} ${className}`}
    >
      <Clock className="h-3 w-3" />
      {info.label}
    </span>
  );
};

export default RecordingRetentionBadge;
