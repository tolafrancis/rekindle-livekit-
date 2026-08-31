import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  ArrowLeft, Users, Calendar, MessageSquare, Settings as SettingsIcon,
  Check, X, UserMinus, Crown, Shield, Loader2, Plus, Pin, PinOff,
  CheckCircle2, XCircle, HelpCircle, UserPlus2, Trash2,
} from 'lucide-react';
import {
  resolveSmallGroupRole, smallGroupRoleCan, ASSIGNABLE_SMALL_GROUP_ROLES,
  SMALL_GROUP_ROLE_LABELS, type SmallGroupRole,
} from '../lib/smallGroupPermissions';

interface SmallGroupDetailManagerProps {
  ministryId: string;
  groupId: string;
  isMinistryAdmin: boolean; // resolved by the parent (ministry owner/leader/admin OR coordinator)
  onBack: () => void;
}

const ATTENDANCE_STATUSES = ['present', 'absent', 'excused', 'first_time_guest'] as const;

export const SmallGroupDetailManager: React.FC<SmallGroupDetailManagerProps> = ({
  ministryId, groupId, isMinistryAdmin, onBack,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [tab, setTab] = useState<'members' | 'meetings' | 'posts' | 'settings'>('members');
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    title: '', description: '', meeting_date: '', start_time: '', end_time: '',
    location_type: 'physical' as 'physical' | 'online', location_address: '', meeting_link: '',
  });
  const [savingMeeting, setSavingMeeting] = useState(false);

  const [attendanceMeeting, setAttendanceMeeting] = useState<any | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<Record<string, string>>({});
  const [guestName, setGuestName] = useState('');
  const [savingAttendance, setSavingAttendance] = useState(false);

  const [showPostModal, setShowPostModal] = useState(false);
  const [postForm, setPostForm] = useState({ post_type: 'announcement', title: '', content: '', resource_type: 'link', resource_url: '' });
  const [postFilter, setPostFilter] = useState<'all' | 'announcement' | 'discussion' | 'prayer_request' | 'resource'>('all');
  const [savingPost, setSavingPost] = useState(false);

  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [roleModalMember, setRoleModalMember] = useState<any | null>(null);
  const [roleModalValue, setRoleModalValue] = useState<'leader' | 'assistant_leader' | 'member'>('member');

  useEffect(() => {
    loadAll();
  }, [groupId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [groupRes, membersRes, meetingsRes, postsRes] = await Promise.all([
        supabase.from('small_groups').select('*').eq('id', groupId).maybeSingle(),
        supabase.from('small_group_members').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
        supabase.from('small_group_meetings').select('*').eq('group_id', groupId).order('meeting_date', { ascending: false }),
        supabase.from('small_group_posts').select('*').eq('group_id', groupId).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
      ]);
      if (groupRes.error) throw groupRes.error;
      setGroup(groupRes.data);
      setSettingsForm(groupRes.data ? {
        name: groupRes.data.name, description: groupRes.data.description || '',
        category: groupRes.data.category || '', meeting_day: groupRes.data.meeting_day || '',
        meeting_time: groupRes.data.meeting_time || '', meeting_frequency: groupRes.data.meeting_frequency || '',
        location_type: groupRes.data.location_type, location_address: groupRes.data.location_address || '',
        meeting_link: groupRes.data.meeting_link || '', max_members: groupRes.data.max_members ? String(groupRes.data.max_members) : '',
        cover_image_url: groupRes.data.cover_image_url || '', privacy: groupRes.data.privacy, status: groupRes.data.status,
      } : null);
      setMembers(membersRes.data || []);
      setMeetings(meetingsRes.data || []);
      setPosts(postsRes.data || []);
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const myMemberRow = members.find((m) => m.user_id === user?.id);
  const myRole: SmallGroupRole = resolveSmallGroupRole({
    userId: user?.id,
    isMinistryAdmin,
    isCoordinator: false, // already folded into isMinistryAdmin by the parent
    memberRole: myMemberRow?.role,
    memberStatus: myMemberRow?.status,
  });
  const canManageMembers = smallGroupRoleCan(myRole, 'manage_members');
  const canManageMeetings = smallGroupRoleCan(myRole, 'manage_meetings');
  const canRecordAttendance = smallGroupRoleCan(myRole, 'record_attendance');
  const canPostAnnouncement = smallGroupRoleCan(myRole, 'post_announcement_resource');
  const canPostDiscussion = smallGroupRoleCan(myRole, 'post_discussion_prayer');
  const canEditSettings = smallGroupRoleCan(myRole, 'edit_group_settings');
  const canArchiveDelete = smallGroupRoleCan(myRole, 'archive_delete_group');

  const activeMembers = useMemo(() => members.filter((m) => m.status === 'active'), [members]);
  const pendingMembers = useMemo(() => members.filter((m) => m.status === 'pending'), [members]);

  // ── Members ──
  const approveMember = async (m: any) => {
    try {
      const { error } = await supabase.from('small_group_members')
        .update({ status: 'active', approved_by: user?.id, approved_at: new Date().toISOString(), joined_at: new Date().toISOString() })
        .eq('id', m.id);
      if (error) throw error;
      toast({ title: t('smallGroupDetailManager', 'approved', 'Approved') });
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  // Decline/remove delete the row outright (rather than soft-updating status
  // to 'declined'/'removed') so the (group_id, user_id) unique constraint
  // never blocks the person from requesting/joining again later.
  const declineMember = async (m: any) => {
    try {
      const { error } = await supabase.from('small_group_members').delete().eq('id', m.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  const removeMember = async (m: any) => {
    if (!window.confirm(t('smallGroupDetailManager', 'confirmRemoveMember', 'Remove this member from the group?'))) return;
    try {
      const { error } = await supabase.from('small_group_members').delete().eq('id', m.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  const openRoleModal = (m: any) => {
    setRoleModalMember(m);
    setRoleModalValue(m.role);
  };

  const saveRole = async () => {
    if (!roleModalMember) return;
    try {
      const { error } = await supabase.from('small_group_members').update({ role: roleModalValue }).eq('id', roleModalMember.id);
      if (error) throw error;
      setRoleModalMember(null);
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  // ── Meetings ──
  const handleCreateMeeting = async () => {
    if (!meetingForm.title.trim() || !meetingForm.meeting_date) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: t('smallGroupDetailManager', 'titleDateRequired', 'Title and date are required'), variant: 'destructive' });
      return;
    }
    setSavingMeeting(true);
    try {
      const { error } = await supabase.from('small_group_meetings').insert({
        group_id: groupId,
        title: meetingForm.title.trim(),
        description: meetingForm.description || null,
        meeting_date: meetingForm.meeting_date,
        start_time: meetingForm.start_time || null,
        end_time: meetingForm.end_time || null,
        location_type: meetingForm.location_type,
        location_address: meetingForm.location_address || null,
        meeting_link: meetingForm.meeting_link || null,
        created_by: user?.id,
      });
      if (error) throw error;
      setShowMeetingModal(false);
      setMeetingForm({ title: '', description: '', meeting_date: '', start_time: '', end_time: '', location_type: 'physical', location_address: '', meeting_link: '' });
      toast({ title: t('smallGroupDetailManager', 'saved', 'Saved'), description: t('smallGroupDetailManager', 'meetingCreated', 'Meeting created') });
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSavingMeeting(false);
    }
  };

  const openAttendance = async (meeting: any) => {
    setAttendanceMeeting(meeting);
    setGuestName('');
    try {
      const { data } = await supabase.from('small_group_attendance').select('*').eq('meeting_id', meeting.id);
      const rows: Record<string, string> = {};
      (data || []).forEach((r: any) => { if (r.user_id) rows[r.user_id] = r.status; });
      setAttendanceRows(rows);
    } catch {
      setAttendanceRows({});
    }
  };

  const saveAttendance = async () => {
    if (!attendanceMeeting) return;
    setSavingAttendance(true);
    try {
      const upserts = activeMembers
        .filter((m) => attendanceRows[m.user_id])
        .map((m) => ({
          meeting_id: attendanceMeeting.id,
          user_id: m.user_id,
          status: attendanceRows[m.user_id],
          recorded_by: user?.id,
        }));
      if (upserts.length > 0) {
        const { error } = await supabase.from('small_group_attendance').upsert(upserts, { onConflict: 'meeting_id,user_id' });
        if (error) throw error;
      }
      if (guestName.trim()) {
        const { error } = await supabase.from('small_group_attendance').insert({
          meeting_id: attendanceMeeting.id, guest_name: guestName.trim(), status: 'first_time_guest', recorded_by: user?.id,
        });
        if (error) throw error;
      }
      await supabase.from('small_group_meetings').update({ status: 'completed' }).eq('id', attendanceMeeting.id);
      toast({ title: t('smallGroupDetailManager', 'saved', 'Saved'), description: t('smallGroupDetailManager', 'attendanceSaved', 'Attendance saved') });
      setAttendanceMeeting(null);
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSavingAttendance(false);
    }
  };

  // ── Posts ──
  const openPostModal = (postType: string) => {
    setPostForm({ post_type: postType, title: '', content: '', resource_type: 'link', resource_url: '' });
    setShowPostModal(true);
  };

  const handleCreatePost = async () => {
    if (!postForm.content.trim() && !postForm.resource_url.trim()) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: t('smallGroupDetailManager', 'contentRequired', 'Content is required'), variant: 'destructive' });
      return;
    }
    setSavingPost(true);
    try {
      const { error } = await supabase.from('small_group_posts').insert({
        group_id: groupId,
        author_id: user?.id,
        post_type: postForm.post_type,
        title: postForm.title || null,
        content: postForm.content || null,
        resource_type: postForm.post_type === 'resource' ? postForm.resource_type : null,
        resource_url: postForm.post_type === 'resource' ? (postForm.resource_url || null) : null,
      });
      if (error) throw error;
      setShowPostModal(false);
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSavingPost(false);
    }
  };

  const togglePin = async (p: any) => {
    try {
      await supabase.from('small_group_posts').update({ is_pinned: !p.is_pinned }).eq('id', p.id);
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  const deletePost = async (p: any) => {
    try {
      await supabase.from('small_group_posts').delete().eq('id', p.id);
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  // ── Settings ──
  const saveSettings = async () => {
    if (!settingsForm) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase.from('small_groups').update({
        name: settingsForm.name,
        description: settingsForm.description || null,
        category: settingsForm.category || null,
        meeting_day: settingsForm.meeting_day || null,
        meeting_time: settingsForm.meeting_time || null,
        meeting_frequency: settingsForm.meeting_frequency || null,
        location_type: settingsForm.location_type,
        location_address: settingsForm.location_address || null,
        meeting_link: settingsForm.meeting_link || null,
        max_members: settingsForm.max_members ? parseInt(settingsForm.max_members, 10) : null,
        cover_image_url: settingsForm.cover_image_url || null,
        privacy: settingsForm.privacy,
        status: settingsForm.status,
      }).eq('id', groupId);
      if (error) throw error;
      toast({ title: t('smallGroupDetailManager', 'saved', 'Saved') });
      await loadAll();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const deleteGroup = async () => {
    if (!window.confirm(t('smallGroupDetailManager', 'confirmDeleteGroup', 'Permanently delete this group and all its members, meetings, attendance, and posts?'))) return;
    try {
      const { error } = await supabase.from('small_groups').delete().eq('id', groupId);
      if (error) throw error;
      onBack();
    } catch (e: any) {
      toast({ title: t('smallGroupDetailManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  if (loading || !group) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const filteredPosts = postFilter === 'all' ? posts : posts.filter((p) => p.post_type === postFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />{t('smallGroupDetailManager', 'back', 'Back')}</Button>
        <div>
          <h2 className="text-xl font-bold">{group.name}</h2>
          <p className="text-xs text-muted-foreground">{group.category} · {activeMembers.length} {t('smallGroupDetailManager', 'members', 'members')} · {SMALL_GROUP_ROLE_LABELS[myRole || 'member']}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="members"><Users className="h-4 w-4 mr-1" />{t('smallGroupDetailManager', 'tabMembers', 'Members')}{pendingMembers.length > 0 && <Badge className="ml-1" variant="destructive">{pendingMembers.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="meetings"><Calendar className="h-4 w-4 mr-1" />{t('smallGroupDetailManager', 'tabMeetings', 'Meetings & Attendance')}</TabsTrigger>
          <TabsTrigger value="posts"><MessageSquare className="h-4 w-4 mr-1" />{t('smallGroupDetailManager', 'tabPosts', 'Posts')}</TabsTrigger>
          {(canEditSettings || canArchiveDelete) && <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1" />{t('smallGroupDetailManager', 'tabSettings', 'Settings')}</TabsTrigger>}
        </TabsList>

        {/* ── Members ── */}
        <TabsContent value="members" className="space-y-4">
          {pendingMembers.length > 0 && canManageMembers && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('smallGroupDetailManager', 'joinRequests', 'Join Requests')}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {pendingMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                    <span className="text-sm">{m.user_id}</span>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => approveMember(m)}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => declineMember(m)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">{t('smallGroupDetailManager', 'allMembers', 'All Members')} ({activeMembers.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {activeMembers.length === 0 && <p className="text-sm text-muted-foreground">{t('smallGroupDetailManager', 'noMembersYet', 'No members yet.')}</p>}
              {activeMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    {m.role === 'leader' && <Crown className="h-4 w-4 text-amber-500" />}
                    {m.role === 'assistant_leader' && <Shield className="h-4 w-4 text-blue-500" />}
                    {m.user_id}
                    <Badge variant="outline">{SMALL_GROUP_ROLE_LABELS[m.role as 'leader' | 'assistant_leader' | 'member']}</Badge>
                  </span>
                  {canManageMembers && m.user_id !== user?.id && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openRoleModal(m)}>{t('smallGroupDetailManager', 'changeRole', 'Change Role')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeMember(m)}><UserMinus className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Meetings & Attendance ── */}
        <TabsContent value="meetings" className="space-y-4">
          {canManageMeetings && (
            <Button onClick={() => setShowMeetingModal(true)}><Plus className="h-4 w-4 mr-2" />{t('smallGroupDetailManager', 'newMeeting', 'New Meeting')}</Button>
          )}
          <div className="space-y-2">
            {meetings.length === 0 && <p className="text-sm text-muted-foreground">{t('smallGroupDetailManager', 'noMeetingsYet', 'No meetings scheduled yet.')}</p>}
            {meetings.map((mt) => (
              <Card key={mt.id}>
                <CardContent className="pt-4 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-medium flex items-center gap-2">{mt.title} <Badge variant={mt.status === 'completed' ? 'secondary' : mt.status === 'cancelled' ? 'destructive' : 'default'}>{mt.status}</Badge></div>
                    <div className="text-xs text-muted-foreground">{mt.meeting_date}{mt.start_time ? ` · ${mt.start_time}` : ''}</div>
                  </div>
                  {canRecordAttendance && (
                    <Button size="sm" variant="outline" onClick={() => openAttendance(mt)}>{t('smallGroupDetailManager', 'recordAttendance', 'Record Attendance')}</Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Posts ── */}
        <TabsContent value="posts" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <Select value={postFilter} onValueChange={(v: any) => setPostFilter(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('smallGroupDetailManager', 'allPosts', 'All')}</SelectItem>
                <SelectItem value="announcement">{t('smallGroupDetailManager', 'announcements', 'Announcements')}</SelectItem>
                <SelectItem value="discussion">{t('smallGroupDetailManager', 'discussion', 'Discussion')}</SelectItem>
                <SelectItem value="prayer_request">{t('smallGroupDetailManager', 'prayerRequests', 'Prayer Requests')}</SelectItem>
                <SelectItem value="resource">{t('smallGroupDetailManager', 'resources', 'Resources')}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              {canPostAnnouncement && <Button size="sm" onClick={() => openPostModal('announcement')}>{t('smallGroupDetailManager', 'newAnnouncement', 'Announcement')}</Button>}
              {canPostAnnouncement && <Button size="sm" variant="outline" onClick={() => openPostModal('resource')}>{t('smallGroupDetailManager', 'shareResource', 'Share Resource')}</Button>}
              {canPostDiscussion && <Button size="sm" variant="outline" onClick={() => openPostModal('discussion')}>{t('smallGroupDetailManager', 'newDiscussion', 'Discussion')}</Button>}
              {canPostDiscussion && <Button size="sm" variant="outline" onClick={() => openPostModal('prayer_request')}>{t('smallGroupDetailManager', 'newPrayerRequest', 'Prayer Request')}</Button>}
            </div>
          </div>
          <div className="space-y-2">
            {filteredPosts.length === 0 && <p className="text-sm text-muted-foreground">{t('smallGroupDetailManager', 'noPostsYet', 'Nothing posted yet.')}</p>}
            {filteredPosts.map((p) => (
              <Card key={p.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {p.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                        <Badge variant="outline">{p.post_type.replace('_', ' ')}</Badge>
                        {p.title && <span className="font-medium">{p.title}</span>}
                      </div>
                      {p.content && <p className="text-sm text-muted-foreground mt-1">{p.content}</p>}
                      {p.resource_url && <a href={p.resource_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline mt-1 block">{p.resource_url}</a>}
                    </div>
                    {(canManageMembers || p.author_id === user?.id) && (
                      <div className="flex gap-1">
                        {canPostAnnouncement && <Button size="sm" variant="ghost" onClick={() => togglePin(p)}>{p.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</Button>}
                        <Button size="sm" variant="ghost" onClick={() => deletePost(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Settings ── */}
        {(canEditSettings || canArchiveDelete) && settingsForm && (
          <TabsContent value="settings" className="space-y-4">
            {canEditSettings && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t('smallGroupDetailManager', 'groupDetails', 'Group Details')}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>{t('smallGroupDetailManager', 'labelName', 'Name')}</Label><Input value={settingsForm.name} onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })} /></div>
                  <div><Label>{t('smallGroupDetailManager', 'labelDescription', 'Description')}</Label><Textarea value={settingsForm.description} onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t('smallGroupDetailManager', 'labelMeetingDay', 'Meeting Day')}</Label><Input value={settingsForm.meeting_day} onChange={(e) => setSettingsForm({ ...settingsForm, meeting_day: e.target.value })} /></div>
                    <div><Label>{t('smallGroupDetailManager', 'labelMeetingTime', 'Meeting Time')}</Label><Input type="time" value={settingsForm.meeting_time} onChange={(e) => setSettingsForm({ ...settingsForm, meeting_time: e.target.value })} /></div>
                  </div>
                  <div><Label>{t('smallGroupDetailManager', 'labelMaxMembers', 'Maximum Members')}</Label><Input type="number" value={settingsForm.max_members} onChange={(e) => setSettingsForm({ ...settingsForm, max_members: e.target.value })} /></div>
                  <div>
                    <Label>{t('smallGroupDetailManager', 'labelPrivacy', 'Privacy')}</Label>
                    <Select value={settingsForm.privacy} onValueChange={(v) => setSettingsForm({ ...settingsForm, privacy: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">{t('smallGroupDetailManager', 'privacyPublic', 'Public')}</SelectItem>
                        <SelectItem value="private">{t('smallGroupDetailManager', 'privacyPrivate', 'Private')}</SelectItem>
                        <SelectItem value="invite_only">{t('smallGroupDetailManager', 'privacyInviteOnly', 'Invite Only')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{t('smallGroupDetailManager', 'saveChanges', 'Save Changes')}</Button>
                </CardContent>
              </Card>
            )}
            {canArchiveDelete && (
              <Card className="border-destructive/40">
                <CardHeader><CardTitle className="text-base text-destructive">{t('smallGroupDetailManager', 'dangerZone', 'Danger Zone')}</CardTitle></CardHeader>
                <CardContent>
                  <Button variant="destructive" onClick={deleteGroup}>{t('smallGroupDetailManager', 'deleteGroup', 'Delete Group')}</Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ── New meeting modal ── */}
      <Dialog open={showMeetingModal} onOpenChange={setShowMeetingModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('smallGroupDetailManager', 'newMeeting', 'New Meeting')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('smallGroupDetailManager', 'labelMeetingTitle', 'Meeting Title *')}</Label><Input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} /></div>
            <div><Label>{t('smallGroupDetailManager', 'labelDescription', 'Description / Agenda')}</Label><Textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>{t('smallGroupDetailManager', 'labelDate', 'Date *')}</Label><Input type="date" value={meetingForm.meeting_date} onChange={(e) => setMeetingForm({ ...meetingForm, meeting_date: e.target.value })} /></div>
              <div><Label>{t('smallGroupDetailManager', 'labelStartTime', 'Start')}</Label><Input type="time" value={meetingForm.start_time} onChange={(e) => setMeetingForm({ ...meetingForm, start_time: e.target.value })} /></div>
              <div><Label>{t('smallGroupDetailManager', 'labelEndTime', 'End')}</Label><Input type="time" value={meetingForm.end_time} onChange={(e) => setMeetingForm({ ...meetingForm, end_time: e.target.value })} /></div>
            </div>
            <div>
              <Label>{t('smallGroupDetailManager', 'labelLocationType', 'Location Type')}</Label>
              <Select value={meetingForm.location_type} onValueChange={(v: any) => setMeetingForm({ ...meetingForm, location_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">{t('smallGroupDetailManager', 'locationPhysical', 'Physical')}</SelectItem>
                  <SelectItem value="online">{t('smallGroupDetailManager', 'locationOnline', 'Online')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {meetingForm.location_type === 'physical' ? (
              <div><Label>{t('smallGroupDetailManager', 'labelAddress', 'Location')}</Label><Input value={meetingForm.location_address} onChange={(e) => setMeetingForm({ ...meetingForm, location_address: e.target.value })} /></div>
            ) : (
              <div><Label>{t('smallGroupDetailManager', 'labelMeetingLink', 'Meeting Link')}</Label><Input value={meetingForm.meeting_link} onChange={(e) => setMeetingForm({ ...meetingForm, meeting_link: e.target.value })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMeetingModal(false)}>{t('smallGroupDetailManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateMeeting} disabled={savingMeeting}>{savingMeeting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{t('smallGroupDetailManager', 'createMeeting', 'Create Meeting')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Attendance modal ── */}
      <Dialog open={!!attendanceMeeting} onOpenChange={(o) => !o && setAttendanceMeeting(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('smallGroupDetailManager', 'recordAttendance', 'Record Attendance')} — {attendanceMeeting?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {activeMembers.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="text-sm truncate flex-1">{m.user_id}</span>
                <Select value={attendanceRows[m.user_id] || ''} onValueChange={(v) => setAttendanceRows({ ...attendanceRows, [m.user_id]: v })}>
                  <SelectTrigger className="w-44"><SelectValue placeholder={t('smallGroupDetailManager', 'selectStatus', 'Select status')} /></SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_STATUSES.filter((s) => s !== 'first_time_guest').map((s) => (
                      <SelectItem key={s} value={s}>{t('smallGroupDetailManager', `attendance_${s}`, s.replace('_', ' '))}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="pt-3 border-t">
              <Label>{t('smallGroupDetailManager', 'addGuest', 'Add a first-time guest by name')}</Label>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t('smallGroupDetailManager', 'guestNamePlaceholder', 'Guest name')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendanceMeeting(null)}>{t('smallGroupDetailManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveAttendance} disabled={savingAttendance}>{savingAttendance ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{t('smallGroupDetailManager', 'saveAttendance', 'Save Attendance')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New post modal ── */}
      <Dialog open={showPostModal} onOpenChange={setShowPostModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {postForm.post_type === 'announcement' && t('smallGroupDetailManager', 'newAnnouncement', 'Announcement')}
              {postForm.post_type === 'discussion' && t('smallGroupDetailManager', 'newDiscussion', 'Discussion')}
              {postForm.post_type === 'prayer_request' && t('smallGroupDetailManager', 'newPrayerRequest', 'Prayer Request')}
              {postForm.post_type === 'resource' && t('smallGroupDetailManager', 'shareResource', 'Share Resource')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('smallGroupDetailManager', 'labelTitle', 'Title (optional)')}</Label><Input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} /></div>
            <div><Label>{t('smallGroupDetailManager', 'labelContent', 'Content')}</Label><Textarea rows={4} value={postForm.content} onChange={(e) => setPostForm({ ...postForm, content: e.target.value })} /></div>
            {postForm.post_type === 'resource' && (
              <>
                <div>
                  <Label>{t('smallGroupDetailManager', 'labelResourceType', 'Resource Type')}</Label>
                  <Select value={postForm.resource_type} onValueChange={(v) => setPostForm({ ...postForm, resource_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="devotional">{t('smallGroupDetailManager', 'resourceDevotional', 'Devotional')}</SelectItem>
                      <SelectItem value="reading_plan">{t('smallGroupDetailManager', 'resourceReadingPlan', 'Reading Plan')}</SelectItem>
                      <SelectItem value="book">{t('smallGroupDetailManager', 'resourceBook', 'Book')}</SelectItem>
                      <SelectItem value="link">{t('smallGroupDetailManager', 'resourceLink', 'Link')}</SelectItem>
                      <SelectItem value="file">{t('smallGroupDetailManager', 'resourceFile', 'File')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{t('smallGroupDetailManager', 'labelResourceUrl', 'URL')}</Label><Input value={postForm.resource_url} onChange={(e) => setPostForm({ ...postForm, resource_url: e.target.value })} placeholder="https://..." /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPostModal(false)}>{t('smallGroupDetailManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreatePost} disabled={savingPost}>{savingPost ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{t('smallGroupDetailManager', 'post', 'Post')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Role change modal ── */}
      <Dialog open={!!roleModalMember} onOpenChange={(o) => !o && setRoleModalMember(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('smallGroupDetailManager', 'changeRole', 'Change Role')}</DialogTitle></DialogHeader>
          <Select value={roleModalValue} onValueChange={(v: any) => setRoleModalValue(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_SMALL_GROUP_ROLES.map((r) => <SelectItem key={r} value={r}>{SMALL_GROUP_ROLE_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleModalMember(null)}>{t('smallGroupDetailManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveRole}>{t('smallGroupDetailManager', 'saveChanges', 'Save Changes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SmallGroupDetailManager;
