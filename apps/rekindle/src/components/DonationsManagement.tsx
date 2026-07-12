import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { PaymentSettingsDialog } from './PaymentSettingsDialog';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  DollarSign, TrendingUp, Users, Calendar, Download,
  Search, Settings, CreditCard, MessageSquare, Building2,
  Save, Loader2, Heart, RefreshCw
} from 'lucide-react';

interface DonationsManagementProps {
  donations: any[];
  sponsors: any[];
  onUpdate: () => void;
}

// Partner days by amount
function calcPartnerDays(amount: number, currency: string): number {
  if (currency === 'NGN') {
    if (amount >= 10000) return 90;
    if (amount >= 5000)  return 60;
    return 30;
  }
  // USD and others
  if (amount >= 50)  return 365;
  if (amount >= 25)  return 180;
  if (amount >= 10)  return 90;
  if (amount >= 5)   return 60;
  return 30;
}

interface BankSettings {
  donation_whatsapp_number: string;
  donation_bank_name: string;
  donation_account_number: string;
  donation_account_name: string;
  donation_bank_country: string;
  donation_usd_instructions: string;
}

export const DonationsManagement: React.FC<DonationsManagementProps> = ({ donations, sponsors, onUpdate }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm]       = useState('');
  const [dateRange, setDateRange]         = useState('all');
  const [amountFilter, setAmountFilter]   = useState('all');
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [bankSettings, setBankSettings]   = useState<BankSettings>({
    donation_whatsapp_number: '',
    donation_bank_name: '',
    donation_account_number: '',
    donation_account_name: '',
    donation_bank_country: 'Nigeria',
    donation_usd_instructions: '',
  });
  const [savingBank, setSavingBank]       = useState(false);
  const [bankLoaded, setBankLoaded]       = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partners, setPartners]           = useState<any[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);

  // Load bank settings
  const loadBankSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', [
          'donation_whatsapp_number','donation_bank_name',
          'donation_account_number','donation_account_name',
          'donation_bank_country','donation_usd_instructions'
        ]);
      if (data) {
        const map: any = {};
        data.forEach((r: any) => { map[r.key] = r.value; });
        setBankSettings(prev => ({ ...prev, ...map }));
      }
      setBankLoaded(true);
    } catch (err) {
      console.error('Error loading bank settings:', err);
    }
  }, []);

  // Load partners
  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, partner_expires_at, partner_total_donated, partner_donation_count')
        .not('partner_expires_at', 'is', null)
        .order('partner_expires_at', { ascending: false });
      setPartners(data ?? []);
    } catch (err) {
      console.error('Error loading partners:', err);
    } finally {
      setLoadingPartners(false);
    }
  }, []);

  useEffect(() => { loadBankSettings(); loadPartners(); }, []);

  const saveBankSettings = async () => {
    setSavingBank(true);
    try {
      const upserts = Object.entries(bankSettings).map(([key, value]) => ({
        key, value, updated_at: new Date().toISOString()
      }));
      const { error } = await supabase
        .from('platform_settings')
        .upsert(upserts, { onConflict: 'key' });
      if (error) throw error;
      toast({ title: t('donationsManagement', 'bankDetailsSaved', 'Bank details saved'), description: t('donationsManagement', 'donationPageUpdated', 'Donation page updated successfully.') });
    } catch (err: any) {
      toast({ title: t('donationsManagement', 'errorSavingSettings', 'Error saving settings'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingBank(false);
    }
  };

  const filteredDonations = useMemo(() => {
    let filtered = [...donations];
    if (searchTerm) {
      filtered = filtered.filter(d =>
        d.donor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.donor_email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date(now.setDate(now.getDate() - parseInt(dateRange)));
      filtered = filtered.filter(d => new Date(d.created_at) >= cutoff);
    }
    if (amountFilter !== 'all') {
      const [min, max] = amountFilter.split('-').map(Number);
      filtered = filtered.filter(d => {
        const amount = d.amount || 0;
        return max ? amount >= min && amount <= max : amount >= min;
      });
    }
    return filtered;
  }, [donations, searchTerm, dateRange, amountFilter]);

  const stats = useMemo(() => {
    const total       = filteredDonations.reduce((sum, d) => sum + (d.amount || 0), 0);
    const uniqueDonors = new Set(filteredDonations.map(d => d.donor_email)).size;
    return {
      totalAmount:    total.toFixed(2),
      totalDonations: filteredDonations.length,
      avgDonation:    filteredDonations.length > 0 ? (total / filteredDonations.length).toFixed(2) : '0.00',
      uniqueDonors,
    };
  }, [filteredDonations]);

  const filteredPartners = useMemo(() => {
    if (!partnerSearch) return partners;
    const q = partnerSearch.toLowerCase();
    return partners.filter(p =>
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  }, [partners, partnerSearch]);

  const exportCSV = () => {
    const csvData = [
      ['Donor Name','Email','Amount','Currency','Date','Status','Method','Partner Days'],
      ...filteredDonations.map(d => [
        d.is_anonymous ? 'Anonymous' : (d.donor_name ?? ''),
        d.donor_email ?? 'N/A',
        d.amount,
        d.currency ?? 'USD',
        new Date(d.created_at).toLocaleDateString(),
        d.payment_status ?? d.status,
        d.payment_method ?? d.provider ?? 'N/A',
        calcPartnerDays(d.amount, d.currency ?? 'USD'),
      ])
    ];
    const csv  = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `donations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">

      {/* Payment Gateway Settings */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <CreditCard className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{t('donationsManagement', 'paymentGatewaySettings', 'Payment Gateway Settings')}</h3>
                <p className="text-sm text-gray-600">{t('donationsManagement', 'configureApiKeys', 'Configure Stripe and Paystack API keys')}</p>
              </div>
            </div>
            <Button onClick={() => setShowPaymentSettings(true)} className="bg-purple-600 hover:bg-purple-700">
              <Settings className="h-4 w-4 mr-2" />{t('donationsManagement', 'configure', 'Configure')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bank & WhatsApp Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-green-600" />
            {t('donationsManagement', 'directTransferDetails', 'Direct Transfer Details')}
          </CardTitle>
          <CardDescription>
            {t('donationsManagement', 'directTransferDesc', 'These details appear on the donation page for users who prefer bank transfer or WhatsApp payment')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                {t('donationsManagement', 'whatsappNumber', 'WhatsApp Number')}
              </Label>
              <Input
                placeholder="+2348012345678"
                value={bankSettings.donation_whatsapp_number}
                onChange={e => setBankSettings(p => ({ ...p, donation_whatsapp_number: e.target.value }))}
              />
              <p className="text-xs text-gray-500">{t('donationsManagement', 'whatsappHint', 'Users message this number to confirm manual transfers')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('donationsManagement', 'bankName', 'Bank Name')}</Label>
              <Input
                placeholder={t('donationsManagement', 'bankNamePlaceholder', 'e.g. GTBank, Access Bank')}
                value={bankSettings.donation_bank_name}
                onChange={e => setBankSettings(p => ({ ...p, donation_bank_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('donationsManagement', 'accountNumber', 'Account Number')}</Label>
              <Input
                placeholder="0123456789"
                value={bankSettings.donation_account_number}
                onChange={e => setBankSettings(p => ({ ...p, donation_account_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('donationsManagement', 'accountName', 'Account Name')}</Label>
              <Input
                placeholder="ReKindle BC / Tola Francis Olabanjo"
                value={bankSettings.donation_account_name}
                onChange={e => setBankSettings(p => ({ ...p, donation_account_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('donationsManagement', 'bankCountry', 'Bank Country')}</Label>
              <Input
                placeholder="Nigeria"
                value={bankSettings.donation_bank_country}
                onChange={e => setBankSettings(p => ({ ...p, donation_bank_country: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('donationsManagement', 'usdInstructions', 'USD / International Instructions')}</Label>
              <Input
                placeholder={t('donationsManagement', 'usdInstructionsPlaceholder', 'e.g. Wise transfer to tola@rekindlebc.com')}
                value={bankSettings.donation_usd_instructions}
                onChange={e => setBankSettings(p => ({ ...p, donation_usd_instructions: e.target.value }))}
              />
            </div>
          </div>
          <Button onClick={saveBankSettings} disabled={savingBank} className="bg-green-600 hover:bg-green-700 text-white">
            {savingBank ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('donationsManagement', 'saving', 'Saving...')}</> : <><Save className="h-4 w-4 mr-2" />{t('donationsManagement', 'saveDetails', 'Save Details')}</>}
          </Button>
        </CardContent>
      </Card>

      {/* Partner Days Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500" />
            {t('donationsManagement', 'partnerDaysByAmount', 'Partner Days by Donation Amount')}
          </CardTitle>
          <CardDescription>{t('donationsManagement', 'partnerDaysGrantDesc', 'How many Partner days each donation grants')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">NGN</p>
              <div className="space-y-1 text-sm">
                {[['Any amount', '30 days'],['₦5,000+','60 days'],['₦10,000+','90 days']].map(([a,d]) => (
                  <div key={a} className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>{a}</span><span className="font-medium text-green-700">{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('donationsManagement', 'usdOther', 'USD / Other')}</p>
              <div className="space-y-1 text-sm">
                {[['Any amount','30 days'],['$5+','60 days'],['$10+','90 days'],['$25+','180 days'],['$50+','365 days']].map(([a,d]) => (
                  <div key={a} className="flex justify-between p-2 bg-gray-50 rounded">
                    <span>{a}</span><span className="font-medium text-green-700">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('donationsManagement', 'totalRaised', 'Total Raised'), value: `$${stats.totalAmount}`, icon: DollarSign, color: 'text-green-500' },
          { label: t('donationsManagement', 'donations', 'Donations'), value: stats.totalDonations, icon: TrendingUp, color: 'text-blue-500' },
          { label: t('donationsManagement', 'avgDonation', 'Avg Donation'), value: `$${stats.avgDonation}`, icon: Calendar, color: 'text-purple-500' },
          { label: t('donationsManagement', 'donors', 'Donors'), value: stats.uniqueDonors, icon: Users, color: 'text-orange-500' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Partners */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-rose-500" />
                {t('donationsManagement', 'activePartners', 'Active Partners')}
              </CardTitle>
              <CardDescription>{t('donationsManagement', 'activePartnersDesc', 'Users with active Partner status')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadPartners} disabled={loadingPartners}>
              <RefreshCw className={`h-3.5 w-3.5 ${loadingPartners ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('donationsManagement', 'searchPartners', 'Search partners...')}
                value={partnerSearch}
                onChange={e => setPartnerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="text-left px-3 py-2">{t('donationsManagement', 'name', 'Name')}</th>
                    <th className="text-left px-3 py-2">{t('donationsManagement', 'email', 'Email')}</th>
                    <th className="text-left px-3 py-2">{t('donationsManagement', 'expires', 'Expires')}</th>
                    <th className="text-left px-3 py-2">{t('donationsManagement', 'totalGiven', 'Total Given')}</th>
                    <th className="text-left px-3 py-2">{t('donationsManagement', 'status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">{t('donationsManagement', 'noPartnersYet', 'No partners yet')}</td></tr>
                  ) : filteredPartners.map(p => {
                    const expired = p.partner_expires_at && new Date(p.partner_expires_at) < new Date();
                    return (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{p.full_name ?? t('donationsManagement', 'unknown', 'Unknown')}</td>
                        <td className="px-3 py-2 text-gray-500">{p.email}</td>
                        <td className="px-3 py-2">
                          {p.partner_expires_at
                            ? new Date(p.partner_expires_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-green-700 font-medium">
                          ${Number(p.partner_total_donated ?? 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={expired ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}>
                            {expired ? t('donationsManagement', 'expired', 'Expired') : t('donationsManagement', 'active', 'Active')}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Donations History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('donationsManagement', 'donationsHistory', 'Donations History')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder={t('donationsManagement', 'searchDonors', 'Search donors...')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40"><SelectValue placeholder={t('donationsManagement', 'dateRange', 'Date range')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('donationsManagement', 'allTime', 'All Time')}</SelectItem>
                  <SelectItem value="7">{t('donationsManagement', 'last7Days', 'Last 7 days')}</SelectItem>
                  <SelectItem value="30">{t('donationsManagement', 'last30Days', 'Last 30 days')}</SelectItem>
                  <SelectItem value="90">{t('donationsManagement', 'last90Days', 'Last 90 days')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={amountFilter} onValueChange={setAmountFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder={t('donationsManagement', 'amount', 'Amount')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('donationsManagement', 'allAmounts', 'All Amounts')}</SelectItem>
                  <SelectItem value="0-50">$0 - $50</SelectItem>
                  <SelectItem value="50-100">$50 - $100</SelectItem>
                  <SelectItem value="100-500">$100 - $500</SelectItem>
                  <SelectItem value="500-0">$500+</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />{t('donationsManagement', 'export', 'Export')}
              </Button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {[
                      t('donationsManagement', 'donor', 'Donor'),
                      t('donationsManagement', 'email', 'Email'),
                      t('donationsManagement', 'amount', 'Amount'),
                      t('donationsManagement', 'date', 'Date'),
                      t('donationsManagement', 'status', 'Status'),
                      t('donationsManagement', 'method', 'Method'),
                      t('donationsManagement', 'partnerDays', 'Partner Days'),
                    ].map(h => (
                      <th key={h} className="text-left p-3 font-medium text-xs text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDonations.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">{t('donationsManagement', 'noDonationsYet', 'No donations yet')}</td></tr>
                  ) : filteredDonations.map(donation => (
                    <tr key={donation.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{donation.is_anonymous ? t('donationsManagement', 'anonymous', 'Anonymous') : donation.donor_name}</td>
                      <td className="p-3 text-gray-500">{donation.donor_email ?? t('donationsManagement', 'na', 'N/A')}</td>
                      <td className="p-3 font-semibold text-green-600">
                        {donation.currency === 'NGN' ? '₦' : '$'}{Number(donation.amount ?? 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs">{new Date(donation.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <Badge variant={donation.payment_status === 'completed' ? 'default' : donation.payment_status === 'pending' ? 'secondary' : 'destructive'}>
                          {donation.payment_status ?? donation.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs capitalize">{donation.payment_method ?? donation.provider ?? t('donationsManagement', 'na', 'N/A')}</td>
                      <td className="p-3 text-xs text-green-700 font-medium">
                        {t('donationsManagement', 'nDays', '{n} days').replace('{n}', String(calcPartnerDays(donation.amount, donation.currency ?? 'USD')))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <PaymentSettingsDialog open={showPaymentSettings} onOpenChange={setShowPaymentSettings} />
    </div>
  );
};
