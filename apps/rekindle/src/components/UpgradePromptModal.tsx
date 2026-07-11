import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Heart, X, Sparkles, Check, Crown } from 'lucide-react';
import type { UpgradePromptConfig } from '@/hooks/useUpgradePrompt';

interface Props {
  prompt: UpgradePromptConfig | null;
  onClose: () => void;
  onUpgrade: (category: 'individual' | 'ministry') => void;
}

export const UpgradePromptModal: React.FC<Props> = ({ prompt, onClose, onUpgrade }) => {
  if (!prompt) return null;

  const isMinistry = prompt.category === 'ministry';

  const handleBecomPartner = () => {
    // Navigate to donate tab in profile
    window.dispatchEvent(new CustomEvent('openDonate'));
    onUpgrade(prompt.category);
    onClose();
  };

  return (
    <Dialog open={!!prompt} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${
          isMinistry
            ? 'bg-gradient-to-br from-purple-600 to-indigo-700'
            : 'bg-gradient-to-br from-purple-500 to-rose-500'
        } text-white`}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              {isMinistry
                ? <Crown className="h-5 w-5 text-white" />
                : <Heart className="h-5 w-5 text-white" />
              }
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white text-left leading-snug">
              {prompt.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/90 text-sm mt-2 leading-relaxed">{prompt.body}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* What you get */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
            <Check className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />
            <p className="text-sm font-medium text-purple-800">{prompt.benefit}</p>
          </div>

          {/* Partner benefits list */}
          {!isMinistry && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Partner benefits include:</p>
              {[
                'Full devotional library — all series',
                'Live channel creation',
                'Replay access',
                'Book summaries',
                'WhatsApp devotionals & affirmations',
              ].map(b => (
                <div key={b} className="flex items-center gap-2 text-sm text-gray-600">
                  <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  {b}
                </div>
              ))}
            </div>
          )}

          {/* Partner pricing note */}
          {!isMinistry && (
            <div className="flex items-center justify-between text-sm bg-green-50 border border-green-100 rounded-lg p-3">
              <span className="text-green-700 font-medium">Any donation amount</span>
              <span className="text-green-700 font-bold">→ Partner access</span>
            </div>
          )}

          {/* CTAs */}
          <div className="space-y-2">
            {isMinistry ? (
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('openSubscription', { detail: { category: 'ministry' } }));
                  onUpgrade('ministry');
                  onClose();
                }}
              >
                <Crown className="h-4 w-4 mr-2" />
                View Ministry Plans
              </Button>
            ) : (
              <Button
                className="w-full bg-gradient-to-r from-purple-600 to-rose-500 hover:from-purple-700 hover:to-rose-600 text-white font-semibold"
                onClick={handleBecomPartner}
              >
                <Heart className="h-4 w-4 mr-2" />
                Become a Partner
              </Button>
            )}
            <button
              onClick={onClose}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradePromptModal;
