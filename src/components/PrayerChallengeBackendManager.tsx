import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Settings, 
  Trash2, 
  Edit, 
  Eye, 
  EyeOff, 
  Users, 
  TrendingUp, 
  Calendar,
  Search,
  Filter,
  Download,
  Plus,
  Save,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from './ui/use-toast';

interface PrayerChallenge {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_days: number;
  prayer_points: string[];
  created_by: string;
  creator_name: string;
  is_active: boolean;
  session_type: string;
  instrumental_id?: string;
  created_at: string;
}

interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  user_name: string;
  completed_sessions: number;
  current_streak: number;
  joined_at: string;
  last_session_date: string;
}

interface ChallengeStats {
  total_participants: number;
  total_sessions: number;
  avg_completion_rate: number;
  active_today: number;
}

export const PrayerChallengeBackendManager: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [challenges, setChallenges] = useState<PrayerChallenge[]>([]);
  const [participants, setParticipants] = useState<ChallengeParticipant[]>([]);
  const [stats, setStats] = useState<Record<string, ChallengeStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedChallenge, setSelectedChallenge] = useState<PrayerChallenge | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<PrayerChallenge | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Form state for editing
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    duration_days: 7,
    prayer_points: [''],
    session_type: 'slides',
    instrumental_id: '',
    is_active: true
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch all challenges
      const { data: challengesData, error: challengesError } = await supabase
        .from('enhanced_prayer_challenges')
        .select('*')
        .order('created_at', { ascending: false });

      if (challengesError) throw challengesError;

      if (challengesData) {
        const parsed = challengesData.map(c => ({
          ...c,
          prayer_points: typeof c.prayer_points === 'string' 
            ? JSON.parse(c.prayer_points) 
            : c.prayer_points
        }));
        setChallenges(parsed);

        // Fetch stats for each challenge
        const statsPromises = parsed.map(async (challenge) => {
          const [participantsRes, sessionsRes] = await Promise.all([
            supabase
              .from('challenge_participants')
              .select('*', { count: 'exact' })
              .eq('challenge_id', challenge.id),
            supabase
              .from('challenge_session_logs')
              .select('*', { count: 'exact' })
              .eq('challenge_id', challenge.id)
          ]);

          const today = new Date().toISOString().split('T')[0];
          const activeToday = participantsRes.data?.filter(
            p => p.last_session_date === today
          ).length || 0;

          const avgCompletion = participantsRes.data && participantsRes.data.length > 0
            ? participantsRes.data.reduce((sum, p) => sum + p.completed_sessions, 0) / participantsRes.data.length
            : 0;

          return {
            challengeId: challenge.id,
            stats: {
              total_participants: participantsRes.count || 0,
              total_sessions: sessionsRes.count || 0,
              avg_completion_rate: avgCompletion,
              active_today: activeToday
            }
          };
        });

        const statsResults = await Promise.all(statsPromises);
        const statsMap: Record<string, ChallengeStats> = {};
        statsResults.forEach(({ challengeId, stats }) => {
          statsMap[challengeId] = stats;
        });
        setStats(statsMap);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: t('prayerChallengeBackendManager', 'error', 'Error'),
        description: t('prayerChallengeBackendManager', 'failedToLoadChallenges', 'Failed to load challenges'),
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const fetchParticipants = async (challengeId: string) => {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('*')
      .eq('challenge_id', challengeId)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('Error fetching participants:', error);
      return;
    }

    setParticipants(data || []);
  };

  const handleEditChallenge = (challenge: PrayerChallenge) => {
    setSelectedChallenge(challenge);
    setEditForm({
      title: challenge.title,
      description: challenge.description,
      category: challenge.category,
      duration_days: challenge.duration_days,
      prayer_points: challenge.prayer_points,
      session_type: challenge.session_type,
      instrumental_id: challenge.instrumental_id || '',
      is_active: challenge.is_active
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedChallenge) return;

    const { error } = await supabase
      .from('enhanced_prayer_challenges')
      .update({
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        duration_days: editForm.duration_days,
        prayer_points: JSON.stringify(editForm.prayer_points),
        session_type: editForm.session_type,
        instrumental_id: editForm.instrumental_id || null,
        is_active: editForm.is_active
      })
      .eq('id', selectedChallenge.id);

    if (error) {
      toast({
        title: t('prayerChallengeBackendManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: t('prayerChallengeBackendManager', 'success', 'Success'),
      description: t('prayerChallengeBackendManager', 'challengeUpdatedSuccessfully', 'Challenge updated successfully')
    });

    setEditMode(false);
    setSelectedChallenge(null);
    fetchAllData();
  };

  const handleCreateChallenge = () => {
    setEditForm({
      title: '',
      description: '',
      category: 'Healing',
      duration_days: 7,
      prayer_points: [''],
      session_type: 'slides',
      instrumental_id: '',
      is_active: true
    });
    setShowCreateDialog(true);
  };

  const handleSaveNewChallenge = async () => {
    // Validate required fields
    if (!editForm.title.trim()) {
      toast({
        title: t('prayerChallengeBackendManager', 'validationError', 'Validation Error'),
        description: t('prayerChallengeBackendManager', 'titleIsRequired', 'Title is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!editForm.description.trim()) {
      toast({
        title: t('prayerChallengeBackendManager', 'validationError', 'Validation Error'),
        description: t('prayerChallengeBackendManager', 'descriptionIsRequired', 'Description is required'),
        variant: 'destructive'
      });
      return;
    }

    if (editForm.prayer_points.filter(p => p.trim()).length === 0) {
      toast({
        title: t('prayerChallengeBackendManager', 'validationError', 'Validation Error'),
        description: t('prayerChallengeBackendManager', 'atLeastOnePrayerPointRequired', 'At least one prayer point is required'),
        variant: 'destructive'
      });
      return;
    }

    // Get user profile data
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('user_id', user?.id)
      .single();

    const creatorName = profile?.full_name || 'Admin';

    const { error } = await supabase
      .from('enhanced_prayer_challenges')
      .insert({
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        duration_days: editForm.duration_days,
        prayer_points: JSON.stringify(editForm.prayer_points.filter(p => p.trim())),
        session_type: editForm.session_type,
        instrumental_id: editForm.instrumental_id || null,
        is_active: editForm.is_active,
        created_by: user?.id,
        creator_name: creatorName
      });

    if (error) {
      toast({
        title: t('prayerChallengeBackendManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: t('prayerChallengeBackendManager', 'success', 'Success'),
      description: t('prayerChallengeBackendManager', 'challengeCreatedSuccessfully', 'Challenge created successfully')
    });

    setShowCreateDialog(false);
    fetchAllData();
  };

  const handleToggleActive = async (challenge: PrayerChallenge) => {
    const { error } = await supabase
      .from('enhanced_prayer_challenges')
      .update({ is_active: !challenge.is_active })
      .eq('id', challenge.id);

    if (error) {
      toast({
        title: t('prayerChallengeBackendManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: t('prayerChallengeBackendManager', 'success', 'Success'),
      description: !challenge.is_active
        ? t('prayerChallengeBackendManager', 'challengeActivated', 'Challenge activated')
        : t('prayerChallengeBackendManager', 'challengeDeactivated', 'Challenge deactivated')
    });

    fetchAllData();
  };

  const handleDeleteChallenge = async () => {
    if (!challengeToDelete) return;

    // Delete associated data first
    await supabase
      .from('challenge_session_logs')
      .delete()
      .eq('challenge_id', challengeToDelete.id);

    await supabase
      .from('challenge_participants')
      .delete()
      .eq('challenge_id', challengeToDelete.id);

    // Delete the challenge
    const { error } = await supabase
      .from('enhanced_prayer_challenges')
      .delete()
      .eq('id', challengeToDelete.id);

    if (error) {
      toast({
        title: t('prayerChallengeBackendManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: t('prayerChallengeBackendManager', 'success', 'Success'),
      description: t('prayerChallengeBackendManager', 'challengeDeletedSuccessfully', 'Challenge deleted successfully')
    });

    setShowDeleteDialog(false);
    setChallengeToDelete(null);
    fetchAllData();
  };

  const handleViewDetails = (challenge: PrayerChallenge) => {
    setSelectedChallenge(challenge);
    fetchParticipants(challenge.id);
  };

  const exportToCSV = () => {
    const csvData = challenges.map(c => ({
      Title: c.title,
      Category: c.category,
      Status: c.is_active ? 'Active' : 'Inactive',
      Participants: stats[c.id]?.total_participants || 0,
      'Total Sessions': stats[c.id]?.total_sessions || 0,
      'Created At': new Date(c.created_at).toLocaleDateString(),
      Creator: c.creator_name
    }));

    const headers = Object.keys(csvData[0] || {}).join(',');
    const rows = csvData.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prayer-challenges-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const addPrayerPoint = () => {
    setEditForm({
      ...editForm,
      prayer_points: [...editForm.prayer_points, '']
    });
  };

  const removePrayerPoint = (index: number) => {
    setEditForm({
      ...editForm,
      prayer_points: editForm.prayer_points.filter((_, i) => i !== index)
    });
  };

  const updatePrayerPoint = (index: number, value: string) => {
    const updated = [...editForm.prayer_points];
    updated[index] = value;
    setEditForm({ ...editForm, prayer_points: updated });
  };

  // Filter challenges
  const filteredChallenges = challenges.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         c.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && c.is_active) ||
                         (filterStatus === 'inactive' && !c.is_active);
    const matchesCategory = filterCategory === 'all' || c.category === filterCategory;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('prayerChallengeBackendManager', 'loadingChallenges', 'Loading challenges...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8 text-purple-600" />
            {t('prayerChallengeBackendManager', 'prayerChallengesManager', 'Prayer Challenges Manager')}
          </h1>
          <p className="text-gray-600 mt-1">{t('prayerChallengeBackendManager', 'manageAllChallengesSubtitle', 'Manage all prayer challenges and track engagement')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreateChallenge} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" />
            {t('prayerChallengeBackendManager', 'createChallenge', 'Create Challenge')}
          </Button>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {t('prayerChallengeBackendManager', 'exportCsv', 'Export CSV')}
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'totalChallenges', 'Total Challenges')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{challenges.length}</div>
            <p className="text-xs text-gray-500 mt-1">
              {t('prayerChallengeBackendManager', 'xActive', '{count} active').replace('{count}', String(challenges.filter(c => c.is_active).length))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'totalParticipants', 'Total Participants')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Object.values(stats).reduce((sum, s) => sum + s.total_participants, 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('prayerChallengeBackendManager', 'acrossAllChallenges', 'Across all challenges')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'totalSessions', 'Total Sessions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Object.values(stats).reduce((sum, s) => sum + s.total_sessions, 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('prayerChallengeBackendManager', 'prayerSessionsCompleted', 'Prayer sessions completed')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'activeToday', 'Active Today')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Object.values(stats).reduce((sum, s) => sum + s.active_today, 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('prayerChallengeBackendManager', 'usersPrayingToday', 'Users praying today')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('prayerChallengeBackendManager', 'searchChallengesPlaceholder', 'Search challenges...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('prayerChallengeBackendManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="active">{t('prayerChallengeBackendManager', 'activeOnly', 'Active Only')}</SelectItem>
                <SelectItem value="inactive">{t('prayerChallengeBackendManager', 'inactiveOnly', 'Inactive Only')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('prayerChallengeBackendManager', 'allCategories', 'All Categories')}</SelectItem>
                <SelectItem value="Healing">Healing</SelectItem>
                <SelectItem value="Thanksgiving">Thanksgiving</SelectItem>
                <SelectItem value="Revival">Revival</SelectItem>
                <SelectItem value="Intercession">Intercession</SelectItem>
                <SelectItem value="Worship">Worship</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Challenges List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('prayerChallengeBackendManager', 'allChallengesCount', 'All Challenges ({count})').replace('{count}', String(filteredChallenges.length))}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredChallenges.map((challenge) => (
              <div
                key={challenge.id}
                className="border rounded-lg p-4 hover:border-purple-300 transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{challenge.title}</h3>
                          <Badge variant={challenge.is_active ? "default" : "secondary"}>
                            {challenge.is_active ? t('prayerChallengeBackendManager', 'active', 'Active') : t('prayerChallengeBackendManager', 'inactive', 'Inactive')}
                          </Badge>
                          <Badge variant="outline">{challenge.category}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{challenge.description}</p>
                        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {t('prayerChallengeBackendManager', 'xParticipants', '{count} participants').replace('{count}', String(stats[challenge.id]?.total_participants || 0))}
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {t('prayerChallengeBackendManager', 'xSessions', '{count} sessions').replace('{count}', String(stats[challenge.id]?.total_sessions || 0))}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {t('prayerChallengeBackendManager', 'xDays', '{count} days').replace('{count}', String(challenge.duration_days))}
                          </span>
                          <span>
                            {t('prayerChallengeBackendManager', 'createdByX', 'Created by {name}').replace('{name}', challenge.creator_name)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewDetails(challenge)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t('prayerChallengeBackendManager', 'view', 'View')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditChallenge(challenge)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      {t('prayerChallengeBackendManager', 'edit', 'Edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(challenge)}
                    >
                      {challenge.is_active ? (
                        <><EyeOff className="h-4 w-4 mr-1" />{t('prayerChallengeBackendManager', 'deactivate', 'Deactivate')}</>
                      ) : (
                        <><Eye className="h-4 w-4 mr-1" />{t('prayerChallengeBackendManager', 'activate', 'Activate')}</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setChallengeToDelete(challenge);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {filteredChallenges.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('prayerChallengeBackendManager', 'noChallengesFound', 'No challenges found matching your filters')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={selectedChallenge !== null && !editMode} onOpenChange={(open) => !open && setSelectedChallenge(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedChallenge?.title}</DialogTitle>
            <DialogDescription>{selectedChallenge?.description}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">{t('prayerChallengeBackendManager', 'details', 'Details')}</TabsTrigger>
              <TabsTrigger value="participants">{t('prayerChallengeBackendManager', 'participants', 'Participants')}</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'category', 'Category')}</label>
                  <p className="text-sm">{selectedChallenge?.category}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'duration', 'Duration')}</label>
                  <p className="text-sm">{t('prayerChallengeBackendManager', 'xDays', '{count} days').replace('{count}', String(selectedChallenge?.duration_days))}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'sessionType', 'Session Type')}</label>
                  <p className="text-sm">{selectedChallenge?.session_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'status', 'Status')}</label>
                  <p className="text-sm">{selectedChallenge?.is_active ? t('prayerChallengeBackendManager', 'active', 'Active') : t('prayerChallengeBackendManager', 'inactive', 'Inactive')}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'prayerPoints', 'Prayer Points')}</label>
                <ul className="mt-2 space-y-2">
                  {selectedChallenge?.prayer_points.map((point, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'totalParticipants', 'Total Participants')}</label>
                  <p className="text-2xl font-bold">{stats[selectedChallenge?.id || '']?.total_participants || 0}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">{t('prayerChallengeBackendManager', 'totalSessions', 'Total Sessions')}</label>
                  <p className="text-2xl font-bold">{stats[selectedChallenge?.id || '']?.total_sessions || 0}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="participants" className="space-y-4">
              {participants.length === 0 ? (
                <p className="text-center text-gray-500 py-8">{t('prayerChallengeBackendManager', 'noParticipantsYet', 'No participants yet')}</p>
              ) : (
                <div className="space-y-2">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{participant.user_name}</p>
                        <p className="text-xs text-gray-500">
                          {t('prayerChallengeBackendManager', 'joinedX', 'Joined {date}').replace('{date}', new Date(participant.joined_at).toLocaleDateString())}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {t('prayerChallengeBackendManager', 'xSessions', '{count} sessions').replace('{count}', String(participant.completed_sessions))}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t('prayerChallengeBackendManager', 'xDayStreak', '{count} day streak').replace('{count}', String(participant.current_streak))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editMode} onOpenChange={(open) => !open && setEditMode(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('prayerChallengeBackendManager', 'editChallenge', 'Edit Challenge')}</DialogTitle>
            <DialogDescription>{t('prayerChallengeBackendManager', 'updateChallengeDetails', 'Update challenge details')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'title', 'Title')}</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder={t('prayerChallengeBackendManager', 'challengeTitlePlaceholder', 'Challenge title')}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'description', 'Description')}</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder={t('prayerChallengeBackendManager', 'challengeDescriptionPlaceholder', 'Challenge description')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'category', 'Category')}</label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Healing">Healing</SelectItem>
                    <SelectItem value="Thanksgiving">Thanksgiving</SelectItem>
                    <SelectItem value="Revival">Revival</SelectItem>
                    <SelectItem value="Intercession">Intercession</SelectItem>
                    <SelectItem value="Worship">Worship</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'durationDays', 'Duration (days)')}</label>
                <Input
                  type="number"
                  value={editForm.duration_days}
                  onChange={(e) => setEditForm({ ...editForm, duration_days: parseInt(e.target.value) })}
                  min={1}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'sessionType', 'Session Type')}</label>
              <Select value={editForm.session_type} onValueChange={(v) => setEditForm({ ...editForm, session_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slides">{t('prayerChallengeBackendManager', 'slides', 'Slides')}</SelectItem>
                  <SelectItem value="list">{t('prayerChallengeBackendManager', 'list', 'List')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('prayerChallengeBackendManager', 'prayerPoints', 'Prayer Points')}</label>
              <div className="space-y-2">
                {editForm.prayer_points.map((point, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={point}
                      onChange={(e) => updatePrayerPoint(idx, e.target.value)}
                      placeholder={t('prayerChallengeBackendManager', 'prayerPointX', 'Prayer point {num}').replace('{num}', String(idx + 1))}
                    />
                    {editForm.prayer_points.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePrayerPoint(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPrayerPoint}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('prayerChallengeBackendManager', 'addPrayerPoint', 'Add Prayer Point')}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="is_active" className="text-sm font-medium">
                {t('prayerChallengeBackendManager', 'active', 'Active')}
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>
              {t('prayerChallengeBackendManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>
              <Save className="h-4 w-4 mr-2" />
              {t('prayerChallengeBackendManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Challenge Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('prayerChallengeBackendManager', 'createNewChallenge', 'Create New Challenge')}</DialogTitle>
            <DialogDescription>{t('prayerChallengeBackendManager', 'createNewChallengeSubtitle', 'Create a new prayer challenge for your community')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'titleRequired', 'Title *')}</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder={t('prayerChallengeBackendManager', 'titleExamplePlaceholder', '30 Days of Healing Prayer')}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'descriptionRequired', 'Description *')}</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder={t('prayerChallengeBackendManager', 'descriptionExamplePlaceholder', 'Join us for 30 days of focused prayer for healing...')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'categoryRequired', 'Category *')}</label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Healing">Healing</SelectItem>
                    <SelectItem value="Thanksgiving">Thanksgiving</SelectItem>
                    <SelectItem value="Revival">Revival</SelectItem>
                    <SelectItem value="Intercession">Intercession</SelectItem>
                    <SelectItem value="Worship">Worship</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'durationDaysRequired', 'Duration (days) *')}</label>
                <Input
                  type="number"
                  value={editForm.duration_days}
                  onChange={(e) => setEditForm({ ...editForm, duration_days: parseInt(e.target.value) })}
                  min={1}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'sessionTypeRequired', 'Session Type *')}</label>
              <Select value={editForm.session_type} onValueChange={(v) => setEditForm({ ...editForm, session_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slides">{t('prayerChallengeBackendManager', 'slides', 'Slides')}</SelectItem>
                  <SelectItem value="list">{t('prayerChallengeBackendManager', 'list', 'List')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('prayerChallengeBackendManager', 'prayerPointsRequired', 'Prayer Points *')}</label>
              <div className="space-y-2">
                {editForm.prayer_points.map((point, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={point}
                      onChange={(e) => updatePrayerPoint(idx, e.target.value)}
                      placeholder={t('prayerChallengeBackendManager', 'prayerPointX', 'Prayer point {num}').replace('{num}', String(idx + 1))}
                    />
                    {editForm.prayer_points.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePrayerPoint(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPrayerPoint}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('prayerChallengeBackendManager', 'addPrayerPoint', 'Add Prayer Point')}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t('prayerChallengeBackendManager', 'backgroundMusicIdOptional', 'Background Music ID (Optional)')}</label>
              <Input
                value={editForm.instrumental_id}
                onChange={(e) => setEditForm({ ...editForm, instrumental_id: e.target.value })}
                placeholder={t('prayerChallengeBackendManager', 'enterMusicIdPlaceholder', 'Enter music ID')}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('prayerChallengeBackendManager', 'backgroundMusicIdHelp', 'ID of background music from your music library')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="create_is_active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="create_is_active" className="text-sm font-medium">
                {t('prayerChallengeBackendManager', 'activeVisibleToUsers', 'Active (Visible to users)')}
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('prayerChallengeBackendManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSaveNewChallenge} className="bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4 mr-2" />
              {t('prayerChallengeBackendManager', 'createChallenge', 'Create Challenge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('prayerChallengeBackendManager', 'deleteChallenge', 'Delete Challenge')}</DialogTitle>
            <DialogDescription>
              {t('prayerChallengeBackendManager', 'deleteChallengeConfirm', 'Are you sure you want to delete "{title}"? This will also delete all participant data and session logs. This action cannot be undone.').replace('{title}', challengeToDelete?.title || '')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('prayerChallengeBackendManager', 'cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteChallenge}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('prayerChallengeBackendManager', 'delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};