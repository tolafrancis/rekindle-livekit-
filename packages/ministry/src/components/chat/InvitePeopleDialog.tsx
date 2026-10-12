import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Checkbox } from '@rekindle/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, Search } from 'lucide-react';
import { groupChatApi, chatErrorText, type InviteCandidate } from '../../lib/groupChatApi';
import { initials } from './MessageBubble';

type T = (ns: string, key: string, fallback?: string, vars?: Record<string, string | number>) => string;

/** Pick people from the ministry to invite into a small group. */
export const InvitePeopleDialog: React.FC<{
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: () => void;
  t: T;
}> = ({ groupId, open, onOpenChange, onInvited, t }) => {
  const [candidates, setCandidates] = useState<InviteCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery('');
    setLoading(true);
    groupChatApi.inviteCandidates(groupId)
      .then((rows) => setCandidates(rows || []))
      .catch((e) => toast({ title: chatErrorText(e), variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, groupId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
  }, [candidates, query]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else if (next.size < 50) next.add(id);
    return next;
  });

  const invite = async () => {
    setSaving(true);
    try {
      const count = await groupChatApi.invite(groupId, Array.from(selected));
      toast({ title: t('groupChat', 'invitesSent', '{count} invitation(s) sent', { count: count ?? selected.size }) });
      onInvited?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = (s: string | null) =>
    s === 'invited' ? t('groupChat', 'alreadyInvited', 'Invited')
      : s === 'pending' ? t('groupChat', 'requestedToJoin', 'Asked to join')
        : s === 'declined' ? t('groupChat', 'declinedBefore', 'Declined before')
          : s === 'removed' ? t('groupChat', 'removedBefore', 'Removed before')
            : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('groupChat', 'invitePeople', 'Invite people')}</DialogTitle>
          <DialogDescription>{t('groupChat', 'inviteDesc', 'People in this ministry who are not in the group yet.')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('groupChat', 'searchPeople', 'Search by name')} className="pl-9" />
        </div>
        <div className="-mx-2 min-h-[160px] flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {query ? t('groupChat', 'noMatches', 'No one matches that name.') : t('groupChat', 'noCandidates', 'Everyone in the ministry is already in this group.')}
            </p>
          ) : (
            visible.map((c) => {
              const label = statusLabel(c.group_status);
              const disabled = c.group_status === 'invited';
              return (
                <label key={c.user_id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                  <Checkbox checked={selected.has(c.user_id)} disabled={disabled} onCheckedChange={() => toggle(c.user_id)} />
                  <Avatar className="h-8 w-8">
                    {c.avatar_url && <AvatarImage src={c.avatar_url} alt="" />}
                    <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  {label && <span className="text-xs text-muted-foreground">{label}</span>}
                </label>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button onClick={invite} disabled={!selected.size || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selected.size
              ? t('groupChat', 'inviteCount', 'Invite {count}', { count: selected.size })
              : t('groupChat', 'invite', 'Invite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
