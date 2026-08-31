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
import { resolveMinistryRole, roleCan, type MinistryRole } from '@rekindle/auth/ministryPermissions';
import {
  Users, Search, Loader2, Plus, Edit, Archive, Trash2, UserPlus, X,
  BarChart3, TrendingUp, Award, Crown, MapPin, Video as VideoIcon,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { SmallGroupDetailManager } from './SmallGroupDetailManager';

interface MinistrySmallGroupsManagerProps {
  ministryId: string;
}

interface SmallGroup {
  id: string;
  ministry_id: string;
  name: string;
  description: string | null;
  category: string | null;
  leader_id: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_frequency: string | null;
  location_type: 'physical' | 'online' | 'hybrid';
  location_address: string | null;
  meeting_link: string | null;
  max_members: number | null;
  status: 'active' | 'inactive' | 'closed';
  cover_image_url: string | null;
  privacy: 'public' | 'private' | 'invite_only';
  member_count: number;
  created_at: string;
}

interface Coordinator {
  id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

const CATEGORY_OPTIONS = [
  'Bible Study', 'Prayer Group', 'Youth', 'Men', 'Women', 'Couples',
  'Discipleship', 'Outreach', 'Worship', 'Other',
];

const emptyForm = {
  name: '',
  description: '',
  category: 'Bible Study',
  meeting_day: 'monday',
  meeting_time: '',
  meeting_frequency: 'weekly',
  location_type: 'physical' as 'physical' | 'online' | 'hybrid',
  location_address: '',
  meeting_link: '',
  max_members: '',
  status: 'active' as 'active' | 'inactive' | 'closed',
  cover_image_url: '',
  privacy: 'public' as 'public' | 'private' | 'invite_only',
};

export const MinistrySmallGroupsManager: React.FC<MinistrySmallGroupsManagerProps> = ({ ministryId }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [subTab, setSubTab] = useState<'overview' | 'groups' | 'coordinators'>('overview');
  const [groups, setGroups] = useState<SmallGroup[]>([]);
  const [members, setMembers] = useState<any[]>([]); // small_group_members rows, all groups, for analytics + engagement ranking
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [myMinistryRow, setMyMinistryRow] = useState<any>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SmallGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [coordinatorEmail, setCoordinatorEmail] = useState('');
  const [addingCoordinator, setAddingCoordinator] = useState(false);

  useEffect(() => {
    loadAll();
  }, [ministryId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [groupsRes, membersRes, coordRes, ministryRes] = await Promise.all([
        supabase.from('small_groups').select('*').eq('ministry_id', ministryId).order('created_at', { ascending: false }),
        supabase.from('small_group_members').select('*').eq('ministry_id', ministryId),
        supabase.from('small_group_coordinators').select('*').eq('ministry_id', ministryId).order('created_at', { ascending: false }),
        supabase.from('ministry_groups').select('owner_id, leader_id').eq('id', ministryId).maybeSingle(),
      ]);
      if (groupsRes.error) throw groupsRes.error;
      setGroups(groupsRes.data || []);
      setMembers(membersRes.data || []);
      setCoordinators(coordRes.data || []);
      setOwnerId(ministryRes.data?.owner_id ?? null);
      setLeaderId(ministryRes.data?.leader_id ?? null);

      if (user?.id) {
        const { data: mine } = await supabase
          .from('ministry_group_members')
          .select('role, is_leader')
          .eq('ministry_id', ministryId)
          .eq('user_id', user.id)
          .maybeSingle();
        setMyMinistryRow(mine);
      }
    } catch (e: any) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const myMinistryRole: MinistryRole | null = resolveMinistryRole({
    userId: user?.id,
    ownerId,
    leaderId,
    memberRole: myMinistryRow?.role,
    memberIsLeader: myMinistryRow?.is_leader,
  });
  const isMinistryAdmin = roleCan(myMinistryRole, 'manage_members');
  const isCoordinator = !!user?.id && coordinators.some((c) => c.user_id === user.id);
  const canManageGroups = isMinistryAdmin || isCoordinator;
  const canManageCoordinators = roleCan(myMinistryRole, 'manage_roles');

  const filteredGroups = useMemo(() => groups.filter((g) => {
    const matchesSearch = !searchTerm ||
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || g.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || g.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  }), [groups, searchTerm, categoryFilter, statusFilter]);

  // ── Analytics ──
  const activeMembers = members.filter((m) => m.status === 'active');
  const totalGroups = groups.length;
  const activeGroups = groups.filter((g) => g.status === 'active').length;
  const inactiveGroups = totalGroups - activeGroups;
  const distinctParticipants = new Set(activeMembers.map((m) => m.user_id)).size;
  const avgGroupSize = totalGroups > 0
    ? Math.round((groups.reduce((sum, g) => sum + (g.member_count || 0), 0) / totalGroups) * 10) / 10
    : 0;
  const pendingRequests = members.filter((m) => m.status === 'pending').length;
  const statusChartData = [
    { name: t('ministrySmallGroupsManager', 'chartActive', 'Active'), count: activeGroups },
    { name: t('ministrySmallGroupsManager', 'chartInactive', 'Inactive/Closed'), count: inactiveGroups },
  ];
  const engagementRanked = useMemo(
    () => [...groups].sort((a, b) => (b.member_count || 0) - (a.member_count || 0)),
    [groups],
  );

  // ── Create / edit group ──
  const openCreate = () => {
    setEditingGroup(null);
    setFormData({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (g: SmallGroup) => {
    setEditingGroup(g);
    setFormData({
      name: g.name,
      description: g.description || '',
      category: g.category || 'Bible Study',
      meeting_day: g.meeting_day || 'monday',
      meeting_time: g.meeting_time || '',
      meeting_frequency: g.meeting_frequency || 'weekly',
      location_type: g.location_type,
      location_address: g.location_address || '',
      meeting_link: g.meeting_link || '',
      max_members: g.max_members ? String(g.max_members) : '',
      status: g.status,
      cover_image_url: g.cover_image_url || '',
      privacy: g.privacy,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: t('ministrySmallGroupsManager', 'nameRequired', 'Group name is required'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ministry_id: ministryId,
        name: formData.name.trim(),
        description: formData.description || null,
        category: formData.category || null,
        meeting_day: formData.meeting_day || null,
        meeting_time: formData.meeting_time || null,
        meeting_frequency: formData.meeting_frequency || null,
        location_type: formData.location_type,
        location_address: formData.location_address || null,
        meeting_link: formData.meeting_link || null,
        max_members: formData.max_members ? parseInt(formData.max_members, 10) : null,
        status: formData.status,
        cover_image_url: formData.cover_image_url || null,
        privacy: formData.privacy,
      };

      if (editingGroup) {
        const { error } = await supabase.from('small_groups').update(payload).eq('id', editingGroup.id);
        if (error) throw error;
        toast({ title: t('ministrySmallGroupsManager', 'saved', 'Saved'), description: t('ministrySmallGroupsManager', 'groupUpdated', 'Small group updated') });
      } else {
        const { data: created, error } = await supabase
          .from('small_groups')
          .insert({ ...payload, created_by: user?.id })
          .select('id')
          .single();
        if (error) throw error;
        // Creator becomes the group's first leader.
        if (created?.id && user?.id) {
          await supabase.from('small_group_members').insert({
            group_id: created.id,
            user_id: user.id,
            role: 'leader',
            status: 'active',
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            joined_at: new Date().toISOString(),
          });
        }
        toast({ title: t('ministrySmallGroupsManager', 'created', 'Created'), description: t('ministrySmallGroupsManager', 'groupCreated', 'Small group created') });
      }
      setShowModal(false);
      await loadAll();
    } catch (e: any) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (g: SmallGroup, nextStatus: 'active' | 'inactive' | 'closed') => {
    try {
      const { error } = await supabase.from('small_groups').update({ status: nextStatus }).eq('id', g.id);
      if (error) throw error;
      toast({ title: t('ministrySmallGroupsManager', 'saved', 'Saved'), description: t('ministrySmallGroupsManager', 'statusUpdated', 'Group status updated') });
      await loadAll();
    } catch (e: any) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (g: SmallGroup) => {
    if (!window.confirm(t('ministrySmallGroupsManager', 'confirmDelete', 'Delete "{name}"? This removes all its members, meetings, attendance, and posts. This cannot be undone.').replace('{name}', g.name))) return;
    try {
      const { error } = await supabase.from('small_groups').delete().eq('id', g.id);
      if (error) throw error;
      toast({ title: t('ministrySmallGroupsManager', 'deleted', 'Deleted'), description: t('ministrySmallGroupsManager', 'groupDeleted', 'Small group deleted') });
      await loadAll();
    } catch (e: any) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  // ── Coordinators ──
  const handleAddCoordinator = async () => {
    if (!coordinatorEmail.trim()) return;
    setAddingCoordinator(true);
    try {
      const { data: profile, error: lookupErr } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('email', coordinatorEmail.trim().toLowerCase())
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!profile?.user_id) {
        toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: t('ministrySmallGroupsManager', 'userNotFound', 'No user found with that email'), variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('small_group_coordinators').insert({
        ministry_id: ministryId,
        user_id: profile.user_id,
        assigned_by: user?.id,
      });
      if (error) throw error;
      setCoordinatorEmail('');
      toast({ title: t('ministrySmallGroupsManager', 'saved', 'Saved'), description: t('ministrySmallGroupsManager', 'coordinatorAdded', 'Coordinator added') });
      await loadAll();
    } catch (e: any) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setAddingCoordinator(false);
    }
  };

  const handleRemoveCoordinator = async (c: Coordinator) => {
    try {
      const { error } = await supabase.from('small_group_coordinators').delete().eq('id', c.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      toast({ title: t('ministrySmallGroupsManager', 'error', 'Error'), description: e.message, variant: 'destructive' });
    }
  };

  if (selectedGroupId) {
    return (
      <SmallGroupDetailManager
        ministryId={ministryId}
        groupId={selectedGroupId}
        isMinistryAdmin={canManageGroups}
        onBack={() => { setSelectedGroupId(null); loadAll(); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            {t('ministrySmallGroupsManager', 'title', 'Small Groups')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('ministrySmallGroupsManager', 'subtitle', 'Create and manage small groups, cell groups, and Bible studies')}
          </p>
        </div>
        {canManageGroups && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('ministrySmallGroupsManager', 'createGroup', 'Create Group')}
          </Button>
        )}
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)}>
        <TabsList>
          <TabsTrigger value="overview">{t('ministrySmallGroupsManager', 'tabOverview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="groups">{t('ministrySmallGroupsManager', 'tabGroups', 'Groups')}</TabsTrigger>
          {canManageCoordinators && <TabsTrigger value="coordinators">{t('ministrySmallGroupsManager', 'tabCoordinators', 'Coordinators')}</TabsTrigger>}
        </TabsList>

        {/* ── Overview / analytics ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalGroups}</div>
              <div className="text-xs text-muted-foreground">{t('ministrySmallGroupsManager', 'statTotalGroups', 'Total Groups')}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold">{activeGroups}</div>
              <div className="text-xs text-muted-foreground">{t('ministrySmallGroupsManager', 'statActiveGroups', 'Active Groups')}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold">{distinctParticipants}</div>
              <div className="text-xs text-muted-foreground">{t('ministrySmallGroupsManager', 'statTotalMembers', 'Members Participating')}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold">{avgGroupSize}</div>
              <div className="text-xs text-muted-foreground">{t('ministrySmallGroupsManager', 'statAvgSize', 'Average Group Size')}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />{t('ministrySmallGroupsManager', 'activeVsInactive', 'Active vs. Inactive Groups')}</CardTitle></CardHeader>
            <CardContent>
              {totalGroups === 0 ? (
                <p className="text-sm text-muted-foreground">{t('ministrySmallGroupsManager', 'noGroupsYet', 'No small groups yet.')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#7c3aed" name={t('ministrySmallGroupsManager', 'legendGroups', 'Groups')} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />{t('ministrySmallGroupsManager', 'topEngagement', 'Groups by Engagement')}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {engagementRanked.length === 0 && <p className="text-sm text-muted-foreground">{t('ministrySmallGroupsManager', 'noGroupsYet', 'No small groups yet.')}</p>}
                {engagementRanked.slice(0, 5).map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{g.name}</span>
                    <Badge variant="secondary">{g.member_count} {t('ministrySmallGroupsManager', 'members', 'members')}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" />{t('ministrySmallGroupsManager', 'recentRequests', 'Recent Join Requests')}</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingRequests}</div>
                <p className="text-xs text-muted-foreground">{t('ministrySmallGroupsManager', 'pendingAcrossAllGroups', 'Pending across all groups — open a group to review.')}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Groups list ── */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={t('ministrySmallGroupsManager', 'searchPlaceholder', 'Search groups...')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-48"><SelectValue placeholder={t('ministrySmallGroupsManager', 'category', 'Category')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministrySmallGroupsManager', 'allCategories', 'All Categories')}</SelectItem>
                {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40"><SelectValue placeholder={t('ministrySmallGroupsManager', 'status', 'Status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministrySmallGroupsManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="active">{t('ministrySmallGroupsManager', 'chartActive', 'Active')}</SelectItem>
                <SelectItem value="inactive">{t('ministrySmallGroupsManager', 'statusInactive', 'Inactive')}</SelectItem>
                <SelectItem value="closed">{t('ministrySmallGroupsManager', 'statusClosed', 'Closed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredGroups.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              {t('ministrySmallGroupsManager', 'noGroupsFound', 'No small groups found.')}
            </CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredGroups.map((g) => (
                <Card key={g.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedGroupId(g.id)}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{g.name}</h3>
                          <Badge variant={g.status === 'active' ? 'default' : 'secondary'}>{g.status}</Badge>
                          {g.privacy !== 'public' && <Badge variant="outline">{g.privacy === 'invite_only' ? t('ministrySmallGroupsManager', 'privacyInviteOnly', 'Invite Only') : t('ministrySmallGroupsManager', 'privacyPrivate', 'Private')}</Badge>}
                        </div>
                        {g.category && <p className="text-xs text-muted-foreground mt-0.5">{g.category}</p>}
                      </div>
                      {canManageGroups && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(g)} title={t('ministrySmallGroupsManager', 'edit', 'Edit')}><Edit className="h-4 w-4" /></Button>
                          {g.status === 'active' ? (
                            <Button size="sm" variant="ghost" onClick={() => handleArchive(g, 'inactive')} title={t('ministrySmallGroupsManager', 'archive', 'Archive')}><Archive className="h-4 w-4" /></Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => handleArchive(g, 'active')} title={t('ministrySmallGroupsManager', 'reactivate', 'Reactivate')}><Award className="h-4 w-4" /></Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(g)} title={t('ministrySmallGroupsManager', 'deleteAction', 'Delete')}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      )}
                    </div>
                    {g.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{g.description}</p>}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                      {g.meeting_day && <span className="flex items-center gap-1"><VideoIcon className="h-3 w-3" />{g.meeting_day}{g.meeting_time ? ` · ${g.meeting_time}` : ''}</span>}
                      {g.location_type === 'physical' && g.location_address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{g.location_address}</span>}
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{g.member_count}{g.max_members ? `/${g.max_members}` : ''}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Coordinators ── */}
        {canManageCoordinators && (
          <TabsContent value="coordinators" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('ministrySmallGroupsManager', 'assignCoordinator', 'Assign a Small Group Coordinator')}</CardTitle></CardHeader>
              <CardContent className="flex gap-2">
                <Input
                  placeholder={t('ministrySmallGroupsManager', 'coordinatorEmailPlaceholder', 'Member email address')}
                  value={coordinatorEmail}
                  onChange={(e) => setCoordinatorEmail(e.target.value)}
                />
                <Button onClick={handleAddCoordinator} disabled={addingCoordinator}>
                  {addingCoordinator ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </CardContent>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {t('ministrySmallGroupsManager', 'coordinatorHint', 'Coordinators can manage every small group in this ministry, without any other ministry-admin access.')}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                {coordinators.length === 0 && <p className="text-sm text-muted-foreground">{t('ministrySmallGroupsManager', 'noCoordinatorsYet', 'No coordinators assigned yet.')}</p>}
                {coordinators.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                    <span className="flex items-center gap-2 text-sm"><Crown className="h-4 w-4 text-amber-500" />{c.user_id}</span>
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveCoordinator(c)}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Create / edit modal ── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroup ? t('ministrySmallGroupsManager', 'editGroup', 'Edit Small Group') : t('ministrySmallGroupsManager', 'createGroup', 'Create Group')}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">{t('ministrySmallGroupsManager', 'basicInfo', 'Basic Info')}</TabsTrigger>
              <TabsTrigger value="meeting">{t('ministrySmallGroupsManager', 'meetingDetails', 'Meeting Details')}</TabsTrigger>
              <TabsTrigger value="settings">{t('ministrySmallGroupsManager', 'settingsPrivacy', 'Settings & Privacy')}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3">
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelName', 'Group Name *')}</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelDescription', 'Description')}</Label>
                <Textarea rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelCategory', 'Category')}</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelCoverImage', 'Cover Image URL')}</Label>
                <Input value={formData.cover_image_url} onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })} placeholder="https://..." />
              </div>
            </TabsContent>

            <TabsContent value="meeting" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('ministrySmallGroupsManager', 'labelMeetingDay', 'Meeting Day')}</Label>
                  <Select value={formData.meeting_day} onValueChange={(v) => setFormData({ ...formData, meeting_day: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (
                        <SelectItem key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('ministrySmallGroupsManager', 'labelMeetingTime', 'Meeting Time')}</Label>
                  <Input type="time" value={formData.meeting_time} onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelFrequency', 'Meeting Frequency')}</Label>
                <Select value={formData.meeting_frequency} onValueChange={(v) => setFormData({ ...formData, meeting_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{t('ministrySmallGroupsManager', 'freqWeekly', 'Weekly')}</SelectItem>
                    <SelectItem value="biweekly">{t('ministrySmallGroupsManager', 'freqBiweekly', 'Bi-weekly')}</SelectItem>
                    <SelectItem value="monthly">{t('ministrySmallGroupsManager', 'freqMonthly', 'Monthly')}</SelectItem>
                    <SelectItem value="custom">{t('ministrySmallGroupsManager', 'freqCustom', 'Custom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelLocationType', 'Location Type')}</Label>
                <Select value={formData.location_type} onValueChange={(v: any) => setFormData({ ...formData, location_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">{t('ministrySmallGroupsManager', 'locationPhysical', 'Physical')}</SelectItem>
                    <SelectItem value="online">{t('ministrySmallGroupsManager', 'locationOnline', 'Online')}</SelectItem>
                    <SelectItem value="hybrid">{t('ministrySmallGroupsManager', 'locationHybrid', 'Hybrid')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.location_type === 'physical' || formData.location_type === 'hybrid') && (
                <div>
                  <Label>{t('ministrySmallGroupsManager', 'labelAddress', 'Physical Location')}</Label>
                  <Input value={formData.location_address} onChange={(e) => setFormData({ ...formData, location_address: e.target.value })} />
                </div>
              )}
              {(formData.location_type === 'online' || formData.location_type === 'hybrid') && (
                <div>
                  <Label>{t('ministrySmallGroupsManager', 'labelMeetingLink', 'Online Meeting Link')}</Label>
                  <Input value={formData.meeting_link} onChange={(e) => setFormData({ ...formData, meeting_link: e.target.value })} placeholder="https://..." />
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-3">
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelMaxMembers', 'Maximum Members (optional)')}</Label>
                <Input type="number" min={1} value={formData.max_members} onChange={(e) => setFormData({ ...formData, max_members: e.target.value })} placeholder={t('ministrySmallGroupsManager', 'unlimited', 'Unlimited')} />
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelStatus', 'Group Status')}</Label>
                <Select value={formData.status} onValueChange={(v: any) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('ministrySmallGroupsManager', 'chartActive', 'Active')}</SelectItem>
                    <SelectItem value="inactive">{t('ministrySmallGroupsManager', 'statusInactive', 'Inactive')}</SelectItem>
                    <SelectItem value="closed">{t('ministrySmallGroupsManager', 'statusClosed', 'Closed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ministrySmallGroupsManager', 'labelPrivacy', 'Privacy')}</Label>
                <Select value={formData.privacy} onValueChange={(v: any) => setFormData({ ...formData, privacy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t('ministrySmallGroupsManager', 'privacyPublicDesc', 'Public within the ministry — anyone can join instantly')}</SelectItem>
                    <SelectItem value="private">{t('ministrySmallGroupsManager', 'privacyPrivateDesc', 'Private — visible, but requires approval to join')}</SelectItem>
                    <SelectItem value="invite_only">{t('ministrySmallGroupsManager', 'privacyInviteOnlyDesc', 'Invite Only — not listed, leader adds members directly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('ministrySmallGroupsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingGroup ? t('ministrySmallGroupsManager', 'saveChanges', 'Save Changes') : t('ministrySmallGroupsManager', 'createGroup', 'Create Group')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistrySmallGroupsManager;
