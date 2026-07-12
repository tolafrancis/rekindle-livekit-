import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Users, Search, Plus, Edit, Trash2, RefreshCw, 
  UserPlus, Mail, Link, Copy, Check, Crown, Shield,
  Settings, Eye, EyeOff, Loader2
} from 'lucide-react';

interface MinistryGroup {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  owner_id: string;
  member_count: number;
  invite_code: string;
  settings: {
    allow_broadcasts: boolean;
    public_join: boolean;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  can_receive_broadcasts: boolean;
  joined_at: string;
  email?: string;
  user_profile?: {
    full_name: string;
    email: string;
    avatar_url: string;
  };
}

interface GroupInvite {
  id: string;
  group_id: string;
  email: string;
  invite_code: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface AdminMinistryGroupsProps {
  onUpdate?: () => void;
}

export const AdminMinistryGroups: React.FC<AdminMinistryGroupsProps> = ({ onUpdate }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [groups, setGroups] = useState<MinistryGroup[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MinistryGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MinistryGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    leader_id: '',
    is_active: true,
    settings: {
      allow_broadcasts: true,
      public_join: false
    }
  });

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadGroups();
    loadUsers();
    return () => { isMounted.current = false; };
  }, []);


  const loadGroups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ministry_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (isMounted.current) {
        setGroups(data || []);
      }
    } catch (err: any) {
      console.error('Error loading ministry groups:', err);
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email, subscription_tier')
        .in('subscription_tier', ['premium', 'ministry'])
        .order('full_name');

      if (error) throw error;
      if (isMounted.current) {
        setUsers(data || []);
      }
    } catch (err: any) {
      console.error('Error loading users:', err);
    }
  };

  const loadGroupMembers = async (groupId: string) => {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('ministry_group_members')
        .select('*')
        .eq('group_id', groupId);

      if (membersError) throw membersError;

      // Load user profiles for members
      const userIds = membersData?.map(m => m.user_id).filter(Boolean) || [];
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email, avatar_url')
          .in('user_id', userIds);
        profiles = profilesData || [];
      }

      const membersWithProfiles = membersData?.map(member => ({
        ...member,
        user_profile: profiles.find(p => p.user_id === member.user_id)
      })) || [];

      const { data: invitesData, error: invitesError } = await supabase
        .from('ministry_group_invites')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'pending');

      if (invitesError) throw invitesError;

      if (isMounted.current) {
        setMembers(membersWithProfiles);
        setInvites(invitesData || []);
      }
    } catch (err: any) {
      console.error('Error loading group members:', err);
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  const handleCreate = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      description: '',
      leader_id: '',
      is_active: true,
      settings: {
        allow_broadcasts: true,
        public_join: false
      }
    });
    setShowModal(true);
  };

  const handleEdit = (group: MinistryGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      leader_id: group.leader_id || group.owner_id || '',
      is_active: group.is_active,
      settings: group.settings || { allow_broadcasts: true, public_join: false }
    });
    setShowModal(true);
  };

  const handleViewMembers = (group: MinistryGroup) => {
    setSelectedGroup(group);
    loadGroupMembers(group.id);
    setShowMembersModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: t('adminMinistryGroups', 'groupNameRequired', 'Group name is required'), variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: t('adminMinistryGroups', 'mustBeLoggedIn', 'You must be logged in'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        leader_id: formData.leader_id || null,
        is_active: formData.is_active,
        settings: formData.settings,
        updated_at: new Date().toISOString()
      };

      if (editingGroup) {
        const { error } = await supabase
          .from('ministry_groups')
          .update(dataToSave)
          .eq('id', editingGroup.id);

        if (error) throw error;
        toast({ title: t('adminMinistryGroups', 'success', 'Success'), description: t('adminMinistryGroups', 'groupUpdated', 'Ministry group updated successfully') });
      } else {
        // For new groups, set owner_id to selected leader or current user (admin)
        // This ensures RLS policy is satisfied
        dataToSave.invite_code = generateInviteCode();
        dataToSave.owner_id = formData.leader_id || user.id;
        dataToSave.member_count = 0;
        dataToSave.created_at = new Date().toISOString();

        const { error } = await supabase
          .from('ministry_groups')
          .insert(dataToSave);

        if (error) throw error;
        toast({ title: t('adminMinistryGroups', 'success', 'Success'), description: t('adminMinistryGroups', 'groupCreated', 'Ministry group created successfully') });
      }

      setShowModal(false);
      loadGroups();
      onUpdate?.();
    } catch (err: any) {
      console.error('Error saving ministry group:', err);
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };



  const handleDelete = async (groupId: string) => {
    if (!confirm(t('adminMinistryGroups', 'confirmDeleteGroup', 'Are you sure you want to delete this ministry group? This will also remove all members and invites.'))) {
      return;
    }

    try {
      const { error } = await supabase
        .from('ministry_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      toast({ title: t('adminMinistryGroups', 'success', 'Success'), description: t('adminMinistryGroups', 'groupDeleted', 'Ministry group deleted successfully') });
      loadGroups();
      onUpdate?.();
    } catch (err: any) {
      console.error('Error deleting ministry group:', err);
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm(t('adminMinistryGroups', 'confirmRemoveMember', 'Are you sure you want to remove this member?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      // Update member count
      if (selectedGroup) {
        await supabase
          .from('ministry_groups')
          .update({ member_count: Math.max(0, (selectedGroup.member_count || 1) - 1) })
          .eq('id', selectedGroup.id);
      }

      toast({ title: t('adminMinistryGroups', 'success', 'Success'), description: t('adminMinistryGroups', 'memberRemoved', 'Member removed successfully') });
      if (selectedGroup) loadGroupMembers(selectedGroup.id);
      loadGroups();
    } catch (err: any) {
      console.error('Error removing member:', err);
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('ministry_group_invites')
        .update({ status: 'expired' })
        .eq('id', inviteId);

      if (error) throw error;
      toast({ title: t('adminMinistryGroups', 'success', 'Success'), description: t('adminMinistryGroups', 'inviteCancelled', 'Invite cancelled') });
      if (selectedGroup) loadGroupMembers(selectedGroup.id);
    } catch (err: any) {
      console.error('Error cancelling invite:', err);
      toast({ title: t('adminMinistryGroups', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/join-ministry?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: t('adminMinistryGroups', 'copied', 'Copied!'), description: t('adminMinistryGroups', 'inviteLinkCopied', 'Invite link copied to clipboard') });
  };

  const filteredGroups = groups.filter(group => {
    const search = searchTerm.toLowerCase();
    return (
      group.name?.toLowerCase().includes(search) ||
      group.description?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('adminMinistryGroups', 'searchPlaceholder', 'Search ministry groups...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadGroups}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('adminMinistryGroups', 'refresh', 'Refresh')}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('adminMinistryGroups', 'createGroup', 'Create Group')}
          </Button>
        </div>
      </div>

      {/* Groups Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colName', 'Name')}</th>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colDescription', 'Description')}</th>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colLeader', 'Leader')}</th>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colMembers', 'Members')}</th>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colInviteCode', 'Invite Code')}</th>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colStatus', 'Status')}</th>
                  <th className="text-left p-4 font-medium">{t('adminMinistryGroups', 'colActions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      {t('adminMinistryGroups', 'noGroups', 'No ministry groups found. Create your first group to get started.')}
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map(group => {
                    const leader = users.find(u => u.user_id === (group.leader_id || group.owner_id));
                    return (
                      <tr key={group.id} className="border-b hover:bg-gray-50">
                        <td className="p-4 font-medium">{group.name}</td>
                        <td className="p-4 text-gray-600 max-w-xs truncate">
                          {group.description || '-'}
                        </td>
                        <td className="p-4">
                          {leader ? (
                            <div className="flex items-center gap-2">
                              <Crown className="h-4 w-4 text-amber-500" />
                              <span>{leader.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">{t('adminMinistryGroups', 'noLeader', 'No leader')}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <Badge variant="secondary">
                            <Users className="h-3 w-3 mr-1" />
                            {group.member_count || 0}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {group.invite_code ? (
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                {group.invite_code}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyInviteLink(group.invite_code)}
                              >
                                {copiedCode === group.invite_code ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-4">
                          <Badge variant={group.is_active ? 'default' : 'secondary'}>
                            {group.is_active ? t('adminMinistryGroups', 'active', 'Active') : t('adminMinistryGroups', 'inactive', 'Inactive')}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewMembers(group)}
                              title={t('adminMinistryGroups', 'viewMembers', 'View Members')}
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(group)}
                              title={t('adminMinistryGroups', 'edit', 'Edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(group.id)}
                              title={t('adminMinistryGroups', 'delete', 'Delete')}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? t('adminMinistryGroups', 'editGroupTitle', 'Edit Ministry Group') : t('adminMinistryGroups', 'createGroupTitle', 'Create Ministry Group')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('adminMinistryGroups', 'groupNameLabel', 'Group Name *')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('adminMinistryGroups', 'groupNamePlaceholder', "e.g., Youth Ministry, Women's Prayer Group")}
              />
            </div>
            <div>
              <Label>{t('adminMinistryGroups', 'descriptionLabel', 'Description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('adminMinistryGroups', 'descriptionPlaceholder', 'Brief description of this ministry group...')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('adminMinistryGroups', 'groupLeaderLabel', 'Group Leader')}</Label>
              <Select
                value={formData.leader_id || '__none__'}
                onValueChange={(value) => setFormData({ ...formData, leader_id: value === '__none__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('adminMinistryGroups', 'selectLeaderPlaceholder', 'Select a leader (optional)')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('adminMinistryGroups', 'noLeaderAssigned', 'No leader assigned')}</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {t('adminMinistryGroups', 'tierUsersHint', 'Only premium and ministry tier users are shown')}
              </p>
            </div>

            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('adminMinistryGroups', 'groupSettings', 'Group Settings')}
              </h4>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('adminMinistryGroups', 'allowBroadcasts', 'Allow Broadcasts')}</Label>
                  <p className="text-xs text-gray-500">{t('adminMinistryGroups', 'allowBroadcastsHint', 'Members can receive broadcast messages')}</p>
                </div>
                <Switch
                  checked={formData.settings.allow_broadcasts}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, allow_broadcasts: checked }
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('adminMinistryGroups', 'publicJoin', 'Public Join')}</Label>
                  <p className="text-xs text-gray-500">{t('adminMinistryGroups', 'publicJoinHint', 'Anyone can join with the invite code')}</p>
                </div>
                <Switch
                  checked={formData.settings.public_join}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, public_join: checked }
                  })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('adminMinistryGroups', 'activeStatus', 'Active Status')}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t('adminMinistryGroups', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminMinistryGroups', 'saving', 'Saving...')}
                </>
              ) : (
                t('adminMinistryGroups', 'save', 'Save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedGroup?.name} - {t('adminMinistryGroups', 'membersSuffix', 'Members')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Current Members */}
            <div>
              <h4 className="font-medium mb-3">{t('adminMinistryGroups', 'currentMembers', 'Current Members ({count})').replace('{count}', String(members.length))}</h4>
              {members.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('adminMinistryGroups', 'noMembersYet', 'No members yet')}</p>
              ) : (
                <div className="space-y-2">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          {member.user_profile?.full_name?.[0] || member.email?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.user_profile?.full_name || member.email || t('adminMinistryGroups', 'unknown', 'Unknown')}
                          </p>
                          <p className="text-sm text-gray-500">
                            {member.user_profile?.email || member.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                          {member.role || 'member'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Invites */}
            <div>
              <h4 className="font-medium mb-3">{t('adminMinistryGroups', 'pendingInvites', 'Pending Invites ({count})').replace('{count}', String(invites.length))}</h4>
              {invites.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('adminMinistryGroups', 'noPendingInvites', 'No pending invites')}</p>
              ) : (
                <div className="space-y-2">
                  {invites.map(invite => (
                    <div key={invite.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-xs text-gray-500">
                            {t('adminMinistryGroups', 'expires', 'Expires: {date}').replace('{date}', new Date(invite.expires_at).toLocaleDateString())}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvite(invite.id)}
                      >
                        {t('adminMinistryGroups', 'cancel', 'Cancel')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invite Link */}
            {selectedGroup?.invite_code && (
              <div className="p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  {t('adminMinistryGroups', 'shareableInviteLink', 'Shareable Invite Link')}
                </h4>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/join-ministry?code=${selectedGroup.invite_code}`}
                    className="bg-white"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyInviteLink(selectedGroup.invite_code)}
                  >
                    {copiedCode === selectedGroup.invite_code ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembersModal(false)}>
              {t('adminMinistryGroups', 'close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMinistryGroups;
