import React, { useState, useEffect } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '../ui/use-toast';
import {
  DollarSign, TrendingUp, Building2, Search, RefreshCw,
  Loader2, Download, CreditCard, ArrowUpRight, ArrowDownRight,
  Calendar, Receipt
} from 'lucide-react';

interface PlatformFee {
  id: string;
  ministry_id: string;
  fee_type: string;
  amount: number;
  percentage: number;
  transaction_id: string;
  description: string;
  status: string;
  collected_at: string;
  created_at: string;
}

interface Donation {
  id: string;
  ministry_id: string;
  amount: number;
  donor_name: string;
  donor_email: string;
  payment_method: string;
  status: string;
  created_at: string;
}

interface Ministry {
  id: string;
  name: string;
  theme_color: string;
}

interface BillingOverviewProps {
  onUpdate: () => void;
}

export const BillingOverview: React.FC<BillingOverviewProps> = ({ onUpdate }) => {
  const { t } = useLanguage();
  const [fees, setFees] = useState<PlatformFee[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [ministries, setMinistries] = useState<Record<string, Ministry>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('30');
  const [activeView, setActiveView] = useViewHistory<'fees' | 'donations'>('billing-overview', 'fees');

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalFees: 0,
    totalDonations: 0,
    pendingFees: 0,
    collectedFees: 0,
    avgFeePerMinistry: 0,
    monthlyGrowth: 0
  });

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateFilter));

      const [feesRes, donationsRes, ministriesRes] = await Promise.all([
        supabase.from('platform_fees').select('*').gte('created_at', daysAgo.toISOString()).order('created_at', { ascending: false }),
        supabase.from('donations').select('*').gte('created_at', daysAgo.toISOString()).order('created_at', { ascending: false }),
        supabase.from('ministry_groups').select('id, name, theme_color')
      ]);

      setFees(feesRes.data || []);
      setDonations(donationsRes.data || []);

      const ministryMap: Record<string, Ministry> = {};
      (ministriesRes.data || []).forEach(m => { ministryMap[m.id] = m; });
      setMinistries(ministryMap);

      // Calculate stats
      const allFees = feesRes.data || [];
      const allDonations = donationsRes.data || [];
      
      const totalFees = allFees.reduce((sum, f) => sum + Number(f.amount), 0);
      const totalDonations = allDonations.reduce((sum, d) => sum + Number(d.amount), 0);
      const collectedFees = allFees.filter(f => f.status === 'collected').reduce((sum, f) => sum + Number(f.amount), 0);
      const pendingFees = allFees.filter(f => f.status === 'pending').reduce((sum, f) => sum + Number(f.amount), 0);
      
      const uniqueMinistries = new Set(allFees.map(f => f.ministry_id));

      setStats({
        totalRevenue: totalFees + totalDonations,
        totalFees,
        totalDonations,
        pendingFees,
        collectedFees,
        avgFeePerMinistry: uniqueMinistries.size > 0 ? totalFees / uniqueMinistries.size : 0,
        monthlyGrowth: 12.5 // Placeholder
      });
    } catch (err) {
      console.error('Error loading billing data:', err);
      toast({ title: t('billingOverview', 'errorTitle', 'Error'), description: t('billingOverview', 'failedLoad', 'Failed to load billing data'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCollectFee = async (feeId: string) => {
    try {
      await supabase
        .from('platform_fees')
        .update({ status: 'collected', collected_at: new Date().toISOString() })
        .eq('id', feeId);

      toast({ title: t('billingOverview', 'successTitle', 'Success'), description: t('billingOverview', 'feeCollected', 'Fee marked as collected') });
      loadData();
      onUpdate();
    } catch (err: any) {
      toast({ title: t('billingOverview', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleExportCSV = () => {
    const data = activeView === 'fees' ? fees : donations;
    const headers = activeView === 'fees'
      ? [t('billingOverview', 'ministry', 'Ministry'), t('billingOverview', 'type', 'Type'), t('billingOverview', 'amount', 'Amount'), t('billingOverview', 'status', 'Status'), t('billingOverview', 'date', 'Date')]
      : [t('billingOverview', 'ministry', 'Ministry'), t('billingOverview', 'donor', 'Donor'), t('billingOverview', 'amount', 'Amount'), t('billingOverview', 'status', 'Status'), t('billingOverview', 'date', 'Date')];
    
    const rows = data.map(item => {
      if (activeView === 'fees') {
        const fee = item as PlatformFee;
        return [
          ministries[fee.ministry_id]?.name || t('billingOverview', 'unknown', 'Unknown'),
          fee.fee_type,
          `$${Number(fee.amount).toFixed(2)}`,
          fee.status,
          new Date(fee.created_at).toLocaleDateString()
        ];
      } else {
        const donation = item as Donation;
        return [
          ministries[donation.ministry_id]?.name || t('billingOverview', 'unknown', 'Unknown'),
          donation.donor_name || t('billingOverview', 'anonymous', 'Anonymous'),
          `$${Number(donation.amount).toFixed(2)}`,
          donation.status,
          new Date(donation.created_at).toLocaleDateString()
        ];
      }
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeView}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredFees = fees.filter(fee => {
    const ministry = ministries[fee.ministry_id];
    return ministry?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fee.fee_type?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredDonations = donations.filter(donation => {
    const ministry = ministries[donation.ministry_id];
    return ministry?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      donation.donor_name?.toLowerCase().includes(searchTerm.toLowerCase());
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
      {/* Revenue Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-emerald-600">{t('billingOverview', 'totalRevenue', 'Total Revenue')}</p>
                <p className="text-2xl font-bold text-emerald-700">${stats.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600">{t('billingOverview', 'platformFees', 'Platform Fees')}</p>
                <p className="text-2xl font-bold text-blue-700">${stats.totalFees.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-600">{t('billingOverview', 'donations', 'Donations')}</p>
                <p className="text-2xl font-bold text-purple-700">${stats.totalDonations.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-600">{t('billingOverview', 'growth', 'Growth')}</p>
                <p className="text-2xl font-bold text-green-700 flex items-center">
                  {stats.monthlyGrowth > 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                  {stats.monthlyGrowth}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fee Status */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('billingOverview', 'collectedFees', 'Collected Fees')}</p>
                <p className="text-xl font-bold text-green-600">${stats.collectedFees.toLocaleString()}</p>
              </div>
              <Badge className="bg-green-100 text-green-700">{t('billingOverview', 'collected', 'Collected')}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('billingOverview', 'pendingFees', 'Pending Fees')}</p>
                <p className="text-xl font-bold text-amber-600">${stats.pendingFees.toLocaleString()}</p>
              </div>
              <Badge className="bg-amber-100 text-amber-700">{t('billingOverview', 'pending', 'Pending')}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & View Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2">
              <Button 
                variant={activeView === 'fees' ? 'default' : 'outline'}
                onClick={() => setActiveView('fees')}
              >
                {t('billingOverview', 'platformFees', 'Platform Fees')}
              </Button>
              <Button
                variant={activeView === 'donations' ? 'default' : 'outline'}
                onClick={() => setActiveView('donations')}
              >
                {t('billingOverview', 'donations', 'Donations')}
              </Button>
            </div>
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('billingOverview', 'searchPlaceholder', 'Search...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-36">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('billingOverview', 'last7Days', 'Last 7 days')}</SelectItem>
                <SelectItem value="30">{t('billingOverview', 'last30Days', 'Last 30 days')}</SelectItem>
                <SelectItem value="90">{t('billingOverview', 'last90Days', 'Last 90 days')}</SelectItem>
                <SelectItem value="365">{t('billingOverview', 'lastYear', 'Last year')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              {t('billingOverview', 'exportCsv', 'Export CSV')}
            </Button>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('billingOverview', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {activeView === 'fees' ? <Receipt className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
            {activeView === 'fees' ? t('billingOverview', 'platformFees', 'Platform Fees') : t('billingOverview', 'donations', 'Donations')} ({activeView === 'fees' ? filteredFees.length : filteredDonations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">{t('billingOverview', 'ministry', 'Ministry')}</th>
                  {activeView === 'fees' ? (
                    <>
                      <th className="text-left p-4 font-medium">{t('billingOverview', 'type', 'Type')}</th>
                      <th className="text-left p-4 font-medium">{t('billingOverview', 'amount', 'Amount')}</th>
                      <th className="text-left p-4 font-medium">{t('billingOverview', 'percentage', 'Percentage')}</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left p-4 font-medium">{t('billingOverview', 'donor', 'Donor')}</th>
                      <th className="text-left p-4 font-medium">{t('billingOverview', 'amount', 'Amount')}</th>
                      <th className="text-left p-4 font-medium">{t('billingOverview', 'method', 'Method')}</th>
                    </>
                  )}
                  <th className="text-left p-4 font-medium">{t('billingOverview', 'status', 'Status')}</th>
                  <th className="text-left p-4 font-medium">{t('billingOverview', 'date', 'Date')}</th>
                  {activeView === 'fees' && <th className="text-left p-4 font-medium">{t('billingOverview', 'actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {activeView === 'fees' ? (
                  filteredFees.map(fee => {
                    const ministry = ministries[fee.ministry_id];
                    return (
                      <tr key={fee.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: ministry?.theme_color || '#7c3aed' }}
                            >
                              <Building2 className="h-4 w-4 text-white" />
                            </div>
                            <span className="font-medium">{ministry?.name || t('billingOverview', 'unknown', 'Unknown')}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{fee.fee_type}</Badge>
                        </td>
                        <td className="p-4 font-medium">${Number(fee.amount).toFixed(2)}</td>
                        <td className="p-4">{fee.percentage}%</td>
                        <td className="p-4">
                          <Badge className={
                            fee.status === 'collected' ? 'bg-green-100 text-green-700' :
                            fee.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-700'
                          }>
                            {fee.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-gray-600">
                          {new Date(fee.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          {fee.status === 'pending' && (
                            <Button size="sm" onClick={() => handleCollectFee(fee.id)}>
                              {t('billingOverview', 'collect', 'Collect')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  filteredDonations.map(donation => {
                    const ministry = ministries[donation.ministry_id];
                    return (
                      <tr key={donation.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: ministry?.theme_color || '#7c3aed' }}
                            >
                              <Building2 className="h-4 w-4 text-white" />
                            </div>
                            <span className="font-medium">{ministry?.name || t('billingOverview', 'unknown', 'Unknown')}</span>
                          </div>
                        </td>
                        <td className="p-4">{donation.donor_name || t('billingOverview', 'anonymous', 'Anonymous')}</td>
                        <td className="p-4 font-medium">${Number(donation.amount).toFixed(2)}</td>
                        <td className="p-4">
                          <Badge variant="outline">{donation.payment_method || t('billingOverview', 'card', 'Card')}</Badge>
                        </td>
                        <td className="p-4">
                          <Badge className={
                            donation.status === 'completed' ? 'bg-green-100 text-green-700' :
                            donation.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-700'
                          }>
                            {donation.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-gray-600">
                          {new Date(donation.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingOverview;
