import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { toast } from '@rekindle/ui/use-toast';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { UserCheck, UserPlus, Users, Loader2, Clock, Check, X } from 'lucide-react';
import { registerForWebinar, decideWebinarRegistration, type WebinarRegisterResult } from '../webinar/webinarControl';

export type MeetingKind = 'ministry' | 'channel' | 'webinar';

interface Props {
  meetingId: string;
  meetingKind: MeetingKind;
  meetingTitle: string;
  /** The host doesn't register — they see the registrant count/list instead. */
  isHost?: boolean;
  /** Guests may register with name+email only on public meetings. */
  allowGuests?: boolean;
  className?: string;
  /** Called after this person's registration changes (register/cancel). */
  onChange?: () => void;
  /** Webinars: called after a signed-out guest registers. */
  onGuestRegistered?: (result: WebinarRegisterResult) => void;
}

interface Registrant {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  status: string;
}

/**
 * Register / cancel a meeting RSVP, shared by ministry and live-channel meetings.
 * Members/followers register in one tap; guests (on public meetings) register with
 * a name + email. Registrants are also who reminders go to (plus eligible members).
 */
export const RegisterMeetingButton: React.FC<Props> = ({
  meetingId, meetingKind, meetingTitle, isHost = false, allowGuests = false, className,
  onChange, onGuestRegistered,
}) => {
  // Webinar registrations go through the webinar-registration edge function
  // (confirmation email, personal join link, optional host approval — 0427).
  const isWebinar = meetingKind === 'webinar';
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const { user } = useAuth();
  const [count, setCount] = useState<number>(0);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);

  const refresh = useCallback(async () => {
    const { data: c } = await supabase.rpc('meeting_registration_count', { p_meeting_id: meetingId });
    setCount(typeof c === 'number' ? c : 0);
    if (user) {
      const { data } = await supabase
        .from('meeting_registrations')
        .select('id, status')
        .eq('meeting_id', meetingId)
        .eq('user_id', user.id)
        .maybeSingle();
      setRegistered(!!data && (data as any).status === 'registered');
      setMyStatus((data as any)?.status ?? null);
    }
  }, [meetingId, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const registerAsUser = async () => {
    if (!user) return;
    setBusy(true);
    if (isWebinar) {
      try {
        const res = await registerForWebinar(meetingId);
        if (res.status === 'pending') {
          toast({ title: 'Registration sent', description: 'The host will review it. We’ll email you when you’re approved.' });
        } else if (res.status === 'declined') {
          toast({ title: 'Registration not approved', description: 'The host declined this registration.', variant: 'destructive' });
        } else {
          toast({ title: 'You’re registered', description: `Check your email for your join link to “${meetingTitle}”.` });
        }
        await refresh();
        onChange?.();
      } catch (e: any) {
        toast({ title: 'Could not register', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      // Upsert-by-hand: partial unique indexes make onConflict awkward, so
      // re-activate an existing row or insert a fresh one.
      const { data: existing } = await supabase
        .from('meeting_registrations')
        .select('id')
        .eq('meeting_id', meetingId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        await supabase.from('meeting_registrations')
          .update({ status: 'registered' }).eq('id', (existing as any).id);
      } else {
        const { error } = await supabase.from('meeting_registrations').insert({
          meeting_id: meetingId, meeting_kind: meetingKind, user_id: user.id, status: 'registered',
        });
        if (error) throw error;
      }
      toast({ title: 'You’re registered', description: `We’ll remind you before “${meetingTitle}”.` });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not register', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await supabase.from('meeting_registrations')
        .update({ status: 'cancelled' })
        .eq('meeting_id', meetingId).eq('user_id', user.id);
      toast({ title: 'Registration cancelled' });
      await refresh();
      onChange?.();
    } catch (e: any) {
      toast({ title: 'Could not cancel', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const registerAsGuest = async () => {
    const name = guestName.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast({ title: 'Enter a name and valid email', variant: 'destructive' });
      return;
    }
    setBusy(true);
    if (isWebinar) {
      try {
        const res = await registerForWebinar(meetingId, { name, email });
        toast(res.status === 'pending'
          ? { title: 'Registration sent', description: `The host will review it and email ${email}.` }
          : { title: 'You’re registered', description: `Your personal join link was emailed to ${email}.` });
        setGuestOpen(false);
        setGuestName(''); setGuestEmail('');
        await refresh();
        onGuestRegistered?.(res);
      } catch (e: any) {
        toast({ title: 'Could not register', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const { error } = await supabase.from('meeting_registrations').insert({
        meeting_id: meetingId, meeting_kind: meetingKind, guest_name: name, guest_email: email, status: 'registered',
      });
      // A duplicate email = already registered; treat as success.
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
      toast({ title: 'You’re registered', description: `A reminder will be emailed to ${email}.` });
      setGuestOpen(false);
      setGuestName(''); setGuestEmail('');
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not register', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const openList = async () => {
    setListOpen(true);
    const { data } = await supabase
      .from('meeting_registrations')
      .select('id, user_id, guest_name, guest_email, status')
      .eq('meeting_id', meetingId)
      .in('status', isWebinar ? ['registered', 'pending'] : ['registered'])
      .order('registered_at', { ascending: true });
    setRegistrants((data as Registrant[]) || []);
  };

  const decide = async (r: Registrant, approve: boolean) => {
    setDeciding(r.id);
    try {
      await decideWebinarRegistration(r.id, approve);
      setRegistrants((prev) => approve
        ? prev.map((x) => (x.id === r.id ? { ...x, status: 'registered' } : x))
        : prev.filter((x) => x.id !== r.id));
      toast({ title: approve ? 'Approved' : 'Declined', description: approve ? 'Their join link is on its way by email.' : 'They’ve been emailed.' });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not update', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeciding(null);
    }
  };
  const pendingCount = registrants.filter((r) => r.status === 'pending').length;

  // Host view: a clearly-labelled button that opens the registrant list.
  if (isHost) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={openList} className={className} title="View registrations">
          <Users className="h-4 w-4 mr-1" />
          Registrations ({count})
        </Button>
        <Dialog open={listOpen} onOpenChange={setListOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrations ({registrants.length - pendingCount})</DialogTitle>
              <DialogDescription>
                People registered for “{meetingTitle}”.
                {pendingCount > 0 && ` ${pendingCount} waiting for your approval.`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-80 overflow-y-auto divide-y">
              {registrants.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No registrations yet.</p>
              ) : registrants.map((r) => (
                <div key={r.id} className="py-2 text-sm flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{r.guest_name || 'Member'}</span>
                    {r.guest_email && <span className="text-gray-500"> · {r.guest_email}</span>}
                    {!r.user_id && <Badge variant="secondary" className="ml-2 text-[10px]">Guest</Badge>}
                    {r.status === 'pending' && <Badge variant="outline" className="ml-2 text-[10px] border-amber-300 text-amber-700">Pending</Badge>}
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-green-700 border-green-300" disabled={deciding === r.id} onClick={() => decide(r, true)} title="Approve">
                        {deciding === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-red-700 border-red-300" disabled={deciding === r.id} onClick={() => decide(r, false)} title="Decline">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Attendee view.
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Badge variant="outline" className="border-gray-300 gap-1">
        <Users className="h-3 w-3" />
        {count} registered
      </Badge>
      {isWebinar && myStatus === 'pending' ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={cancel} title="Cancel your registration request" className="border-amber-300 text-amber-700 hover:bg-amber-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4 mr-1" />}
          Awaiting approval
        </Button>
      ) : isWebinar && myStatus === 'declined' ? (
        <Button variant="outline" size="sm" disabled className="text-gray-500">Not approved</Button>
      ) : registered ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={cancel} className="border-green-300 text-green-700 hover:bg-green-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4 mr-1" />}
          Registered
        </Button>
      ) : (
        <Button
          variant="outline" size="sm" disabled={busy}
          onClick={() => (user ? registerAsUser() : allowGuests ? setGuestOpen(true) : toast({ title: 'Please sign in to register' }))}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
          Register
        </Button>
      )}

      <Dialog open={guestOpen} onOpenChange={setGuestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Register for this meeting</DialogTitle>
            <DialogDescription>We’ll email you a reminder before it starts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="reg-name">Your name</Label>
              <Input id="reg-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-email">Email</Label>
              <Input id="reg-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={registerAsGuest} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegisterMeetingButton;
