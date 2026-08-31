import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Textarea } from '@rekindle/ui/textarea';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  ArrowLeft, Users, MapPin, Clock, Video, Loader2, Pin, Crown, Shield, Send,
} from 'lucide-react';

interface SmallGroupPageProps {
  groupId: string;
  onBack: () => void;
}

export const SmallGroupPage: React.FC<SmallGroupPageProps> = ({ groupId, onBack }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [group, setGroup] = useState<any>(null);
  const [myMembership, setMyMembership] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [newPrayer, setNewPrayer] = useState('');
  const [postingPrayer, setPostingPrayer] = useState(false);

  useEffect(() => {
    load();
  }, [groupId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: g, error } = await supabase.from('small_groups').select('*').eq('id', groupId).maybeSingle();
      if (error) throw error;
      setGroup(g);

      if (user?.id) {
        const { data: mine } = await supabase
          .from('small_group_members').select('*').eq('group_id', groupId).eq('user_id', user.id).maybeSingle();
        setMyMembership(mine);

        const isMember = mine?.status === 'active';
        if (isMember) {
          const [membersRes, meetingsRes, postsRes] = await Promise.all([
            supabase.from('small_group_members').select('*').eq('group_id', groupId).eq('status', 'active'),
            supabase.from('small_group_meetings').select('*').eq('group_id', groupId).order('meeting_date', { ascending: true }),
            supabase.from('small_group_posts').select('*').eq('group_id', groupId).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
          ]);
          setMembers(membersRes.data || []);
          setMeetings((meetingsRes.data || []).filter((m: any) => m.status !== 'completed'));
          setPosts(postsRes.data || []);
        }
      }
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user?.id || !group) return;
    setJoining(true);
    try {
      const isPublic = group.privacy === 'public';
      const { error } = await supabase.from('small_group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'member',
        status: isPublic ? 'active' : 'pending',
        ...(isPublic ? { approved_at: new Date().toISOString(), joined_at: new Date().toISOString() } : {}),
      });
      if (error) throw error;
      toast({ title: isPublic ? t('smallGroupsMember', 'joined', 'Joined!') : t('smallGroupsMember', 'requestSent', 'Request sent') });
      await load();
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const postPrayerRequest = async () => {
    if (!newPrayer.trim() || !user?.id) return;
    setPostingPrayer(true);
    try {
      const { error } = await supabase.from('small_group_posts').insert({
        group_id: groupId, author_id: user.id, post_type: 'prayer_request', content: newPrayer.trim(),
      });
      if (error) throw error;
      setNewPrayer('');
      await load();
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setPostingPrayer(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />{t('smallGroupsMember', 'back', 'Back')}</Button>
        <p className="text-muted-foreground">{t('smallGroupsMember', 'groupNotFound', 'This small group is not available.')}</p>
      </div>
    );
  }

  const isMember = myMembership?.status === 'active';

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />{t('smallGroupsMember', 'back', 'Back')}</Button>

      {group.cover_image_url && <img src={group.cover_image_url} alt="" className="w-full h-48 object-cover rounded-lg" />}

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.category && <Badge variant="outline">{group.category}</Badge>}
        </div>
        {group.description && <p className="text-muted-foreground mt-2">{group.description}</p>}
        <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
          {group.meeting_day && <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{group.meeting_day}{group.meeting_time ? ` · ${group.meeting_time}` : ''}{group.meeting_frequency ? ` (${group.meeting_frequency})` : ''}</span>}
          {group.location_type === 'physical' && group.location_address && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{group.location_address}</span>}
          {group.location_type !== 'physical' && <span className="flex items-center gap-1"><Video className="h-4 w-4" />{t('smallGroupsMember', 'locationOnline', 'Online')}</span>}
          <span className="flex items-center gap-1"><Users className="h-4 w-4" />{group.member_count}{group.max_members ? `/${group.max_members}` : ''} {t('smallGroupsMember', 'members', 'members')}</span>
        </div>
      </div>

      {!isMember && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              {myMembership?.status === 'pending' ? (
                <Badge variant="secondary">{t('smallGroupsMember', 'requestPending', 'Request pending')}</Badge>
              ) : (
                <p className="text-sm text-muted-foreground">{t('smallGroupsMember', 'joinToSeeMore', 'Join this group to see meetings, posts, and members.')}</p>
              )}
            </div>
            {!myMembership && (
              <Button onClick={handleJoin} disabled={joining}>
                {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {group.privacy === 'public' ? t('smallGroupsMember', 'join', 'Join') : t('smallGroupsMember', 'requestToJoin', 'Request to Join')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isMember && (
        <>
          <div>
            <h3 className="font-semibold mb-2">{t('smallGroupsMember', 'upcomingMeetings', 'Upcoming Meetings')}</h3>
            {meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('smallGroupsMember', 'noUpcomingMeetings', 'No upcoming meetings scheduled.')}</p>
            ) : (
              <div className="space-y-2">
                {meetings.map((m) => (
                  <Card key={m.id}><CardContent className="pt-4">
                    <div className="font-medium">{m.title}</div>
                    <div className="text-xs text-muted-foreground">{m.meeting_date}{m.start_time ? ` · ${m.start_time}` : ''}</div>
                    {m.description && <p className="text-sm text-muted-foreground mt-1">{m.description}</p>}
                  </CardContent></Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t('smallGroupsMember', 'shareAPrayerRequest', 'Share a Prayer Request')}</h3>
            <div className="flex gap-2">
              <Textarea rows={2} value={newPrayer} onChange={(e) => setNewPrayer(e.target.value)} placeholder={t('smallGroupsMember', 'prayerRequestPlaceholder', "What's on your heart?")} />
              <Button onClick={postPrayerRequest} disabled={postingPrayer || !newPrayer.trim()}>
                {postingPrayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t('smallGroupsMember', 'groupFeed', 'Group Feed')}</h3>
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('smallGroupsMember', 'noPostsYet', 'Nothing shared yet.')}</p>
            ) : (
              <div className="space-y-2">
                {posts.map((p) => (
                  <Card key={p.id}><CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      {p.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                      <Badge variant="outline">{p.post_type.replace('_', ' ')}</Badge>
                      {p.title && <span className="font-medium">{p.title}</span>}
                    </div>
                    {p.content && <p className="text-sm text-muted-foreground">{p.content}</p>}
                    {p.resource_url && <a href={p.resource_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">{p.resource_url}</a>}
                  </CardContent></Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t('smallGroupsMember', 'membersHeading', 'Members')} ({members.length})</h3>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <Badge key={m.id} variant="secondary" className="flex items-center gap-1">
                  {m.role === 'leader' && <Crown className="h-3 w-3 text-amber-500" />}
                  {m.role === 'assistant_leader' && <Shield className="h-3 w-3 text-blue-500" />}
                  {m.user_id === user?.id ? t('smallGroupsMember', 'you', 'You') : m.user_id}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SmallGroupPage;
