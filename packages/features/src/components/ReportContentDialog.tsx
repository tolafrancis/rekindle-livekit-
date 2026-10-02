import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Textarea } from '@rekindle/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@rekindle/ui/radio-group';
import { Label } from '@rekindle/ui/label';
import { toast } from '@rekindle/ui/use-toast';
import { REPORT_REASONS, REPORT_THANKS, submitReport, type ReportReason, type ReportTarget } from '../moderation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ReportTarget;
}

export const ReportContentDialog: React.FC<Props> = ({ open, onOpenChange, target }) => {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setDetails('');
    }
  }, [open]);

  const isProfile = target.contentType === 'user';

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    const result = await submitReport({ ...target, reason, description: details });
    setSubmitting(false);
    if (!result.ok) {
      toast({ title: 'Report not sent', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Report sent', description: REPORT_THANKS });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{isProfile ? 'Report user' : 'Report content'}</DialogTitle>
          <DialogDescription>
            {isProfile && target.authorName
              ? `Why are you reporting ${target.authorName}?`
              : 'Why are you reporting this?'}{' '}
            Your report is anonymous to the person you report.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)} className="gap-2">
          {REPORT_REASONS.map((r) => (
            <Label
              key={r.value}
              htmlFor={`report-reason-${r.value}`}
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer font-normal hover:bg-muted/50"
            >
              <RadioGroupItem id={`report-reason-${r.value}`} value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>

        {reason && (
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={reason === 'other' ? 'Tell us what happened (optional)' : 'Anything else we should know? (optional)'}
            maxLength={1000}
            rows={3}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!reason || submitting}>
            {submitting ? 'Sending…' : 'Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportContentDialog;
