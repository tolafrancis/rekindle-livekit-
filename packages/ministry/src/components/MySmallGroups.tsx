import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Users, Loader2, Crown, Shield, X, Settings, MessageSquare } from 'lucide-react';
import { SMALL_GROUP_ROLE_LABELS } from '../lib/smallGroupPermissions';
import { groupChatApi, chatErrorText, lastMessagePreview } from '../lib/groupChatApi';
import { useGroupChatInbox } from '../lib/useGroupChatInbox';
import { SmallGroupPage } from './SmallGroupPage';
import { SmallGroupDetailManager } from './SmallGroupDetailManager';

interface MySmallGroupsProps {
  ministryId: string;
  /** Open this group's page straight away (e.g. from its chat). */
  autoOpenGroupId?: string | null;
  onAutoOpened?: () => void;
}

export const MySmallGroups: React.FC<MySmallGroupsProps> = ({ ministryId, autoOpenGroupId, onAutoOpened }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  // Last message and unread count per group, kept live.
  const inbox = useGroupChatInbox(user?.id, { ministryId });
  const chatById = new Map(inbox.chats.map((c) => [c.group_id, c]));
  const [responding, setResponding] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Group leaders / assistant leaders manage their own groups from here; the
  // Manage Groups tab is only shown to ministry admins.
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [ministryId, user?.id]);

  useEffect(() => {
    if (!autoOpenGroupId) return;
    setSelectedGroupId(autoOpenGroupId);
    onAutoOpened?.();
  }, [autoOpenGroupId]);

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('small_group_members')
        .select('*, small_groups!inner(*)')
        .eq('ministry_id', ministryId)
        .eq('user_id', user.id)
        .in('status', ['active', 'pending', 'invited'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const respondInvite = async (groupId: string, accept: boolean) => {
    setResponding(groupId);
    try {
      await groupChatApi.respondInvite(groupId, accept);
      await load();
      inbox.reload();
      if (accept) setSelectedGroupId(groupId);
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    } finally {
      setResponding(null);
    }
  };

  const cancelRequest = async (rowId: string) => {
    try {
      const { error } = await supabase.from('small_group_members').delete().eq('id', rowId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  if (managingGroupId) {
    return (
      <SmallGroupDetailManager
        ministryId={ministryId}
        groupId={managingGroupId}
        isMinistryAdmin={false}
        onBack={() => { setManagingGroupId(null); load(); }}
      />
    );
  }

  if (selectedGroupId) {
    return <SmallGroupPage groupId={selectedGroupId} onBack={() => { setSelectedGroupId(null); load(); inbox.reload(); }} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const active = rows.filter((r) => r.status === 'active');
  const pending = rows.filter((r) => r.status === 'pending');
  const invited = rows.filter((r) => r.status === 'invited');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" />{t('smallGroupsMember', 'myGroupsTitle', 'My Small Groups')}</h2>
      </div>

      {invited.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('groupChat', 'invitations', 'Invitations')}</h3>
          {invited.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.small_groups?.name}</p>
                  {chatById.get(r.group_id)?.invited_by_name && (
                    <p className="text-xs text-muted-foreground">
                      {t('groupChat', 'invitedBy', '{name} invited you', { name: chatById.get(r.group_id)!.invited_by_name! })}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={responding === r.group_id} onClick={() => respondInvite(r.group_id, true)}>
                    {responding === r.group_id && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {t('groupChat', 'accept', 'Join group')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={responding === r.group_id} onClick={() => respondInvite(r.group_id, false)}>
                    {t('groupChat', 'decline', 'Decline')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('smallGroupsMember', 'pendingRequests', 'Pending Requests')}</h3>
          {pending.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <span>{r.small_groups?.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t('smallGroupsMember', 'requestPending', 'Request pending')}</Badge>
                  <Button aria-label={t('smallGroupsMember', 'cancelRequest', 'Cancel request')} size="sm" variant="ghost" onClick={() => cancelRequest(r.id)}><X className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {active.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          {t('smallGroupsMember', 'noGroupsJoined', "You haven't joined any small groups yet — check out Discover.")}
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {active.map((r) => (
            <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedGroupId(r.group_id)}>
              <CardContent className="pt-4 space-y-1">
                <div className="flex items-center gap-2">
                  {r.role === 'leader' && <Crown className="h-4 w-4 text-amber-500" />}
                  {r.role === 'assistant_leader' && <Shield className="h-4 w-4 text-blue-500" />}
                  <h3 className="font-semibold">{r.small_groups?.name}</h3>
                </div>
                {(() => {
                  const chat = chatById.get(r.group_id);
                  const preview = chat ? lastMessagePreview(chat, user?.id) : '';
                  if (!preview) return <p className="text-sm text-muted-foreground line-clamp-2">{r.small_groups?.description}</p>;
                  return (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{preview}</span>
                      {chat!.unread_count > 0 && chat!.notify_level !== 'muted' && (
                        <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {chat!.unread_count >= 100 ? '99+' : chat!.unread_count}
                        </span>
                      )}
                    </p>
                  );
                })()}
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{SMALL_GROUP_ROLE_LABELS[(r.role as 'leader' | 'assistant_leader' | 'member') || 'member']}</Badge>
                  {(r.role === 'leader' || r.role === 'assistant_leader') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setManagingGroupId(r.group_id); }}
                    >
                      <Settings className="h-4 w-4 mr-1" />{t('smallGroupsMember', 'manageGroup', 'Manage')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MySmallGroups;
