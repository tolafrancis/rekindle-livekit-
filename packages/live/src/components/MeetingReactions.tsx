import React from 'react';
import { Smile } from 'lucide-react';
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

/**
 * A single compact button that opens a popover of the reaction emojis, instead of
 * showing all six inline. The popover clamps to the viewport width so it never
 * spills off-screen, and it dismisses on outside click or Escape.
 *
 * `placement` picks which way the popover unfolds: 'up' (default) for a button
 * that sits near the bottom of its container (e.g. next to a control bar), 'down'
 * for one that sits near the top (e.g. a broadcast host's top overlay row) —
 * opening upward there would push the popover off the top of the screen.
 */
export const ReactionButton: React.FC<{
  onReact: (emoji: string) => void;
  placement?: 'up' | 'down';
}> = ({ onReact, placement = 'up' }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          role="menu"
          className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-gray-900/90 px-2 py-1.5 shadow-lg backdrop-blur-sm max-w-[calc(100vw-1.5rem)] ${
            placement === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          {REACTIONS.map((r) => (
            <button
              key={r.emoji}
              onClick={() => {
                onReact(r.emoji);
                setOpen(false);
              }}
              title={r.label}
              aria-label={r.label}
              className="px-1.5 py-0.5 text-2xl leading-none transition-transform hover:scale-125 active:scale-90"
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Reactions"
        aria-expanded={open}
        title="Reactions"
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors ${
          open ? 'bg-purple-600 text-white' : 'bg-gray-900/70 text-white hover:bg-gray-800/80'
        }`}
      >
        <Smile className="h-5 w-5" />
      </button>
    </div>
  );
};
