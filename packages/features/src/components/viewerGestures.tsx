// =============================================================================
// Shared viewer gesture helpers — used by every content viewer (devotionals,
// bible studies, prayer sessions) so tap/audio behaviour is IDENTICAL everywhere.
//
// Gesture contract (see product requirements):
//   • SINGLE tap  -> PAUSE only. Never starts or resumes audio.
//   • DOUBLE tap  -> PLAY / resume audio (an explicit user action).
//   • Play button -> PLAY (explicit).
//   • Navigation / scrolling / showing controls -> never touches audio.
// Audio must never auto-start; it plays only via an explicit Play / double-tap.
// =============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../LanguageContext';

const DOUBLE_TAP_MS = 280;

// Elements that should NOT be treated as a background tap (controls, inputs…).
const CONTROL_SELECTOR =
  'button, a, input, select, textarea, [role="slider"], [role="button"], [role="menu"], [data-no-tap]';

/**
 * Distinguish a single tap from a double tap on the viewer background.
 * Taps that land on a control (see CONTROL_SELECTOR) are ignored so buttons and
 * navigation keep working. Returns an onClick handler to spread on the viewer.
 */
export function useTapGesture(onSingleTap: () => void, onDoubleTap: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleRef = useRef(onSingleTap);
  const doubleRef = useRef(onDoubleTap);
  singleRef.current = onSingleTap;
  doubleRef.current = onDoubleTap;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(CONTROL_SELECTOR)) return; // let controls handle themselves

    if (timer.current) {
      // Second tap within the window -> double tap (play).
      clearTimeout(timer.current);
      timer.current = null;
      doubleRef.current();
    } else {
      // First tap -> wait to see if a second one arrives; if not, it's a single tap (pause).
      timer.current = setTimeout(() => {
        timer.current = null;
        singleRef.current();
      }, DOUBLE_TAP_MS);
    }
  }, []);
}

const TIP_STORAGE_KEY = 'rk_viewer_gesture_tip_seen_v1';

/**
 * One-time-per-user flag backed by localStorage. `show` is true until dismissed
 * (or already dismissed on a previous visit). Best-effort — degrades to
 * always-show if storage is unavailable.
 */
export function useOneTimeTip(storageKey: string = TIP_STORAGE_KEY) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setShow(true);
    } catch { /* storage blocked — skip the tip rather than nag */ }
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setShow(false);
    try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
  }, [storageKey]);

  return { show, dismiss };
}

/**
 * The onboarding tip shown the first time a viewer opens. Auto-dismisses after a
 * few seconds and is remembered per user. Rendered near the top of the viewer.
 */
export const ViewerGestureTip: React.FC<{ show: boolean; onDismiss: () => void; message?: string }> = ({ show, onDismiss, message }) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4" data-no-tap>
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/75 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        role="button"
        tabIndex={0}
      >
        <span>👆</span>
        <span>
          {message ?? t('viewers', 'gestureTip', 'Single tap to pause · double-tap to resume')}
        </span>
        <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
          {t('viewers', 'gotIt', 'Got it')}
        </span>
      </div>
    </div>
  );
};
