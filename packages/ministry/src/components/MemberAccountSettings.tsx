import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { usePushNotifications } from '@rekindle/features/usePushNotifications';
import { DailyReminders } from '@rekindle/features/components/DailyReminders';
import {
  User as UserIcon, Bell, Globe, ShieldCheck, LogOut, Loader2, Save, Languages,
} from 'lucide-react';
import { ImageUpload } from './ImageUpload';

// Phase 7 — member Account settings for the standalone ministry app: profile,
// notifications & reminders, language, and account controls. Reuses the shared
// auth/language/push building blocks (no consumer-only dependencies).

const SPIRITUAL_LEVELS = [
  { value: 'beginner', label: 'New to faith' },
  { value: 'growing', label: 'Growing' },
  { value: 'mature', label: 'Mature' },
  { value: 'leader', label: 'Leader' },
];

export default function MemberAccountSettings() {
  const { user, profile, updateProfile, updatePassword, signOut } = useAuth();
  const { language, setLanguage, availableLanguages } = useLanguage();
  const push = usePushNotifications();
  useEffect(() => { push.checkStatus(); }, []);

  // ── Profile ──
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [spiritualLevel, setSpiritualLevel] = useState(profile?.spiritual_level ?? 'beginner');
  const [savingProfile, setSavingProfile] = useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    const res = await updateProfile({ full_name: fullName.trim(), avatar_url: avatarUrl.trim(), spiritual_level: spiritualLevel } as any);
    setSavingProfile(false);
    if (res?.error) return toast({ title: 'Could not save', description: res.error, variant: 'destructive' });
    toast({ title: 'Profile saved' });
  };

  // ── Account (password / sign out) ──
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const changePassword = async () => {
    if (pw.length < 8) return toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
    if (pw !== pw2) return toast({ title: "Passwords don't match", variant: 'destructive' });
    setSavingPw(true);
    const res = await updatePassword(pw);
    setSavingPw(false);
    if (res?.error) return toast({ title: 'Could not update password', description: res.error, variant: 'destructive' });
    setPw(''); setPw2('');
    toast({ title: 'Password updated' });
  };

  // ── Push toggle ──
  const togglePush = async (on: boolean) => {
    if (on) await push.subscribe();
    else await push.unsubscribe();
    await push.checkStatus();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, notifications, and preferences.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="h-5 w-5" /> Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-14 w-14 object-cover" /> : <UserIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="avatar">Photo</Label>
              <ImageUpload
                value={avatarUrl}
                onChange={(url) => setAvatarUrl(url)}
                folder="avatars"
                placeholder="Upload photo"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label>Faith journey</Label>
            <Select value={spiritualLevel} onValueChange={setSpiritualLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPIRITUAL_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save profile
          </Button>
        </CardContent>
      </Card>

      {/* Notifications & reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-5 w-5" /> Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Push notifications</p>
              <p className="text-xs text-muted-foreground">
                {push.permission === 'denied'
                  ? 'Blocked in your browser settings — enable notifications for this site to turn on.'
                  : 'Get devotional, prayer, and ministry updates on this device.'}
              </p>
            </div>
            <Switch
              checked={push.isSubscribed}
              disabled={push.isLoading || push.permission === 'denied'}
              onCheckedChange={togglePush}
            />
          </div>
        </CardContent>
      </Card>

      {/* Daily reminders (shared component) */}
      <DailyReminders />

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Languages className="h-5 w-5" /> Language</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Globe className="h-4 w-4" /> App language</Label>
            <Select value={language} onValueChange={(v) => void setLanguage(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableLanguages.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="mr-2">{l.flag}</span>{l.nativeName ?? l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5" /> Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <Button variant="outline" onClick={changePassword} disabled={savingPw || !pw || !pw2}>
            {savingPw ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Update password
          </Button>

          <div className="border-t pt-4">
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
