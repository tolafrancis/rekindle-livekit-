import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, ExternalLink, Flag, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Card, CardContent } from '@rekindle/ui/card';
import { Textarea } from '@rekindle/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@rekindle/ui/alert-dialog';
import { toast } from '@rekindle/ui/use-toast';
import {
  contentTypeLabel,
  listReports,
  moderateReport,
  reportReasonLabel,
  type ModerationAction,
  type ModerationReport,
  type ReportStatus,
} from '../moderation';

type Filter = 'pending' | 'all' | Extract<ReportStatus, 'resolved' | 'dismissed'>;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const ACTION_COPY: Record<ModerationAction, { title: string; body: string; confirm: string }> = {
  dismiss: {
    title: 'Dismiss this report?',
    body: 'The content stays up. Other open reports about the same item are closed too.',
    confirm: 'Dismiss',
  },
  remove: {
    title: 'Remove this content?',
    body: 'It will be taken down for everyone. Other open reports about it are closed too.',
    confirm: 'Remove content',
  },
  ban: {
    title: 'Ban this user?',
    body: 'They will be signed out on every device and can no longer post, message or book counselling.',
    confirm: 'Ban user',
  },
};

const ACTION_DONE: Record<ModerationAction, string> = {
  dismiss: 'Report dismissed',
  remove: 'Content removed',
  ban: 'User banned',
};

const statusVariant = (s: ReportStatus): 'default' | 'secondary' | 'destructive' | 'outline' =>
  s === 'pending' ? 'destructive' : s === 'resolved' ? 'default' : 'secondary';

/** Admin → Reports: the flagged_content queue, pending first. */
export const ModerationReportsPanel: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('pending');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ report: ModerationReport; action: ModerationAction } | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await listReports(filter === 'all' ? undefined : filter));
    } catch (err) {
      toast({
        title: 'Could not load reports',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => reports.filter((r) => r.status === 'pending').length, [reports]);

  const confirmAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    try {
      await moderateReport(pending.report.id, pending.action, notes);
      toast({ title: ACTION_DONE[pending.action] });
      setPending(null);
      setNotes('');
      await load();
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Flag className="h-5 w-5" /> Reports
          </h2>
          <p className="text-sm text-muted-foreground">
            Content and users reported by the community. Aim to review within 24 hours.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {f.value === 'pending' && filter === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8" />
            <p>{filter === 'pending' ? 'No pending reports. All clear.' : 'No reports here.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const open = r.status === 'pending' || r.status === 'under_review';
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(r.status)}>{r.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline">{contentTypeLabel(r.content_type)}</Badge>
                    <Badge variant="secondary">{reportReasonLabel(r.reason)}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(r.flagged_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 text-sm">
                    {r.content_preview || <span className="italic text-muted-foreground">No preview available</span>}
                  </div>

                  {r.description && (
                    <p className="text-sm">
                      <span className="font-medium">Reporter's note: </span>
                      {r.description}
                    </p>
                  )}

                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>
                      Reported by: <span className="text-foreground">{r.reporter_name || 'Unknown'}</span>
                    </span>
                    <span>
                      Author: <span className="text-foreground">{r.reported_user_name || 'Unknown'}</span>
                      {r.reported_user_is_banned && (
                        <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-[10px]">banned</Badge>
                      )}
                    </span>
                    {r.content_url && (
                      <a
                        href={r.content_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Open where it was reported <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {!open && r.action_taken && (
                      <span>
                        Outcome: <span className="text-foreground">{r.action_taken.replace(/_/g, ' ')}</span>
                        {r.reviewed_at ? ` · ${new Date(r.reviewed_at).toLocaleString()}` : ''}
                      </span>
                    )}
                    {!open && r.review_notes && <span className="sm:col-span-2">Notes: {r.review_notes}</span>}
                  </div>

                  {open && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setPending({ report: r, action: 'dismiss' })}>
                        <XCircle className="mr-2 h-4 w-4" /> Dismiss
                      </Button>
                      {r.content_type !== 'user' && (
                        <Button size="sm" variant="secondary" onClick={() => setPending({ report: r, action: 'remove' })}>
                          <Trash2 className="mr-2 h-4 w-4" /> Remove content
                        </Button>
                      )}
                      {r.reported_user_id && !r.reported_user_is_banned && (
                        <Button size="sm" variant="destructive" onClick={() => setPending({ report: r, action: 'ban' })}>
                          <Ban className="mr-2 h-4 w-4" /> Ban user
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setPending(null);
            setNotes('');
          }
        }}
      >
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{ACTION_COPY[pending.action].title}</AlertDialogTitle>
                <AlertDialogDescription>{ACTION_COPY[pending.action].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal note (optional)"
                rows={2}
                maxLength={1000}
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmAction}
                  disabled={busy}
                  className={pending.action === 'dismiss' ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
                >
                  {busy ? 'Working…' : ACTION_COPY[pending.action].confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ModerationReportsPanel;
