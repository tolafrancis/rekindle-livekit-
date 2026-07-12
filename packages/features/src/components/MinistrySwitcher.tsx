import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { useCurrentMinistry } from '../CurrentMinistryContext';
import { Button } from '@rekindle/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import { cn } from '@rekindle/ui/utils';

// Phase 3 — ministry switcher. Lists the member's ministries and switches the
// current-ministry context. Single-membership renders as a static label (fast
// path — nothing to switch).
export function MinistrySwitcher({ className }: { className?: string }) {
  const { ministries, currentMinistry, setCurrentMinistry, loading } = useCurrentMinistry();

  if (loading) {
    return (
      <div className={cn('h-9 w-48 animate-pulse rounded-md bg-muted', className)} aria-hidden />
    );
  }

  if (ministries.length === 0) return null;

  // Single-ministry fast path — no switcher, just the name.
  if (ministries.length === 1) {
    return (
      <div className={cn('flex items-center gap-2 px-2 text-sm font-medium', className)}>
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{currentMinistry?.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('justify-between gap-2 min-w-48', className)}>
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{currentMinistry?.name ?? 'Select ministry'}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your ministries</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ministries.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => setCurrentMinistry(m.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{m.name}</span>
            {m.id === currentMinistry?.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
