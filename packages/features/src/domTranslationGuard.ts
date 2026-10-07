// Browser page translation (Safari's Translate, Chrome/Google Translate) and
// some extensions swap React's text nodes for their own <font> wrappers.
// When React later removes or moves one of those nodes it is no longer
// where React left it, so removeChild/insertBefore throw NotFoundError
// ("The object can not be found here." in Safari) and the whole screen
// unmounts. This makes those two calls tolerate a node that has already
// been moved, which is the workaround the React team recommends
// (facebook/react#11538). Calls on nodes that are where React expects
// behave exactly as before.
/** Fired on window whenever the guard had to step in (see BrowserTranslationTip). */
export const DOM_CONFLICT_EVENT = 'rk:dom-translation-conflict';

const reportConflict = () => {
  try { window.dispatchEvent(new Event(DOM_CONFLICT_EVENT)); } catch { /* non-fatal */ }
};

export function installDomTranslationGuard() {
  if (typeof Node !== 'function' || !Node.prototype) return;
  const proto = Node.prototype as Node & { __rkTranslationGuard?: boolean };
  if (proto.__rkTranslationGuard) return;
  proto.__rkTranslationGuard = true;

  const originalRemoveChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn('[dom-guard] removeChild skipped: node was moved by something outside React (likely page translation)');
      reportConflict();
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('[dom-guard] insertBefore fell back to appendChild: reference node was moved by something outside React (likely page translation)');
      reportConflict();
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
