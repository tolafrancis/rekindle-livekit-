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
 *
 * Why history mutations are serialized through `queue`: `history.back()` is
 * asynchronous — the actual navigation and its `popstate` land on a later task —
 * while `history.pushState()` is synchronous. A multi-step flow that closes one
 * dialog and opens the next in the same React commit (e.g. music selector →
 * scripture preview) used to call `back()` then immediately `pushState()` before
 * the browser had processed the pending `back()`. That let the new entry land on
 * top of the wrong index, so a later close popped past this component's own
 * tab/route entry and dropped the user somewhere else entirely. Queuing every
 * push/back behind the previous one's real `popstate` keeps the browser's actual
 * history stack in lockstep with our logical `stack`, no matter how many dialogs
 * open/close within a single tick.
 */

interface ModalEntry {
  id: string;
  close: () => void;
}

const stack: ModalEntry[] = [];
let listening = false;
let ignoreNextPop = false;
let counter = 0;

// Chain of pending real history mutations (pushState/back), run strictly in order.
let queue: Promise<void> = Promise.resolve();

// Safety cap so a missed/suppressed popstate (shouldn't happen, but browsers are
// browsers) can't wedge the queue forever and silently block all future modals.
const POPSTATE_WAIT_MS = 1000;

function waitForNextPopstate(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', handler);
      resolve();
    };
    const handler = () => finish();
    window.addEventListener('popstate', handler);
    setTimeout(finish, POPSTATE_WAIT_MS);
  });
}

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
  queue = queue.then(() => {
    const cur = window.history.state;
    const base = cur && typeof cur === 'object' ? { ...(cur as Record<string, unknown>) } : {};
    window.history.pushState({ ...base, [`modal:${id}`]: true }, '', window.location.href);
  });
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
    queue = queue.then(() => {
      ignoreNextPop = true;
      const popped = waitForNextPopstate();
      window.history.back();
      return popped;
    });
  }
}
