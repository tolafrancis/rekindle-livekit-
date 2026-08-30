import React from 'react';
import { Minus, Square, X, Radio, Settings, Power } from 'lucide-react';

interface TitleBarProps {
  onOpenSettings?: () => void;
  showSettingsButton?: boolean;
  statusText?: string;
  statusColor?: 'emerald' | 'amber' | 'crimson' | 'slate';
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onOpenSettings,
  showSettingsButton = false,
  statusText,
  statusColor = 'slate',
}) => {
  const handleMinimize = () => {
    window.electronAPI?.windowControls.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.windowControls.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.windowControls.close();
  };

  const statusDotColors = {
    emerald: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
    amber: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    crimson: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
    slate: 'bg-slate-500',
  };

  return (
    <header className="window-drag-region h-11 bg-surface border-b border-surface-border flex items-center justify-between px-3 select-none flex-shrink-0 z-50">
      {/* Brand & App Title */}
      <div className="flex items-center space-x-2.5">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm">
          <Radio className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-xs tracking-wider uppercase text-slate-200">
            ReKindle Translator
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-slate-400 border border-slate-700 font-mono">
            PA EDGE AGENT
          </span>
        </div>

        {statusText && (
          <div className="flex items-center space-x-1.5 ml-3 pl-3 border-l border-surface-border">
            <span className={`w-2 h-2 rounded-full ${statusDotColors[statusColor]}`} />
            <span className="text-[11px] font-medium text-slate-300 capitalize">{statusText}</span>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="window-no-drag flex items-center space-x-1">
        {showSettingsButton && onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Setup & Hardware Settings"
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-surface-elevated transition-colors mr-1"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* Electron Window buttons */}
        <button
          onClick={handleMinimize}
          title="Minimize to taskbar"
          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-surface-elevated transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          title="Toggle Maximize"
          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-surface-elevated transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          title="Minimize to System Tray"
          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-rose-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
