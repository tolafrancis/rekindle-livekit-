import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { supabase } from '@rekindle/supabase';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import {
  Gift, Plus, Search, Loader2, TrendingUp, Users, Calendar, Download,
  DollarSign, Target, UserX, User, Edit, Trash2, BarChart3, CreditCard,
  Mail, Phone, MapPin, CheckCircle, Clock, AlertCircle, Filter, Eye,
  Repeat, FileText, Send, Copy, Award, Heart, Settings, Link2
} from 'lucide-react';
import { MinistryPaymentSettings } from './MinistryPaymentSettings';
import { MinistryDonationForm } from './MinistryDonationForm';

interface MinistryDonationsManagerProps {
  ministryId: string;
  ministryName?: string;
  themeColor?: string;
  isLeader?: boolean;
}

interface Donation {
  id: string;
  donor_id: string;
  amount_cents: number;
  currency: string;
  donation_type: string;
  payment_method: string;
  is_recurring: boolean;
  recurrence_interval: string;
  campaign_id: string;
  fund_allocation: string;
  is_anonymous: boolean;
  donor_name: string;
  donor_email: string;
  donor_phone: string;
  tax_receipt_sent: boolean;
  status: string;
  notes: string;
  transaction_id: string;
  created_at: string;
}

interface Campaign {
  id: string;
  title: string;
  description: string;
  goal_cents: number;
  raised_cents: number;
  donor_count: number;
  start_date: string;
  end_date: string;
  category: string;
  image_url: string;
  is_active: boolean;
  is_featured: boolean;
}

interface DonorProfile {
  donor_id: string;
  donor_name: string;
  donor_email: string;
  totalDonations: number;
  donationCount: number;
  firstDonation: string;
  lastDonation: string;
  isRecurring: boolean;
}

interface Analytics {
  totalDonations: number;
  totalDonors: number;
  avgDonation: number;
  recurringDonors: number;
  thisMonth: number;
  lastMonth: number;
  growth: number;
  topCampaign: Campaign | null;
  topDonor: DonorProfile | null;
}

const FUND_ALLOCATIONS = [
  'General Fund', 'Building Fund', 'Missions', 'Benevolence', 'Youth Ministry',
  'Children Ministry', 'Worship', 'Outreach', 'Education', 'Other'
];

const CAMPAIGN_CATEGORIES = [
  'Building Project', 'Missions Trip', 'Community Outreach', 'Ministry Launch',
  'Special Event', 'Emergency Relief', 'Scholarship Fund', 'Equipment', 'Other'
];

export const MinistryDonationsManager: React.FC<MinistryDonationsManagerProps> = ({
  ministryId,
  ministryName = 'Ministry',
  themeColor = '#7c3aed',
  isLeader = false
}) => {
  const { t } = useLanguage();

  const [donations, setDonations] = useState<Donation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [donorProfiles, setDonorProfiles] = useState<DonorProfile[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showDonorModal, setShowDonorModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedDonor, setSelectedDonor] = useState<DonorProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    goal_cents: 0,
    category: 'Building Project',
    start_date: '',
    end_date: '',
    image_url: '',
    is_featured: false
  });

  useEffect(() => {
    loadData();
  }, [ministryId]);

  const loadData = async () => {
    try {
      const [donationsRes, campaignsRes] = await Promise.all([
        supabase
          .from('ministry_donations')
          .select('*')
          .eq('ministry_id', ministryId)
          .order('created_at', { ascending: false }),
        supabase
          .from('ministry_donation_campaigns')
          .select('*')
          .eq('ministry_id', ministryId)
          .order('created_at', { ascending: false })
      ]);

      const donationsData = donationsRes.data || [];
      const campaignsData = campaignsRes.data || [];

      setDonations(donationsData);
      setCampaigns(campaignsData);

      // Calculate donor profiles
      const donorMap = new Map<string, DonorProfile>();
      donationsData.forEach(d => {
        if (d.is_anonymous) return;
        const key = d.donor_id || d.donor_email;
        if (!key) return;

        if (!donorMap.has(key)) {
          donorMap.set(key, {
            donor_id: d.donor_id,
            donor_name: d.donor_name,
            donor_email: d.donor_email,
            totalDonations: 0,
            donationCount: 0,
            firstDonation: d.created_at,
            lastDonation: d.created_at,
            isRecurring: false
          });
        }

        const profile = donorMap.get(key)!;
        profile.totalDonations += d.amount_cents;
        profile.donationCount++;
        profile.isRecurring = profile.isRecurring || d.is_recurring;
        if (new Date(d.created_at) < new Date(profile.firstDonation)) {
          profile.firstDonation = d.created_at;
        }
        if (new Date(d.created_at) > new Date(profile.lastDonation)) {
          profile.lastDonation = d.created_at;
        }
      });

      const profiles = Array.from(donorMap.values()).sort((a, b) => b.totalDonations - a.totalDonations);
      setDonorProfiles(profiles);

      // Calculate analytics
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const thisMonthDonations = donationsData.filter(d => new Date(d.created_at) >= thisMonthStart);
      const lastMonthDonations = donationsData.filter(d => 
        new Date(d.created_at) >= lastMonthStart && new Date(d.created_at) <= lastMonthEnd
      );

      const thisMonthTotal = thisMonthDonations.reduce((sum, d) => sum + (d.amount_cents || 0), 0);
      const lastMonthTotal = lastMonthDonations.reduce((sum, d) => sum + (d.amount_cents || 0), 0);
      const growth = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;

      const totalDonations = donationsData.reduce((sum, d) => sum + (d.amount_cents || 0), 0);
      const topCampaign = [...campaignsData].sort((a, b) => (b.raised_cents || 0) - (a.raised_cents || 0))[0] || null;

      setAnalytics({
        totalDonations,
        totalDonors: profiles.length,
        avgDonation: donationsData.length > 0 ? totalDonations / donationsData.length : 0,
        recurringDonors: profiles.filter(p => p.isRecurring).length,
        thisMonth: thisMonthTotal,
        lastMonth: lastMonthTotal,
        growth,
        topCampaign,
        topDonor: profiles[0] || null
      });
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm({
      title: '',
      description: '',
      goal_cents: 0,
      category: 'Building Project',
      start_date: '',
      end_date: '',
      image_url: '',
      is_featured: false
    });
    setShowCampaignModal(true);
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      title: campaign.title,
      description: campaign.description,
      goal_cents: campaign.goal_cents,
      category: campaign.category || 'Building Project',
      start_date: campaign.start_date ? new Date(campaign.start_date).toISOString().slice(0, 10) : '',
      end_date: campaign.end_date ? new Date(campaign.end_date).toISOString().slice(0, 10) : '',
      image_url: campaign.image_url || '',
      is_featured: campaign.is_featured || false
    });
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.title.trim()) {
      toast({ title: t('ministryDonationsManager', 'error', 'Error'), description: t('ministryDonationsManager', 'campaignTitleRequired', 'Campaign title is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ministry_id: ministryId,
        title: campaignForm.title.trim(),
        description: campaignForm.description.trim(),
        goal_cents: campaignForm.goal_cents,
        category: campaignForm.category,
        start_date: campaignForm.start_date || null,
        end_date: campaignForm.end_date || null,
        image_url: campaignForm.image_url || null,
        is_featured: campaignForm.is_featured,
        is_active: true
      };

      if (editingCampaign) {
        const { error } = await supabase
          .from('ministry_donation_campaigns')
          .update(dataToSave)
          .eq('id', editingCampaign.id);
        if (error) throw error;
        toast({ title: t('ministryDonationsManager', 'success', 'Success'), description: t('ministryDonationsManager', 'campaignUpdated', 'Campaign updated') });
      } else {
        const { error } = await supabase
          .from('ministry_donation_campaigns')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryDonationsManager', 'success', 'Success'), description: t('ministryDonationsManager', 'campaignCreated', 'Campaign created') });
      }

      setShowCampaignModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('ministryDonationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm(t('ministryDonationsManager', 'confirmDeleteCampaign', 'Are you sure you want to delete this campaign?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_donation_campaigns')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryDonationsManager', 'success', 'Success'), description: t('ministryDonationsManager', 'campaignDeleted', 'Campaign deleted') });
      loadData();
    } catch (err: any) {
      toast({ title: t('ministryDonationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleCampaignStatus = async (campaign: Campaign) => {
    try {
      const { error } = await supabase
        .from('ministry_donation_campaigns')
        .update({ is_active: !campaign.is_active })
        .eq('id', campaign.id);
      if (error) throw error;
      loadData();
    } catch (err: any) {
      toast({ title: t('ministryDonationsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleViewDonor = (profile: DonorProfile) => {
    setSelectedDonor(profile);
    setShowDonorModal(true);
  };

  const handleExportDonations = () => {
    const csv = [
      ['Date', 'Donor', 'Amount', 'Type', 'Payment Method', 'Status', 'Fund', 'Campaign', 'Recurring'].join(','),
      ...filteredDonations.map(d => [
        new Date(d.created_at).toLocaleDateString(),
        d.is_anonymous ? 'Anonymous' : (d.donor_name || 'Unknown'),
        `$${(d.amount_cents / 100).toFixed(2)}`,
        d.donation_type,
        d.payment_method || '',
        d.status,
        d.fund_allocation || 'General',
        campaigns.find(c => c.id === d.campaign_id)?.title || '',
        d.is_recurring ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDonors = () => {
    const csv = [
      ['Name', 'Email', 'Total Donated', 'Number of Donations', 'First Donation', 'Last Donation', 'Recurring'].join(','),
      ...donorProfiles.map(p => [
        p.donor_name || 'Unknown',
        p.donor_email || '',
        `$${(p.totalDonations / 100).toFixed(2)}`,
        p.donationCount,
        new Date(p.firstDonation).toLocaleDateString(),
        new Date(p.lastDonation).toLocaleDateString(),
        p.isRecurring ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donors-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredDonations = donations.filter(d => {
    const matchesSearch = (d.donor_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.donor_email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchesCampaign = campaignFilter === 'all' || d.campaign_id === campaignFilter;
    return matchesSearch && matchesStatus && matchesCampaign;
  });

  const stats = {
    total: donations.reduce((sum, d) => sum + (d.amount_cents || 0), 0),
    count: donations.length,
    donors: donorProfiles.length,
    recurring: donations.filter(d => d.is_recurring).length,
    activeCampaigns: campaigns.filter(c => c.is_active).length
  };

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
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('ministryDonationsManager', 'searchDonations', 'Search donations...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-80"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryDonationsManager', 'allStatus', 'All Status')}</SelectItem>
              <SelectItem value="completed">{t('ministryDonationsManager', 'completed', 'Completed')}</SelectItem>
              <SelectItem value="pending">{t('ministryDonationsManager', 'pending', 'Pending')}</SelectItem>
              <SelectItem value="failed">{t('ministryDonationsManager', 'failed', 'Failed')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryDonationsManager', 'allCampaigns', 'All Campaigns')}</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAnalyticsModal(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('ministryDonationsManager', 'analytics', 'Analytics')}
          </Button>
          <Button variant="outline" onClick={handleExportDonations}>
            <Download className="h-4 w-4 mr-2" />
            {t('ministryDonationsManager', 'export', 'Export')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-600">{t('ministryDonationsManager', 'totalDonations', 'Total Donations')}</p>
                <p className="text-2xl font-bold text-green-700">${(stats.total / 100).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Gift className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600">{t('ministryDonationsManager', 'donations', 'Donations')}</p>
                <p className="text-2xl font-bold text-blue-700">{stats.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-600">{t('ministryDonationsManager', 'totalDonors', 'Total Donors')}</p>
                <p className="text-2xl font-bold text-purple-700">{stats.donors}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-500 rounded-lg">
                <Repeat className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-pink-600">{t('ministryDonationsManager', 'recurring', 'Recurring')}</p>
                <p className="text-2xl font-bold text-pink-700">{stats.recurring}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg">
                <Target className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-amber-600">{t('ministryDonationsManager', 'activeCampaigns', 'Active Campaigns')}</p>
                <p className="text-2xl font-bold text-amber-700">{stats.activeCampaigns}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue={isLeader ? "donations" : "give"} className="w-full">
        <TabsList>
          {!isLeader && <TabsTrigger value="give">{t('ministryDonationsManager', 'give', 'Give')}</TabsTrigger>}
          <TabsTrigger value="donations">{t('ministryDonationsManager', 'donations', 'Donations')}</TabsTrigger>
          <TabsTrigger value="campaigns">{t('ministryDonationsManager', 'campaigns', 'Campaigns')}</TabsTrigger>
          <TabsTrigger value="donors">{t('ministryDonationsManager', 'donors', 'Donors')}</TabsTrigger>
          {isLeader && <TabsTrigger value="settings">{t('ministryDonationsManager', 'paymentSettings', 'Payment Settings')}</TabsTrigger>}
        </TabsList>

        {/* Give Tab - For non-leaders to donate */}
        {!isLeader && (
          <TabsContent value="give" className="mt-6">
            <MinistryDonationForm
              ministryId={ministryId}
              ministryName={ministryName}
              themeColor={themeColor}
            />
          </TabsContent>
        )}


        {/* Donations Tab */}
        <TabsContent value="donations" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {filteredDonations.length === 0 ? (
                <div className="text-center py-12">
                  <Gift className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">{t('ministryDonationsManager', 'noDonationsYet', 'No Donations Yet')}</h3>
                  <p className="text-gray-500">{t('ministryDonationsManager', 'donationsWillAppearHere', 'Donations will appear here')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'date', 'Date')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'donor', 'Donor')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'amount', 'Amount')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'type', 'Type')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'method', 'Method')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'fund', 'Fund')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'status', 'Status')}</th>
                        <th className="text-left p-4 font-medium">{t('ministryDonationsManager', 'actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDonations.map(donation => (
                        <tr key={donation.id} className="border-b hover:bg-gray-50">
                          <td className="p-4 text-gray-600">
                            {new Date(donation.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {donation.is_anonymous ? (
                                <UserX className="h-4 w-4 text-gray-400" />
                              ) : (
                                <User className="h-4 w-4 text-gray-400" />
                              )}
                              <div>
                                <p className="font-medium">
                                  {donation.is_anonymous ? t('ministryDonationsManager', 'anonymous', 'Anonymous') : (donation.donor_name || t('ministryDonationsManager', 'unknown', 'Unknown'))}
                                </p>
                                {!donation.is_anonymous && donation.donor_email && (
                                  <p className="text-xs text-gray-500">{donation.donor_email}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-4 font-semibold text-green-600">
                            ${(donation.amount_cents / 100).toFixed(2)}
                          </td>
                          <td className="p-4">
                            <div className="flex gap-1">
                              <Badge variant="outline">{donation.donation_type}</Badge>
                              {donation.is_recurring && (
                                <Badge variant="secondary">
                                  <Repeat className="h-3 w-3 mr-1" />
                                  {t('ministryDonationsManager', 'recurring', 'Recurring')}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-xs">
                              <CreditCard className="h-3 w-3 mr-1" />
                              {donation.payment_method || t('ministryDonationsManager', 'card', 'Card')}
                            </Badge>
                          </td>
                          <td className="p-4 text-gray-600">{donation.fund_allocation || t('ministryDonationsManager', 'general', 'General')}</td>
                          <td className="p-4">
                            <Badge variant={donation.status === 'completed' ? 'default' : 'secondary'}>
                              {donation.status}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              {!donation.tax_receipt_sent && donation.status === 'completed' && (
                                <Button variant="ghost" size="sm">
                                  <FileText className="h-4 w-4 mr-1" />
                                  {t('ministryDonationsManager', 'receipt', 'Receipt')}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={handleCreateCampaign}>
              <Plus className="h-4 w-4 mr-2" />
              {t('ministryDonationsManager', 'newCampaign', 'New Campaign')}
            </Button>
          </div>
          {campaigns.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">{t('ministryDonationsManager', 'noCampaignsYet', 'No Campaigns Yet')}</h3>
                <p className="text-gray-500 mb-4">{t('ministryDonationsManager', 'createFirstCampaign', 'Create your first fundraising campaign')}</p>
                <Button onClick={handleCreateCampaign}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('ministryDonationsManager', 'createCampaign', 'Create Campaign')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaigns.map(campaign => {
                const progress = campaign.goal_cents > 0 
                  ? Math.min(100, (campaign.raised_cents / campaign.goal_cents) * 100) 
                  : 0;
                return (
                  <Card key={campaign.id} className="border">
                    <CardContent className="p-0">
                      {campaign.image_url && (
                        <img 
                          src={campaign.image_url} 
                          alt={campaign.title}
                          className="w-full h-48 object-cover rounded-t-lg"
                        />
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold">{campaign.title}</h3>
                              {campaign.is_featured && (
                                <Award className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            <Badge variant="outline" className="mb-2">{campaign.category}</Badge>
                          </div>
                          <Badge variant={campaign.is_active ? 'default' : 'secondary'}>
                            {campaign.is_active ? t('ministryDonationsManager', 'active', 'Active') : t('ministryDonationsManager', 'ended', 'Ended')}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{campaign.description}</p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">
                              {t('ministryDonationsManager', 'amountRaised', '{amount} raised').replace('{amount}', `$${(campaign.raised_cents / 100).toLocaleString()}`)}
                            </span>
                            <span className="text-gray-500">
                              {t('ministryDonationsManager', 'ofAmount', 'of {amount}').replace('{amount}', `$${(campaign.goal_cents / 100).toLocaleString()}`)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{t('ministryDonationsManager', 'percentComplete', '{percent}% complete').replace('{percent}', progress.toFixed(0))}</span>
                            <span>{t('ministryDonationsManager', 'donorsCount', '{count} donors').replace('{count}', String(campaign.donor_count || 0))}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleEditCampaign(campaign)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            {t('ministryDonationsManager', 'edit', 'Edit')}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleToggleCampaignStatus(campaign)}
                          >
                            {campaign.is_active ? t('ministryDonationsManager', 'end', 'End') : t('ministryDonationsManager', 'activate', 'Activate')}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteCampaign(campaign.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Donors Tab */}
        <TabsContent value="donors" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button variant="outline" onClick={handleExportDonors}>
              <Download className="h-4 w-4 mr-2" />
              {t('ministryDonationsManager', 'exportDonors', 'Export Donors')}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {donorProfiles.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">{t('ministryDonationsManager', 'noDonorsYet', 'No Donors Yet')}</h3>
                  <p className="text-gray-500">{t('ministryDonationsManager', 'donorProfilesWillAppearHere', 'Donor profiles will appear here')}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {donorProfiles.map(profile => (
                    <div key={profile.donor_id || profile.donor_email} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <User className="h-6 w-6 text-green-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{profile.donor_name || t('ministryDonationsManager', 'unknown', 'Unknown')}</h3>
                              {profile.isRecurring && (
                                <Badge variant="secondary">
                                  <Heart className="h-3 w-3 mr-1" />
                                  {t('ministryDonationsManager', 'recurringDonor', 'Recurring Donor')}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{profile.donor_email}</p>
                            <div className="flex gap-3 text-xs text-gray-500 mt-1">
                              <span>{t('ministryDonationsManager', 'donationsCount', '{count} donations').replace('{count}', String(profile.donationCount))}</span>
                              <span>{t('ministryDonationsManager', 'sinceDate', 'Since {date}').replace('{date}', new Date(profile.firstDonation).toLocaleDateString())}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-600">
                            ${(profile.totalDonations / 100).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">{t('ministryDonationsManager', 'totalGiven', 'Total Given')}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => handleViewDonor(profile)}
                          >
                            {t('ministryDonationsManager', 'viewDetails', 'View Details')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>



        {/* Payment Settings Tab - For leaders only */}
        {isLeader && (
          <TabsContent value="settings" className="mt-6">
            <MinistryPaymentSettings
              ministryId={ministryId}
              onSave={() => {
                toast({ title: t('ministryDonationsManager', 'settingsSaved', 'Settings Saved'), description: t('ministryDonationsManager', 'paymentSettingsUpdated', 'Payment settings updated successfully') });
              }}
            />
          </TabsContent>
        )}
      </Tabs>


      {/* Campaign Modal */}
      <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? t('ministryDonationsManager', 'editCampaign', 'Edit Campaign') : t('ministryDonationsManager', 'createFundraisingCampaign', 'Create Fundraising Campaign')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryDonationsManager', 'campaignTitleLabel', 'Campaign Title *')}</Label>
              <Input
                value={campaignForm.title}
                onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })}
                placeholder={t('ministryDonationsManager', 'campaignTitlePlaceholder', 'e.g., New Building Fund')}
              />
            </div>
            <div>
              <Label>{t('ministryDonationsManager', 'description', 'Description')}</Label>
              <Textarea
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                placeholder={t('ministryDonationsManager', 'descriptionPlaceholder', 'Describe the campaign purpose and goals...')}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryDonationsManager', 'goalAmount', 'Goal Amount ($)')}</Label>
                <Input
                  type="number"
                  value={campaignForm.goal_cents / 100}
                  onChange={(e) => setCampaignForm({ ...campaignForm, goal_cents: parseFloat(e.target.value) * 100 || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>{t('ministryDonationsManager', 'category', 'Category')}</Label>
                <Select
                  value={campaignForm.category}
                  onValueChange={(v) => setCampaignForm({ ...campaignForm, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryDonationsManager', 'startDate', 'Start Date')}</Label>
                <Input
                  type="date"
                  value={campaignForm.start_date}
                  onChange={(e) => setCampaignForm({ ...campaignForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('ministryDonationsManager', 'endDate', 'End Date')}</Label>
                <Input
                  type="date"
                  value={campaignForm.end_date}
                  onChange={(e) => setCampaignForm({ ...campaignForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>{t('ministryDonationsManager', 'campaignImageUrl', 'Campaign Image URL (Optional)')}</Label>
              <Input
                value={campaignForm.image_url}
                onChange={(e) => setCampaignForm({ ...campaignForm, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Switch
                checked={campaignForm.is_featured}
                onCheckedChange={(v) => setCampaignForm({ ...campaignForm, is_featured: v })}
              />
              <div>
                <Label>{t('ministryDonationsManager', 'featuredCampaign', 'Featured Campaign')}</Label>
                <p className="text-xs text-gray-500">{t('ministryDonationsManager', 'displayProminently', 'Display prominently on donation page')}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignModal(false)}>{t('ministryDonationsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSaveCampaign} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingCampaign ? t('ministryDonationsManager', 'updateCampaign', 'Update Campaign') : t('ministryDonationsManager', 'createCampaign', 'Create Campaign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Donor Details Modal */}
      <Dialog open={showDonorModal} onOpenChange={setShowDonorModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('ministryDonationsManager', 'donorProfile', 'Donor Profile')}</DialogTitle>
          </DialogHeader>
          {selectedDonor && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <User className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{selectedDonor.donor_name}</h3>
                    <p className="text-gray-600">{selectedDonor.donor_email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'totalDonated', 'Total Donated')}</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${(selectedDonor.totalDonations / 100).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'numberOfDonations', 'Number of Donations')}</p>
                    <p className="text-2xl font-bold">{selectedDonor.donationCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'firstDonation', 'First Donation')}</p>
                    <p className="font-medium">{new Date(selectedDonor.firstDonation).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'lastDonation', 'Last Donation')}</p>
                    <p className="font-medium">{new Date(selectedDonor.lastDonation).toLocaleDateString()}</p>
                  </div>
                </div>
                {selectedDonor.isRecurring && (
                  <div className="mt-3 p-2 bg-pink-50 border border-pink-200 rounded flex items-center gap-2">
                    <Heart className="h-4 w-4 text-pink-600" />
                    <span className="text-sm text-pink-700 font-medium">{t('ministryDonationsManager', 'recurringDonor', 'Recurring Donor')}</span>
                  </div>
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('ministryDonationsManager', 'donationHistory', 'Donation History')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {donations
                      .filter(d => d.donor_id === selectedDonor.donor_id || d.donor_email === selectedDonor.donor_email)
                      .slice(0, 5)
                      .map(d => (
                        <div key={d.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium">${(d.amount_cents / 100).toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(d.created_at).toLocaleDateString()} • {d.fund_allocation || t('ministryDonationsManager', 'general', 'General')}
                            </p>
                          </div>
                          <Badge variant={d.status === 'completed' ? 'default' : 'secondary'}>
                            {d.status}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowDonorModal(false)}>{t('ministryDonationsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Modal */}
      <Dialog open={showAnalyticsModal} onOpenChange={setShowAnalyticsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ministryDonationsManager', 'donationsAnalytics', 'Donations Analytics')}</DialogTitle>
          </DialogHeader>
          {analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <DollarSign className="h-8 w-8 mx-auto text-green-500 mb-2" />
                      <p className="text-2xl font-bold">${(analytics.avgDonation / 100).toFixed(2)}</p>
                      <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'averageDonation', 'Average Donation')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <Repeat className="h-8 w-8 mx-auto text-pink-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.recurringDonors}</p>
                      <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'recurringDonors', 'Recurring Donors')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <TrendingUp className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.growth.toFixed(1)}%</p>
                      <p className="text-sm text-gray-500">{t('ministryDonationsManager', 'monthlyGrowth', 'Monthly Growth')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500 mb-1">{t('ministryDonationsManager', 'thisMonth', 'This Month')}</p>
                    <p className="text-3xl font-bold text-green-600">
                      ${(analytics.thisMonth / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500 mb-1">{t('ministryDonationsManager', 'lastMonth', 'Last Month')}</p>
                    <p className="text-3xl font-bold text-gray-600">
                      ${(analytics.lastMonth / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {analytics.topCampaign && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Award className="h-5 w-5 text-amber-500" />
                      {t('ministryDonationsManager', 'topCampaign', 'Top Campaign')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">{analytics.topCampaign.title}</h4>
                      <p className="text-sm text-gray-600 mb-3">{analytics.topCampaign.description}</p>
                      <div className="flex gap-4 text-sm">
                        <span className="font-medium text-green-600">
                          {t('ministryDonationsManager', 'amountRaised', '{amount} raised').replace('{amount}', `$${(analytics.topCampaign.raised_cents / 100).toLocaleString()}`)}
                        </span>
                        <span className="text-gray-500">
                          {t('ministryDonationsManager', 'donorsCount', '{count} donors').replace('{count}', String(analytics.topCampaign.donor_count))}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {analytics.topDonor && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Heart className="h-5 w-5 text-pink-500" />
                      {t('ministryDonationsManager', 'topDonor', 'Top Donor')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{analytics.topDonor.donor_name}</h4>
                          <p className="text-sm text-gray-600">{analytics.topDonor.donor_email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {t('ministryDonationsManager', 'donationsCount', '{count} donations').replace('{count}', String(analytics.topDonor.donationCount))}
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-green-600">
                          ${(analytics.topDonor.totalDonations / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsModal(false)}>{t('ministryDonationsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default MinistryDonationsManager;
