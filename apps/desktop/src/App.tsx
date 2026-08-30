import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { WizardContainer } from './components/wizard/WizardContainer';
import { ServiceView } from './components/service/ServiceView';
import { secureStore, type AppSettings } from './utils/secureStore';
import type { ServiceStatus } from './components/service/StatusIndicator';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isWizardMode, setIsWizardMode] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('idle');

  useEffect(() => {
    (async () => {
      const stored = await secureStore.getSettings();
      setSettings(stored);
      setIsWizardMode(!stored.isConfigured);
      setLoading(false);
    })();
  }, []);

  const handleWizardFinished = (updated: AppSettings) => {
    setSettings(updated);
    setIsWizardMode(false);
  };

  const getStatusColor = (): 'emerald' | 'amber' | 'crimson' | 'slate' => {
    switch (serviceStatus) {
      case 'live':
        return 'emerald';
      case 'connecting':
        return 'amber';
      case 'error':
        return 'crimson';
      default:
        return 'slate';
    }
  };

  if (loading || !settings) {
    return (
      <div className="h-screen w-screen flex flex-col bg-background text-slate-200">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center space-x-3">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-slate-400">
            Initializing ReKindle Hardware Agent...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-slate-100 overflow-hidden font-sans">
      <TitleBar
        showSettingsButton={!isWizardMode}
        onOpenSettings={() => setIsWizardMode(true)}
        statusText={isWizardMode ? 'Setup Wizard' : serviceStatus}
        statusColor={isWizardMode ? 'slate' : getStatusColor()}
      />

      <main className="flex-1 overflow-y-auto min-h-0 bg-radial-gradient">
        {isWizardMode ? (
          <div className="py-2">
            <WizardContainer
              initialSettings={settings}
              onFinished={handleWizardFinished}
            />
          </div>
        ) : (
          <div className="py-4">
            <ServiceView
              settings={settings}
              onOpenSettings={() => setIsWizardMode(true)}
              onStatusChange={(s) => setServiceStatus(s)}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
