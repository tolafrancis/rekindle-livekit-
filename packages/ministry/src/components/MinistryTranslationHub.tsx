import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Radio, HardDrive, Settings as SettingsIcon } from 'lucide-react';
import { MinistryTranslationServiceManager } from './MinistryTranslationServiceManager';
import { MinistryTranslationDeviceList } from './MinistryTranslationDeviceList';
import { MinistryTranslationSettings } from './MinistryTranslationSettings';

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
        <TabsList className="w-full md:w-auto">
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
      </Tabs>
    </div>
  );
};

export default MinistryTranslationHub;
