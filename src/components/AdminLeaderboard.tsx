import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Trophy, Award, RefreshCw, Loader2, Search, Edit, Plus, Trash2,
  Users, Zap, Flame, Target, Crown
} from 'lucide-react';

interface UserStat {
  id: string;
  user_id: string;
  prayer_streak: number;
  longest_prayer_streak: number;
  xp_points: number;
  challenges_completed: number;
  disciples_mentored: number;
  prayers_said: number;
  devotionals_completed: number;
  user_profile?: {
    full_name: string;
    email: string;
  };
}

export const AdminLeaderboard: React.FC = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserStat | null>(null);
  const [formData, setFormData] = useState({
    xp_points: 0,
    prayer_streak: 0,
    challenges_completed: 0,
    disciples_mentored: 0
  });
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadStats();
    return () => { isMounted.current = false; };
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      
      const { data: statsData, error } = await supabase
        .from('user_stats')
        .select('*')
        .order('xp_points', { ascending: false });

      if (error) throw error;

      // Load user profiles
      const userIds = statsData?.map(s => s.user_id) || [];
      let profiles: any[] = [];
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        profiles = profilesData || [];
      }

      const enrichedStats = statsData?.map(stat => ({
        ...stat,
        user_profile: profiles.find(p => p.user_id === stat.user_id)
      })) || [];

      if (isMounted.current) {
        setStats(enrichedStats);
      }
    } catch (err: any) {
      console.error('Error loading stats:', err);
      toast({ title: t('adminLeaderboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleEdit = (stat: UserStat) => {
    setEditingUser(stat);
    setFormData({
      xp_points: stat.xp_points,
      prayer_streak: stat.prayer_streak,
      challenges_completed: stat.challenges_completed,
      disciples_mentored: stat.disciples_mentored
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingUser) return;

    try {
      const { error } = await supabase
        .from('user_stats')
        .update(formData)
        .eq('user_id', editingUser.user_id);

      if (error) throw error;

      toast({ title: t('adminLeaderboard', 'success', 'Success'), description: t('adminLeaderboard', 'statsUpdated', 'Stats updated successfully') });
      setShowModal(false);
      loadStats();
    } catch (err: any) {
      toast({ title: t('adminLeaderboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleResetStreak = async (userId: string) => {
    if (!confirm(t('adminLeaderboard', 'resetStreakConfirm', 'Reset prayer streak for this user?'))) return;

    try {
      const { error } = await supabase
        .from('user_stats')
        .update({ prayer_streak: 0 })
        .eq('user_id', userId);

      if (error) throw error;

      toast({ title: t('adminLeaderboard', 'success', 'Success'), description: t('adminLeaderboard', 'streakReset', 'Streak reset') });
      loadStats();
    } catch (err: any) {
      toast({ title: t('adminLeaderboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const filteredStats = stats.filter(stat => {
    const searchLower = searchTerm.toLowerCase();
    return (
      stat.user_profile?.full_name?.toLowerCase().includes(searchLower) ||
      stat.user_profile?.email?.toLowerCase().includes(searchLower)
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
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-yellow-500" />
            {t('adminLeaderboard', 'title', 'Leaderboard Management')}
          </h2>
          <p className="text-gray-600">{t('adminLeaderboard', 'subtitle', 'Manage user stats and rankings')}</p>
        </div>
        <Button variant="outline" onClick={loadStats}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('adminLeaderboard', 'refresh', 'Refresh')}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{stats.length}</p>
            <p className="text-xs text-gray-500">{t('adminLeaderboard', 'totalUsers', 'Total Users')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p className="text-2xl font-bold">
              {stats.reduce((sum, s) => sum + s.xp_points, 0).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{t('adminLeaderboard', 'totalXp', 'Total XP')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold">
              {Math.max(...stats.map(s => s.prayer_streak), 0)}
            </p>
            <p className="text-xs text-gray-500">{t('adminLeaderboard', 'longestStreak', 'Longest Streak')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">
              {stats.reduce((sum, s) => sum + s.challenges_completed, 0)}
            </p>
            <p className="text-xs text-gray-500">{t('adminLeaderboard', 'challengesDone', 'Challenges Done')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={t('adminLeaderboard', 'searchUsers', 'Search users...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'rank', 'Rank')}</th>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'user', 'User')}</th>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'xpPoints', 'XP Points')}</th>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'prayerStreak', 'Prayer Streak')}</th>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'challenges', 'Challenges')}</th>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'disciples', 'Disciples')}</th>
                  <th className="text-left p-4 font-medium">{t('adminLeaderboard', 'actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((stat, index) => (
                  <tr key={stat.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      {index + 1 === 1 && <Crown className="h-5 w-5 text-yellow-500" />}
                      {index + 1 === 2 && <Badge variant="secondary">{t('adminLeaderboard', 'secondPlace', '2nd')}</Badge>}
                      {index + 1 === 3 && <Badge variant="secondary">{t('adminLeaderboard', 'thirdPlace', '3rd')}</Badge>}
                      {index + 1 > 3 && <span className="text-gray-500">#{index + 1}</span>}
                    </td>
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{stat.user_profile?.full_name || t('adminLeaderboard', 'unknown', 'Unknown')}</p>
                        <p className="text-sm text-gray-500">{stat.user_profile?.email}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="default">{stat.xp_points}</Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <Flame className="h-3 w-3" />
                        {stat.prayer_streak}
                      </Badge>
                    </td>
                    <td className="p-4">{stat.challenges_completed}</td>
                    <td className="p-4">{stat.disciples_mentored}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(stat)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResetStreak(stat.user_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('adminLeaderboard', 'editUserStats', 'Edit User Stats')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('adminLeaderboard', 'xpPoints', 'XP Points')}</Label>
              <Input
                type="number"
                value={formData.xp_points}
                onChange={(e) => setFormData({ ...formData, xp_points: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>{t('adminLeaderboard', 'prayerStreak', 'Prayer Streak')}</Label>
              <Input
                type="number"
                value={formData.prayer_streak}
                onChange={(e) => setFormData({ ...formData, prayer_streak: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>{t('adminLeaderboard', 'challengesCompleted', 'Challenges Completed')}</Label>
              <Input
                type="number"
                value={formData.challenges_completed}
                onChange={(e) => setFormData({ ...formData, challenges_completed: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>{t('adminLeaderboard', 'disciplesMentored', 'Disciples Mentored')}</Label>
              <Input
                type="number"
                value={formData.disciples_mentored}
                onChange={(e) => setFormData({ ...formData, disciples_mentored: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('adminLeaderboard', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave}>{t('adminLeaderboard', 'saveChanges', 'Save Changes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLeaderboard;