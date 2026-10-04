import { useEffect, useRef, useState, type RefObject } from 'react';

// How loud the room's own audio plays for this listener, 0..1. Live
// Translation (LiveKitRoomWrapper.setTranslationLanguage) lowers it only
// while the translated voice is actually talking, so music and singing
// between translated phrases still come through at full volume.

/** Original audio level while the translation is talking. */
export const DUCKED_LEVEL = 0.12;

let level = 1;
const listeners = new Set<(level: number) => void>();

export function setTranslationDuck(next: number): void {
  if (next === level) return;
  level = next;
  listeners.forEach((l) => l(level));
}

export function useTranslationDuck(): number {
  const [value, setValue] = useState(level);
  useEffect(() => {
    listeners.add(setValue);
    setValue(level);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

// iOS Safari ignores HTMLMediaElement.volume, so there the fallback is a
// plain mute while the translation talks.
let volumeWorks: boolean | null = null;
function canSetVolume(): boolean {
  if (volumeWorks === null) {
    try {
      const probe = new Audio();
      probe.volume = 0.5;
      volumeWorks = probe.volume === 0.5;
    } catch {
      volumeWorks = false;
    }
  }
  return volumeWorks;
}

/** Applies the duck level to a remote <audio> element, ramping so the
 *  music doesn't click in and out. */
export function useDuckedVolume(ref: RefObject<HTMLAudioElement | null>): void {
  const target = useTranslationDuck();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!canSetVolume()) {
      el.muted = target < 0.5;
      return;
    }
    el.muted = false;
    if (timer.current) clearInterval(timer.current);
    // ~150ms down, ~400ms back up, so the original returns gently.
    const step = target < el.volume ? 0.15 : 0.05;
    timer.current = setInterval(() => {
      const diff = target - el.volume;
      if (Math.abs(diff) <= step) {
        el.volume = target;
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      } else {
        el.volume = Math.min(1, Math.max(0, el.volume + Math.sign(diff) * step));
      }
    }, 20);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [target, ref]);
}
