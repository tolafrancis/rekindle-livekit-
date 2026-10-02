import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, UserX } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { toast } from '@rekindle/ui/use-toast';
import { useModeration } from '../ModerationContext';
import { fetchBlockedUsers, type BlockedUser } from '../moderation';

/** Settings → Privacy → Blocked users. */
export const BlockedUsersList: React.FC<{ className?: string }> = ({ className }) => {
  const { unblock, blockedIds } = useModeration();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchBlockedUsers());
    } catch (err) {
      toast({
        title: 'Could not load blocked users',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when someone is blocked elsewhere in the app while this is open.
  useEffect(() => {
    void load();
  }, [load, blockedIds.size]);

  const handleUnblock = async (u: BlockedUser) => {
    setBusyId(u.blockedId);
    try {
      await unblock(u.blockedId);
      setUsers((prev) => prev.filter((x) => x.blockedId !== u.blockedId));
      toast({ title: `Unblocked ${u.name || 'user'}` });
    } catch (err) {
      toast({
        title: 'Could not unblock',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className={`flex justify-center py-8 ${className ?? ''}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground ${className ?? ''}`}>
        <UserX className="h-8 w-8 opacity-50" />
        <p>You haven't blocked anyone.</p>
        <p className="text-xs">Block someone from the ⋯ menu on their posts, messages or profile.</p>
      </div>
    );
  }

  return (
    <ul className={`divide-y ${className ?? ''}`}>
      {users.map((u) => (
        <li key={u.blockedId} className="flex items-center gap-3 py-3">
          <Avatar className="h-9 w-9">
            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
            <AvatarFallback>{(u.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{u.name || 'Unknown user'}</p>
            <p className="text-xs text-muted-foreground">Blocked {new Date(u.createdAt).toLocaleDateString()}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleUnblock(u)} disabled={busyId === u.blockedId}>
            {busyId === u.blockedId ? 'Unblocking…' : 'Unblock'}
          </Button>
        </li>
      ))}
    </ul>
  );
};

export default BlockedUsersList;
