import React, { useState } from 'react';
import { Step1DeviceKey } from './Step1DeviceKey';
import { Step2AudioLanguage } from './Step2AudioLanguage';
import { Step3TestTone } from './Step3TestTone';
import { Step4ComboJackWarning } from './Step4ComboJackWarning';
import { Step5Ready } from './Step5Ready';
import { secureStore, type AppSettings } from '../../utils/secureStore';

interface WizardContainerProps {
  initialSettings: AppSettings;
  onFinished: (updatedSettings: AppSettings) => void;
}

export const WizardContainer: React.FC<WizardContainerProps> = ({
  initialSettings,
  onFinished,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);

  const steps = [
    { num: 1, label: 'Device Key' },
    { num: 2, label: 'Audio & Lang' },
    { num: 3, label: 'Output Test' },
    { num: 4, label: 'Hardware Safety' },
    { num: 5, label: 'Ready' },
  ];

  const handleStep1Success = (authData: {
    deviceKey: string;
    bearerToken: string;
    tokenExpiresAt: string;
    deviceId: string;
    ministryId: string;
  }) => {
    const updated = { ...settings, ...authData };
    setSettings(updated);
    secureStore.saveSettings(updated);
    setCurrentStep(2);
  };

  const handleStep2Success = (data: {
    inputDeviceId: string;
    outputDeviceId: string;
    sourceLanguage: string;
    targetLanguage: string;
  }) => {
    const updated = { ...settings, ...data };
    setSettings(updated);
    secureStore.saveSettings(updated);
    setCurrentStep(3);
  };

  const handleStep3Success = () => {
    setCurrentStep(4);
  };

  const handleStep4Success = () => {
    setCurrentStep(5);
  };

  const handleStep5Complete = async () => {
    const finalSettings = await secureStore.saveSettings({
      ...settings,
      isConfigured: true,
    });
    onFinished(finalSettings);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Progress Stepper Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {/* Background track line */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-800 z-0" />

          {steps.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <div key={step.num} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-600/20 shadow-lg shadow-blue-600/30'
                      : 'bg-surface-elevated text-slate-500 border border-slate-700'
                  }`}
                >
                  {isCompleted ? '✓' : step.num}
                </div>
                <span
                  className={`text-[10px] font-medium mt-1.5 whitespace-nowrap ${
                    isCurrent ? 'text-slate-200' : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Views */}
      <div className="bg-surface/50 border border-surface-border rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        {currentStep === 1 && (
          <Step1DeviceKey
            initialKey={settings.deviceKey}
            onSuccess={handleStep1Success}
          />
        )}
        {currentStep === 2 && (
          <Step2AudioLanguage
            initialInputId={settings.inputDeviceId}
            initialOutputId={settings.outputDeviceId}
            initialSourceLang={settings.sourceLanguage}
            initialTargetLang={settings.targetLanguage}
            onBack={() => setCurrentStep(1)}
            onSuccess={handleStep2Success}
          />
        )}
        {currentStep === 3 && (
          <Step3TestTone
            outputDeviceId={settings.outputDeviceId}
            onBack={() => setCurrentStep(2)}
            onSuccess={handleStep3Success}
          />
        )}
        {currentStep === 4 && (
          <Step4ComboJackWarning
            onBack={() => setCurrentStep(3)}
            onSuccess={handleStep4Success}
          />
        )}
        {currentStep === 5 && (
          <Step5Ready
            settings={settings}
            onBack={() => setCurrentStep(4)}
            onComplete={handleStep5Complete}
          />
        )}
      </div>
    </div>
  );
};
