import React from 'react';
import { MinistryTranslationHub } from './MinistryTranslationHub';

interface Ministry {
  id: string;
  name: string;
  settings: any;
}

interface MinistryLiveTechSettingsProps {
  ministry: Ministry;
  onUpdate: () => void;
}

// Split out of MinistrySettingsHub (2026-09-14, per the user's request):
// Live Translation used to live under Settings > Live & Tech; moved under the
// "Live" nav group next to the live channel itself.
//
// The old "Restream Defaults" YouTube/Facebook key card was removed
// (2026-11-05): nothing read settings.restream_defaults. Restreaming is set up
// per channel/meeting via "Connect to YouTube & Facebook" (ChannelStreamConfig).
export const MinistryLiveTechSettings: React.FC<MinistryLiveTechSettingsProps> = ({ ministry }) => (
  <div className="space-y-6">
    <MinistryTranslationHub ministryId={ministry.id} ministryName={ministry.name} />
  </div>
);

export default MinistryLiveTechSettings;
