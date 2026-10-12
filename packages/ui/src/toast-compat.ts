/**
 * Sonner-style `toast` API backed by the shadcn use-toast system.
 *
 * The apps used to mount two toasters (shadcn `Toaster` + `Sonner`). This shim
 * lets existing `toast('msg')` / `toast.success('msg')` / `toast.error('msg')`
 * call sites keep working while everything renders through the single shadcn
 * `<Toaster />`.
 */
import type * as React from "react";
import { toast as baseToast } from "./use-toast";

export interface CompatToastOptions {
  description?: React.ReactNode;
  duration?: number;
}

type Message = React.ReactNode;
type Variant = "default" | "destructive";

function show(message: Message, opts: CompatToastOptions | undefined, variant: Variant) {
  const { description, duration } = opts ?? {};
  return baseToast({
    title: message,
    description,
    variant,
    ...(duration !== undefined ? { duration } : {}),
  });
}

type CompatToast = {
  (message: Message, opts?: CompatToastOptions): ReturnType<typeof baseToast>;
  success: (message: Message, opts?: CompatToastOptions) => ReturnType<typeof baseToast>;
  error: (message: Message, opts?: CompatToastOptions) => ReturnType<typeof baseToast>;
  info: (message: Message, opts?: CompatToastOptions) => ReturnType<typeof baseToast>;
  warning: (message: Message, opts?: CompatToastOptions) => ReturnType<typeof baseToast>;
  message: (message: Message, opts?: CompatToastOptions) => ReturnType<typeof baseToast>;
};

export const toast: CompatToast = Object.assign(
  (message: Message, opts?: CompatToastOptions) => show(message, opts, "default"),
  {
    success: (message: Message, opts?: CompatToastOptions) => show(message, opts, "default"),
    error: (message: Message, opts?: CompatToastOptions) => show(message, opts, "destructive"),
    info: (message: Message, opts?: CompatToastOptions) => show(message, opts, "default"),
    warning: (message: Message, opts?: CompatToastOptions) => show(message, opts, "default"),
    message: (message: Message, opts?: CompatToastOptions) => show(message, opts, "default"),
  },
);

export default toast;
