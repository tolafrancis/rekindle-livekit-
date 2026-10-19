import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { MessageSquare, Send, BarChart3, FileText, Settings } from 'lucide-react';
import { MinistryWhatsAppConnect, hasActiveWhatsAppPlan } from './MinistryWhatsAppConnect';
import { MinistryWhatsAppBroadcast } from './MinistryWhatsAppBroadcast';
import { MinistryWhatsAppUsage } from './MinistryWhatsAppUsage';
import { supabase } from '@rekindle/supabase';
import type { MinistryWABAConfig, WhatsAppConnectSection } from './MinistryWhatsAppConnect';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';

interface MinistryWhatsAppHubProps {
  ministryId: string;
  ministryName: string;
}

type HubTab = 'connect' | 'templates' | 'broadcast' | 'usage' | 'settings';

export const MinistryWhatsAppHub: React.FC<MinistryWhatsAppHubProps> = ({
  ministryId,
  ministryName,
}) => {
  // Sub-tab kept in history state so a remount or Back keeps the tab the user was on.
  const [tab, setTab] = useViewHistory<HubTab>('ministry-whatsapp-tab', 'connect');
  const [wabaConfig, setWabaConfig] = useState<MinistryWABAConfig | null>(null);

  const loadConfig = useCallback(() => {
    supabase
      .from('ministry_whatsapp_configs')
      .select('*')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => setWabaConfig(data ?? null));
  }, [ministryId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Templates and Settings belong to the ministry's own WhatsApp Business
  // Account, so they only appear once a plan for it is paid for. Broadcast is
  // always there: without a connected account it sends via Rekindle's number.
  const hasPlan = hasActiveWhatsAppPlan(wabaConfig);
  const activeTab: HubTab = !hasPlan && (tab === 'templates' || tab === 'settings') ? 'connect' : tab;

  const connectSection = (section: WhatsAppConnectSection) => (
    <MinistryWhatsAppConnect
      ministryId={ministryId}
      ministryName={ministryName}
      section={section}
      onConfigChange={setWabaConfig}
      onOpenBroadcast={() => setTab('broadcast')}
    />
  );

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-600" />
          WhatsApp Broadcasts
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Message <strong>{ministryName}</strong>'s members on WhatsApp, from your own verified number or via Rekindle's.
        </p>
      </div>

      {/* One tab row for the whole feature — the Connection tab used to hold a
          second row (Connection / Templates / Settings) of its own. */}
      <Tabs value={activeTab} onValueChange={(v) => setTab(v as HubTab)}>
        <TabsList className="w-full md:w-auto flex-wrap h-auto">
          <TabsTrigger value="connect" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Your Number
          </TabsTrigger>
          {hasPlan && (
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
          )}
          <TabsTrigger value="broadcast" className="gap-2">
            <Send className="h-4 w-4" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage & Credits
          </TabsTrigger>
          {hasPlan && (
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="connect" className="mt-5">
          {connectSection('connect')}
        </TabsContent>

        {hasPlan && (
          <TabsContent value="templates" className="mt-5">
            {connectSection('templates')}
          </TabsContent>
        )}

        <TabsContent value="broadcast" className="mt-5">
          <MinistryWhatsAppBroadcast
            ministryId={ministryId}
            ministryName={ministryName}
            wabaConfig={wabaConfig}
            onConfigChange={loadConfig}
            onOpenCredits={() => setTab('usage')}
          />
        </TabsContent>

        {/* Usage & Credits tab — always accessible */}
        <TabsContent value="usage" className="mt-5">
          <MinistryWhatsAppUsage
            ministryId={ministryId}
            wabaConfig={wabaConfig}
          />
        </TabsContent>

        {hasPlan && (
          <TabsContent value="settings" className="mt-5">
            {connectSection('settings')}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
