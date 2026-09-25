import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Textarea } from '@rekindle/ui/textarea';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { buildJoinUrl } from '@rekindle/features/qrCode';
import {
  ArrowLeft, Users, MapPin, Clock, Video, Loader2, Pin, Crown, Shield, Send, Share2,
} from 'lucide-react';

interface SmallGroupPageProps {
  groupId: string;
  onBack: () => void;
}

const POSTS_PAGE = 20;

export const SmallGroupPage: React.FC<SmallGroupPageProps> = ({ groupId, onBack }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [group, setGroup] = useState<any>(null);
  const [ministryInfo, setMinistryInfo] = useState<{ name: string; slug: string; invite_code: string | null; qr_code_version: number | null } | null>(null);
  const [whatsappNotifyAvailable, setWhatsappNotifyAvailable] = useState(false);
  const [savingNotifyPref, setSavingNotifyPref] = useState(false);
  const [myMembership, setMyMembership] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  // The group feed is fetched POSTS_PAGE rows at a time; reloads (e.g. after
  // posting) re-fetch however many are already on screen.
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const postsCountRef = useRef(0);
  postsCountRef.current = posts.length;
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

      if (g?.ministry_id) {
        // Needed to build the "Share to WhatsApp" join link — the same
        // slug/code/version MinistryRegistrationSettings uses for the
        // ministry-wide QR/invite link (buildJoinUrl, packages/features/src/qrCode.ts).
        supabase
          .from('ministry_groups')
          .select('name, slug, invite_code, qr_code_version')
          .eq('id', g.ministry_id)
          .maybeSingle()
          .then(({ data: m }) => { if (m) setMinistryInfo(m as any); });

        // Only offer the opt-in toggle when the ministry has actually set up
        // WhatsApp notifications (connected WABA + a chosen template) — see
        // migrations/0336_small_group_whatsapp_notify.sql. Toggling it on
        // with nothing configured would silently do nothing.
        supabase
          .from('ministry_whatsapp_configs')
          .select('connection_status, notify_template_name')
          .eq('ministry_id', g.ministry_id)
          .maybeSingle()
          .then(({ data: cfg }) => {
            setWhatsappNotifyAvailable(!!cfg && cfg.connection_status === 'connected' && !!cfg.notify_template_name);
          });
      }

      if (user?.id) {
        const { data: mine } = await supabase
          .from('small_group_members').select('*').eq('group_id', groupId).eq('user_id', user.id).maybeSingle();
        setMyMembership(mine);

        const isMember = mine?.status === 'active';
        if (isMember) {
          const postsLimit = Math.max(POSTS_PAGE, postsCountRef.current);
          const [membersRes, meetingsRes, postsRes] = await Promise.all([
            supabase.from('small_group_members').select('*').eq('group_id', groupId).eq('status', 'active'),
            supabase.from('small_group_meetings').select('*').eq('group_id', groupId).order('meeting_date', { ascending: true }),
            supabase.from('small_group_posts').select('*').eq('group_id', groupId).order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
              .limit(postsLimit),
          ]);
          setMembers(membersRes.data || []);
          setMeetings((meetingsRes.data || []).filter((m: any) => m.status !== 'completed'));
          setPosts(postsRes.data || []);
          setPostsHasMore((postsRes.data?.length ?? 0) === postsLimit);
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

  // "Share to WhatsApp" invite — a leader pastes this straight into the
  // WhatsApp group chat they already use. No WhatsApp Business connection
  // needed: this just reuses the existing ministry join-link mechanism
  // (buildJoinUrl) with a ?group= param so a brand-new invitee lands on
  // this exact group once they've joined the ministry (see
  // MinistryJoinLanding.tsx + MinistriesHub.tsx's small-group deep link).
  const shareToWhatsApp = () => {
    if (!group || !ministryInfo?.slug) return;
    const joinUrl = buildJoinUrl(
      ministryInfo.slug,
      ministryInfo.invite_code || '',
      ministryInfo.qr_code_version || 0,
      undefined,
      { group: group.id },
    );
    const text = t('smallGroupsMember', 'whatsappInviteText',
      'Join our "{group}" small group at {ministry} on Rekindle! 🙏\n\n{link}\n\nOnce you\'re in, you\'ll find "{group}" waiting for you under Small Groups.')
      .replace('{group}', group.name)
      .replace('{ministry}', ministryInfo.name)
      .replace('{link}', joinUrl);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const toggleWhatsappNotify = async () => {
    if (!myMembership) return;
    setSavingNotifyPref(true);
    const next = !myMembership.whatsapp_notify;
    try {
      const { error } = await supabase.from('small_group_members').update({ whatsapp_notify: next }).eq('id', myMembership.id);
      if (error) throw error;
      setMyMembership({ ...myMembership, whatsapp_notify: next });
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSavingNotifyPref(false);
    }
  };

  const loadMorePosts = async () => {
    const from = postsCountRef.current;
    setLoadingMorePosts(true);
    try {
      const { data, error } = await supabase.from('small_group_posts').select('*').eq('group_id', groupId)
        .order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
        .range(from, from + POSTS_PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      setPosts(prev => {
        const seen = new Set(prev.map((p: any) => p.id));
        return [...prev, ...rows.filter((p: any) => !seen.has(p.id))];
      });
      setPostsHasMore(rows.length === POSTS_PAGE);
    } catch (e: any) {
      toast({ title: t('smallGroupsMember', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoadingMorePosts(false);
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
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{group.name}</h1>
            {group.category && <Badge variant="outline">{group.category}</Badge>}
          </div>
          {isMember && ministryInfo?.slug && (
            <Button
              size="sm"
              variant="outline"
              onClick={shareToWhatsApp}
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              {t('smallGroupsMember', 'shareToWhatsApp', 'Share to WhatsApp')}
            </Button>
          )}
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

      {isMember && whatsappNotifyAvailable && (
        <Card>
          <CardContent className="pt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('smallGroupsMember', 'whatsappRemindersTitle', 'Get WhatsApp reminders for this group')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('smallGroupsMember', 'whatsappRemindersDesc', "New meetings and announcements will also be sent to your WhatsApp number from {ministry}'s verified account.").replace('{ministry}', ministryInfo?.name || '')}
              </p>
            </div>
            <Button
              size="sm"
              variant={myMembership?.whatsapp_notify ? 'default' : 'outline'}
              onClick={toggleWhatsappNotify}
              disabled={savingNotifyPref}
              className="shrink-0"
            >
              {savingNotifyPref ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (myMembership?.whatsapp_notify ? t('smallGroupsMember', 'notifyOn', 'On') : t('smallGroupsMember', 'notifyOff', 'Off'))}
            </Button>
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
                {postsHasMore && (
                  <div className="flex justify-center pt-1">
                    <Button variant="outline" size="sm" onClick={loadMorePosts} disabled={loadingMorePosts}>
                      {loadingMorePosts && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {t('common', 'loadMore', 'Load more')}
                    </Button>
                  </div>
                )}
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
