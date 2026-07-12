// src/components/ReferralSystem.tsx
// Complete referral system with dashboard, stats, and rewards

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateReferralCode,
  getUserReferralCodes,
  getUserReferrals,
  getReferralStats,
  getUserRewards,
  getUserMilestones,
  claimReward,
  claimAllRewards,
  claimMilestone,
  copyReferralLink,
  shareReferral,
  formatRewardValue,
  getMilestoneInfo,
  type ReferralCode,
  type Referral,
  type ReferralStats,
  type ReferralReward,
  type ReferralMilestone,
} from '@/lib/referralService';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  Share2,
  Users,
  TrendingUp,
  Gift,
  Award,
  CheckCircle,
  Clock,
  Sparkles,
  Link as LinkIcon,
  QrCode,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

export const ReferralSystem: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [milestones, setMilestones] = useState<ReferralMilestone[]>([]);
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (user) {
      loadReferralData();
    }
  }, [user]);

  const loadReferralData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Load referral code
      const { code, error: codeError } = await generateReferralCode(user.id);
      if (codeError) {
        console.error('Code error:', codeError);
      } else {
        setReferralCode(code);
      }

      // Load stats
      const { stats: statsData, error: statsError } = await getReferralStats(user.id);
      if (statsError) {
        console.error('Stats error:', statsError);
      } else {
        setStats(statsData);
      }

      // Load referrals
      const { referrals: referralData, error: refError } = await getUserReferrals(user.id);
      if (refError) {
        console.error('Referrals error:', refError);
      } else {
        setReferrals(referralData);
      }

      // Load rewards
      const { rewards: rewardData, error: rewardError } = await getUserRewards(user.id);
      if (rewardError) {
        console.error('Rewards error:', rewardError);
      } else {
        setRewards(rewardData);
      }

      // Load milestones
      const { milestones: milestoneData, error: milestoneError } = await getUserMilestones(user.id);
      if (milestoneError) {
        console.error('Milestones error:', milestoneError);
      } else {
        setMilestones(milestoneData);
      }
    } catch (error) {
      console.error('Load referral data error:', error);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!referralCode) return;

    const success = await copyReferralLink(referralCode.code);
    if (success) {
      setCopied(true);
      toast.success('Referral link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (!referralCode || !user) return;

    const success = await shareReferral(referralCode.code, user.user_metadata?.full_name);
    if (!success) {
      // Fallback to copy if share API not available
      handleCopyLink();
    }
  };

  const handleClaimReward = async (rewardId: string) => {
    if (!user) return;

    setClaiming(true);
    const { success, error } = await claimReward(rewardId, user.id);
    
    if (success) {
      toast.success('Reward claimed successfully!');
      loadReferralData();
    } else {
      toast.error(error || 'Failed to claim reward');
    }
    setClaiming(false);
  };

  const handleClaimAllRewards = async () => {
    if (!user) return;

    setClaiming(true);
    const { count, totalXP, error } = await claimAllRewards(user.id);
    
    if (error) {
      toast.error(error);
    } else if (count > 0) {
      toast.success(`Claimed ${count} rewards! +${totalXP} XP`);
      loadReferralData();
    } else {
      toast.info('No rewards to claim');
    }
    setClaiming(false);
  };

  const handleClaimMilestone = async (milestoneId: string) => {
    if (!user) return;

    setClaiming(true);
    const { success, error } = await claimMilestone(milestoneId, user.id);
    
    if (success) {
      toast.success('Milestone reward claimed!');
      loadReferralData();
    } else {
      toast.error(error || 'Failed to claim milestone');
    }
    setClaiming(false);
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  const unclaimedRewards = rewards.filter(r => !r.is_claimed);
  const unclaimedMilestones = milestones.filter(m => !m.is_claimed);

  return (
    <div className="space-y-6">
      {/* Header with Share Card */}
      <Card className="bg-gradient-to-br from-purple-600 to-purple-800 text-white border-none">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            Share Your Faith
          </CardTitle>
          <CardDescription className="text-purple-100">
            Invite others to begin their spiritual journey with Rekindle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Referral Code Display */}
          {referralCode && (
            <div className="bg-white/20 backdrop-blur rounded-lg p-6 space-y-4">
              <div className="text-center">
                <p className="text-sm opacity-90 mb-2">Your Referral Code</p>
                <p className="text-4xl font-bold tracking-wider mb-4">{referralCode.code}</p>
                
                {/* Action Buttons */}
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={handleCopyLink}
                    variant="secondary"
                    className="flex-1 max-w-xs"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleShare}
                    variant="secondary"
                    className="flex-1 max-w-xs"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
                <div className="text-center">
                  <p className="text-3xl font-bold">{stats?.totalReferrals || 0}</p>
                  <p className="text-sm opacity-90">Referred</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{stats?.activeReferrals || 0}</p>
                  <p className="text-sm opacity-90">Active</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{stats?.totalXPEarned || 0}</p>
                  <p className="text-sm opacity-90">XP Earned</p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          {stats && stats.conversionRate > 0 && (
            <Alert className="bg-white/10 border-white/20 text-white">
              <TrendingUp className="w-4 h-4" />
              <AlertDescription>
                Your referral conversion rate is {stats.conversionRate.toFixed(1)}% - Keep sharing!
              </AlertDescription>
            </Alert>
          )}

          {/* Unclaimed Rewards Alert */}
          {unclaimedRewards.length > 0 && (
            <Alert className="bg-amber-500/20 border-amber-400 text-white">
              <Gift className="w-4 h-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>You have {unclaimedRewards.length} unclaimed rewards!</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleClaimAllRewards}
                  disabled={claiming}
                >
                  Claim All
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <Users className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="referrals">
            <UserPlus className="w-4 h-4 mr-2" />
            Referrals
          </TabsTrigger>
          <TabsTrigger value="rewards">
            <Gift className="w-4 h-4 mr-2" />
            Rewards {unclaimedRewards.length > 0 && (
              <Badge className="ml-2" variant="destructive">{unclaimedRewards.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="milestones">
            <Award className="w-4 h-4 mr-2" />
            Milestones
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Referrals"
              value={stats?.totalReferrals || 0}
              icon={<Users className="w-4 h-4" />}
              description="Friends invited"
            />
            <StatCard
              title="Active Users"
              value={stats?.activeReferrals || 0}
              icon={<CheckCircle className="w-4 h-4 text-green-500" />}
              description="Currently active"
            />
            <StatCard
              title="Total XP"
              value={stats?.totalXPEarned || 0}
              icon={<Sparkles className="w-4 h-4 text-yellow-500" />}
              description="Experience earned"
            />
            <StatCard
              title="Conversion Rate"
              value={`${(stats?.conversionRate || 0).toFixed(1)}%`}
              icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
              description="Activation rate"
            />
          </div>

          {/* Progress to Next Milestone */}
          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Progress to Next Milestone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MilestoneProgress
                  current={stats.totalReferrals}
                  target={5}
                  label="5 Referrals"
                  reward="250 XP"
                />
                <MilestoneProgress
                  current={stats.totalReferrals}
                  target={10}
                  label="10 Referrals"
                  reward="500 XP"
                />
                <MilestoneProgress
                  current={stats.activeReferrals}
                  target={5}
                  label="5 Active Referrals"
                  reward="Community Builder Badge"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4">
          {referrals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UserPlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Referrals Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start inviting friends to grow your spiritual community
                </p>
                <Button onClick={handleCopyLink}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Referral Link
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {referrals.map((referral) => (
                <ReferralCard key={referral.id} referral={referral} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Rewards Tab */}
        <TabsContent value="rewards" className="space-y-4">
          {rewards.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Gift className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Rewards Yet</h3>
                <p className="text-muted-foreground">
                  Invite friends to start earning rewards
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {rewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  reward={reward}
                  onClaim={() => handleClaimReward(reward.id)}
                  claiming={claiming}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Milestones Tab */}
        <TabsContent value="milestones" className="space-y-4">
          {milestones.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Milestones Yet</h3>
                <p className="text-muted-foreground">
                  Reach milestones by referring more friends
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  onClaim={() => handleClaimMilestone(milestone.id)}
                  claiming={claiming}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================
// SUB-COMPONENTS
// ============================================

const StatCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description: string;
}> = ({ title, value, icon, description }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const MilestoneProgress: React.FC<{
  current: number;
  target: number;
  label: string;
  reward: string;
}> = ({ current, target, label, reward }) => {
  const progress = Math.min((current / target) * 100, 100);
  const remaining = Math.max(target - current, 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {current}/{target} {remaining > 0 && `(${remaining} more)`}
        </span>
      </div>
      <Progress value={progress} className="h-2" />
      <p className="text-xs text-muted-foreground">Reward: {reward}</p>
    </div>
  );
};

const ReferralCard: React.FC<{ referral: Referral }> = ({ referral }) => {
  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-yellow-500', icon: Clock },
    active: { label: 'Active', color: 'bg-green-500', icon: CheckCircle },
    completed: { label: 'Completed', color: 'bg-blue-500', icon: Award },
    expired: { label: 'Expired', color: 'bg-gray-500', icon: Clock },
  };

  const config = statusConfig[referral.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="font-medium">
              {referral.referred_profile?.full_name || 'New User'}
            </p>
            <p className="text-sm text-muted-foreground">
              Joined {new Date(referral.referred_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Badge className={`${config.color} text-white`}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {config.label}
        </Badge>
      </CardContent>
    </Card>
  );
};

const RewardCard: React.FC<{
  reward: ReferralReward;
  onClaim: () => void;
  claiming: boolean;
}> = ({ reward, onClaim, claiming }) => {
  const rewardIcons = {
    xp: Sparkles,
    badge: Award,
    premium_days: Gift,
    points: TrendingUp,
  };

  const RewardIcon = rewardIcons[reward.reward_type] || Gift;

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <RewardIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-medium">{formatRewardValue(reward)}</p>
            <p className="text-sm text-muted-foreground">
              Earned {new Date(reward.awarded_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        {!reward.is_claimed ? (
          <Button size="sm" onClick={onClaim} disabled={claiming}>
            Claim
          </Button>
        ) : (
          <Badge variant="secondary">
            <CheckCircle className="w-3 h-3 mr-1" />
            Claimed
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

const MilestoneCard: React.FC<{
  milestone: ReferralMilestone;
  onClaim: () => void;
  claiming: boolean;
}> = ({ milestone, onClaim, claiming }) => {
  const info = getMilestoneInfo(milestone);

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <div className="text-4xl">{info.icon}</div>
          <div>
            <p className="font-medium">{info.title}</p>
            <p className="text-sm text-muted-foreground">{info.description}</p>
            {milestone.reward_type && (
              <p className="text-sm font-medium text-purple-600 mt-1">
                Reward: {milestone.reward_type === 'xp'
                  ? `${milestone.reward_value?.amount} XP`
                  : milestone.reward_value?.badge_id}
              </p>
            )}
          </div>
        </div>
        {!milestone.is_claimed ? (
          <Button size="sm" onClick={onClaim} disabled={claiming}>
            Claim
          </Button>
        ) : (
          <Badge variant="secondary">
            <CheckCircle className="w-3 h-3 mr-1" />
            Claimed
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </CardContent>
    </Card>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  </div>
);

export default ReferralSystem;