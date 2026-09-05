import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "./utils"
import { registerModal, unregisterModal } from "./modal-stack"

/**
 * Dialog Root, wrapped so the browser Back button closes it (via the modal stack)
 * instead of navigating away. Works for controlled dialogs (`open`/`onOpenChange`)
 * and trigger-driven ones (state tracked through `onOpenChange`).
 */
const Dialog: React.FC<React.ComponentProps<typeof DialogPrimitive.Root>> = ({
  open,
  onOpenChange,
  ...props
}) => {
  const idRef = React.useRef<string | null>(null)
  // Keep the latest onOpenChange so the registered close() is never stale.
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const register = React.useCallback(() => {
    if (!idRef.current) idRef.current = registerModal(() => onOpenChangeRef.current?.(false))
  }, [])
  const unregister = React.useCallback(() => {
    if (idRef.current) {
      unregisterModal(idRef.current)
      idRef.current = null
    }
  }, [])

  // Controlled dialogs: follow the `open` prop.
  React.useEffect(() => {
    if (open === undefined) return
    if (open) register()
    else unregister()
  }, [open, register, unregister])

  // Always clean up if the dialog unmounts while open.
  React.useEffect(() => unregister, [unregister])

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (open === undefined) {
        // Uncontrolled (trigger-driven): track via the change events.
        if (next) register()
        else unregister()
      }
      onOpenChangeRef.current?.(next)
    },
    [open, register, unregister],
  )

  return <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} {...props} />
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-[80] grid w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-border/40 bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {/* data-dialog-close-x: a stable hook for a non-dismissible dialog to
          hide JUST this built-in X (e.g. `[&_[data-dialog-close-x]]:hidden`
          on DialogContent) without also catching an action button the
          consumer places as a direct child of DialogContent instead of
          inside DialogFooter — a blanket `[&>button]:hidden` selector hides
          both indiscriminately, which is exactly what silently broke
          AcceptRulesModal's own "I Agree" button. */}
      <DialogPrimitive.Close data-dialog-close-x className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-foreground",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
