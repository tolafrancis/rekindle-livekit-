// pages/AdminBulkTTS.tsx or components/AdminBulkTTSPanel.tsx
// Admin dashboard page for bulk TTS generation

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BulkTTSUploader } from '@/components/BulkTTSUploader';
import { BulkTTSJobMonitor } from '@/components/BulkTTSJobMonitor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, History, Settings, InfoIcon, 
  Zap, DollarSign, Clock
} from 'lucide-react';

export const AdminBulkTTSPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('upload');
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Globe className="h-8 w-8" />
          Bulk TTS Generation
        </h1>
        <p className="text-muted-foreground">
          Generate audio for multiple devotional slides in multiple languages
        </p>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Quick Generate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">9 Languages</div>
            <p className="text-xs text-muted-foreground">Asian Focus Preset</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cost Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.015</div>
            <p className="text-xs text-muted-foreground">per 1,000 characters</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Processing Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">~10/min</div>
            <p className="text-xs text-muted-foreground">audio files generated</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Info Alert */}
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>
          <strong>How it works:</strong> Upload multiple slides via CSV, select languages, 
          and generate TTS audio in bulk. Generated audio is automatically stored and will 
          be used by your devotional player.
        </AlertDescription>
      </Alert>
      
      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Generate Audio
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Job History
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <InfoIcon className="h-4 w-4" />
            Quick Guide
          </TabsTrigger>
        </TabsList>
        
        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <BulkTTSUploader 
            onComplete={(jobId) => {
              console.log('Job started:', jobId);
              // Switch to jobs tab to see progress
              setActiveTab('jobs');
            }}
          />
        </TabsContent>
        
        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          <BulkTTSJobMonitor />
        </TabsContent>
        
        {/* Guide Tab */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>
                Follow these steps to generate audio for your devotionals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">1</Badge>
                  <h3 className="font-semibold">Prepare Your CSV</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  Create a CSV file with your slide data:
                </p>
                <pre className="ml-8 p-3 bg-muted rounded-md text-xs overflow-x-auto">
{`slide_id,day_number,text
daily_26_slide0,1,"Today we explore faith..."
daily_26_slide1,1,"Scripture: Romans 8:14-17"
daily_26_slide2,1,"Let us reflect on God's grace"`}
                </pre>
              </div>
              
              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">2</Badge>
                  <h3 className="font-semibold">Select Languages</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  Choose a preset or manually select languages:
                </p>
                <ul className="ml-8 space-y-1 text-sm text-muted-foreground">
                  <li>• <strong>Asian Focus</strong> - 9 languages (Chinese, Korean, Japanese, etc.)</li>
                  <li>• <strong>Global Reach</strong> - 10 languages (Asian + European)</li>
                  <li>• <strong>Western Focus</strong> - 6 languages (English, Spanish, French, etc.)</li>
                  <li>• <strong>Custom</strong> - Pick any combination</li>
                </ul>
              </div>
              
              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">3</Badge>
                  <h3 className="font-semibold">Review & Generate</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  Check the estimate and click "Generate TTS":
                </p>
                <ul className="ml-8 space-y-1 text-sm text-muted-foreground">
                  <li>• Total audio files = slides × languages</li>
                  <li>• Cost = $0.015 per 1,000 characters</li>
                  <li>• Time = ~6 seconds per audio file</li>
                </ul>
              </div>
              
              {/* Step 4 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">4</Badge>
                  <h3 className="font-semibold">Monitor Progress</h3>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  Track your job in the "Job History" tab. When complete, the audio 
                  will automatically be available in your devotional player.
                </p>
              </div>
              
              {/* Examples */}
              <div className="space-y-2 pt-4 border-t">
                <h3 className="font-semibold">Cost Examples</h3>
                <div className="ml-2 space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span>Single devotional (5 slides × 9 languages)</span>
                    <Badge variant="outline">$0.30</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span>Weekly series (7 days × 5 slides × 9 languages)</span>
                    <Badge variant="outline">$2.10</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                    <span>Monthly series (30 days × 5 slides × 9 languages)</span>
                    <Badge variant="outline">$9.00</Badge>
                  </div>
                </div>
              </div>
              
              {/* Tips */}
              <div className="space-y-2 pt-4 border-t">
                <h3 className="font-semibold">💡 Tips</h3>
                <ul className="ml-2 space-y-1 text-sm text-muted-foreground">
                  <li>• Start with a small test batch (3-5 slides) to verify</li>
                  <li>• English is always included and cannot be removed</li>
                  <li>• Jobs process in the background - you can close the browser</li>
                  <li>• Generated audio is cached and reused automatically</li>
                  <li>• Export job results to CSV for record-keeping</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
export default AdminBulkTTSPanel;