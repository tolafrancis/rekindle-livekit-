import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Crown, Building2, Users, HardDrive, Zap, Palette, Globe,
  Loader2, Edit, CheckCircle, Search, RefreshCw
} from 'lucide-react';

interface Subscription {
  id: string;
  ministry_id: string;
  plan_type: string;
  status: string;
  member_limit: number;
  storage_limit_mb: number;
  api_calls_limit: number;
  api_calls_used: number;
  broadcast_limit: number;
  broadcasts_used: number;
  video_minutes_limit: number;
  video_minutes_used: number;
  white_label_enabled: boolean;
  custom_domain_enabled: boolean;
  priority_support: boolean;
  current_period_end: string;
  amount_cents: number;
  currency: string;
}

interface Ministry {
  id: string;
  name: string;
  theme_color: string;
  member_count: number;
}

interface SubscriptionPlansManagerProps {
  onUpdate: () => void;
}

const PLAN_CONFIGS = {
  basic: {
    name: 'Basic',
    member_limit: 100,
    storage_limit_mb: 1024,
    api_calls_limit: 5000,
    broadcast_limit: 50,
    video_minutes_limit: 500,
    white_label_enabled: false,
    custom_domain_enabled: false,
    priority_support: false,
    price: 0
  },
  standard: {
    name: 'Standard',
    member_limit: 500,
    storage_limit_mb: 5120,
    api_calls_limit: 25000,
    broadcast_limit: 200,
    video_minutes_limit: 2000,
    white_label_enabled: false,
    custom_domain_enabled: false,
    priority_support: false,
    price: 2999
  },
  premium: {
    name: 'Premium',
    member_limit: 2000,
    storage_limit_mb: 20480,
    api_calls_limit: 100000,
    broadcast_limit: 1000,
    video_minutes_limit: 10000,
    white_label_enabled: true,
    custom_domain_enabled: false,
    priority_support: true,
    price: 9999
  },
  enterprise: {
    name: 'Enterprise',
    member_limit: 10000,
    storage_limit_mb: 102400,
    api_calls_limit: 500000,
    broadcast_limit: 5000,
    video_minutes_limit: 50000,
    white_label_enabled: true,
    custom_domain_enabled: true,
    priority_support: true,
    price: 29999
  }
};

export const SubscriptionPlansManager: React.FC<SubscriptionPlansManagerProps> = ({ onUpdate }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [ministries, setMinistries] = useState<Record<string, Ministry>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState<Partial<Subscription>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subsRes, ministriesRes] = await Promise.all([
        supabase.from('ministry_subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('ministry_groups').select('id, name, theme_color, member_count')
      ]);

      setSubscriptions(subsRes.data || []);

      const ministryMap: Record<string, Ministry> = {};
      (ministriesRes.data || []).forEach(m => { ministryMap[m.id] = m; });
      setMinistries(ministryMap);
    } catch (err) {
      console.error('Error loading subscriptions:', err);
      toast({ title: t('subscriptionPlansManager', 'error', 'Error'), description: t('subscriptionPlansManager', 'failedToLoad', 'Failed to load subscriptions'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubscription = (sub: Subscription) => {
    setSelectedSubscription(sub);
    setEditForm({
      plan_type: sub.plan_type,
      status: sub.status,
      member_limit: sub.member_limit,
      storage_limit_mb: sub.storage_limit_mb,
      api_calls_limit: sub.api_calls_limit,
      broadcast_limit: sub.broadcast_limit,
      video_minutes_limit: sub.video_minutes_limit,
      white_label_enabled: sub.white_label_enabled,
      custom_domain_enabled: sub.custom_domain_enabled,
      priority_support: sub.priority_support,
      amount_cents: sub.amount_cents
    });
    setShowEditModal(true);
  };

  const handleApplyPlanDefaults = (planType: string) => {
    const config = PLAN_CONFIGS[planType as keyof typeof PLAN_CONFIGS];
    if (config) {
      setEditForm({
        ...editForm,
        plan_type: planType,
        member_limit: config.member_limit,
        storage_limit_mb: config.storage_limit_mb,
        api_calls_limit: config.api_calls_limit,
        broadcast_limit: config.broadcast_limit,
        video_minutes_limit: config.video_minutes_limit,
        white_label_enabled: config.white_label_enabled,
        custom_domain_enabled: config.custom_domain_enabled,
        priority_support: config.priority_support,
        amount_cents: config.price
      });
    }
  };

  const handleSaveSubscription = async () => {
    if (!selectedSubscription) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('ministry_subscriptions')
        .update(editForm)
        .eq('id', selectedSubscription.id);

      if (error) throw error;

      // Log audit
      await supabase.from('ministry_audit_logs').insert({
        ministry_id: selectedSubscription.ministry_id,
        actor_id: user?.id,
        actor_type: 'platform_admin',
        action: 'subscription_updated',
        resource_type: 'subscription',
        resource_id: selectedSubscription.id,
        new_values: editForm
      });

      toast({ title: t('subscriptionPlansManager', 'success', 'Success'), description: t('subscriptionPlansManager', 'subscriptionUpdated', 'Subscription updated') });
      setShowEditModal(false);
      loadData();
      onUpdate();
    } catch (err: any) {
      toast({ title: t('subscriptionPlansManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetUsage = async (subId: string, ministryId: string) => {
    try {
      await supabase
        .from('ministry_subscriptions')
        .update({
          api_calls_used: 0,
          broadcasts_used: 0,
          video_minutes_used: 0
        })
        .eq('id', subId);

      await supabase.from('ministry_audit_logs').insert({
        ministry_id: ministryId,
        actor_id: user?.id,
        actor_type: 'platform_admin',
        action: 'usage_reset',
        resource_type: 'subscription',
        resource_id: subId
      });

      toast({ title: t('subscriptionPlansManager', 'success', 'Success'), description: t('subscriptionPlansManager', 'usageReset', 'Usage counters reset') });
      loadData();
    } catch (err: any) {
      toast({ title: t('subscriptionPlansManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    const ministry = ministries[sub.ministry_id];
    const matchesSearch = ministry?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = planFilter === 'all' || sub.plan_type === planFilter;
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
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
      {/* Plan Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(PLAN_CONFIGS).map(([key, config]) => {
          const count = subscriptions.filter(s => s.plan_type === key && s.status === 'active').length;
          return (
            <Card key={key} className={`${key === 'enterprise' ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={key === 'enterprise' ? 'default' : 'secondary'} className="capitalize">
                    {config.name}
                  </Badge>
                  <span className="text-2xl font-bold">{count}</span>
                </div>
                <p className="text-sm text-gray-500">
                  ${(config.price / 100).toFixed(2)}/mo
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('subscriptionPlansManager', 'searchPlaceholder', 'Search by ministry name...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('subscriptionPlansManager', 'plan', 'Plan')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('subscriptionPlansManager', 'allPlans', 'All Plans')}</SelectItem>
                <SelectItem value="basic">{t('subscriptionPlansManager', 'basic', 'Basic')}</SelectItem>
                <SelectItem value="standard">{t('subscriptionPlansManager', 'standard', 'Standard')}</SelectItem>
                <SelectItem value="premium">{t('subscriptionPlansManager', 'premium', 'Premium')}</SelectItem>
                <SelectItem value="enterprise">{t('subscriptionPlansManager', 'enterprise', 'Enterprise')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('subscriptionPlansManager', 'status', 'Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('subscriptionPlansManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="active">{t('subscriptionPlansManager', 'active', 'Active')}</SelectItem>
                <SelectItem value="inactive">{t('subscriptionPlansManager', 'inactive', 'Inactive')}</SelectItem>
                <SelectItem value="past_due">{t('subscriptionPlansManager', 'pastDue', 'Past Due')}</SelectItem>
                <SelectItem value="canceled">{t('subscriptionPlansManager', 'canceled', 'Canceled')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('subscriptionPlansManager', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            {t('subscriptionPlansManager', 'ministrySubscriptions', 'Ministry Subscriptions ({count})').replace('{count}', String(filteredSubscriptions.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'ministry', 'Ministry')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'plan', 'Plan')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'status', 'Status')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'members', 'Members')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'apiUsage', 'API Usage')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'storage', 'Storage')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'features', 'Features')}</th>
                  <th className="text-left p-4 font-medium">{t('subscriptionPlansManager', 'actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscriptions.map(sub => {
                  const ministry = ministries[sub.ministry_id];
                  const apiUsage = getUsagePercentage(sub.api_calls_used || 0, sub.api_calls_limit || 1);
                  
                  return (
                    <tr key={sub.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: ministry?.theme_color || '#7c3aed' }}
                          >
                            <Building2 className="h-4 w-4 text-white" />
                          </div>
                          <span className="font-medium">{ministry?.name || t('subscriptionPlansManager', 'unknown', 'Unknown')}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={sub.plan_type === 'enterprise' ? 'default' : 'secondary'} className="capitalize">
                          {sub.plan_type}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={sub.status === 'active' ? 'default' : 'secondary'} className={
                          sub.status === 'active' ? 'bg-green-100 text-green-700' :
                          sub.status === 'past_due' ? 'bg-red-100 text-red-700' :
                          ''
                        }>
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span>{ministry?.member_count || 0}</span>
                          <span className="text-gray-400">/ {sub.member_limit?.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="w-24">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>{apiUsage}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${getUsageColor(apiUsage)}`}
                              style={{ width: `${apiUsage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm">
                          {(sub.storage_limit_mb / 1024).toFixed(1)} GB
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          {sub.white_label_enabled && (
                            <Badge variant="outline" className="text-xs">
                              <Palette className="h-3 w-3 mr-1" />
                              WL
                            </Badge>
                          )}
                          {sub.custom_domain_enabled && (
                            <Badge variant="outline" className="text-xs">
                              <Globe className="h-3 w-3 mr-1" />
                              CD
                            </Badge>
                          )}
                          {sub.priority_support && (
                            <Badge variant="outline" className="text-xs">
                              <Zap className="h-3 w-3 mr-1" />
                              PS
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditSubscription(sub)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleResetUsage(sub.id, sub.ministry_id)}
                          >
                            {t('subscriptionPlansManager', 'resetUsage', 'Reset Usage')}
                          </Button>
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

      {/* Edit Subscription Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('subscriptionPlansManager', 'editSubscription', 'Edit Subscription')}</DialogTitle>
          </DialogHeader>
          {selectedSubscription && (
            <div className="space-y-4">
              <div>
                <Label>{t('subscriptionPlansManager', 'planType', 'Plan Type')}</Label>
                <Select
                  value={editForm.plan_type}
                  onValueChange={(v) => handleApplyPlanDefaults(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">{t('subscriptionPlansManager', 'basic', 'Basic')}</SelectItem>
                    <SelectItem value="standard">{t('subscriptionPlansManager', 'standard', 'Standard')}</SelectItem>
                    <SelectItem value="premium">{t('subscriptionPlansManager', 'premium', 'Premium')}</SelectItem>
                    <SelectItem value="enterprise">{t('subscriptionPlansManager', 'enterprise', 'Enterprise')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('subscriptionPlansManager', 'status', 'Status')}</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('subscriptionPlansManager', 'active', 'Active')}</SelectItem>
                    <SelectItem value="inactive">{t('subscriptionPlansManager', 'inactive', 'Inactive')}</SelectItem>
                    <SelectItem value="past_due">{t('subscriptionPlansManager', 'pastDue', 'Past Due')}</SelectItem>
                    <SelectItem value="canceled">{t('subscriptionPlansManager', 'canceled', 'Canceled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('subscriptionPlansManager', 'memberLimit', 'Member Limit')}</Label>
                  <Input
                    type="number"
                    value={editForm.member_limit}
                    onChange={(e) => setEditForm({ ...editForm, member_limit: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t('subscriptionPlansManager', 'storageMb', 'Storage (MB)')}</Label>
                  <Input
                    type="number"
                    value={editForm.storage_limit_mb}
                    onChange={(e) => setEditForm({ ...editForm, storage_limit_mb: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t('subscriptionPlansManager', 'apiCallsLimit', 'API Calls Limit')}</Label>
                  <Input
                    type="number"
                    value={editForm.api_calls_limit}
                    onChange={(e) => setEditForm({ ...editForm, api_calls_limit: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t('subscriptionPlansManager', 'broadcastLimit', 'Broadcast Limit')}</Label>
                  <Input
                    type="number"
                    value={editForm.broadcast_limit}
                    onChange={(e) => setEditForm({ ...editForm, broadcast_limit: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t('subscriptionPlansManager', 'videoMinutesLimit', 'Video Minutes Limit')}</Label>
                  <Input
                    type="number"
                    value={editForm.video_minutes_limit}
                    onChange={(e) => setEditForm({ ...editForm, video_minutes_limit: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t('subscriptionPlansManager', 'monthlyPrice', 'Monthly Price (cents)')}</Label>
                  <Input
                    type="number"
                    value={editForm.amount_cents}
                    onChange={(e) => setEditForm({ ...editForm, amount_cents: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label>{t('subscriptionPlansManager', 'whiteLabelEnabled', 'White-label Enabled')}</Label>
                  <Switch
                    checked={editForm.white_label_enabled}
                    onCheckedChange={(v) => setEditForm({ ...editForm, white_label_enabled: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t('subscriptionPlansManager', 'customDomainEnabled', 'Custom Domain Enabled')}</Label>
                  <Switch
                    checked={editForm.custom_domain_enabled}
                    onCheckedChange={(v) => setEditForm({ ...editForm, custom_domain_enabled: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t('subscriptionPlansManager', 'prioritySupport', 'Priority Support')}</Label>
                  <Switch
                    checked={editForm.priority_support}
                    onCheckedChange={(v) => setEditForm({ ...editForm, priority_support: v })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>{t('subscriptionPlansManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSaveSubscription} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('subscriptionPlansManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionPlansManager;
