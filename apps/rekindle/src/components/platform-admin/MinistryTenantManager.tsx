import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Building2, Search, Loader2, CheckCircle, XCircle, Clock, Eye,
  Shield, Users, Settings, AlertTriangle, RefreshCw, Ban, Play,
  Globe, Lock, Download, Mail, Phone, Link, ExternalLink,
  FileCheck, UserCog, Palette, Crown
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
  verification_status: string;
  approved_at: string;
  verified_at: string;
  suspension_reason: string;
  created_at: string;
  theme_color: string;
  contact_email: string;
  contact_phone: string;
  website_url: string;
  tax_id: string;
  legal_name: string;
  risk_level: string;
  platform_notes: string;
}

interface Subscription {
  id: string;
  ministry_id: string;
  plan_type: string;
  status: string;
  member_limit: number;
  storage_limit_mb: number;
  api_calls_limit: number;
  white_label_enabled: boolean;
  custom_domain_enabled: boolean;
}

interface WhiteLabelSettings {
  id: string;
  ministry_id: string;
  custom_domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  hide_platform_branding: boolean;
}

interface MinistryTenantManagerProps {
  onUpdate: () => void;
}

export const MinistryTenantManager: React.FC<MinistryTenantManagerProps> = ({ onUpdate }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [whiteLabelSettings, setWhiteLabelSettings] = useState<Record<string, WhiteLabelSettings>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showWhiteLabelModal, setShowWhiteLabelModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'suspend' | 'activate' | 'verify'>('approve');
  const [actionReason, setActionReason] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [whiteLabelForm, setWhiteLabelForm] = useState({
    custom_domain: '',
    logo_url: '',
    primary_color: '#7c3aed',
    secondary_color: '#4f46e5',
    hide_platform_branding: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ministriesRes, subsRes, whiteLabelRes] = await Promise.all([
        supabase.from('ministry_groups').select('*').order('created_at', { ascending: false }),
        supabase.from('ministry_subscriptions').select('*'),
        supabase.from('ministry_white_label_settings').select('*')
      ]);

      setMinistries(ministriesRes.data || []);

      const subsMap: Record<string, Subscription> = {};
      (subsRes.data || []).forEach(s => { subsMap[s.ministry_id] = s; });
      setSubscriptions(subsMap);

      const wlMap: Record<string, WhiteLabelSettings> = {};
      (whiteLabelRes.data || []).forEach(w => { wlMap[w.ministry_id] = w; });
      setWhiteLabelSettings(wlMap);
    } catch (err) {
      console.error('Error loading data:', err);
      toast({ title: t('ministryTenantManager', 'error', 'Error'), description: t('ministryTenantManager', 'failedToLoad', 'Failed to load ministries'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (ministry: Ministry) => {
    setSelectedMinistry(ministry);
    setShowDetailsModal(true);
  };

  const handleOpenAction = (ministry: Ministry, action: typeof actionType) => {
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
        case 'verify':
          updates = {
            verification_status: 'verified',
            verified_at: new Date().toISOString(),
            verified_by: user?.id
          };
          auditAction = 'ministry_verified';
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
        actor_type: 'platform_admin',
        action: auditAction,
        resource_type: 'ministry',
        resource_id: selectedMinistry.id,
        new_values: updates,
        metadata: { reason: actionReason }
      });

      toast({ title: t('ministryTenantManager', 'success', 'Success'), description: t('ministryTenantManager', 'actionSuccess', 'Ministry {action} successfully').replace('{action}', `${actionType}d`) });
      setShowActionModal(false);
      loadData();
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministryTenantManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenWhiteLabel = (ministry: Ministry) => {
    setSelectedMinistry(ministry);
    const existing = whiteLabelSettings[ministry.id];
    if (existing) {
      setWhiteLabelForm({
        custom_domain: existing.custom_domain || '',
        logo_url: existing.logo_url || '',
        primary_color: existing.primary_color || '#7c3aed',
        secondary_color: existing.secondary_color || '#4f46e5',
        hide_platform_branding: existing.hide_platform_branding || false
      });
    } else {
      setWhiteLabelForm({
        custom_domain: '',
        logo_url: '',
        primary_color: ministry.theme_color || '#7c3aed',
        secondary_color: '#4f46e5',
        hide_platform_branding: false
      });
    }
    setShowWhiteLabelModal(true);
  };

  const handleSaveWhiteLabel = async () => {
    if (!selectedMinistry) return;
    setSaving(true);

    try {
      const existing = whiteLabelSettings[selectedMinistry.id];
      
      if (existing) {
        await supabase
          .from('ministry_white_label_settings')
          .update(whiteLabelForm)
          .eq('id', existing.id);
      } else {
        await supabase
          .from('ministry_white_label_settings')
          .insert({ ministry_id: selectedMinistry.id, ...whiteLabelForm });
      }

      toast({ title: t('ministryTenantManager', 'success', 'Success'), description: t('ministryTenantManager', 'whiteLabelSaved', 'White-label settings saved') });
      setShowWhiteLabelModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('ministryTenantManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRiskLevel = async (ministryId: string, riskLevel: string) => {
    try {
      await supabase
        .from('ministry_groups')
        .update({ risk_level: riskLevel })
        .eq('id', ministryId);

      toast({ title: t('ministryTenantManager', 'success', 'Success'), description: t('ministryTenantManager', 'riskLevelUpdated', 'Risk level updated') });
      loadData();
    } catch (err: any) {
      toast({ title: t('ministryTenantManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdatePlatformNotes = async (ministryId: string, notes: string) => {
    try {
      await supabase
        .from('ministry_groups')
        .update({ platform_notes: notes })
        .eq('id', ministryId);

      toast({ title: t('ministryTenantManager', 'success', 'Success'), description: t('ministryTenantManager', 'notesSaved', 'Notes saved') });
    } catch (err: any) {
      toast({ title: t('ministryTenantManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">{t('ministryTenantManager', 'approved', 'Approved')}</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700">{t('ministryTenantManager', 'pending', 'Pending')}</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">{t('ministryTenantManager', 'rejected', 'Rejected')}</Badge>;
      case 'suspended':
        return <Badge className="bg-red-500 text-white">{t('ministryTenantManager', 'suspended', 'Suspended')}</Badge>;
      default:
        return <Badge variant="secondary">{status || t('ministryTenantManager', 'unknown', 'Unknown')}</Badge>;
    }
  };

  const getVerificationBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-blue-100 text-blue-700"><Shield className="h-3 w-3 mr-1" />{t('ministryTenantManager', 'verified', 'Verified')}</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700">{t('ministryTenantManager', 'pendingVerification', 'Pending Verification')}</Badge>;
      default:
        return <Badge variant="outline">{t('ministryTenantManager', 'unverified', 'Unverified')}</Badge>;
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <Badge className="bg-red-500 text-white">{t('ministryTenantManager', 'highRisk', 'High Risk')}</Badge>;
      case 'medium':
        return <Badge className="bg-amber-500 text-white">{t('ministryTenantManager', 'mediumRisk', 'Medium Risk')}</Badge>;
      case 'low':
      default:
        return <Badge className="bg-green-100 text-green-700">{t('ministryTenantManager', 'lowRisk', 'Low Risk')}</Badge>;
    }
  };

  const filteredMinistries = ministries.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.contact_email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.approval_status === statusFilter;
    const matchesVerification = verificationFilter === 'all' || m.verification_status === verificationFilter;
    return matchesSearch && matchesStatus && matchesVerification;
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
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('ministryTenantManager', 'searchPlaceholder', 'Search ministries by name, email...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('ministryTenantManager', 'statusPlaceholder', 'Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministryTenantManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="pending">{t('ministryTenantManager', 'pending', 'Pending')}</SelectItem>
                <SelectItem value="approved">{t('ministryTenantManager', 'approved', 'Approved')}</SelectItem>
                <SelectItem value="suspended">{t('ministryTenantManager', 'suspended', 'Suspended')}</SelectItem>
                <SelectItem value="rejected">{t('ministryTenantManager', 'rejected', 'Rejected')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verificationFilter} onValueChange={setVerificationFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('ministryTenantManager', 'verificationPlaceholder', 'Verification')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministryTenantManager', 'all', 'All')}</SelectItem>
                <SelectItem value="verified">{t('ministryTenantManager', 'verified', 'Verified')}</SelectItem>
                <SelectItem value="unverified">{t('ministryTenantManager', 'unverified', 'Unverified')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('ministryTenantManager', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ministries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('ministryTenantManager', 'ministryTenants', 'Ministry Tenants ({count})').replace('{count}', String(filteredMinistries.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'colMinistry', 'Ministry')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'contact', 'Contact')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'members', 'Members')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'plan', 'Plan')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'status', 'Status')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'verification', 'Verification')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'risk', 'Risk')}</th>
                  <th className="text-left p-4 font-medium">{t('ministryTenantManager', 'actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMinistries.map(ministry => {
                  const sub = subscriptions[ministry.id];
                  const wl = whiteLabelSettings[ministry.id];
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
                            <p className="text-xs text-gray-500">{ministry.location || t('ministryTenantManager', 'noLocation', 'No location')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          {ministry.contact_email && (
                            <p className="flex items-center gap-1 text-gray-600">
                              <Mail className="h-3 w-3" />
                              {ministry.contact_email}
                            </p>
                          )}
                          {ministry.contact_phone && (
                            <p className="flex items-center gap-1 text-gray-500">
                              <Phone className="h-3 w-3" />
                              {ministry.contact_phone}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          {ministry.member_count || 0}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={sub?.plan_type === 'enterprise' ? 'default' : 'secondary'}>
                          {sub?.plan_type || 'basic'}
                        </Badge>
                        {wl && (
                          <Badge variant="outline" className="ml-1">
                            <Palette className="h-3 w-3 mr-1" />
                            WL
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">{getStatusBadge(ministry.approval_status || 'pending')}</td>
                      <td className="p-4">{getVerificationBadge(ministry.verification_status)}</td>
                      <td className="p-4">
                        <Select
                          value={ministry.risk_level || 'low'}
                          onValueChange={(v) => handleUpdateRiskLevel(ministry.id, v)}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">{t('ministryTenantManager', 'low', 'Low')}</SelectItem>
                            <SelectItem value="medium">{t('ministryTenantManager', 'medium', 'Medium')}</SelectItem>
                            <SelectItem value="high">{t('ministryTenantManager', 'high', 'High')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleViewDetails(ministry)} title={t('ministryTenantManager', 'viewDetails', 'View Details')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenWhiteLabel(ministry)} title={t('ministryTenantManager', 'whiteLabelSettings', 'White-label Settings')}>
                            <Palette className="h-4 w-4" />
                          </Button>
                          {ministry.approval_status === 'pending' && (
                            <>
                              <Button size="icon" className="bg-green-600 hover:bg-green-700 h-8 w-8" onClick={() => handleOpenAction(ministry, 'approve')} title={t('ministryTenantManager', 'approve', 'Approve')}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleOpenAction(ministry, 'reject')} title={t('ministryTenantManager', 'reject', 'Reject')}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {ministry.approval_status === 'approved' && ministry.is_active && (
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleOpenAction(ministry, 'suspend')} title={t('ministryTenantManager', 'suspend', 'Suspend')}>
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                          {ministry.approval_status === 'suspended' && (
                            <Button size="icon" className="bg-green-600 hover:bg-green-700 h-8 w-8" onClick={() => handleOpenAction(ministry, 'activate')} title={t('ministryTenantManager', 'activate', 'Activate')}>
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {ministry.verification_status !== 'verified' && ministry.approval_status === 'approved' && (
                            <Button size="icon" className="bg-blue-600 hover:bg-blue-700 h-8 w-8" onClick={() => handleOpenAction(ministry, 'verify')} title={t('ministryTenantManager', 'verify', 'Verify')}>
                              <Shield className="h-4 w-4" />
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

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('ministryTenantManager', 'ministryDetails', 'Ministry Details')}</DialogTitle>
          </DialogHeader>
          {selectedMinistry && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">{t('ministryTenantManager', 'info', 'Info')}</TabsTrigger>
                <TabsTrigger value="subscription">{t('ministryTenantManager', 'subscription', 'Subscription')}</TabsTrigger>
                <TabsTrigger value="admins">{t('ministryTenantManager', 'admins', 'Admins')}</TabsTrigger>
                <TabsTrigger value="notes">{t('ministryTenantManager', 'notes', 'Notes')}</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-20 h-20 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: selectedMinistry.theme_color || '#7c3aed' }}
                  >
                    <Building2 className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">{selectedMinistry.name}</h3>
                    <p className="text-gray-500">{selectedMinistry.category} • {selectedMinistry.location}</p>
                    <div className="flex gap-2 mt-2">
                      {getStatusBadge(selectedMinistry.approval_status)}
                      {getVerificationBadge(selectedMinistry.verification_status)}
                      {getRiskBadge(selectedMinistry.risk_level)}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">{selectedMinistry.description || t('ministryTenantManager', 'noDescription', 'No description')}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'legalName', 'Legal Name')}</Label>
                    <p className="font-medium">{selectedMinistry.legal_name || t('ministryTenantManager', 'notProvided', 'Not provided')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'taxId', 'Tax ID')}</Label>
                    <p className="font-medium">{selectedMinistry.tax_id || t('ministryTenantManager', 'notProvided', 'Not provided')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'contactEmail', 'Contact Email')}</Label>
                    <p className="font-medium">{selectedMinistry.contact_email || t('ministryTenantManager', 'notProvided', 'Not provided')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'contactPhone', 'Contact Phone')}</Label>
                    <p className="font-medium">{selectedMinistry.contact_phone || t('ministryTenantManager', 'notProvided', 'Not provided')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'website', 'Website')}</Label>
                    {selectedMinistry.website_url ? (
                      <a href={selectedMinistry.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 flex items-center gap-1">
                        {selectedMinistry.website_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="font-medium">{t('ministryTenantManager', 'notProvided', 'Not provided')}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'members', 'Members')}</Label>
                    <p className="font-medium">{selectedMinistry.member_count || 0}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'created', 'Created')}</Label>
                    <p className="font-medium">{new Date(selectedMinistry.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('ministryTenantManager', 'visibility', 'Visibility')}</Label>
                    <Badge variant="outline">
                      {selectedMinistry.is_public ? <Globe className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                      {selectedMinistry.is_public ? t('ministryTenantManager', 'publicLabel', 'Public') : t('ministryTenantManager', 'privateLabel', 'Private')}
                    </Badge>
                  </div>
                </div>

                {selectedMinistry.suspension_reason && (
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-700">
                      <strong>{t('ministryTenantManager', 'suspensionReasonLabel', 'Suspension Reason:')}</strong> {selectedMinistry.suspension_reason}
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="subscription" className="space-y-4 mt-4">
                {subscriptions[selectedMinistry.id] ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <Label className="text-purple-600">{t('ministryTenantManager', 'currentPlan', 'Current Plan')}</Label>
                        <p className="text-2xl font-bold text-purple-700 capitalize">
                          {subscriptions[selectedMinistry.id].plan_type}
                        </p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <Label className="text-green-600">{t('ministryTenantManager', 'status', 'Status')}</Label>
                        <p className="text-2xl font-bold text-green-700 capitalize">
                          {subscriptions[selectedMinistry.id].status}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-gray-500">{t('ministryTenantManager', 'memberLimit', 'Member Limit')}</Label>
                        <p className="font-medium">{subscriptions[selectedMinistry.id].member_limit?.toLocaleString()}</p>
                      </div>
                      <div>
                        <Label className="text-gray-500">{t('ministryTenantManager', 'storageLimit', 'Storage Limit')}</Label>
                        <p className="font-medium">{(subscriptions[selectedMinistry.id].storage_limit_mb / 1024).toFixed(1)} GB</p>
                      </div>
                      <div>
                        <Label className="text-gray-500">{t('ministryTenantManager', 'apiCallsLimit', 'API Calls Limit')}</Label>
                        <p className="font-medium">{subscriptions[selectedMinistry.id].api_calls_limit?.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <Switch checked={subscriptions[selectedMinistry.id].white_label_enabled} disabled />
                        <Label>{t('ministryTenantManager', 'whiteLabel', 'White-label')}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={subscriptions[selectedMinistry.id].custom_domain_enabled} disabled />
                        <Label>{t('ministryTenantManager', 'customDomain', 'Custom Domain')}</Label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Crown className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">{t('ministryTenantManager', 'noSubscription', 'No subscription found')}</p>
                    <Button className="mt-4" onClick={() => { /* Open subscription assignment */ }}>
                      {t('ministryTenantManager', 'assignSubscription', 'Assign Subscription')}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="admins" className="space-y-4 mt-4">
                <div className="text-center py-8">
                  <UserCog className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">{t('ministryTenantManager', 'ministryAdminManagement', 'Ministry admin management')}</p>
                  <p className="text-sm text-gray-400 mt-2">{t('ministryTenantManager', 'viewManageAdmins', 'View and manage ministry administrators')}</p>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4 mt-4">
                <div>
                  <Label>{t('ministryTenantManager', 'platformAdminNotes', 'Platform Admin Notes')}</Label>
                  <Textarea
                    defaultValue={selectedMinistry.platform_notes || ''}
                    placeholder={t('ministryTenantManager', 'notesPlaceholder', 'Add internal notes about this ministry...')}
                    rows={6}
                    onBlur={(e) => handleUpdatePlatformNotes(selectedMinistry.id, e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('ministryTenantManager', 'notesAutoSave', 'Notes are saved automatically when you click outside')}</p>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>{t('ministryTenantManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && t('ministryTenantManager', 'approveMinistry', 'Approve Ministry')}
              {actionType === 'reject' && t('ministryTenantManager', 'rejectMinistry', 'Reject Ministry')}
              {actionType === 'suspend' && t('ministryTenantManager', 'suspendMinistry', 'Suspend Ministry')}
              {actionType === 'activate' && t('ministryTenantManager', 'activateMinistry', 'Activate Ministry')}
              {actionType === 'verify' && t('ministryTenantManager', 'verifyMinistry', 'Verify Ministry')}
            </DialogTitle>
          </DialogHeader>
          {selectedMinistry && (
            <div className="space-y-4">
              <p className="text-gray-600">
                {actionType === 'approve' && t('ministryTenantManager', 'approveConfirm', 'Approve "{name}" to allow them to operate on the platform?').replace('{name}', selectedMinistry.name)}
                {actionType === 'reject' && t('ministryTenantManager', 'rejectConfirm', 'Reject "{name}"? They will not be able to operate.').replace('{name}', selectedMinistry.name)}
                {actionType === 'suspend' && t('ministryTenantManager', 'suspendConfirm', 'Suspend "{name}"? All their operations will be paused.').replace('{name}', selectedMinistry.name)}
                {actionType === 'activate' && t('ministryTenantManager', 'activateConfirm', 'Reactivate "{name}"?').replace('{name}', selectedMinistry.name)}
                {actionType === 'verify' && t('ministryTenantManager', 'verifyConfirm', 'Mark "{name}" as verified? This indicates they are a legitimate organization.').replace('{name}', selectedMinistry.name)}
              </p>

              {(actionType === 'reject' || actionType === 'suspend') && (
                <div>
                  <Label>{t('ministryTenantManager', 'reason', 'Reason *')}</Label>
                  <Textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={t('ministryTenantManager', 'reasonPlaceholder', 'Provide a reason...')}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionModal(false)}>{t('ministryTenantManager', 'cancel', 'Cancel')}</Button>
            <Button
              onClick={handleExecuteAction}
              disabled={saving || ((actionType === 'reject' || actionType === 'suspend') && !actionReason.trim())}
              variant={actionType === 'reject' || actionType === 'suspend' ? 'destructive' : 'default'}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministryTenantManager', 'confirm', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* White-label Modal */}
      <Dialog open={showWhiteLabelModal} onOpenChange={setShowWhiteLabelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {t('ministryTenantManager', 'whiteLabelSettings', 'White-label Settings')}
            </DialogTitle>
          </DialogHeader>
          {selectedMinistry && (
            <div className="space-y-4">
              <div>
                <Label>{t('ministryTenantManager', 'customDomain', 'Custom Domain')}</Label>
                <Input
                  value={whiteLabelForm.custom_domain}
                  onChange={(e) => setWhiteLabelForm({ ...whiteLabelForm, custom_domain: e.target.value })}
                  placeholder="ministry.example.com"
                />
              </div>
              <div>
                <Label>{t('ministryTenantManager', 'logoUrl', 'Logo URL')}</Label>
                <Input
                  value={whiteLabelForm.logo_url}
                  onChange={(e) => setWhiteLabelForm({ ...whiteLabelForm, logo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('ministryTenantManager', 'primaryColor', 'Primary Color')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={whiteLabelForm.primary_color}
                      onChange={(e) => setWhiteLabelForm({ ...whiteLabelForm, primary_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={whiteLabelForm.primary_color}
                      onChange={(e) => setWhiteLabelForm({ ...whiteLabelForm, primary_color: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>{t('ministryTenantManager', 'secondaryColor', 'Secondary Color')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={whiteLabelForm.secondary_color}
                      onChange={(e) => setWhiteLabelForm({ ...whiteLabelForm, secondary_color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={whiteLabelForm.secondary_color}
                      onChange={(e) => setWhiteLabelForm({ ...whiteLabelForm, secondary_color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Switch
                  checked={whiteLabelForm.hide_platform_branding}
                  onCheckedChange={(v) => setWhiteLabelForm({ ...whiteLabelForm, hide_platform_branding: v })}
                />
                <div>
                  <Label>{t('ministryTenantManager', 'hidePlatformBranding', 'Hide Platform Branding')}</Label>
                  <p className="text-xs text-gray-500">{t('ministryTenantManager', 'removePoweredBy', 'Remove "Powered by" text')}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWhiteLabelModal(false)}>{t('ministryTenantManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSaveWhiteLabel} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministryTenantManager', 'saveSettings', 'Save Settings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryTenantManager;
