import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Users, Loader2, Crown, Shield, X } from 'lucide-react';
import { SMALL_GROUP_ROLE_LABELS } from '../lib/smallGroupPermissions';
import { SmallGroupPage } from './SmallGroupPage';

interface MySmallGroupsProps {
  ministryId: string;
}

export const MySmallGroups: React.FC<MySmallGroupsProps> = ({ ministryId }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [ministryId, user?.id]);

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('small_group_members')
        .select('*, small_groups!inner(*)')
        .eq('ministry_id', ministryId)
        .eq('user_id', user.id)
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
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

  if (selectedGroupId) {
    return <SmallGroupPage groupId={selectedGroupId} onBack={() => { setSelectedGroupId(null); load(); }} />;
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" />{t('smallGroupsMember', 'myGroupsTitle', 'My Small Groups')}</h2>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('smallGroupsMember', 'pendingRequests', 'Pending Requests')}</h3>
          {pending.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <span>{r.small_groups?.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t('smallGroupsMember', 'requestPending', 'Request pending')}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => cancelRequest(r.id)}><X className="h-4 w-4" /></Button>
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
                <p className="text-sm text-muted-foreground line-clamp-2">{r.small_groups?.description}</p>
                <Badge variant="outline">{SMALL_GROUP_ROLE_LABELS[(r.role as 'leader' | 'assistant_leader' | 'member') || 'member']}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MySmallGroups;
