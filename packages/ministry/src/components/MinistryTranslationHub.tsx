import React, { Suspense, lazy } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Radio, HardDrive, Settings as SettingsIcon, Languages, Loader2 } from 'lucide-react';
import { MinistryTranslationServiceManager } from './MinistryTranslationServiceManager';
import { MinistryTranslationDeviceList } from './MinistryTranslationDeviceList';
import { MinistryTranslationSettings } from './MinistryTranslationSettings';

// Bilingual two-person conversation: its own session and invite links. Lives
// here beside the translation Settings (2026-10-02, per Tola), not in the
// Live module's sub-tabs.
const BilingualConversationHub = lazy(() =>
  import('@rekindle/live/components/BilingualConversationHub').then((m) => ({ default: m.BilingualConversationHub })));

interface MinistryTranslationHubProps {
  ministryId: string;
  ministryName: string;
}

// ReKindle Live Translation admin area — Phase 1 (see docs/rlt-build-checklist.md).
// Mirrors the MinistryWhatsAppHub pattern: one tabbed hub, three focused
// sub-managers underneath.
export const MinistryTranslationHub: React.FC<MinistryTranslationHubProps> = ({ ministryId, ministryName }) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Radio className="h-5 w-5 text-indigo-600" />
          Live Translation
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time speech translation for <strong>{ministryName}</strong> — interactive meetings and live
          broadcasts first, PA system add-on later.
        </p>
      </div>

      <Tabs defaultValue="service">
        <TabsList className="w-full flex-wrap md:w-auto">
          <TabsTrigger value="service" className="gap-2">
            <Radio className="h-4 w-4" />
            Service
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2">
            <HardDrive className="h-4 w-4" />
            Devices
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="conversation" className="gap-2">
            <Languages className="h-4 w-4" />
            Conversation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="service" className="mt-5">
          <MinistryTranslationServiceManager ministryId={ministryId} />
        </TabsContent>
        <TabsContent value="devices" className="mt-5">
          <MinistryTranslationDeviceList ministryId={ministryId} />
        </TabsContent>
        <TabsContent value="settings" className="mt-5">
          <MinistryTranslationSettings ministryId={ministryId} />
        </TabsContent>
        <TabsContent value="conversation" className="mt-5">
          <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
            <BilingualConversationHub ministryId={ministryId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MinistryTranslationHub;
