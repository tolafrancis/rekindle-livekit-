import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog"
import { buttonVariants } from "./button"
import { cn } from "./utils"

/**
 * Shared confirmation dialog, a styled replacement for window.confirm().
 *
 *   if (!(await confirmAction({ title: 'Delete this verse?', destructive: true }))) return;
 *
 * Mount <ConfirmDialogHost /> once near the app root. Without a host (e.g. a
 * page rendered outside the app shell) it falls back to window.confirm so
 * existing behaviour is never lost.
 */
export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for deletes and other irreversible actions. */
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let enqueue: ((pending: Pending) => void) | null = null

export function confirmAction(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === "string" ? { title: options } : options
  if (!enqueue) {
    const text = typeof opts.description === "string" ? `${opts.title}\n\n${opts.description}` : opts.title
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(text) : false)
  }
  // Open on the next tick so a menu or popover that triggered it can finish
  // closing first (Radix otherwise leaves pointer-events locked on <body>).
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      if (enqueue) enqueue({ ...opts, resolve })
      else resolve(window.confirm(opts.title))
    }, 0)
  })
}

export function ConfirmDialogHost() {
  const [queue, setQueue] = React.useState<Pending[]>([])
  // The Action/Cancel click and the dialog's close both report; settle once.
  const settledRef = React.useRef<Pending | null>(null)

  React.useEffect(() => {
    enqueue = (pending) => setQueue((q) => [...q, pending])
    return () => {
      enqueue = null
    }
  }, [])

  const current = queue[0]
  const settle = (ok: boolean) => {
    if (!current || settledRef.current === current) return
    settledRef.current = current
    current.resolve(ok)
    setQueue((q) => q.slice(1))
  }

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => { if (!open) settle(false) }}>
      {current && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current.title}</AlertDialogTitle>
            {current.description && (
              <AlertDialogDescription>{current.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {current.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(current.destructive && buttonVariants({ variant: "destructive" }))}
            >
              {current.confirmLabel ?? (current.destructive ? "Delete" : "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
