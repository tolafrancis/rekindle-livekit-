import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { MessageSquare, Send, BarChart3, AlertTriangle } from 'lucide-react';
import { MinistryWhatsAppConnect } from './MinistryWhatsAppConnect';
import { MinistryWhatsAppBroadcast } from './MinistryWhatsAppBroadcast';
import { MinistryWhatsAppUsage } from './MinistryWhatsAppUsage';
import { supabase } from '@/lib/supabase';
import type { MinistryWABAConfig } from './MinistryWhatsAppConnect';

interface MinistryWhatsAppHubProps {
  ministryId: string;
  ministryName: string;
}

export const MinistryWhatsAppHub: React.FC<MinistryWhatsAppHubProps> = ({
  ministryId,
  ministryName,
}) => {
  const [wabaConfig, setWabaConfig] = useState<MinistryWABAConfig | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<MinistryWABAConfig['connection_status']>('pending');

  // Load config on mount so Broadcast tab is enabled if already connected
  useEffect(() => {
    supabase
      .from('ministry_whatsapp_configs')
      .select('*')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWabaConfig(data);
          setConnectionStatus(data.connection_status);
        }
      });
  }, [ministryId]);

  const handleStatusChange = useCallback(
    (status: MinistryWABAConfig['connection_status']) => {
      setConnectionStatus(status);
      supabase
        .from('ministry_whatsapp_configs')
        .select('*')
        .eq('ministry_id', ministryId)
        .single()
        .then(({ data }) => { if (data) setWabaConfig(data); });
    },
    [ministryId],
  );

  const isConnected = connectionStatus === 'connected' && wabaConfig != null;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-600" />
          WhatsApp Broadcasts
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Send messages from <strong>{ministryName}</strong>'s own verified WhatsApp Business Account.
        </p>
      </div>

      <Tabs defaultValue="connect">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="connect" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Connection
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2" disabled={!isConnected}>
            <Send className="h-4 w-4" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage & Credits
          </TabsTrigger>
        </TabsList>

        {/* Connection tab */}
        <TabsContent value="connect" className="mt-5">
          <MinistryWhatsAppConnect
            ministryId={ministryId}
            ministryName={ministryName}
            onStatusChange={handleStatusChange}
          />
        </TabsContent>

        {/* Broadcast tab */}
        <TabsContent value="broadcast" className="mt-5">
          {!isConnected ? (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Connect your WhatsApp Business Account first in the <strong>Connection</strong> tab.
              </AlertDescription>
            </Alert>
          ) : (
            <MinistryWhatsAppBroadcast
              ministryId={ministryId}
              ministryName={ministryName}
              wabaConfig={wabaConfig!}
            />
          )}
        </TabsContent>

        {/* Usage & Credits tab — always accessible */}
        <TabsContent value="usage" className="mt-5">
          <MinistryWhatsAppUsage
            ministryId={ministryId}
            wabaConfig={wabaConfig}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
