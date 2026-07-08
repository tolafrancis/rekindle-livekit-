import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Building2, Users, DollarSign, Shield, Settings, AlertTriangle,
  RefreshCw, BarChart3, Server, FileText, Flag, Activity,
  Crown, Loader2, TrendingUp, HardDrive, Clock, CheckCircle,
  XCircle, Database, Zap, MessageSquare, Globe
} from 'lucide-react';

import { MinistryTenantManager } from './MinistryTenantManager';
import { SubscriptionPlansManager } from './SubscriptionPlansManager';
import { BillingOverview } from './BillingOverview';
import { PlatformAnalytics } from './PlatformAnalytics';
import { SystemHealthMonitor } from './SystemHealthMonitor';
import { SupportTicketsManager } from './SupportTicketsManager';
import { AuditLogsViewer } from './AuditLogsViewer';
import { FlaggedContentManager } from './FlaggedContentManager';
import { PlatformAnnouncementsManager } from './PlatformAnnouncementsManager';
// LanguageManager moved to the main Admin dashboard (AdminDashboard "Languages" tab).

interface PlatformStats {
  totalMinistries: number;
  activeMinistries: number;
  pendingApproval: number;
  suspendedMinistries: number;
  verifiedMinistries: number;
  totalMembers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  openTickets: number;
  flaggedContent: number;
  apiCallsToday: number;
  storageUsedGB: number;
}

const PlatformAdminDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats>({
    totalMinistries: 0,
    activeMinistries: 0,
    pendingApproval: 0,
    suspendedMinistries: 0,
    verifiedMinistries: 0,
    totalMembers: 0,
    activeSubscriptions: 0,
    totalRevenue: 0,
    openTickets: 0,
    flaggedContent: 0,
    apiCallsToday: 0,
    storageUsedGB: 0
  });

  // Check if user is platform admin
  const isPlatformAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [
        ministriesRes,
        subscriptionsRes,
        ticketsRes,
        flaggedRes,
        feesRes
      ] = await Promise.all([
        supabase.from('ministry_groups').select('*'),
        supabase.from('ministry_subscriptions').select('*'),
        supabase.from('ministry_support_tickets').select('*').eq('status', 'open'),
        supabase.from('ministry_flagged_content').select('*').eq('status', 'pending'),
        supabase.from('platform_fees').select('amount').eq('status', 'collected')
      ]);

      const ministries = ministriesRes.data || [];
      const subscriptions = subscriptionsRes.data || [];
      const totalRevenue = (feesRes.data || []).reduce((sum, f) => sum + Number(f.amount), 0);
      const totalMembers = ministries.reduce((sum, m) => sum + (m.member_count || 0), 0);

      setStats({
        totalMinistries: ministries.length,
        activeMinistries: ministries.filter(m => m.is_active && m.approval_status === 'approved').length,
        pendingApproval: ministries.filter(m => m.approval_status === 'pending').length,
        suspendedMinistries: ministries.filter(m => m.approval_status === 'suspended').length,
        verifiedMinistries: ministries.filter(m => m.verification_status === 'verified').length,
        totalMembers,
        activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
        totalRevenue,
        openTickets: ticketsRes.data?.length || 0,
        flaggedContent: flaggedRes.data?.length || 0,
        apiCallsToday: 0,
        storageUsedGB: 0
      });
    } catch (err) {
      console.error('Error loading platform stats:', err);
      toast({ title: t('platformAdminDashboard', 'error', 'Error'), description: t('platformAdminDashboard', 'failedLoadStats', 'Failed to load platform statistics'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('platformAdminDashboard', 'accessDenied', 'Access Denied')}</h2>
            <p className="text-gray-600">{t('platformAdminDashboard', 'noPermission', "You don't have permission to access the Platform Admin Dashboard.")}</p>
          </CardContent>
        </Card>
      </div>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Crown className="h-8 w-8 text-amber-500" />
            {t('platformAdminDashboard', 'controlCenter', 'Platform Admin Control Center')}
          </h1>
          <p className="text-gray-600 mt-1">{t('platformAdminDashboard', 'controlCenterSubtitle', 'Manage ministries, subscriptions, and platform operations')}</p>
        </div>
        <Button onClick={loadStats} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('platformAdminDashboard', 'refresh', 'Refresh')}
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-600">{t('platformAdminDashboard', 'totalMinistries', 'Total Ministries')}</p>
                <p className="text-2xl font-bold text-purple-700">{stats.totalMinistries}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-600">{t('platformAdminDashboard', 'active', 'Active')}</p>
                <p className="text-2xl font-bold text-green-700">{stats.activeMinistries}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-amber-600">{t('platformAdminDashboard', 'pending', 'Pending')}</p>
                <p className="text-2xl font-bold text-amber-700">{stats.pendingApproval}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600">{t('platformAdminDashboard', 'totalMembers', 'Total Members')}</p>
                <p className="text-2xl font-bold text-blue-700">{stats.totalMembers.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-emerald-600">{t('platformAdminDashboard', 'revenue', 'Revenue')}</p>
                <p className="text-2xl font-bold text-emerald-700">${stats.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-red-600">{t('platformAdminDashboard', 'issues', 'Issues')}</p>
                <p className="text-2xl font-bold text-red-700">{stats.openTickets + stats.flaggedContent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10 gap-1 h-auto p-1 bg-gray-100">
          <TabsTrigger value="overview" className="text-xs px-2 py-2">
            <BarChart3 className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabOverview', 'Overview')}
          </TabsTrigger>
          <TabsTrigger value="ministries" className="text-xs px-2 py-2">
            <Building2 className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabMinistries', 'Ministries')}
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-xs px-2 py-2">
            <Crown className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabPlans', 'Plans')}
          </TabsTrigger>
          <TabsTrigger value="billing" className="text-xs px-2 py-2">
            <DollarSign className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabBilling', 'Billing')}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs px-2 py-2">
            <TrendingUp className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabAnalytics', 'Analytics')}
          </TabsTrigger>
          <TabsTrigger value="system" className="text-xs px-2 py-2">
            <Server className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabSystem', 'System')}
          </TabsTrigger>
          <TabsTrigger value="support" className="text-xs px-2 py-2">
            <MessageSquare className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabSupport', 'Support')}
            {stats.openTickets > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-xs px-1">{stats.openTickets}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="flagged" className="text-xs px-2 py-2">
            <Flag className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabFlagged', 'Flagged')}
            {stats.flaggedContent > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-xs px-1">{stats.flaggedContent}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs px-2 py-2">
            <FileText className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabAudit', 'Audit')}
          </TabsTrigger>
          <TabsTrigger value="announcements" className="text-xs px-2 py-2">
            <Globe className="h-4 w-4 mr-1" />
            {t('platformAdminDashboard', 'tabAnnounce', 'Announce')}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>{t('platformAdminDashboard', 'quickActions', 'Quick Actions')}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Button 
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => setActiveTab('ministries')}
                >
                  <Clock className="h-6 w-6" />
                  <span>{t('platformAdminDashboard', 'reviewPending', 'Review Pending ({count})').replace('{count}', String(stats.pendingApproval))}</span>
                </Button>
                <Button 
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => setActiveTab('support')}
                >
                  <MessageSquare className="h-6 w-6" />
                  <span>{t('platformAdminDashboard', 'openTickets', 'Open Tickets ({count})').replace('{count}', String(stats.openTickets))}</span>
                </Button>
                <Button 
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => setActiveTab('flagged')}
                >
                  <Flag className="h-6 w-6" />
                  <span>{t('platformAdminDashboard', 'flaggedContent', 'Flagged Content ({count})').replace('{count}', String(stats.flaggedContent))}</span>
                </Button>
                <Button 
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => setActiveTab('announcements')}
                >
                  <Globe className="h-6 w-6" />
                  <span>{t('platformAdminDashboard', 'newAnnouncement', 'New Announcement')}</span>
                </Button>
              </CardContent>
            </Card>

            {/* Ministry Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>{t('platformAdminDashboard', 'ministryStatusBreakdown', 'Ministry Status Breakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">{t('platformAdminDashboard', 'activeApproved', 'Active & Approved')}</span>
                    </div>
                    <Badge className="bg-green-100 text-green-700">{stats.activeMinistries}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-600" />
                      <span className="font-medium">{t('platformAdminDashboard', 'pendingApproval', 'Pending Approval')}</span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700">{stats.pendingApproval}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="font-medium">{t('platformAdminDashboard', 'suspended', 'Suspended')}</span>
                    </div>
                    <Badge className="bg-red-100 text-red-700">{stats.suspendedMinistries}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">{t('platformAdminDashboard', 'verified', 'Verified')}</span>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700">{stats.verifiedMinistries}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Overview */}
            <Card>
              <CardHeader>
                <CardTitle>{t('platformAdminDashboard', 'subscriptionOverview', 'Subscription Overview')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">{t('platformAdminDashboard', 'activeSubscriptions', 'Active Subscriptions')}</span>
                    <span className="font-bold text-lg">{stats.activeSubscriptions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">{t('platformAdminDashboard', 'monthlyRevenue', 'Monthly Revenue')}</span>
                    <span className="font-bold text-lg text-green-600">${stats.totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">{t('platformAdminDashboard', 'avgRevenuePerMinistry', 'Avg. Revenue/Ministry')}</span>
                    <span className="font-bold text-lg">
                      ${stats.activeSubscriptions > 0 ? Math.round(stats.totalRevenue / stats.activeSubscriptions) : 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Health Quick View */}
            <Card>
              <CardHeader>
                <CardTitle>{t('platformAdminDashboard', 'systemHealth', 'System Health')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-green-600" />
                      <span>{t('platformAdminDashboard', 'apiStatus', 'API Status')}</span>
                    </div>
                    <Badge className="bg-green-500">{t('platformAdminDashboard', 'operational', 'Operational')}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-600" />
                      <span>{t('platformAdminDashboard', 'database', 'Database')}</span>
                    </div>
                    <Badge className="bg-green-500">{t('platformAdminDashboard', 'healthy', 'Healthy')}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-blue-600" />
                      <span>{t('platformAdminDashboard', 'storage', 'Storage')}</span>
                    </div>
                    <Badge className="bg-blue-500">{t('platformAdminDashboard', 'gbUsed', '{count} GB Used').replace('{count}', String(stats.storageUsedGB))}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-purple-50 rounded">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-purple-600" />
                      <span>{t('platformAdminDashboard', 'apiCallsToday', 'API Calls Today')}</span>
                    </div>
                    <Badge className="bg-purple-500">{stats.apiCallsToday.toLocaleString()}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Ministries Tab */}
        <TabsContent value="ministries" className="mt-6">
          <MinistryTenantManager onUpdate={loadStats} />
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionPlansManager onUpdate={loadStats} />
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="mt-6">
          <BillingOverview onUpdate={loadStats} />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          <PlatformAnalytics />
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="mt-6">
          <SystemHealthMonitor />
        </TabsContent>

        {/* Support Tab */}
        <TabsContent value="support" className="mt-6">
          <SupportTicketsManager onUpdate={loadStats} />
        </TabsContent>

        {/* Flagged Content Tab */}
        <TabsContent value="flagged" className="mt-6">
          <FlaggedContentManager onUpdate={loadStats} />
        </TabsContent>

        {/* Audit Logs Tab */}
        <TabsContent value="audit" className="mt-6">
          <AuditLogsViewer />
        </TabsContent>

        {/* Announcements Tab */}
        <TabsContent value="announcements" className="mt-6">
          <PlatformAnnouncementsManager />
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default PlatformAdminDashboard;
