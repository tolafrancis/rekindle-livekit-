import * as React from "react"

import { Button } from "./button"
import { cn } from "./utils"

/** Shared empty and error states so every list says what happened and what to do next. */
interface StateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  /** Primary action, e.g. "Browse the library" or "Try again". */
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({ icon, title, description, actionLabel, onAction, className }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center", className)}>
      {icon && <div className="text-gray-400 [&_svg]:h-10 [&_svg]:w-10" aria-hidden="true">{icon}</div>}
      <p className="text-base font-semibold text-gray-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-500">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" className="mt-2 min-h-[44px]" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}

export function ErrorState({ icon, title, description, actionLabel = "Try again", onAction, className }: StateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-6 py-8 text-center", className)}>
      {icon && <div className="text-red-400 [&_svg]:h-8 [&_svg]:w-8" aria-hidden="true">{icon}</div>}
      <p className="text-base font-semibold text-red-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-red-700">{description}</p>}
      {onAction && (
        <Button variant="outline" className="mt-2 min-h-[44px]" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}
