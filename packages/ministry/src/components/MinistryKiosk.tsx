import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { sha256Hex, buildJoinUrl } from '@rekindle/features/qrCode';
import MinistryMemberRegistration from './MinistryMemberRegistration';
import { Loader2, Building2, UserPlus, UserCheck, ArrowLeft, Lock, CheckCircle2, Phone, Mail, Delete } from 'lucide-react';

type Screen = 'loading' | 'invalid' | 'idle' | 'choose' | 'returning' | 'pick' | 'welcome' | 'register';

const IDLE_MS = 10 * 60 * 1000;   // auto-lock after 10 min inactivity
const HEARTBEAT_MS = 5 * 60 * 1000;
const THANKYOU_MS = 5000;

const MinistryKiosk: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>('loading');
  const [ministry, setMinistry] = useState<any>(null);
  const tokenHashRef = useRef<string>('');

  const [lookup, setLookup] = useState({ phone: '', email: '' });
  // Kiosk check-in method: choose phone or email first, then enter it. Phone uses an
  // on-screen ATM keypad (no OS keyboard) since kiosks are touch-only.
  const [lookupMethod, setLookupMethod] = useState<'choice' | 'phone' | 'email'>('choice');
  const [matches, setMatches] = useState<Array<{ profile_id: string; display_name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const [recordOk, setRecordOk] = useState(true);

  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState('');
  const idleTimer = useRef<any>(null);

  // ── load branding + validate this device's kiosk token ─────────────────────
  useEffect(() => {
    (async () => {
      if (!slug) { setScreen('invalid'); return; }
      const { data } = await supabase.rpc('validate_join', { p_slug: slug, p_code: '', p_version: null });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.code_status === 'not_found') { setScreen('invalid'); return; }
      setMinistry(row);

      const tok = localStorage.getItem('kiosk_device_token');
      if (!tok) { setScreen('invalid'); return; }
      const hash = await sha256Hex(tok);
      tokenHashRef.current = hash;
      const { data: k } = await supabase.rpc('check_kiosk_session', { p_slug: slug, p_token_hash: hash });
      const kr = Array.isArray(k) ? k[0] : k;
      setScreen(kr?.valid ? 'idle' : 'invalid');
    })();
  }, [slug]);

  // ── heartbeat ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen === 'loading' || screen === 'invalid') return;
    const t = setInterval(() => {
      if (tokenHashRef.current) supabase.rpc('check_kiosk_session', { p_slug: slug, p_token_hash: tokenHashRef.current });
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [screen, slug]);

  // ── idle auto-lock ───────────────────────────────────────────────────────────
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setLookup({ phone: '', email: '' });
      setWelcomeName('');
      setExitOpen(false);
      setScreen('idle');
    }, IDLE_MS);
  }, []);
  useEffect(() => {
    if (screen === 'loading' || screen === 'invalid' || screen === 'idle') return;
    resetIdle();
    const onAct = () => resetIdle();
    window.addEventListener('pointerdown', onAct);
    window.addEventListener('keydown', onAct);
    return () => {
      window.removeEventListener('pointerdown', onAct);
      window.removeEventListener('keydown', onAct);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [screen, resetIdle]);

  const backToIdle = (delay = 0) => setTimeout(() => {
    setLookup({ phone: '', email: '' }); setLookupMethod('choice'); setWelcomeName(''); setMatches([]); setScreen('idle');
  }, delay);

  // ── returning member lookup + attendance ────────────────────────────────────
  // Record attendance for a chosen profile, then show the welcome screen.
  const checkIn = async (profileId: string, name: string) => {
    setSearching(true);
    try {
      const { data: rec, error: recErr } = await supabase.rpc('kiosk_record_attendance', {
        p_slug: slug, p_token_hash: tokenHashRef.current, p_profile_id: profileId,
      });
      const ok = !recErr && (Array.isArray(rec) ? rec[0]?.recorded : (rec as any)?.recorded) === true;
      if (!ok) console.error('[Kiosk] attendance not recorded', recErr || rec);
      setRecordOk(ok);
      setWelcomeName(name || '');
      setMatches([]);
      setScreen('welcome');
      backToIdle(THANKYOU_MS);
    } finally {
      setSearching(false);
    }
  };

  const doLookup = async () => {
    if (!lookup.phone && !lookup.email) return;
    setSearching(true);
    try {
      const { data } = await supabase.rpc('kiosk_lookup_member', {
        p_slug: slug, p_token_hash: tokenHashRef.current, p_phone: lookup.phone, p_email: lookup.email,
      });
      const rows = (data || []) as Array<{ profile_id: string; display_name: string }>;
      if (rows.length === 0) {
        // no match → send them to registration
        setScreen('register');
        return;
      }
      if (rows.length === 1) {
        await checkIn(rows[0].profile_id, rows[0].display_name);
        return;
      }
      // more than one record matches → let them pick which is them
      setMatches(rows);
      setScreen('pick');
    } finally {
      setSearching(false);
    }
  };

  const guestSubmit = async (payload: any): Promise<'active' | 'pending'> => {
    const { data, error } = await supabase.rpc('kiosk_submit_registration', {
      p_slug: slug, p_token_hash: tokenHashRef.current, p_payload: payload,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    backToIdle(30000); // longer: let them scan the optional account-setup QR
    return (row?.status as 'active' | 'pending') || 'active';
  };

  const tryExit = async () => {
    const hash = await sha256Hex(pin);
    const { data } = await supabase.rpc('verify_kiosk_pin', { p_slug: slug, p_pin_hash: hash });
    if (data === true) navigate('/');
    else { setPin(''); alert('Incorrect PIN'); }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900"><Loader2 className="h-10 w-10 animate-spin text-white" /></div>;
  }
  if (screen === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
        <Lock className="h-12 w-12 mb-4 opacity-70" />
        <h1 className="text-xl font-bold mb-2">Kiosk not set up</h1>
        <p className="text-slate-300 text-sm max-w-sm">This device isn’t registered as a kiosk for this ministry. Activate it from Ministry Settings → Member Registration.</p>
      </div>
    );
  }

  const Header = (
    <div className="flex flex-col items-center mb-8">
      <div className="w-24 h-24 rounded-3xl bg-white shadow-xl flex items-center justify-center overflow-hidden">
        {ministry?.logo_url ? <img src={ministry.logo_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="h-12 w-12 text-purple-500" />}
      </div>
      <h1 className="mt-4 text-3xl font-bold text-white text-center">{ministry?.name}</h1>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-700 to-slate-900 flex flex-col items-center justify-center p-6 relative">
      <button onClick={() => setExitOpen(true)} className="absolute top-4 right-4 text-white/40 hover:text-white/80 text-xs flex items-center gap-1">
        <Lock className="h-3 w-3" /> Exit
      </button>

      {screen === 'idle' && (
        <button onClick={() => setScreen('choose')} className="flex flex-col items-center group">
          {Header}
          <span className="px-10 py-4 rounded-full bg-white text-purple-700 text-xl font-semibold shadow-lg group-active:scale-95 transition">
            Tap to check in or register
          </span>
        </button>
      )}

      {screen === 'choose' && (
        <div className="w-full max-w-md">
          {Header}
          <div className="grid gap-4">
            <button onClick={() => { setLookup({ phone: '', email: '' }); setLookupMethod('choice'); setScreen('returning'); }} className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-lg active:scale-[0.99] transition">
              <UserCheck className="h-8 w-8 text-green-600" />
              <div className="text-left"><p className="text-lg font-semibold">I’m a returning member</p><p className="text-sm text-gray-500">Quick check-in</p></div>
            </button>
            <button onClick={() => setScreen('register')} className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-lg active:scale-[0.99] transition">
              <UserPlus className="h-8 w-8 text-purple-600" />
              <div className="text-left"><p className="text-lg font-semibold">I’m new here</p><p className="text-sm text-gray-500">Register as a member</p></div>
            </button>
          </div>
          <button onClick={() => backToIdle()} className="text-white/60 hover:text-white text-sm mt-6 flex items-center gap-1 mx-auto"><ArrowLeft className="h-4 w-4" /> Back</button>
        </div>
      )}

      {screen === 'returning' && (
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-1">Welcome back</h2>

          {/* Step 1 — choose how to check in (touch-only kiosk: big buttons) */}
          {lookupMethod === 'choice' && (
            <>
              <p className="text-sm text-gray-500 mb-5">How would you like to check in?</p>
              <div className="grid gap-4">
                <button
                  onClick={() => { setLookup({ phone: '', email: '' }); setLookupMethod('phone'); }}
                  className="flex items-center gap-4 border-2 border-gray-100 rounded-2xl p-5 active:scale-[0.99] transition hover:border-purple-200"
                >
                  <Phone className="h-8 w-8 text-purple-600 shrink-0" />
                  <div className="text-left"><p className="text-lg font-semibold">Phone number</p><p className="text-sm text-gray-500">Enter it on the keypad</p></div>
                </button>
                <button
                  onClick={() => { setLookup({ phone: '', email: '' }); setLookupMethod('email'); }}
                  className="flex items-center gap-4 border-2 border-gray-100 rounded-2xl p-5 active:scale-[0.99] transition hover:border-purple-200"
                >
                  <Mail className="h-8 w-8 text-blue-600 shrink-0" />
                  <div className="text-left"><p className="text-lg font-semibold">Email address</p><p className="text-sm text-gray-500">Type your email</p></div>
                </button>
              </div>
              <button onClick={() => setScreen('choose')} className="text-gray-400 hover:text-gray-600 text-sm mt-5 flex items-center gap-1 mx-auto"><ArrowLeft className="h-4 w-4" /> Back</button>
            </>
          )}

          {/* Step 2a — phone via an ATM-style on-screen keypad (no OS keyboard) */}
          {lookupMethod === 'phone' && (
            <>
              <p className="text-sm text-gray-500 mb-3">Enter your phone number.</p>
              <div className="h-14 rounded-xl bg-gray-50 border flex items-center justify-center text-2xl font-semibold tracking-wider mb-4 select-none">
                {lookup.phone || <span className="text-gray-300">+84…</span>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', 'del'].map((key) => (
                  <button
                    key={key}
                    onClick={() => setLookup((l) => ({
                      ...l,
                      phone: key === 'del' ? l.phone.slice(0, -1) : l.phone + key,
                    }))}
                    className="h-16 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 transition text-2xl font-semibold flex items-center justify-center select-none"
                  >
                    {key === 'del' ? <Delete className="h-6 w-6 text-gray-600" /> : key}
                  </button>
                ))}
              </div>
              <Button className="w-full h-14 text-lg mt-4" disabled={searching || !lookup.phone} onClick={doLookup}>
                {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Check in'}
              </Button>
              <button onClick={() => setLookupMethod('choice')} className="text-gray-400 hover:text-gray-600 text-sm mt-4 flex items-center gap-1 mx-auto"><ArrowLeft className="h-4 w-4" /> Back</button>
            </>
          )}

          {/* Step 2b — email (needs letters, so a normal field) */}
          {lookupMethod === 'email' && (
            <>
              <p className="text-sm text-gray-500 mb-3">Enter your email address.</p>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input autoFocus className="h-14 text-lg" type="email" inputMode="email" value={lookup.email} onChange={(e) => setLookup({ ...lookup, email: e.target.value })} placeholder="you@example.com" />
              </div>
              <Button className="w-full h-14 text-lg mt-5" disabled={searching || !lookup.email} onClick={doLookup}>
                {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Check in'}
              </Button>
              <button onClick={() => setLookupMethod('choice')} className="text-gray-400 hover:text-gray-600 text-sm mt-4 flex items-center gap-1 mx-auto"><ArrowLeft className="h-4 w-4" /> Back</button>
            </>
          )}
        </div>
      )}

      {screen === 'pick' && (
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-1">Which one is you?</h2>
          <p className="text-sm text-gray-500 mb-4">We found more than one record with those details. Tap your name to check in.</p>
          <div className="space-y-2">
            {matches.map((m) => (
              <button
                key={m.profile_id}
                onClick={() => checkIn(m.profile_id, m.display_name)}
                disabled={searching}
                className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-xl p-4 text-left transition disabled:opacity-50"
              >
                <UserCheck className="h-5 w-5 text-purple-600 shrink-0" />
                <span className="text-lg font-medium">{m.display_name || 'Member'}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setMatches([]); setScreen('returning'); }} className="text-gray-400 hover:text-gray-600 text-sm mt-4 flex items-center gap-1 mx-auto"><ArrowLeft className="h-4 w-4" /> Back</button>
        </div>
      )}

      {screen === 'welcome' && (
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-1">Welcome back{welcomeName ? `, ${welcomeName.split(' ')[0]}` : ''}!</h2>
          {recordOk
            ? <p className="text-gray-500">You’re checked in. Returning to start…</p>
            : <p className="text-amber-600 text-sm">We couldn’t save your check-in — please let a team member know. Returning to start…</p>}
        </div>
      )}

      {screen === 'register' && (
        <div className="w-full max-w-md">
          <MinistryMemberRegistration
            ministryId={ministry.ministry_id}
            ministryName={ministry.name}
            country={ministry.country}
            giftAidEnabled={ministry.gift_aid_enabled}
            registrationMode={ministry.registration_mode}
            registrationSource="kiosk"
            kioskMode
            guestMode
            onGuestSubmit={guestSubmit}
            accountSetupUrl={buildJoinUrl(slug || '', '', null)}
            onExit={() => backToIdle()}
          />
          <button onClick={() => setScreen('choose')} className="text-white/60 hover:text-white text-sm mt-4 flex items-center gap-1 mx-auto"><ArrowLeft className="h-4 w-4" /> Back</button>
        </div>
      )}

      {exitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => { setExitOpen(false); setPin(''); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Lock className="h-4 w-4" /> Enter kiosk PIN to exit</h3>
            <Input className="h-12 text-center text-2xl tracking-widest" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => { setExitOpen(false); setPin(''); }}>Cancel</Button>
              <Button className="flex-1" disabled={pin.length !== 4} onClick={tryExit}>Exit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MinistryKiosk;
