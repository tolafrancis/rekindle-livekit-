import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  HeartHandshake, Plus, Edit, Trash2, Search, Loader2, Users,
  UserPlus, X, Star,
} from 'lucide-react';

interface MinistryVolunteerTeamsManagerProps {
  ministryId: string;
}

interface VolunteerTeam {
  id: string;
  ministry_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface VolunteerAssignment {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  joined_at: string;
  user_full_name?: string;
  user_email?: string;
}

interface MemberOption {
  user_id: string;
  user_full_name?: string;
  user_email?: string;
}

export const MinistryVolunteerTeamsManager: React.FC<MinistryVolunteerTeamsManagerProps> = ({
  ministryId,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [teams, setTeams] = useState<VolunteerTeam[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<VolunteerTeam | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', is_active: true });

  const [showVolunteersModal, setShowVolunteersModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<VolunteerTeam | null>(null);
  const [assignments, setAssignments] = useState<VolunteerAssignment[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);

  useEffect(() => {
    loadTeams();
  }, [ministryId]);

  const loadTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_volunteer_teams')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTeams(data || []);

      const teamIds = (data || []).map((tm: VolunteerTeam) => tm.id);
      if (teamIds.length > 0) {
        const { data: assignData } = await supabase
          .from('ministry_volunteer_assignments')
          .select('team_id')
          .in('team_id', teamIds);

        const counts: Record<string, number> = {};
        assignData?.forEach((a: { team_id: string }) => {
          counts[a.team_id] = (counts[a.team_id] || 0) + 1;
        });
        setAssignmentCounts(counts);
      }
    } catch (err) {
      // Table may not exist yet if the migration hasn't been run — degrade to
      // an empty list rather than crashing the tab.
      console.error('Error loading volunteer teams:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from('ministry_volunteer_assignments')
        .select('*')
        .eq('team_id', teamId)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      const rows = data || [];
      const userIds = rows.map((r: any) => r.user_id);
      let profileByUserId: Record<string, MemberOption> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('ministry_members_with_profiles')
          .select('user_id, user_full_name, user_email')
          .eq('ministry_id', ministryId)
          .in('user_id', userIds);
        (profiles || []).forEach((p: MemberOption) => { profileByUserId[p.user_id] = p; });
      }

      setAssignments(rows.map((r: any) => ({
        ...r,
        user_full_name: profileByUserId[r.user_id]?.user_full_name || t('ministryVolunteerTeamsManager', 'unknownMember', 'Unknown member'),
        user_email: profileByUserId[r.user_id]?.user_email || '',
      })));
    } catch (err) {
      console.error('Error loading volunteer assignments:', err);
      setAssignments([]);
    }
  };

  const handleCreate = () => {
    setEditingTeam(null);
    setFormData({ name: '', description: '', is_active: true });
    setShowModal(true);
  };

  const handleEdit = (team: VolunteerTeam) => {
    setEditingTeam(team);
    setFormData({ name: team.name, description: team.description || '', is_active: team.is_active });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('ministryVolunteerTeamsManager', 'error', 'Error'), description: t('ministryVolunteerTeamsManager', 'nameRequired', 'Team name is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ministry_id: ministryId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        is_active: formData.is_active,
        created_by: user?.id,
      };

      if (editingTeam) {
        const { error } = await supabase
          .from('ministry_volunteer_teams')
          .update(dataToSave)
          .eq('id', editingTeam.id);
        if (error) throw error;
        toast({ title: t('ministryVolunteerTeamsManager', 'success', 'Success'), description: t('ministryVolunteerTeamsManager', 'teamUpdated', 'Team updated') });
      } else {
        const { error } = await supabase
          .from('ministry_volunteer_teams')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryVolunteerTeamsManager', 'success', 'Success'), description: t('ministryVolunteerTeamsManager', 'teamCreated', 'Team created') });
      }

      setShowModal(false);
      loadTeams();
    } catch (err: any) {
      toast({ title: t('ministryVolunteerTeamsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('ministryVolunteerTeamsManager', 'confirmDelete', 'Delete this team and all its volunteer assignments?'))) return;

    try {
      const { error } = await supabase.from('ministry_volunteer_teams').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryVolunteerTeamsManager', 'success', 'Success'), description: t('ministryVolunteerTeamsManager', 'teamDeleted', 'Team deleted') });
      loadTeams();
    } catch (err: any) {
      toast({ title: t('ministryVolunteerTeamsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleManageVolunteers = async (team: VolunteerTeam) => {
    setSelectedTeam(team);
    setMemberSearchTerm('');
    setMemberOptions([]);
    await loadAssignments(team.id);
    setShowVolunteersModal(true);
  };

  const searchMembers = async (query: string) => {
    setMemberSearchTerm(query);
    if (!query.trim() || !selectedTeam) {
      setMemberOptions([]);
      return;
    }
    setSearchingMembers(true);
    try {
      const { data, error } = await supabase
        .from('ministry_members_with_profiles')
        .select('user_id, user_full_name, user_email')
        .eq('ministry_id', ministryId)
        .or(`user_full_name.ilike.%${query}%,user_email.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      const assignedIds = new Set(assignments.map(a => a.user_id));
      setMemberOptions((data || []).filter((m: MemberOption) => !assignedIds.has(m.user_id)));
    } catch (err) {
      console.error('Error searching members:', err);
      setMemberOptions([]);
    } finally {
      setSearchingMembers(false);
    }
  };

  const handleAddVolunteer = async (member: MemberOption) => {
    if (!selectedTeam) return;
    try {
      const { error } = await supabase.from('ministry_volunteer_assignments').insert({
        team_id: selectedTeam.id,
        user_id: member.user_id,
        added_by: user?.id,
      });
      if (error) throw error;
      setMemberSearchTerm('');
      setMemberOptions([]);
      await loadAssignments(selectedTeam.id);
      loadTeams();
    } catch (err: any) {
      toast({ title: t('ministryVolunteerTeamsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveVolunteer = async (assignmentId: string) => {
    if (!selectedTeam) return;
    try {
      const { error } = await supabase.from('ministry_volunteer_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      await loadAssignments(selectedTeam.id);
      loadTeams();
    } catch (err: any) {
      toast({ title: t('ministryVolunteerTeamsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleLead = async (assignment: VolunteerAssignment) => {
    if (!selectedTeam) return;
    try {
      const nextRole = assignment.team_role === 'lead' ? 'member' : 'lead';
      const { error } = await supabase
        .from('ministry_volunteer_assignments')
        .update({ team_role: nextRole })
        .eq('id', assignment.id);
      if (error) throw error;
      await loadAssignments(selectedTeam.id);
    } catch (err: any) {
      toast({ title: t('ministryVolunteerTeamsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const filteredTeams = teams.filter(tm =>
    tm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tm.description && tm.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('ministryVolunteerTeamsManager', 'searchTeamsPlaceholder', 'Search teams...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-80"
          />
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('ministryVolunteerTeamsManager', 'createTeam', 'Create Team')}
        </Button>
      </div>

      {/* Teams Grid */}
      {filteredTeams.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <HeartHandshake className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">{t('ministryVolunteerTeamsManager', 'noTeams', 'No Volunteer Teams')}</h3>
            <p className="text-gray-500 mb-4">{t('ministryVolunteerTeamsManager', 'noTeamsSubtitle', 'Organize serving teams like ushers, media, or kids ministry')}</p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t('ministryVolunteerTeamsManager', 'createTeam', 'Create Team')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map(team => (
            <Card key={team.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{team.name}</h3>
                    {team.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 mt-1">{team.description}</p>
                    )}
                  </div>
                  <Badge variant={team.is_active ? 'default' : 'outline'}>
                    {team.is_active ? t('ministryVolunteerTeamsManager', 'active', 'Active') : t('ministryVolunteerTeamsManager', 'inactive', 'Inactive')}
                  </Badge>
                </div>

                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  {t('ministryVolunteerTeamsManager', 'xVolunteers', '{count} volunteers').replace('{count}', String(assignmentCounts[team.id] || 0))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleManageVolunteers(team)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    {t('ministryVolunteerTeamsManager', 'manageVolunteers', 'Manage Volunteers')}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(team)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(team.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Team Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTeam ? t('ministryVolunteerTeamsManager', 'editTeam', 'Edit Team') : t('ministryVolunteerTeamsManager', 'createTeam', 'Create Team')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryVolunteerTeamsManager', 'labelTeamName', 'Team Name *')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('ministryVolunteerTeamsManager', 'placeholderTeamName', 'e.g. Ushering Team, Media Team, Kids Ministry')}
              />
            </div>
            <div>
              <Label>{t('ministryVolunteerTeamsManager', 'labelDescription', 'Description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('ministryVolunteerTeamsManager', 'placeholderDescription', 'What does this team do?')}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
              />
              <Label>{t('ministryVolunteerTeamsManager', 'labelActive', 'Active')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('ministryVolunteerTeamsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingTeam ? t('ministryVolunteerTeamsManager', 'updateTeam', 'Update Team') : t('ministryVolunteerTeamsManager', 'createTeam', 'Create Team')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Volunteers Modal */}
      <Dialog open={showVolunteersModal} onOpenChange={setShowVolunteersModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('ministryVolunteerTeamsManager', 'volunteersForX', 'Volunteers: {team}').replace('{team}', String(selectedTeam?.name ?? ''))}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add member search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('ministryVolunteerTeamsManager', 'searchMembersPlaceholder', 'Search members to add by name or email...')}
                value={memberSearchTerm}
                onChange={(e) => searchMembers(e.target.value)}
                className="pl-10"
              />
              {searchingMembers && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
            </div>
            {memberOptions.length > 0 && (
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {memberOptions.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between p-2 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">{m.user_full_name || t('ministryVolunteerTeamsManager', 'unknownMember', 'Unknown member')}</p>
                      <p className="text-xs text-gray-500">{m.user_email}</p>
                    </div>
                    <Button size="sm" onClick={() => handleAddVolunteer(m)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t('ministryVolunteerTeamsManager', 'add', 'Add')}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Current roster */}
            {assignments.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">{t('ministryVolunteerTeamsManager', 'noVolunteersYet', 'No volunteers on this team yet')}</p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">{a.user_full_name}</p>
                      <p className="text-xs text-gray-500">{a.user_email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={a.team_role === 'lead' ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => handleToggleLead(a)}
                        title={t('ministryVolunteerTeamsManager', 'toggleLeadHint', 'Click to toggle Lead / Member')}
                      >
                        {a.team_role === 'lead' && <Star className="h-3 w-3 mr-1" />}
                        {a.team_role === 'lead' ? t('ministryVolunteerTeamsManager', 'lead', 'Lead') : t('ministryVolunteerTeamsManager', 'member', 'Member')}
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveVolunteer(a.id)}>
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowVolunteersModal(false)}>{t('ministryVolunteerTeamsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryVolunteerTeamsManager;
