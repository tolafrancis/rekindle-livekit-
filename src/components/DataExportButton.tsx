import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';
import { Download, Loader2, FileJson, FileSpreadsheet, Lock } from 'lucide-react';

interface DataExportButtonProps {
  userId: string;
  userEmail: string;
  supabaseClient?: any; // Accept supabase client as prop
}

export const DataExportButton: React.FC<DataExportButtonProps> = ({ 
  userId, 
  userEmail,
  supabaseClient 
}) => {
  const entitlements = useUserEntitlements();
  const { t } = useLanguage();

  const [showModal, setShowModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [loading, setLoading] = useState(false);
  
  // Check if user can export data (Ministry+ feature)
  const canExportData = entitlements.canExportData;

  const fetchUserData = async () => {
    try {
      if (!supabaseClient) {
        throw new Error('Supabase client not available');
      }

      // Fetch profile data
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('Profile error:', profileError);
      }

      // Fetch prayer journal entries
      const { data: prayers, error: prayersError } = await supabaseClient
        .from('prayer_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (prayersError && prayersError.code !== 'PGRST116') {
        console.warn('Prayer entries error:', prayersError);
      }

      // Fetch devotional progress
      const { data: devotionals, error: devotionalsError } = await supabaseClient
        .from('devotional_progress')
        .select('*')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false });

      if (devotionalsError && devotionalsError.code !== 'PGRST116') {
        console.warn('Devotional progress error:', devotionalsError);
      }

      // Fetch prayer streaks/stats if table exists
      const { data: streaks, error: streaksError } = await supabaseClient
        .from('prayer_streaks')
        .select('*')
        .eq('user_id', userId);

      if (streaksError && streaksError.code !== 'PGRST116') {
        console.warn('Streaks error:', streaksError);
      }

      return {
        profile: profile || {},
        prayerEntries: prayers || [],
        devotionalProgress: devotionals || [],
        prayerStreaks: streaks || [],
        exportedAt: new Date().toISOString(),
        exportedBy: userEmail,
      };
    } catch (error: any) {
      console.error('Error fetching user data:', error);
      throw error;
    }
  };

  const convertToCSV = (data: any) => {
    const sections: string[] = [];

    // Profile section
    sections.push('=== PROFILE INFORMATION ===');
    if (data.profile && Object.keys(data.profile).length > 0) {
      const profileHeaders = Object.keys(data.profile).join(',');
      const profileValues = Object.values(data.profile).map((v: any) => 
        typeof v === 'string' && v.includes(',') ? `"${v}"` : v
      ).join(',');
      sections.push(profileHeaders);
      sections.push(profileValues);
    }
    sections.push('');

    // Prayer Entries section
    if (data.prayerEntries.length > 0) {
      sections.push('=== PRAYER JOURNAL ENTRIES ===');
      const prayerHeaders = Object.keys(data.prayerEntries[0]).join(',');
      sections.push(prayerHeaders);
      data.prayerEntries.forEach((entry: any) => {
        const values = Object.values(entry).map((v: any) =>
          typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v
        ).join(',');
        sections.push(values);
      });
      sections.push('');
    }

    // Devotional Progress section
    if (data.devotionalProgress.length > 0) {
      sections.push('=== DEVOTIONAL PROGRESS ===');
      const devotionalHeaders = Object.keys(data.devotionalProgress[0]).join(',');
      sections.push(devotionalHeaders);
      data.devotionalProgress.forEach((entry: any) => {
        const values = Object.values(entry).map((v: any) =>
          typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v
        ).join(',');
        sections.push(values);
      });
      sections.push('');
    }

    // Streaks section
    if (data.prayerStreaks.length > 0) {
      sections.push('=== PRAYER STREAKS ===');
      const streakHeaders = Object.keys(data.prayerStreaks[0]).join(',');
      sections.push(streakHeaders);
      data.prayerStreaks.forEach((entry: any) => {
        const values = Object.values(entry).map((v: any) =>
          typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v
        ).join(',');
        sections.push(values);
      });
    }

    return sections.join('\n');
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await fetchUserData();
      
      let content: string;
      let filename: string;
      let mimeType: string;

      if (exportFormat === 'json') {
        content = JSON.stringify(data, null, 2);
        filename = `my-prayer-data-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else {
        content = convertToCSV(data);
        filename = `my-prayer-data-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      }

      // Create blob and download
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: t('dataExportButton', 'exportSuccessful', 'Export Successful'),
        description: t('dataExportButton', 'downloadedAs', 'Your data has been downloaded as {filename}').replace('{filename}', String(filename)),
      });
      setShowModal(false);
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: t('dataExportButton', 'exportFailed', 'Export Failed'),
        description: error.message || t('dataExportButton', 'failedToExport', 'Failed to export data'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => {
          if (!canExportData) {
            toast({
              title: t('dataExportButton', 'ministryTierRequired', 'Ministry Tier Required'),
              description: t('dataExportButton', 'ministryTierDesc', 'Data export requires Ministry tier subscription'),
              variant: 'destructive'
            });
            return;
          }
          setShowModal(true);
        }}
        disabled={!canExportData}
        className="w-full"
      >
        {!canExportData && <Lock className="mr-2 h-4 w-4" />}
        <Download className="mr-2 h-4 w-4" />
        {!canExportData ? t('dataExportButton', 'ministryRequired', 'Ministry Required') : t('dataExportButton', 'downloadMyData', 'Download My Data')}
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dataExportButton', 'exportYourData', 'Export Your Data')}</DialogTitle>
            <DialogDescription>
              {t('dataExportButton', 'exportYourDataDesc', 'Download all your personal data including prayer journal entries, devotional progress, and profile information.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-3">
              <Label>{t('dataExportButton', 'exportFormat', 'Export Format')}</Label>
              <RadioGroup value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                  <RadioGroupItem value="json" id="json" />
                  <Label htmlFor="json" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FileJson className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="font-medium">JSON</p>
                      <p className="text-xs text-gray-500">{t('dataExportButton', 'jsonDesc', 'Machine-readable, preserves data structure')}</p>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                  <RadioGroupItem value="csv" id="csv" />
                  <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="font-medium">CSV</p>
                      <p className="text-xs text-gray-500">{t('dataExportButton', 'csvDesc', 'Opens in Excel/Sheets, human-readable')}</p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>{t('dataExportButton', 'whatsIncluded', "What's included:")}</strong> {t('dataExportButton', 'whatsIncludedBody', 'Profile information, prayer journal entries, devotional reading history, and prayer streaks.')}
              </p>
            </div>

            <Button 
              onClick={handleExport} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('dataExportButton', 'exporting', 'Exporting...')}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t('dataExportButton', 'exportData', 'Export Data')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};