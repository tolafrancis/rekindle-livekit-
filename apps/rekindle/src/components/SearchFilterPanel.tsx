import React from 'react';
import { Flame } from 'lucide-react';

interface SearchFilterPanelProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const searchFilterInputClass =
  'pl-10 bg-white/10 border-white/20 text-white placeholder:text-purple-200 focus-visible:ring-white/50 focus-visible:ring-offset-purple-700';

export const searchFilterSelectTriggerClass =
  'bg-white/10 border-white/20 text-white data-[placeholder]:text-purple-200 focus:ring-white/50 focus:ring-offset-purple-700';

export const searchFilterIconClass =
  'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300';

export const filterChipClass =
  'h-9 rounded-md border border-white/25 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20 hover:text-white';

export const activeFilterChipClass =
  'h-9 rounded-md border border-white bg-white px-3 text-xs font-semibold text-purple-700 shadow-sm hover:bg-white hover:text-purple-700';

export const SearchFilterPanel: React.FC<SearchFilterPanelProps> = ({
  children,
  icon,
  className = '',
}) => (
  <div className={`rounded-lg border border-border/40 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm ${className}`}>
    <div className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="hidden md:flex h-10 w-10 shrink-0 items-center justify-center">
          {icon ?? <Flame className="h-6 w-6 text-white/60" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
          {children}
        </div>
      </div>
    </div>
  </div>
);
