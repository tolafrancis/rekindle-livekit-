/**
 * Modal history stack — makes the browser Back button close the top open dialog
 * instead of navigating away.
 *
 * Each open modal pushes ONE history entry (merged into history.state, like
 * useViewHistory, so it doesn't clobber view keys). Pressing Back pops that entry;
 * our popstate handler closes the top modal. Closing a modal from the app (X /
 * Escape / outside click) removes its entry with a self-inflicted history.back()
 * that the handler ignores.
 *
 * Protocol that avoids the classic double-back bug:
 * - Back → popstate → handler pops the stack entry and calls its close(); the
 *   subsequent unregister (from the modal's own onOpenChange(false)) then finds the
 *   entry already gone and does nothing.
 * - App close → unregister → history.back() flagged as ignored, so the handler
 *   skips closing (the modal is already closing).
 */

interface ModalEntry {
  id: string;
  close: () => void;
}

const stack: ModalEntry[] = [];
let listening = false;
let ignoreNextPop = false;
let counter = 0;

function onPop() {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  if (stack.length === 0) return;
  // Remove from the stack FIRST so the close()-triggered unregister is a no-op.
  const top = stack.pop();
  top?.close();
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', onPop);
}

/** Call when a modal opens. Returns an id to pass back to `unregisterModal`. */
export function registerModal(close: () => void): string {
  if (typeof window === 'undefined') return '';
  ensureListener();
  const id = `modal-${++counter}`;
  stack.push({ id, close });
  const cur = window.history.state;
  const base = cur && typeof cur === 'object' ? { ...(cur as Record<string, unknown>) } : {};
  window.history.pushState({ ...base, [`modal:${id}`]: true }, '', window.location.href);
  return id;
}

/** Call when a modal closes (from the app, not from Back). */
export function unregisterModal(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  const idx = stack.findIndex((m) => m.id === id);
  if (idx === -1) return; // already removed by a Back-driven pop — nothing to undo
  const wasTop = idx === stack.length - 1;
  stack.splice(idx, 1);
  // Only the top entry is safely removable via back(); a modal closed out of order
  // leaves its (harmless) entry to be consumed on a later Back.
  if (wasTop) {
    ignoreNextPop = true;
    window.history.back();
  }
}
