import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, BookOpen, Bell, ChevronRight, Check, Loader2, Mail } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
];

const spiritualLevels = [
  { id: 'seeker', name: 'Seeker', desc: 'Exploring faith and spirituality' },
  { id: 'new_believer', name: 'New Believer', desc: 'Recently committed to faith' },
  { id: 'growing', name: 'Growing', desc: 'Actively developing spiritual disciplines' },
  { id: 'mature', name: 'Mature', desc: 'Established in faith, ready to mentor' },
  { id: 'leader', name: 'Leader', desc: 'Called to lead and disciple others' },
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    language_preference:    'en',
    spiritual_level:        'seeker',
    consent_devotionals:    true,
    consent_affirmations:   true,
    consent_reminders:      true,
    consent_marketing:      false,
    email_opt_in:           false,
    email_consent_given_at: null as string | null,
    email_consent_source:   'onboarding' as string,
  });

  const handleComplete = async () => {
    setLoading(true);
    await completeOnboarding({
      ...data,
      email_consent_given_at: data.email_opt_in ? new Date().toISOString() : null,
    });
    setLoading(false);
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-purple-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center gap-2 mb-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`w-3 h-3 rounded-full ${step >= s ? 'bg-purple-600' : 'bg-gray-200'}`} />
            ))}
          </div>
          <CardTitle className="text-2xl font-serif">
            {step === 1 && 'Choose Your Language'}
            {step === 2 && 'Your Spiritual Journey'}
            {step === 3 && 'Notification Preferences'}
            {step === 4 && 'Email & Communication'}
          </CardTitle>
          <CardDescription>
            {step === 1 && 'Select your preferred language for devotionals and content'}
            {step === 2 && 'Help us personalize your experience'}
            {step === 3 && 'Control how we communicate with you'}
            {step === 4 && 'Choose how you want to hear from ReKindle'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {languages.map((lang) => (
                <button key={lang.code} onClick={() => setData({ ...data, language_preference: lang.code })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${data.language_preference === lang.code ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
                  <span className="text-2xl">{lang.flag}</span>
                  <p className="font-medium mt-1">{lang.name}</p>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              {spiritualLevels.map((level) => (
                <button key={level.id} onClick={() => setData({ ...data, spiritual_level: level.id })}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${data.spiritual_level === level.id ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{level.name}</p>
                      <p className="text-sm text-gray-500">{level.desc}</p>
                    </div>
                    {data.spiritual_level === level.id && <Check className="h-5 w-5 text-purple-600" />}
                  </div>
                </button>
              ))}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              {[
                { key: 'consent_devotionals', label: 'Daily Devotionals', desc: 'Receive daily scripture and reflections' },
                { key: 'consent_affirmations', label: 'Daily Affirmations', desc: 'Faith-based affirmations for your day' },
                { key: 'consent_reminders', label: 'Prayer Reminders', desc: 'Gentle nudges to maintain your streak' },
                { key: 'consent_marketing', label: 'Updates & News', desc: 'New features and community updates' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <Label className="font-medium">{item.label}</Label>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                  <Switch checked={(data as any)[item.key]} onCheckedChange={(v) => setData({ ...data, [item.key]: v })} />
                </div>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="space-y-5">

              {/* Email consent — explicit opt-in, unchecked by default */}
              <div
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  data.email_opt_in
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
                onClick={() => setData({ ...data, email_opt_in: !data.email_opt_in })}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    data.email_opt_in ? 'bg-purple-600 border-purple-600' : 'border-gray-400'
                  }`}>
                    {data.email_opt_in && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-purple-600" />
                      <Label className="font-semibold cursor-pointer">
                        Email notifications &amp; announcements
                      </Label>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      I agree to receive platform news, updates, and announcements from ReKindle by email.
                      You can unsubscribe at any time from any email we send.
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactional notice — always sent, no opt-in needed */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-800">
                  <strong>Always sent regardless of preference above:</strong> booking confirmations,
                  payment receipts, counselling reminders, and account security notices.
                  These are part of the service and cannot be disabled.
                </p>
              </div>

              {/* GDPR/compliance note */}
              <p className="text-xs text-gray-400 leading-relaxed">
                ReKindle respects your privacy. Your data is processed in accordance with our
                Privacy Policy and applicable data protection laws including GDPR, NDPR, and POPIA.
                You can update your preferences at any time in Profile Settings.
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-4">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">Back</Button>}
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} className="flex-1 bg-purple-600 hover:bg-purple-700">
                Continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} className="flex-1 bg-purple-600 hover:bg-purple-700" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Complete Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
