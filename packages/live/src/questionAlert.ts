/**
 * In-page alert for a new incoming Live Translation question — a short
 * two-tone chime, a vibration where supported (phones), and a "(n)" count
 * in the tab title so a speaker glancing at another tab still sees it.
 * Shared by SpeakerPage (/speak) and the ministry admin's Service tab.
 *
 * Browsers only let audio play after the page has had a user gesture;
 * both callers only alert once the user has tapped Start / is working in
 * the dashboard, and any failure here is silently non-fatal.
 */

let audioCtx: AudioContext | null = null;

export function playQuestionChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch { /* non-fatal */ }
  try { navigator.vibrate?.(150); } catch { /* non-fatal */ }
}

const TITLE_BADGE = /^\(\d+\)\s/;

/** Sets (or clears, with 0) a "(n) " prefix on document.title. */
export function setTitleBadge(count: number) {
  if (typeof document === 'undefined') return;
  const base = document.title.replace(TITLE_BADGE, '');
  document.title = count > 0 ? `(${count}) ${base}` : base;
}
