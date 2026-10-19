import React from 'react';
import { CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Switch } from '@rekindle/ui/switch';
import { BookOpen, X, Loader2, EyeOff, Settings } from 'lucide-react';
import type { ScriptureControlState } from './FloatingTranslationButton';

interface LiveScriptureSidebarProps extends ScriptureControlState {
  onClose: () => void;
}

/** Live Scripture's control surface, promoted from a cramped section of the
 *  Live Translation popover into its own side panel (2026-09-29) — same
 *  visual chrome as RoomChatSidebar.tsx / HostControlPanel.tsx so it reads
 *  as one consistent set of panels. Purely presentational: every value here
 *  is lifted from FloatingTranslationButton.tsx's ScriptureControlState,
 *  which keeps owning the actual session/auto-detect logic. */
export const LiveScriptureSidebar: React.FC<LiveScriptureSidebarProps> = ({
  on,
  starting,
  toggle,
  manual,
  setManual,
  manualError,
  onSubmit,
  onScreenVerse,
  hiding,
  onHide,
  canControl,
  autoOff,
  onOpenSettings,
  onClose,
}) => {
  return (
    <div className="z-40 flex h-[40vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-gray-800 bg-gray-900 sm:h-full sm:w-80 sm:max-w-[24rem] sm:border-t-0 sm:border-l">
      <CardHeader className="border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            <CardTitle className="text-white">Live Scripture</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* The only off switch: the toolbar's Scripture button just opens
                this panel (turning Scripture on the first time), and closing
                the panel deliberately leaves Scripture running. */}
            <Switch
              checked={on}
              disabled={starting}
              onCheckedChange={toggle}
              aria-label={on ? 'Turn off Live Scripture' : 'Turn on Live Scripture'}
            />
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-gray-400 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        {starting ? (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Turning on Live Scripture…
          </p>
        ) : !on ? (
          <p className="text-sm text-gray-400">
            Live Scripture is off. Use the switch above to turn it on and put Bible references on screen
            automatically as they're spoken, or type one in here once it's on.
          </p>
        ) : (
          <>
            {canControl && autoOff && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-semibold text-amber-200">Verses won't show on their own yet</p>
                <p className="mt-1 leading-snug">
                  To put verses on screen as they're spoken, switch on both
                  {' '}<span className="font-medium text-white">Detect references automatically</span> and
                  {' '}<span className="font-medium text-white">Show confirmed verses automatically</span> in
                  your ministry's Live Translation settings. You can choose a Bible version there too.
                </p>
                <Button size="sm" variant="outline" className="mt-2.5 h-8 w-full" onClick={onOpenSettings}>
                  <Settings className="h-3.5 w-3.5 mr-1.5" /> Open settings
                </Button>
                <p className="mt-1.5 text-xs text-amber-200/80">The meeting keeps running in the mini player.</p>
              </div>
            )}
            {onScreenVerse ? (
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                  {onScreenVerse.reference} · {onScreenVerse.version}
                </p>
                <p className="mt-1.5 text-sm leading-snug text-white">{onScreenVerse.text}</p>
                {canControl && (
                  <Button size="sm" variant="outline" className="mt-3 h-8 w-full" onClick={onHide} disabled={hiding}>
                    {hiding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
                    Hide
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {canControl && !autoOff ? "Listening for Bible references in the captions…" : 'Nothing on screen right now.'}
              </p>
            )}

            {canControl && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                    placeholder='Type a reference, e.g. "John 3:16"'
                    className="h-9 flex-1 border-gray-700 bg-gray-800 text-sm text-white placeholder:text-gray-500"
                  />
                  <Button size="sm" className="h-9" onClick={onSubmit} disabled={!manual.trim()}>Show</Button>
                </div>
                {manualError && <p className="text-xs text-destructive">{manualError}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveScriptureSidebar;
