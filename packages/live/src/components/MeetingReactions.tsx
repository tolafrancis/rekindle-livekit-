import React from 'react';
import { FloatingReaction } from '../useMeetingReactions';

// Ministry-flavored reaction set
export const REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '❤️', label: 'Love' },
  { emoji: '🙏', label: 'Amen' },
  { emoji: '🙌', label: 'Praise' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '😮', label: 'Wow' },
];

/** Floating emoji overlay — drop this inside a `relative` video container. */
export const MeetingReactionsLayer: React.FC<{ reactions: FloatingReaction[] }> = ({ reactions }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden z-40">
    <style>{`
      @keyframes reactionFloat {
        0%   { transform: translateY(0) scale(0.5);  opacity: 0; }
        12%  { transform: translateY(-14px) scale(1); opacity: 1; }
        100% { transform: translateY(-58vh) scale(1.15); opacity: 0; }
      }
    `}</style>
    {reactions.map((r) => (
      <span
        key={r.id}
        className="absolute bottom-16 text-3xl select-none"
        style={{ left: `${r.x}%`, animation: 'reactionFloat 3s ease-out forwards' }}
      >
        {r.emoji}
      </span>
    ))}
  </div>
);

/** Row of tappable reaction buttons. */
export const ReactionBar: React.FC<{
  onReact: (emoji: string) => void;
  compact?: boolean;
}> = ({ onReact, compact }) => (
  <div
    className={`flex items-center gap-0.5 rounded-full bg-gray-900/70 backdrop-blur-sm shadow-lg ${
      compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5'
    }`}
  >
    {REACTIONS.map((r) => (
      <button
        key={r.emoji}
        onClick={() => onReact(r.emoji)}
        title={r.label}
        aria-label={r.label}
        className={`hover:scale-125 active:scale-90 transition-transform leading-none ${
          compact ? 'text-lg px-1 py-0.5' : 'text-2xl px-1.5 py-0.5'
        }`}
      >
        {r.emoji}
      </button>
    ))}
  </div>
);
