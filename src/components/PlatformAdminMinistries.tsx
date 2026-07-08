import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Building2, Search, Loader2, CheckCircle, XCircle, Clock, Eye,
  Shield, Users, DollarSign, Settings, AlertTriangle, RefreshCw,
  Ban, Play, Pause, FileText, BarChart3, Globe, Lock, Download,
  TrendingUp, Activity, Server, Database, HardDrive
} from 'lucide-react';

interface Ministry {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  member_count: number;
  owner_id: string;
  leader_id: string;
  is_active: boolean;
  is_public: boolean;
  approval_status: string;
  approved_at: string;
  suspension_reason: string;
  created_at: string;
  theme_color: string;
}

interface Subscription {
  id: string;
  ministry_id: string;
  plan_type: string;
  status: string;
  member_limit: number;
  storage_limit_mb: number;
  current_period_end: string;
}

interface SupportTicket {
  id: string;
  ministry_id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
}

const PlatformAdminMinistries: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('ministries');
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'suspend' | 'activate'>('approve');
  const [actionReason, setActionReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Platform stats
  const [platformStats, setPlatformStats] = useState({
    totalMinistries: 0,
    activeMinistries: 0,
    pendingApproval: 0,
    suspendedMinistries: 0,
    totalMembers: 0,
    totalDonations: 0,
    activeSubscriptions: 0,
    openTickets: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load ministries
      const { data: ministriesData, error: ministriesError } = await supabase
        .from('ministry_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (ministriesError) throw ministriesError;
      setMinistries(ministriesData || []);

      // Load subscriptions
      const { data: subsData } = await supabase
        .from('ministry_subscriptions')
        .select('*');

      const subsMap: Record<string, Subscription> = {};
      subsData?.forEach(s => {
        subsMap[s.ministry_id] = s;
      });
      setSubscriptions(subsMap);

      // Load support tickets
      const { data: ticketsData } = await supabase
        .from('ministry_support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      setTickets(ticketsData || []);

      // Calculate stats
      const totalMembers = (ministriesData || []).reduce((sum, m) => sum + (m.member_count || 0), 0);
      
      setPlatformStats({
        totalMinistries: ministriesData?.length || 0,
        activeMinistries: ministriesData?.filter(m => m.is_active && m.approval_status === 'approved').length || 0,
        pendingApproval: ministriesData?.filter(m => m.approval_status === 'pending').length || 0,
        suspendedMinistries: ministriesData?.filter(m => m.approval_status === 'suspended').length || 0,
        totalMembers,
        totalDonations: 0,
        activeSubscriptions: subsData?.filter(s => s.status === 'active').length || 0,
        openTickets: ticketsData?.filter(tk => tk.status === 'open').length || 0
      });

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (ministry: Ministry) => {
    setSelectedMinistry(ministry);
    setShowDetailsModal(true);
  };

  const handleOpenAction = (ministry: Ministry, action: 'approve' | 'reject' | 'suspend' | 'activate') => {
    setSelectedMinistry(ministry);
    setActionType(action);
    setActionReason('');
    setShowActionModal(true);
  };

  const handleExecuteAction = async () => {
    if (!selectedMinistry) return;

    setSaving(true);
    try {
      let updates: any = {};
      let auditAction = '';

      switch (actionType) {
        case 'approve':
          updates = {
            approval_status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: user?.id,
            is_active: true
          };
          auditAction = 'ministry_approved';
          break;
        case 'reject':
          updates = {
            approval_status: 'rejected',
            suspension_reason: actionReason
          };
          auditAction = 'ministry_rejected';
          break;
        case 'suspend':
          updates = {
            approval_status: 'suspended',
            is_active: false,
            suspension_reason: actionReason
          };
          auditAction = 'ministry_suspended';
          break;
        case 'activate':
          updates = {
            approval_status: 'approved',
            is_active: true,
            suspension_reason: null
          };
          auditAction = 'ministry_activated';
          break;
      }

      const { error } = await supabase
        .from('ministry_groups')
        .update(updates)
        .eq('id', selectedMinistry.id);

      if (error) throw error;

      // Log audit
      await supabase.from('ministry_audit_logs').insert({
        ministry_id: selectedMinistry.id,
        actor_id: user?.id,
        actor_type: 'admin',
        action: auditAction,
        resource_type: 'ministry',
        resource_id: selectedMinistry.id,
        new_values: updates,
        metadata: { reason: actionReason }
      });

      toast({ title: t('platformAdminMinistries', 'success', 'Success'), description: t('platformAdminMinistries', 'ministryActionSuccess', 'Ministry {action}d successfully').replace('{action}', actionType) });
      setShowActionModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('platformAdminMinistries', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSubscription = async (ministryId: string, planType: string) => {
    try {
      const existing = subscriptions[ministryId];
      
      if (existing) {
        await supabase
          .from('ministry_subscriptions')
          .update({ 
            plan_type: planType,
            member_limit: planType === 'enterprise' ? 10000 : planType === 'premium' ? 1000 : planType === 'standard' ? 500 : 100,
            storage_limit_mb: planType === 'enterprise' ? 102400 : planType === 'premium' ? 10240 : planType === 'standard' ? 5120 : 1024
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('ministry_subscriptions')
          .insert({
            ministry_id: ministryId,
            plan_type: planType,
            status: 'active',
            member_limit: planType === 'enterprise' ? 10000 : planType === 'premium' ? 1000 : planType === 'standard' ? 500 : 100,
            storage_limit_mb: planType === 'enterprise' ? 102400 : planType === 'premium' ? 10240 : planType === 'standard' ? 5120 : 1024
          });
      }

      toast({ title: t('platformAdminMinistries', 'success', 'Success'), description: t('platformAdminMinistries', 'subscriptionUpdated', 'Subscription updated') });
      loadData();
    } catch (err: any) {
      toast({ title: t('platformAdminMinistries', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      await supabase
        .from('ministry_support_tickets')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', ticketId);

      toast({ title: t('platformAdminMinistries', 'success', 'Success'), description: t('platformAdminMinistries', 'ticketResolved', 'Ticket resolved') });
      loadData();
    } catch (err: any) {
      toast({ title: t('platformAdminMinistries', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">{t('platformAdminMinistries', 'approved', 'Approved')}</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700">{t('platformAdminMinistries', 'pending', 'Pending')}</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">{t('platformAdminMinistries', 'rejected', 'Rejected')}</Badge>;
      case 'suspended':
        return <Badge className="bg-red-500 text-white">{t('platformAdminMinistries', 'suspended', 'Suspended')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredMinistries = ministries.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.approval_status === statusFilter;
    return matchesSearch && matchesStatus;
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
      {/* Platform Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-600">{t('platformAdminMinistries', 'totalMinistries', 'Total Ministries')}</p>
                <p className="text-2xl font-bold text-purple-700">{platformStats.totalMinistries}</p>
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
                <p className="text-sm text-green-600">{t('platformAdminMinistries', 'active', 'Active')}</p>
                <p className="text-2xl font-bold text-green-700">{platformStats.activeMinistries}</p>
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
                <p className="text-sm text-amber-600">{t('platformAdminMinistries', 'pendingApproval', 'Pending Approval')}</p>
                <p className="text-2xl font-bold text-amber-700">{platformStats.pendingApproval}</p>
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
                <p className="text-sm text-blue-600">{t('platformAdminMinistries', 'totalMembers', 'Total Members')}</p>
                <p className="text-2xl font-bold text-blue-700">{platformStats.totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="ministries" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t('platformAdminMinistries', 'ministries', 'Ministries')}
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('platformAdminMinistries', 'subscriptions', 'Subscriptions')}
          </TabsTrigger>
          <TabsTrigger value="tickets" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('platformAdminMinistries', 'support', 'Support')} ({platformStats.openTickets})
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            {t('platformAdminMinistries', 'system', 'System')}
          </TabsTrigger>
        </TabsList>

        {/* Ministries Tab */}
        <TabsContent value="ministries" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('platformAdminMinistries', 'searchPlaceholder', 'Search ministries...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t('platformAdminMinistries', 'status', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('platformAdminMinistries', 'all', 'All')}</SelectItem>
                  <SelectItem value="pending">{t('platformAdminMinistries', 'pending', 'Pending')}</SelectItem>
                  <SelectItem value="approved">{t('platformAdminMinistries', 'approved', 'Approved')}</SelectItem>
                  <SelectItem value="suspended">{t('platformAdminMinistries', 'suspended', 'Suspended')}</SelectItem>
                  <SelectItem value="rejected">{t('platformAdminMinistries', 'rejected', 'Rejected')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('platformAdminMinistries', 'refresh', 'Refresh')}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'ministry', 'Ministry')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'category', 'Category')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'members', 'Members')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'plan', 'Plan')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'status', 'Status')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'created', 'Created')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMinistries.map(ministry => {
                      const sub = subscriptions[ministry.id];
                      return (
                        <tr key={ministry.id} className="border-b hover:bg-gray-50">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: ministry.theme_color || '#7c3aed' }}
                              >
                                <Building2 className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <p className="font-medium">{ministry.name}</p>
                                <p className="text-xs text-gray-500">{ministry.location || t('platformAdminMinistries', 'noLocation', 'No location')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline">{ministry.category || t('platformAdminMinistries', 'generalCategory', 'General')}</Badge>
                          </td>
                          <td className="p-4">{ministry.member_count || 0}</td>
                          <td className="p-4">
                            <Badge variant={sub?.plan_type === 'enterprise' ? 'default' : 'secondary'}>
                              {sub?.plan_type || 'basic'}
                            </Badge>
                          </td>
                          <td className="p-4">{getStatusBadge(ministry.approval_status || 'pending')}</td>
                          <td className="p-4 text-gray-600">
                            {new Date(ministry.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetails(ministry)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {ministry.approval_status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={() => handleOpenAction(ministry, 'approve')}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleOpenAction(ministry, 'reject')}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {ministry.approval_status === 'approved' && ministry.is_active && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenAction(ministry, 'suspend')}
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                              {ministry.approval_status === 'suspended' && (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleOpenAction(ministry, 'activate')}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('platformAdminMinistries', 'subscriptionManagement', 'Subscription Management')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'ministry', 'Ministry')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'currentPlan', 'Current Plan')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'memberLimit', 'Member Limit')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'storage', 'Storage')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'status', 'Status')}</th>
                      <th className="text-left p-4 font-medium">{t('platformAdminMinistries', 'actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ministries.filter(m => m.approval_status === 'approved').map(ministry => {
                      const sub = subscriptions[ministry.id];
                      return (
                        <tr key={ministry.id} className="border-b hover:bg-gray-50">
                          <td className="p-4 font-medium">{ministry.name}</td>
                          <td className="p-4">
                            <Badge>{sub?.plan_type || 'basic'}</Badge>
                          </td>
                          <td className="p-4">{sub?.member_limit || 100}</td>
                          <td className="p-4">{((sub?.storage_limit_mb || 1024) / 1024).toFixed(1)} GB</td>
                          <td className="p-4">
                            <Badge variant={sub?.status === 'active' ? 'default' : 'secondary'}>
                              {sub?.status || 'inactive'}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Select
                              value={sub?.plan_type || 'basic'}
                              onValueChange={(v) => handleUpdateSubscription(ministry.id, v)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="basic">{t('platformAdminMinistries', 'basic', 'Basic')}</SelectItem>
                                <SelectItem value="standard">{t('platformAdminMinistries', 'standard', 'Standard')}</SelectItem>
                                <SelectItem value="premium">{t('platformAdminMinistries', 'premium', 'Premium')}</SelectItem>
                                <SelectItem value="enterprise">{t('platformAdminMinistries', 'enterprise', 'Enterprise')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Support Tickets Tab */}
        <TabsContent value="tickets" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('platformAdminMinistries', 'supportTickets', 'Support Tickets')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tickets.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">{t('platformAdminMinistries', 'noSupportTickets', 'No support tickets')}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {tickets.map(ticket => (
                    <div key={ticket.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{ticket.subject}</h3>
                            <Badge variant={ticket.priority === 'urgent' ? 'destructive' : 'secondary'}>
                              {ticket.priority}
                            </Badge>
                            <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>
                              {ticket.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(ticket.created_at).toLocaleString()}
                          </p>
                        </div>
                        {ticket.status === 'open' && (
                          <Button
                            size="sm"
                            onClick={() => handleResolveTicket(ticket.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t('platformAdminMinistries', 'resolve', 'Resolve')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-4 mt-6">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Server className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-sm text-gray-500">{t('platformAdminMinistries', 'systemStatus', 'System Status')}</p>
                    <p className="text-lg font-bold text-green-600">{t('platformAdminMinistries', 'operational', 'Operational')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Database className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm text-gray-500">{t('platformAdminMinistries', 'database', 'Database')}</p>
                    <p className="text-lg font-bold">{t('platformAdminMinistries', 'healthy', 'Healthy')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-sm text-gray-500">{t('platformAdminMinistries', 'storageUsed', 'Storage Used')}</p>
                    <p className="text-lg font-bold">42%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('platformAdminMinistries', 'platformHealth', 'Platform Health')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span>{t('platformAdminMinistries', 'apiResponseTime', 'API Response Time')}</span>
                  <Badge className="bg-green-100 text-green-700">45ms avg</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span>{t('platformAdminMinistries', 'uptime30Days', 'Uptime (30 days)')}</span>
                  <Badge className="bg-green-100 text-green-700">99.9%</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span>{t('platformAdminMinistries', 'activeSessions', 'Active Sessions')}</span>
                  <Badge className="bg-blue-100 text-blue-700">{platformStats.totalMembers}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('platformAdminMinistries', 'ministryDetails', 'Ministry Details')}</DialogTitle>
          </DialogHeader>
          {selectedMinistry && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: selectedMinistry.theme_color || '#7c3aed' }}
                >
                  <Building2 className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-xl">{selectedMinistry.name}</h3>
                  <p className="text-gray-500">{selectedMinistry.category} • {selectedMinistry.location}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-600">{selectedMinistry.description || t('platformAdminMinistries', 'noDescription', 'No description')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">{t('platformAdminMinistries', 'members', 'Members')}</Label>
                  <p className="font-semibold">{selectedMinistry.member_count || 0}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('platformAdminMinistries', 'status', 'Status')}</Label>
                  <div>{getStatusBadge(selectedMinistry.approval_status || 'pending')}</div>
                </div>
                <div>
                  <Label className="text-gray-500">{t('platformAdminMinistries', 'created', 'Created')}</Label>
                  <p className="font-semibold">{new Date(selectedMinistry.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('platformAdminMinistries', 'visibility', 'Visibility')}</Label>
                  <Badge variant="outline">
                    {selectedMinistry.is_public ? <Globe className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                    {selectedMinistry.is_public ? t('platformAdminMinistries', 'public', 'Public') : t('platformAdminMinistries', 'private', 'Private')}
                  </Badge>
                </div>
              </div>

              {selectedMinistry.suspension_reason && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-700">
                    <strong>{t('platformAdminMinistries', 'suspensionReason', 'Suspension Reason:')}</strong> {selectedMinistry.suspension_reason}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>{t('platformAdminMinistries', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && t('platformAdminMinistries', 'approveMinistry', 'Approve Ministry')}
              {actionType === 'reject' && t('platformAdminMinistries', 'rejectMinistry', 'Reject Ministry')}
              {actionType === 'suspend' && t('platformAdminMinistries', 'suspendMinistry', 'Suspend Ministry')}
              {actionType === 'activate' && t('platformAdminMinistries', 'activateMinistry', 'Activate Ministry')}
            </DialogTitle>
          </DialogHeader>
          {selectedMinistry && (
            <div className="space-y-4">
              <p className="text-gray-600">
                {actionType === 'approve' && t('platformAdminMinistries', 'confirmApprove', 'Are you sure you want to approve "{name}"?').replace('{name}', selectedMinistry.name)}
                {actionType === 'reject' && t('platformAdminMinistries', 'confirmReject', 'Are you sure you want to reject "{name}"?').replace('{name}', selectedMinistry.name)}
                {actionType === 'suspend' && t('platformAdminMinistries', 'confirmSuspend', 'Are you sure you want to suspend "{name}"?').replace('{name}', selectedMinistry.name)}
                {actionType === 'activate' && t('platformAdminMinistries', 'confirmActivate', 'Are you sure you want to activate "{name}"?').replace('{name}', selectedMinistry.name)}
              </p>

              {(actionType === 'reject' || actionType === 'suspend') && (
                <div>
                  <Label>{t('platformAdminMinistries', 'reason', 'Reason')}</Label>
                  <Textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={t('platformAdminMinistries', 'reasonPlaceholder', 'Provide a reason...')}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionModal(false)}>{t('platformAdminMinistries', 'cancel', 'Cancel')}</Button>
            <Button 
              onClick={handleExecuteAction} 
              disabled={saving}
              variant={actionType === 'reject' || actionType === 'suspend' ? 'destructive' : 'default'}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('platformAdminMinistries', 'confirm', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformAdminMinistries;
