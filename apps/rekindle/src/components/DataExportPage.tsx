import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useAuth } from '@/contexts/AuthContext';
import { DataExportButton } from './DataExportButton';
import { supabase } from '@/lib/supabase';
import { Lock, Crown, Download, FileJson, Database, Shield } from 'lucide-react';

const DataExportPage: React.FC = () => {
  const { user, profile } = useAuth();
  const entitlements = useUserEntitlements();
  
  // Check if user can export data (Ministry+ feature)
  const canExportData = entitlements.canExportData;
  
  // Block access if user doesn't have data export permission
  if (!canExportData) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Alert className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <Lock className="h-5 w-5 text-purple-600" />
          <AlertDescription className="ml-2">
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-purple-900 text-lg">Data Export - Ministry Feature</p>
                <p className="text-purple-700 mt-2">
                  Export all your personal data including prayer journals, devotional progress, session history, and more. 
                  Upgrade to Ministry tier to unlock data export capabilities.
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-purple-200">
                <p className="font-semibold text-gray-900 mb-2">What you can export with Ministry tier:</p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>Prayer journal entries and history</li>
                  <li>Devotional progress and completed series</li>
                  <li>Scripture memory cards and verses</li>
                  <li>Profile information and settings</li>
                  <li>Session history and analytics</li>
                  <li>Export in JSON or CSV format</li>
                </ul>
              </div>
              <Button 
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => window.location.href = '/subscribe'}
              >
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Ministry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Export Your Data</h1>
        <p className="text-gray-600">Download a complete copy of your personal data</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Export
          </CardTitle>
          <CardDescription>
            Export all your data in a machine-readable format. Your data will include prayer journals, 
            devotional progress, profile information, and more.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900 mb-1">Your data is secure</p>
                <p className="text-sm text-blue-700">
                  We take your privacy seriously. All exports are encrypted and only accessible to you.
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <FileJson className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <p className="font-semibold">JSON Format</p>
                <p className="text-sm text-gray-600">Machine-readable, preserves data structure</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Download className="h-5 w-5 text-blue-600 mt-1" />
              <div>
                <p className="font-semibold">CSV Format</p>
                <p className="text-sm text-gray-600">Human-readable, spreadsheet compatible</p>
              </div>
            </div>
          </div>
          
          <div className="pt-4">
            {user && profile && (
              <DataExportButton 
                userId={user.id} 
                userEmail={user.email || ''} 
                supabaseClient={supabase}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataExportPage;