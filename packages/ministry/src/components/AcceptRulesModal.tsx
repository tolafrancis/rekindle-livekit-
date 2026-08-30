import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, ScrollText } from 'lucide-react';

interface RuleItem {
  id: string;
  title: string;
  body: string;
}

interface AcceptRulesModalProps {
  ministryId: string;
  ministryName: string;
  items: RuleItem[];
  onAccepted: () => void;
}

/**
 * Blocking "Accept Rules" gate — mounted by MinistrySpace whenever the
 * ministry requires acceptance and the current member hasn't accepted the
 * currently published version (see MinistrySpace's rules-gating effect).
 *
 * Deliberately non-dismissible: no X, no Escape, no outside-click, no
 * browser-Back close. The shared Dialog wrapper (@rekindle/ui/dialog)
 * funnels ALL of those dismiss paths through one onOpenChange(false) call —
 * making that a no-op blocks every one of them at once. DialogContent's
 * baked-in close button is hidden separately since onOpenChange alone
 * would leave a visible-but-inert X, which reads as a bug rather than an
 * intentional gate.
 */
export const AcceptRulesModal: React.FC<AcceptRulesModalProps> = ({ ministryId, ministryName, items, onAccepted }) => {
  const [accepting, setAccepting] = useState(false);

  const accept = async () => {
    setAccepting(true);
    try {
      const { error } = await supabase.rpc('accept_ministry_rules', { p_ministry_id: ministryId });
      if (error) throw error;
      onAccepted();
    } catch (err: any) {
      console.error('[AcceptRulesModal] accept failed:', err);
      toast({ title: 'Could not record your acceptance', description: err.message, variant: 'destructive' });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="[&>button]:hidden"
        onEscapeKeyDown={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-indigo-600" />
            {ministryName}'s Rules & Guidelines
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Please review and accept these rules to continue.
        </p>
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div key={item.id}>
              <p className="font-medium text-sm">{idx + 1}. {item.title}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-0.5">{item.body}</p>
            </div>
          ))}
        </div>
        <Button onClick={accept} disabled={accepting} className="w-full">
          {accepting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          I Agree
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AcceptRulesModal;
