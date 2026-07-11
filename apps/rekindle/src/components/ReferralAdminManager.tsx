import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Users, TrendingUp, Award, Search, RefreshCw, 
  CheckCircle, Clock, XCircle, Gift, Crown,
  Calendar, ArrowUpRight, BarChart3
} from 'lucide-react';

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  totalXPDistributed: number;
  conversionRate: number;
  topReferrers: any[];
}

interface ReferralData {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  status: string;
  referred_at: string;
  activated_at: string | null;
  referrer?: { full_name: string; email: string };
  referred?: { full_name: string; email: string };
}

export const ReferralAdminManager: React.FC = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    activeReferrals: 0,
    pendingReferrals: 0,
    completedReferrals: 0,
    totalXPDistributed: 0,
    conversionRate: 0,
    topReferrers: []
  });
  
  const [referrals, setReferrals] = useState<ReferralData[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadReferrals(),
        loadRewards(),
        loadCodes()
      ]);
    } catch (error) {
      console.error('Error loading referral data:', error);
      toast({
        title: t('referralAdminManager', 'error', 'Error'),
        description: t('referralAdminManager', 'failedLoadData', 'Failed to load referral data'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    // Get overall stats
    const { data: referralData } = await supabase
      .from('referrals')
      .select('status');

    const total = referralData?.length || 0;
    const active = referralData?.filter(r => r.status === 'active').length || 0;
    const pending = referralData?.filter(r => r.status === 'pending').length || 0;
    const completed = referralData?.filter(r => r.status === 'completed').length || 0;

    // Get total XP distributed
    const { data: rewardsData } = await supabase
      .from('referral_rewards')
      .select('reward_value')
      .eq('reward_type', 'xp');

    const totalXP = rewardsData?.reduce((sum, reward) => {
      return sum + (reward.reward_value?.amount || 0);
    }, 0) || 0;

    // Get top referrers
    const { data: topReferrers } = await supabase
      .from('referrals')
      .select(`
        referrer_user_id,
        user_profiles!referrals_referrer_user_id_fkey(full_name, email)
      `);

    // Count referrals by user
    const referrerCounts: Record<string, any> = {};
    topReferrers?.forEach((ref: any) => {
      const userId = ref.referrer_user_id;
      if (!referrerCounts[userId]) {
        referrerCounts[userId] = {
          userId,
          name: ref.user_profiles?.full_name || t('referralAdminManager', 'unknown', 'Unknown'),
          email: ref.user_profiles?.email,
          count: 0
        };
      }
      referrerCounts[userId].count++;
    });

    const topList = Object.values(referrerCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    setStats({
      totalReferrals: total,
      activeReferrals: active,
      pendingReferrals: pending,
      completedReferrals: completed,
      totalXPDistributed: totalXP,
      conversionRate: total > 0 ? (active / total) * 100 : 0,
      topReferrers: topList
    });
  };

  const loadReferrals = async () => {
    const { data, error } = await supabase
      .from('referrals')
      .select(`
        *,
        referrer:user_profiles!referrals_referrer_user_id_fkey(full_name, email),
        referred:user_profiles!referrals_referred_user_id_fkey(full_name, email)
      `)
      .order('referred_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading referrals:', error);
      return;
    }

    setReferrals(data || []);
  };

  const loadRewards = async () => {
    const { data, error } = await supabase
      .from('referral_rewards')
      .select(`
        *,
        user_profiles(full_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading rewards:', error);
      return;
    }

    setRewards(data || []);
  };

  const loadCodes = async () => {
    const { data, error } = await supabase
      .from('referral_codes')
      .select(`
        *,
        user_profiles(full_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading codes:', error);
      return;
    }

    setCodes(data || []);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; icon: any }> = {
      active: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      completed: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
      expired: { color: 'bg-gray-100 text-gray-800', icon: XCircle }
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const filteredReferrals = referrals.filter(ref => {
    const searchLower = searchTerm.toLowerCase();
    return (
      ref.referrer?.full_name?.toLowerCase().includes(searchLower) ||
      ref.referrer?.email?.toLowerCase().includes(searchLower) ||
      ref.referred?.full_name?.toLowerCase().includes(searchLower) ||
      ref.referred?.email?.toLowerCase().includes(searchLower) ||
      ref.referral_code.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('referralAdminManager', 'referralSystem', 'Referral System')}</h2>
          <p className="text-gray-500">{t('referralAdminManager', 'referralSystemSubtitle', 'Manage referral codes, track conversions, and monitor rewards')}</p>
        </div>
        <Button onClick={loadAllData} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('referralAdminManager', 'refresh', 'Refresh')}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('referralAdminManager', 'totalReferrals', 'Total Referrals')}</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalReferrals}</p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('referralAdminManager', 'activeReferrals', 'Active Referrals')}</p>
                <p className="text-3xl font-bold text-green-600">{stats.activeReferrals}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('referralAdminManager', 'conversionRate', 'Conversion Rate')}</p>
                <p className="text-3xl font-bold text-blue-600">
                  {stats.conversionRate.toFixed(1)}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('referralAdminManager', 'totalXPDistributed', 'Total XP Distributed')}</p>
                <p className="text-3xl font-bold text-amber-600">{stats.totalXPDistributed}</p>
              </div>
              <Award className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('referralAdminManager', 'tabOverview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="referrals">{t('referralAdminManager', 'tabAllReferrals', 'All Referrals')}</TabsTrigger>
          <TabsTrigger value="rewards">{t('referralAdminManager', 'tabRewards', 'Rewards')}</TabsTrigger>
          <TabsTrigger value="codes">{t('referralAdminManager', 'tabReferralCodes', 'Referral Codes')}</TabsTrigger>
          <TabsTrigger value="leaderboard">{t('referralAdminManager', 'tabLeaderboard', 'Leaderboard')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('referralAdminManager', 'referralStatusBreakdown', 'Referral Status Breakdown')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium">{t('referralAdminManager', 'active', 'Active')}</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">
                    {stats.activeReferrals}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <span className="font-medium">{t('referralAdminManager', 'pending', 'Pending')}</span>
                  </div>
                  <span className="text-2xl font-bold text-yellow-600">
                    {stats.pendingReferrals}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">{t('referralAdminManager', 'completed', 'Completed')}</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">
                    {stats.completedReferrals}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('referralAdminManager', 'recentReferrals', 'Recent Referrals')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {referrals.slice(0, 5).map((ref) => (
                    <div key={ref.id} className="flex items-center justify-between p-2 border-b last:border-0">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {ref.referrer?.full_name || t('referralAdminManager', 'unknown', 'Unknown')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t('referralAdminManager', 'referredName', 'referred {name}').replace('{name}', ref.referred?.full_name || t('referralAdminManager', 'unknown', 'Unknown'))}
                        </p>
                      </div>
                      {getStatusBadge(ref.status)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* All Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('referralAdminManager', 'searchPlaceholder', 'Search by name, email, or code...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colReferrer', 'Referrer')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colReferredUser', 'Referred User')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colCode', 'Code')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colStatus', 'Status')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colReferredDate', 'Referred Date')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colActivatedDate', 'Activated Date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReferrals.map((ref) => (
                      <tr key={ref.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div>
                            <p className="font-medium">{ref.referrer?.full_name || t('referralAdminManager', 'unknown', 'Unknown')}</p>
                            <p className="text-sm text-gray-500">{ref.referrer?.email}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="font-medium">{ref.referred?.full_name || t('referralAdminManager', 'unknown', 'Unknown')}</p>
                            <p className="text-sm text-gray-500">{ref.referred?.email}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                            {ref.referral_code}
                          </code>
                        </td>
                        <td className="p-4">{getStatusBadge(ref.status)}</td>
                        <td className="p-4 text-sm text-gray-600">
                          {new Date(ref.referred_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          {ref.activated_at 
                            ? new Date(ref.activated_at).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rewards Tab */}
        <TabsContent value="rewards" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colUser', 'User')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colRewardType', 'Reward Type')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colAmount', 'Amount')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colStatus', 'Status')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colDate', 'Date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewards.map((reward) => (
                      <tr key={reward.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div>
                            <p className="font-medium">
                              {reward.user_profiles?.full_name || t('referralAdminManager', 'unknown', 'Unknown')}
                            </p>
                            <p className="text-sm text-gray-500">
                              {reward.user_profiles?.email}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="capitalize">
                            {reward.reward_type}
                          </Badge>
                        </td>
                        <td className="p-4 font-medium">
                          {reward.reward_value?.amount || 0}
                          {reward.reward_type === 'xp' && ' XP'}
                        </td>
                        <td className="p-4">
                          <Badge className={reward.claimed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                            {reward.claimed ? t('referralAdminManager', 'claimed', 'Claimed') : t('referralAdminManager', 'unclaimed', 'Unclaimed')}
                          </Badge>
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          {new Date(reward.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Codes Tab */}
        <TabsContent value="codes" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colUser', 'User')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colCode', 'Code')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colUses', 'Uses')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colMaxUses', 'Max Uses')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colExpires', 'Expires')}</th>
                      <th className="text-left p-4 font-medium">{t('referralAdminManager', 'colStatus', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((code) => (
                      <tr key={code.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div>
                            <p className="font-medium">
                              {code.user_profiles?.full_name || t('referralAdminManager', 'unknown', 'Unknown')}
                            </p>
                            <p className="text-sm text-gray-500">
                              {code.user_profiles?.email}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <code className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-mono">
                            {code.code}
                          </code>
                        </td>
                        <td className="p-4">{code.uses_count || 0}</td>
                        <td className="p-4">{code.max_uses || '∞'}</td>
                        <td className="p-4 text-sm text-gray-600">
                          {code.expires_at
                            ? new Date(code.expires_at).toLocaleDateString()
                            : t('referralAdminManager', 'never', 'Never')}
                        </td>
                        <td className="p-4">
                          <Badge className={code.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {code.is_active ? t('referralAdminManager', 'active', 'Active') : t('referralAdminManager', 'inactive', 'Inactive')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                {t('referralAdminManager', 'topReferrers', 'Top Referrers')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topReferrers.map((referrer, index) => (
                  <div 
                    key={referrer.userId}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        index === 0 ? 'bg-amber-100 text-amber-800' :
                        index === 1 ? 'bg-gray-100 text-gray-800' :
                        index === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-blue-50 text-blue-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{referrer.name}</p>
                        <p className="text-sm text-gray-500">{referrer.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-purple-600">
                        {referrer.count}
                      </p>
                      <p className="text-xs text-gray-500">{t('referralAdminManager', 'referralsLabel', 'referrals')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};