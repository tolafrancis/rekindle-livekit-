import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Loader2, Radio, Calendar, Clock, MailCheck } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { formatMeetingTime } from '@rekindle/features/meetingTime';
import {
  getWebinar, getWebinarRegistrationByToken, registerForWebinar, type MinistryWebinar,
} from './webinarControl';
import { WebinarLobby } from './WebinarLobby';
import { WebinarAttendeeViewer } from './WebinarAttendeeViewer';
import { WebinarEndScreen } from './WebinarEndScreen';

const ENDED_STATUSES = new Set(['ended', 'recording_processing', 'completed', 'cancelled']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const tokenKey = (id: string) => `rk-webinar-guest-token:${id}`;
const guestIdKey = (id: string) => `rk-webinar-guest-id:${id}`;
const guestNameKey = 'rk-webinar-guest-name';

function store(kind: 'local' | 'session', key: string, value?: string): string | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (value === undefined) return s.getItem(key);
    s.setItem(key, value);
  } catch { /* storage blocked — still works for this page view */ }
  return value ?? null;
}

function newId(): string {
  try { return crypto.randomUUID(); } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

interface Props {
  webinarId: string;
  /** Switch to the sign-in form (also used when the webinar is members-only). */
  onSignIn: () => void;
  onHome: () => void;
}

type GuestState =
  | { kind: 'form' }
  | { kind: 'in'; id: string; name: string }
  | { kind: 'pending' }
  | { kind: 'declined' }
  | { kind: 'resent'; email: string };

/** Zoom-style join for signed-out visitors on PUBLIC webinars.
 *  • Registration on: register with name + email → personal link (?tk=) by
 *    email; with host approval on, wait for approval first.
 *  • Registration off: just enter a name and watch.
 *  Guests watch the HLS stream; chat/Q&A/polls/speaking need an account. */
export function WebinarGuestJoin({ webinarId, onSignIn, onHome }: Props) {
  const [webinar, setWebinar] = useState<MinistryWebinar | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<GuestState>({ kind: 'form' });
  const [name, setName] = useState(() => store('session', guestNameKey) || '');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The parent passes a fresh callback each render; keep the load effect stable.
  const onSignInRef = useRef(onSignIn);
  onSignInRef.current = onSignIn;

  const reloadWebinar = useCallback(async () => {
    const w = await getWebinar(webinarId);
    if (w) setWebinar(w);
    return w;
  }, [webinarId]);

  // Resolve the guest's personal link (?tk=… or one remembered on this device).
  const checkToken = useCallback(async (token: string | null): Promise<boolean> => {
    if (!token) return false;
    const reg = await getWebinarRegistrationByToken(token);
    if (!reg || reg.webinar_id !== webinarId) return false;
    store('local', tokenKey(webinarId), token);
    if (reg.status === 'registered') { setState({ kind: 'in', id: reg.registration_id, name: reg.display_name }); return true; }
    if (reg.status === 'pending') { setState({ kind: 'pending' }); return true; }
    if (reg.status === 'declined') { setState({ kind: 'declined' }); return true; }
    return false; // cancelled → register again
  }, [webinarId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const w = await getWebinar(webinarId);
      if (cancelled) return;
      // Not readable signed out = members-only (or gone): sign in instead.
      if (!w || !w.is_public) { onSignInRef.current(); return; }
      setWebinar(w);
      const urlToken = new URLSearchParams(window.location.search).get('tk');
      const ok = (await checkToken(urlToken)) || (await checkToken(store('local', tokenKey(webinarId))));
      if (!cancelled && !ok && !w.registration_required) {
        // Rejoining a no-registration webinar on the same tab keeps the name/id.
        const id = store('session', guestIdKey(webinarId));
        const n = store('session', guestNameKey);
        if (id && n) setState({ kind: 'in', id, name: n });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [webinarId, checkToken]);

  useEffect(() => {
    const channel = supabase
      .channel(`webinar-guest-${webinarId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ministry_webinars', filter: `id=eq.${webinarId}` },
        (payload) => setWebinar(payload.new as MinistryWebinar))
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* noop */ } };
  }, [webinarId]);

  // While waiting for approval, check every 30s so the page lets them in.
  useEffect(() => {
    if (state.kind !== 'pending') return;
    const t = window.setInterval(() => { checkToken(store('local', tokenKey(webinarId))); }, 30_000);
    return () => window.clearInterval(t);
  }, [state.kind, webinarId, checkToken]);

  const register = async () => {
    const n = name.trim();
    const e = email.trim().toLowerCase();
    if (!n || !EMAIL_RE.test(e)) { setError('Enter your name and a valid email.'); return; }
    setBusy(true); setError(null);
    try {
      store('session', guestNameKey, n);
      const res = await registerForWebinar(webinarId, { name: n, email: e });
      if (res.status === 'declined') { setState({ kind: 'declined' }); return; }
      if (res.token) {
        if (!(await checkToken(res.token))) setState({ kind: 'resent', email: e });
      } else {
        // Already registered: the link was re-sent by email only.
        setState({ kind: 'resent', email: e });
      }
    } catch (err: any) {
      setError(err?.message || 'Could not register. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const joinWithName = () => {
    const n = name.trim();
    if (!n) { setError('Enter your name.'); return; }
    const id = store('session', guestIdKey(webinarId)) || newId();
    store('session', guestIdKey(webinarId), id);
    store('session', guestNameKey, n);
    setState({ kind: 'in', id, name: n });
  };

  if (loading || !webinar) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (ENDED_STATUSES.has(webinar.status)) {
    return <WebinarEndScreen webinar={webinar} onHome={onHome} />;
  }

  if (state.kind === 'in') {
    if (webinar.status === 'ending') {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4 text-center">
          <div className="text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto mb-3" />
            <p className="text-sm">The webinar is ending…</p>
          </div>
        </div>
      );
    }
    if (webinar.status === 'live') {
      return (
        <WebinarAttendeeViewer
          webinar={webinar}
          userId={state.id}
          userName={state.name}
          isGuest
          onEnded={reloadWebinar}
          onLeave={onHome}
          onPromoted={() => { /* guests can't be promoted */ }}
        />
      );
    }
    return <WebinarLobby webinar={webinar} role="attendee" onLive={reloadWebinar} hideRegistration />;
  }

  const header = (
    <CardHeader>
      <Badge variant="outline" className="w-fit mx-auto mb-2 bg-purple-50 text-purple-700 border-purple-200">
        <Radio className="h-3 w-3 mr-1" /> Webinar
      </Badge>
      <CardTitle>{webinar.title}</CardTitle>
      {webinar.description && <CardDescription>{webinar.description}</CardDescription>}
      {webinar.scheduled_start_at && (
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2 pt-1">
          <Calendar className="h-4 w-4" /> {formatMeetingTime(webinar.scheduled_start_at, webinar.timezone)}
        </p>
      )}
    </CardHeader>
  );

  const signInLink = (
    <button type="button" onClick={onSignIn} className="text-xs text-purple-700 hover:underline">
      Have a Rekindle account? Sign in instead
    </button>
  );

  let body: React.ReactNode;
  if (state.kind === 'pending') {
    body = (
      <>
        <Clock className="h-8 w-8 text-amber-500 mx-auto" />
        <p className="text-sm text-gray-600">
          You're registered and waiting for the host's approval. We'll email your personal join link as soon as you're approved.
        </p>
        <Button variant="outline" className="w-full" onClick={() => checkToken(store('local', tokenKey(webinarId)))}>Check again</Button>
      </>
    );
  } else if (state.kind === 'declined') {
    body = <p className="text-sm text-gray-600">Sorry, the host wasn't able to approve your registration for this webinar.</p>;
  } else if (state.kind === 'resent') {
    body = (
      <>
        <MailCheck className="h-8 w-8 text-green-600 mx-auto" />
        <p className="text-sm text-gray-600">
          You're already registered with <b>{state.email}</b>. We've emailed your personal join link again. Open it to join.
        </p>
      </>
    );
  } else if (webinar.registration_required) {
    body = (
      <>
        <p className="text-sm text-gray-600">
          Register with your name and email. No account needed. We'll email you a personal join link and reminders.
          {webinar.registration_approval === 'manual' && ' The host approves each registration.'}
        </p>
        <div className="space-y-3 text-left">
          <div className="space-y-1">
            <Label htmlFor="wg-name">Your name</Label>
            <Input id="wg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wg-email">Email</Label>
            <Input id="wg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoComplete="email"
              onKeyDown={(e) => { if (e.key === 'Enter') register(); }} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={register} disabled={busy} className="w-full bg-purple-600 hover:bg-purple-700">
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register
        </Button>
        {signInLink}
      </>
    );
  } else {
    body = (
      <>
        <div className="space-y-1 text-left">
          <Label htmlFor="wg-name">Your name</Label>
          <Input id="wg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name"
            onKeyDown={(e) => { if (e.key === 'Enter') joinWithName(); }} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={joinWithName} className="w-full bg-purple-600 hover:bg-purple-700">Join webinar</Button>
        {signInLink}
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4 text-center">
      <Card className="max-w-md w-full">
        {header}
        <CardContent className="space-y-3">{body}</CardContent>
      </Card>
    </div>
  );
}

export default WebinarGuestJoin;
