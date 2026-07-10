import React from 'react';
import { FileText } from 'lucide-react';

/**
 * Persistent, unmissable notice that AI notes are being taken.
 *
 * REQUIRED whenever `useMeetingNotes` is active: note-taking transcribes EVERY
 * participant's microphone (each browser transcribes its own and shares the text),
 * so people must be able to see that it's happening for as long as it happens.
 */
export const MeetingNotesBanner: React.FC<{
  active: boolean;
  startedBy?: string | null;
  className?: string;
}> = ({ active, startedBy, className }) => {
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-full bg-purple-900/85 backdrop-blur-sm px-3 py-1.5 text-purple-100 shadow-lg ring-1 ring-purple-400/60 ${className ?? ''}`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-300 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-300" />
      </span>
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs font-medium whitespace-nowrap">
        AI notes are being taken
        {startedBy ? <span className="font-normal opacity-80"> · by {startedBy}</span> : null}
      </span>
    </div>
  );
};

export default MeetingNotesBanner;
