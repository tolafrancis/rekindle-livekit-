// =====================================================
// ADMIN SUBSCRIPTION MANAGER
// Comprehensive subscription management for administrators
// =====================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getAllSubscriptionTiers,
  adminAssignSubscription,
  adminUpgradeSubscription,
  adminDowngradeSubscription,
  adminCancelSubscription,
  adminExtendSubscription,
  getUserActiveSubscription,
  getSubscriptionStats,
  type SubscriptionTier,
  type UserSubscription
} from '@/lib/subscriptionEnforcement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Crown, 
  Users, 
  Calendar, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  XCircle,
  Shield,
  Search,
  Filter,
  Download,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Loader2
} from 'lucide-react';

interface AdminSubscriptionManagerProps {
  isSuperAdmin: boolean;
}

export const AdminSubscriptionManager: React.FC<AdminSubscriptionManagerProps> = ({ isSuperAdmin }) => {
  const { toast } = useToast();
  const { t } = useLanguage();

  // State
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchType, setSearchType] = useState<'email' | 'user_id'>('email');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Form state
  const [assignData, setAssignData] = useState({
    tierSlug: 'free',
    expiresAt: '',
    reason: '',
    notes: ''
  });
  const [extendData, setExtendData] = useState({
    newExpiryDate: '',
    reason: ''
  });

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tiersData, statsData] = await Promise.all([
        getAllSubscriptionTiers(),
        getSubscriptionStats()
      ]);
      
      setTiers(tiersData);
      setStats(statsData);
    } catch (error) {
      console.error('[AdminSubscription] Error loading data:', error);
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: t('adminSubscriptionManager', 'failedLoadData', 'Failed to load subscription data'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Initialize all subscription tiers (one-time setup)
  const initializeAllTiers = async () => {
    try {
      setActionLoading(true);
      
      const tierDefinitions = [
        {
          slug: 'free',
          name: 'Free',
          description: 'Basic features for personal use',
          price_monthly: 0,
          price_yearly: 0,
          display_order: 1,
          is_active: true,
          features: {
            max_journal_entries: 10,
            devotional_library_access_level: 'limited',
            prayer_library_access_level: 'limited',
            prayer_wall_access_level: 'view_only',
            max_scripture_memory_verses: 5,
            can_access_book_summaries: false,
            can_book_counsellor: false,
            can_share_revelations: false,
            can_create_live_channel: false,
            max_live_channels: 0,
            can_access_replays: false,
            max_replay_access: 0
          }
        },
        {
          slug: 'premium',
          name: 'Premium',
          description: 'Enhanced features for deeper spiritual growth',
          price_monthly: 9.99,
          price_yearly: 99.99,
          display_order: 2,
          is_active: true,
          features: {
            max_journal_entries: 50,
            devotional_library_access_level: 'unlimited',
            prayer_library_access_level: 'unlimited',
            prayer_wall_access_level: 'unlimited',
            max_scripture_memory_verses: null,
            can_access_book_summaries: true,
            can_book_counsellor: true,
            can_share_revelations: true,
            can_create_live_channel: true,
            max_live_channels: 1,
            can_access_replays: false,
            max_replay_access: 0,
            can_access_counsellor_dashboard: true
          }
        },
        {
          slug: 'premium-plus',
          name: 'Premium Plus',
          description: 'All Premium features plus replay access',
          price_monthly: 19.99,
          price_yearly: 199.99,
          display_order: 3,
          is_active: true,
          features: {
            max_journal_entries: 100,
            devotional_library_access_level: 'unlimited',
            prayer_library_access_level: 'unlimited',
            prayer_wall_access_level: 'unlimited',
            max_scripture_memory_verses: null,
            can_access_book_summaries: true,
            can_book_counsellor: true,
            can_share_revelations: true,
            can_create_live_channel: true,
            max_live_channels: 3,
            can_access_replays: true,
            max_replay_access: 5,
            can_schedule_recurring_sessions: true,
            can_access_counsellor_dashboard: true
          }
        },
        {
          slug: 'ministry',
          name: 'Ministry',
          description: 'For church leaders and ministry organizations',
          price_monthly: 49.99,
          price_yearly: 499.99,
          display_order: 4,
          is_active: true,
          features: {
            max_journal_entries: 100,
            devotional_library_access_level: 'unlimited',
            prayer_library_access_level: 'unlimited',
            prayer_wall_access_level: 'unlimited',
            max_scripture_memory_verses: null,
            can_access_book_summaries: true,
            can_book_counsellor: true,
            can_share_revelations: true,
            can_create_live_channel: true,
            max_live_channels: 3,
            can_access_replays: true,
            max_replay_access: 10,
            can_schedule_recurring_sessions: true,
            can_use_broadcast_messaging: true,
            can_access_analytics: true,
            can_export_data: true,
            can_access_counsellor_dashboard: true
          }
        },
        {
          slug: 'ministry-plus',
          name: 'Ministry Plus',
          description: 'Unlimited features for growing ministries',
          price_monthly: 99.99,
          price_yearly: 999.99,
          display_order: 5,
          is_active: true,
          features: {
            max_journal_entries: null,
            devotional_library_access_level: 'unlimited',
            prayer_library_access_level: 'unlimited',
            prayer_wall_access_level: 'unlimited',
            max_scripture_memory_verses: null,
            can_access_book_summaries: true,
            can_book_counsellor: true,
            can_share_revelations: true,
            can_create_live_channel: true,
            max_live_channels: null,
            can_access_replays: true,
            max_replay_access: null,
            can_schedule_recurring_sessions: true,
            can_use_broadcast_messaging: true,
            can_access_analytics: true,
            can_export_data: true,
            can_record_meetings: true,
            can_download_replays: true,
            can_access_counsellor_dashboard: true
          }
        }
      ];

      // Insert or update each tier
      for (const tier of tierDefinitions) {
        const { error } = await supabase
          .from('subscription_tiers')
          .upsert(tier, { onConflict: 'slug' });
        
        if (error) {
          console.error(`Error upserting tier ${tier.slug}:`, error);
        }
      }

      toast({
        title: t('adminSubscriptionManager', 'success', 'Success'),
        description: t('adminSubscriptionManager', 'tiersInitialized', 'All subscription tiers have been initialized!')
      });

      // Reload data
      await loadData();
    } catch (error: any) {
      console.error('[AdminSubscription] Error initializing tiers:', error);
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: t('adminSubscriptionManager', 'failedInitTiers', 'Failed to initialize subscription tiers'),
        variant: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const searchUser = async () => {
    if (!searchEmail.trim()) {
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: searchType === 'email' ? t('adminSubscriptionManager', 'enterEmail', 'Please enter an email address') : t('adminSubscriptionManager', 'enterUserId', 'Please enter a user ID'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setActionLoading(true);
      
      if (searchType === 'user_id') {
        // Search by user ID directly
        const userId = searchEmail.trim();
        
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        if (profileError || !profile) {
          toast({
            title: t('adminSubscriptionManager', 'notFound', 'Not Found'),
            description: t('adminSubscriptionManager', 'noUserByUserId', 'No user found with this user ID'),
            variant: 'destructive'
          });
          return;
        }
        
        // Get email from auth if available
        const { data: authUsers } = await supabase.auth.admin.listUsers();
        const authUser = authUsers?.users?.find(u => u.id === userId);
        
        setSelectedUser({
          ...profile,
          email: authUser?.email || profile.email,
          user_id: userId
        });
        
        // Load their subscription
        const subscription = await getUserActiveSubscription(userId);
        setUserSubscription(subscription);
        
        toast({
          title: t('adminSubscriptionManager', 'userFound', 'User Found'),
          description: t('adminSubscriptionManager', 'loadedSubForUserId', 'Loaded subscription for user {id}').replace('{id}', String(userId))
        });
        return;
      }
      
      // Search by email
      const emailToSearch = searchEmail.trim().toLowerCase();
      
      // First, try to find user in auth.users
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      let matchingAuthUser = null;
      if (authUsers && authUsers.users) {
        matchingAuthUser = authUsers.users.find(u => 
          u.email?.toLowerCase() === emailToSearch
        );
      }
      
      // If found in auth, get their profile
      if (matchingAuthUser) {
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', matchingAuthUser.id)
          .single();
        
        if (profile) {
          setSelectedUser({
            ...profile,
            email: matchingAuthUser.email,
            user_id: matchingAuthUser.id
          });
          
          // Load their subscription
          const subscription = await getUserActiveSubscription(matchingAuthUser.id);
          setUserSubscription(subscription);
          
          toast({
            title: t('adminSubscriptionManager', 'userFound', 'User Found'),
            description: t('adminSubscriptionManager', 'loadedSubForEmail', 'Loaded subscription for {email}').replace('{email}', String(matchingAuthUser.email))
          });
          return;
        }
      }
      
      // Fallback: Search user_profiles table directly
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .ilike('email', emailToSearch)
        .limit(10);

      if (error) throw error;

      if (!profiles || profiles.length === 0) {
        toast({
          title: t('adminSubscriptionManager', 'notFound', 'Not Found'),
          description: t('adminSubscriptionManager', 'noUserByEmail', 'No user found with this email address. Make sure the user has signed up.'),
          variant: 'destructive'
        });
        return;
      }

      if (profiles.length === 1) {
        const user = profiles[0];
        setSelectedUser(user);
        
        // Load their subscription
        const subscription = await getUserActiveSubscription(user.user_id);
        setUserSubscription(subscription);
        
        toast({
          title: t('adminSubscriptionManager', 'userFound', 'User Found'),
          description: t('adminSubscriptionManager', 'loadedSubForEmail', 'Loaded subscription for {email}').replace('{email}', String(user.email))
        });
      } else {
        toast({
          title: t('adminSubscriptionManager', 'multipleUsersFound', 'Multiple Users Found'),
          description: t('adminSubscriptionManager', 'foundNUsers', 'Found {count} users. Please be more specific.').replace('{count}', String(profiles.length))
        });
      }
    } catch (error: any) {
      console.error('[AdminSubscription] Error searching user:', error);
      toast({
        title: t('adminSubscriptionManager', 'searchError', 'Search Error'),
        description: error.message || t('adminSubscriptionManager', 'failedSearchUser', 'Failed to search for user. Check console for details.'),
        variant: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSubscription = async () => {
    if (!selectedUser) return;
    
    if (!assignData.reason.trim()) {
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: t('adminSubscriptionManager', 'provideReason', 'Please provide a reason for this change'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setActionLoading(true);
      
      const { data: { user: currentAdmin } } = await supabase.auth.getUser();
      if (!currentAdmin) throw new Error('Not authenticated');

      const result = await adminAssignSubscription(
        selectedUser.user_id,
        assignData.tierSlug,
        currentAdmin.id,
        assignData.reason,
        assignData.expiresAt || undefined,
        assignData.notes || undefined
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: t('adminSubscriptionManager', 'success', 'Success'),
        description: t('adminSubscriptionManager', 'subAssignedTo', 'Subscription assigned to {email}').replace('{email}', String(selectedUser.email))
      });

      // Refresh user data
      const subscription = await getUserActiveSubscription(selectedUser.user_id);
      setUserSubscription(subscription);
      setShowAssignModal(false);
      setAssignData({ tierSlug: 'free', expiresAt: '', reason: '', notes: '' });
      
      // Reload stats
      const statsData = await getSubscriptionStats();
      setStats(statsData);
    } catch (error: any) {
      console.error('[AdminSubscription] Error assigning subscription:', error);
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtendSubscription = async () => {
    if (!selectedUser || !userSubscription) return;
    
    if (!extendData.newExpiryDate || !extendData.reason.trim()) {
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: t('adminSubscriptionManager', 'provideBothExpiryReason', 'Please provide both expiry date and reason'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setActionLoading(true);
      
      const { data: { user: currentAdmin } } = await supabase.auth.getUser();
      if (!currentAdmin) throw new Error('Not authenticated');

      const result = await adminExtendSubscription(
        selectedUser.user_id,
        extendData.newExpiryDate,
        currentAdmin.id,
        extendData.reason
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: t('adminSubscriptionManager', 'success', 'Success'),
        description: t('adminSubscriptionManager', 'subExtendedFor', 'Subscription extended for {email}').replace('{email}', String(selectedUser.email))
      });

      // Refresh user data
      const subscription = await getUserActiveSubscription(selectedUser.user_id);
      setUserSubscription(subscription);
      setShowExtendModal(false);
      setExtendData({ newExpiryDate: '', reason: '' });
    } catch (error: any) {
      console.error('[AdminSubscription] Error extending subscription:', error);
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!selectedUser || !userSubscription) return;
    
    if (!confirm(t('adminSubscriptionManager', 'confirmCancel', 'Are you sure you want to cancel the subscription for {email}? They will be moved to the Free tier.').replace('{email}', String(selectedUser.email)))) {
      return;
    }

    const reason = prompt(t('adminSubscriptionManager', 'promptCancelReason', 'Please provide a reason for cancellation:'));
    if (!reason?.trim()) return;

    try {
      setActionLoading(true);
      
      const { data: { user: currentAdmin } } = await supabase.auth.getUser();
      if (!currentAdmin) throw new Error('Not authenticated');

      const result = await adminCancelSubscription(
        selectedUser.user_id,
        currentAdmin.id,
        reason
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: t('adminSubscriptionManager', 'success', 'Success'),
        description: t('adminSubscriptionManager', 'subCancelledFor', 'Subscription cancelled for {email}').replace('{email}', String(selectedUser.email))
      });

      // Refresh user data
      const subscription = await getUserActiveSubscription(selectedUser.user_id);
      setUserSubscription(subscription);
      
      // Reload stats
      const statsData = await getSubscriptionStats();
      setStats(statsData);
    } catch (error: any) {
      console.error('[AdminSubscription] Error cancelling subscription:', error);
      toast({
        title: t('adminSubscriptionManager', 'error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Crown className="h-8 w-8 text-purple-600" />
            {t('adminSubscriptionManager', 'title', 'Subscription Manager')}
          </h2>
          <p className="text-gray-600 mt-1">
            {t('adminSubscriptionManager', 'subtitle', 'Manage user subscriptions, assign tiers, and view analytics')}
          </p>
        </div>
        {isSuperAdmin && tiers.length < 5 && (
          <Button 
            onClick={initializeAllTiers}
            disabled={actionLoading}
            variant="outline"
            className="border-amber-500 text-amber-700 hover:bg-amber-50"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <AlertCircle className="h-4 w-4 mr-2" />
            )}
            {t('adminSubscriptionManager', 'initializeAllTiers', 'Initialize All Tiers')}
          </Button>
        )}
      </div>

      {/* Tier Warning */}
      {tiers.length < 5 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">{t('adminSubscriptionManager', 'missingTiers', 'Missing Subscription Tiers')}</p>
              <p className="mb-2">
                {t('adminSubscriptionManager', 'missingTiersDesc', 'Only {count} of 5 expected tiers found in database. Click "Initialize All Tiers" to set up all subscription tiers.').replace('{count}', String(tiers.length))}
              </p>
              <p className="text-xs text-amber-700">
                {t('adminSubscriptionManager', 'expectedTiers', 'Expected tiers: Free, Premium, Premium Plus, Ministry, Ministry Plus')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('adminSubscriptionManager', 'totalUsers', 'Total Users')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.total_users || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('adminSubscriptionManager', 'activeSubscriptions', 'Active Subscriptions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats?.active_subscriptions || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('adminSubscriptionManager', 'expired', 'Expired')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats?.expired_subscriptions || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('adminSubscriptionManager', 'freeTier', 'Free Tier')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">{stats?.by_tier?.free || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('adminSubscriptionManager', 'tierDistribution', 'Subscription Tier Distribution')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {tiers.map((tier) => (
              <div key={tier.id} className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {stats?.by_tier?.[tier.slug] || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">{tier.name}</div>
                <div className="text-xs text-gray-500">${tier.price_monthly}/mo</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Search and Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t('adminSubscriptionManager', 'userSubManagement', 'User Subscription Management')}
          </CardTitle>
          <CardDescription>
            {t('adminSubscriptionManager', 'userSubManagementDesc', 'Search for a user by email to view and manage their subscription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Troubleshooting Tip */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">{t('adminSubscriptionManager', 'searchTips', 'Search Tips:')}</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>{t('adminSubscriptionManager', 'searchTip1', 'Enter the exact email address the user signed up with')}</li>
                  <li>{t('adminSubscriptionManager', 'searchTip2', 'Email search is case-insensitive')}</li>
                  <li>{t('adminSubscriptionManager', 'searchTip3', 'User must have completed signup to appear in results')}</li>
                  <li>{t('adminSubscriptionManager', 'searchTip4', 'If not found, ask user to verify their email or check spam folder')}</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="flex gap-4">
            <div className="w-40">
              <Label>{t('adminSubscriptionManager', 'searchBy', 'Search By')}</Label>
              <Select value={searchType} onValueChange={(v: 'email' | 'user_id') => setSearchType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{t('adminSubscriptionManager', 'emailLabel', 'Email')}</SelectItem>
                  <SelectItem value="user_id">{t('adminSubscriptionManager', 'userIdLabel', 'User ID')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>{searchType === 'email' ? t('adminSubscriptionManager', 'userEmail', 'User Email') : t('adminSubscriptionManager', 'userIdLabel', 'User ID')}</Label>
              <Input
                type="text"
                placeholder={searchType === 'email' ? t('adminSubscriptionManager', 'enterUserEmailPh', 'Enter user email address') : t('adminSubscriptionManager', 'enterUserIdPh', 'Enter user ID (UUID)')}
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchUser()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={searchUser} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    {t('adminSubscriptionManager', 'search', 'Search')}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Selected User Info */}
          {selectedUser && (
            <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border-2 border-purple-200">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-xl font-bold">{selectedUser.full_name || t('adminSubscriptionManager', 'unnamedUser', 'Unnamed User')}</h3>
                    <p className="text-gray-600">{selectedUser.email}</p>
                  </div>
                  
                  {userSubscription ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="text-lg px-4 py-1" variant="default">
                          {userSubscription.tier.name}
                        </Badge>
                        <Badge variant={userSubscription.status === 'active' ? 'default' : 'destructive'}>
                          {userSubscription.status}
                        </Badge>
                        {userSubscription.is_admin_override && (
                          <Badge variant="outline">
                            <Shield className="h-3 w-3 mr-1" />
                            {t('adminSubscriptionManager', 'adminOverride', 'Admin Override')}
                          </Badge>
                        )}
                      </div>
                      
                      {userSubscription.expires_at && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="h-4 w-4" />
                          {t('adminSubscriptionManager', 'expiresLabel', 'Expires:')} {new Date(userSubscription.expires_at).toLocaleDateString()}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                        <div>
                          <div className="text-gray-600">{t('adminSubscriptionManager', 'liveChannels', 'Live Channels')}</div>
                          <div className="font-semibold">
                            {userSubscription.tier.max_live_channels === null ? t('adminSubscriptionManager', 'unlimited', 'Unlimited') : userSubscription.tier.max_live_channels}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">{t('adminSubscriptionManager', 'meetingDuration', 'Meeting Duration')}</div>
                          <div className="font-semibold">
                            {userSubscription.tier.max_meeting_duration_minutes === null ? t('adminSubscriptionManager', 'unlimited', 'Unlimited') : `${userSubscription.tier.max_meeting_duration_minutes} min`}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">{t('adminSubscriptionManager', 'analytics', 'Analytics')}</div>
                          <div className="font-semibold capitalize">{userSubscription.tier.analytics_level}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">{t('adminSubscriptionManager', 'support', 'Support')}</div>
                          <div className="font-semibold capitalize">{userSubscription.tier.support_level}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="h-5 w-5" />
                      <span>{t('adminSubscriptionManager', 'noActiveSub', 'No active subscription')}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowAssignModal(true)}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    {t('adminSubscriptionManager', 'assignChangeTier', 'Assign/Change Tier')}
                  </Button>
                  
                  {userSubscription && userSubscription.expires_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowExtendModal(true)}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      {t('adminSubscriptionManager', 'extendExpiry', 'Extend Expiry')}
                    </Button>
                  )}
                  
                  {userSubscription && userSubscription.tier.slug !== 'free' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleCancelSubscription}
                      disabled={actionLoading}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {t('adminSubscriptionManager', 'cancel', 'Cancel')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Subscription Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-purple-600" />
              {t('adminSubscriptionManager', 'assignTierTitle', 'Assign Subscription Tier')}
            </DialogTitle>
            <DialogDescription>
              {t('adminSubscriptionManager', 'assignTierDesc', "Manually assign or change a user's subscription tier. This bypasses payment flows.")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
              <strong>{t('adminSubscriptionManager', 'adminOverrideWarn', '⚠️ Admin Override:')}</strong> {t('adminSubscriptionManager', 'adminOverrideWarnDesc', "This will directly update the user's subscription tier and access rights immediately.")}
            </div>

            <div>
              <Label>{t('adminSubscriptionManager', 'subscriptionTier', 'Subscription Tier')}</Label>
              {tiers.length < 5 && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  {t('adminSubscriptionManager', 'tiersAvailableWarn', 'Only {count} tier(s) available. Click "Initialize All Tiers" button at the top to add all 5 tiers.').replace('{count}', String(tiers.length))}
                </div>
              )}
              <Select value={assignData.tierSlug} onValueChange={(value) => setAssignData({ ...assignData, tierSlug: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiers.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {t('adminSubscriptionManager', 'noTiersAvailable', 'No tiers available - Initialize tiers first')}
                    </SelectItem>
                  ) : (
                    tiers.map((tier) => (
                      <SelectItem key={tier.id} value={tier.slug}>
                        {tier.name} - ${tier.price_monthly}/mo
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {assignData.tierSlug !== 'free' && (
              <div>
                <Label>{t('adminSubscriptionManager', 'expiryDateOptional', 'Expiry Date (Optional)')}</Label>
                <Input
                  type="datetime-local"
                  value={assignData.expiresAt}
                  onChange={(e) => setAssignData({ ...assignData, expiresAt: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('adminSubscriptionManager', 'leaveBlankNoExpiry', 'Leave blank for no expiry (permanent until cancelled)')}
                </p>
              </div>
            )}

            <div>
              <Label>{t('adminSubscriptionManager', 'reasonRequired', 'Reason (Required)')}</Label>
              <Input
                placeholder={t('adminSubscriptionManager', 'reasonAssignPh', 'e.g., Trial extension, Partnership, Testing')}
                value={assignData.reason}
                onChange={(e) => setAssignData({ ...assignData, reason: e.target.value })}
              />
            </div>

            <div>
              <Label>{t('adminSubscriptionManager', 'notesOptional', 'Notes (Optional)')}</Label>
              <Input
                placeholder={t('adminSubscriptionManager', 'additionalNotesPh', 'Additional notes...')}
                value={assignData.notes}
                onChange={(e) => setAssignData({ ...assignData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              {t('adminSubscriptionManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleAssignSubscription} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminSubscriptionManager', 'assigning', 'Assigning...')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t('adminSubscriptionManager', 'assignSubscription', 'Assign Subscription')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Subscription Modal */}
      <Dialog open={showExtendModal} onOpenChange={setShowExtendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              {t('adminSubscriptionManager', 'extendSubscription', 'Extend Subscription')}
            </DialogTitle>
            <DialogDescription>
              {t('adminSubscriptionManager', 'extendSubDesc', "Extend the expiry date for this user's subscription")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {userSubscription && userSubscription.expires_at && (
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
                {t('adminSubscriptionManager', 'currentExpiry', 'Current expiry:')} {new Date(userSubscription.expires_at).toLocaleString()}
              </div>
            )}

            <div>
              <Label>{t('adminSubscriptionManager', 'newExpiryDate', 'New Expiry Date')}</Label>
              <Input
                type="datetime-local"
                value={extendData.newExpiryDate}
                onChange={(e) => setExtendData({ ...extendData, newExpiryDate: e.target.value })}
              />
            </div>

            <div>
              <Label>{t('adminSubscriptionManager', 'reasonRequired', 'Reason (Required)')}</Label>
              <Input
                placeholder={t('adminSubscriptionManager', 'reasonExtendPh', 'e.g., Extension due to technical issues')}
                value={extendData.reason}
                onChange={(e) => setExtendData({ ...extendData, reason: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendModal(false)}>
              {t('adminSubscriptionManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleExtendSubscription} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminSubscriptionManager', 'extending', 'Extending...')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t('adminSubscriptionManager', 'extendSubscription', 'Extend Subscription')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Available Tiers Reference */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminSubscriptionManager', 'availableTiers', 'Available Subscription Tiers')}</CardTitle>
          <CardDescription>
            {t('adminSubscriptionManager', 'availableTiersDesc', 'Reference guide for all subscription tiers and their features')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tiers.map((tier) => (
              <div key={tier.id} className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-lg">{tier.name}</h4>
                  <Badge>{tier.slug}</Badge>
                </div>
                <div className="text-2xl font-bold text-purple-600 mb-2">
                  ${tier.price_monthly}<span className="text-sm text-gray-600">/mo</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    {tier.can_create_live_channels ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <span>
                      {tier.max_live_channels === null ? t('adminSubscriptionManager', 'unlimited', 'Unlimited') : tier.max_live_channels} {t('adminSubscriptionManager', 'liveChannels', 'Live Channels')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tier.can_host_interactive_meetings ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <span>{t('adminSubscriptionManager', 'interactiveMeetings', 'Interactive Meetings')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tier.can_record_meetings ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <span>{t('adminSubscriptionManager', 'meetingRecording', 'Meeting Recording')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tier.can_access_book_summaries ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <span>{t('adminSubscriptionManager', 'bookSummaries', 'Book Summaries')}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {t('adminSubscriptionManager', 'analyticsLabel', 'Analytics:')} {tier.analytics_level} | {t('adminSubscriptionManager', 'supportLabel', 'Support:')} {tier.support_level}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};