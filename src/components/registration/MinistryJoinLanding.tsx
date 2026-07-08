import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { Button } from '@/components/ui/button';
import { sha256Hex } from '@/lib/qrCode';
import MinistryMemberRegistration from './MinistryMemberRegistration';
import {
  Loader2, AlertTriangle, CheckCircle2, UserCheck, ArrowRight, Building2, Monitor, RefreshCcw,
} from 'lucide-react';

interface MinistryBranding {
  ministry_id: string;
  name: string;
  logo_url: string | null;
  banner_url: string | null;
  welcome_message: string | null;
  registration_mode: string;
  kiosk_enabled: boolean;
  country: string | null;
  gift_aid_enabled: boolean;
  code_status: string;
}

interface IdentityMatch {
  profile_id: string;
  display_name: string | null;
  registration_status: string;
  source: string;
  is_self: boolean;
}

const MinistryJoinLanding: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [sp] = useSearchParams();
  const code = sp.get('code') || '';
  const version = sp.get('v') ? parseInt(sp.get('v') as string, 10) : null;
  const { user } = useAuth();

  const [stage, setStage] = useState<'loading' | 'error' | 'branding'>('loading');
  const [ministry, setMinistry] = useState<MinistryBranding | null>(null);
  const [codeStatus, setCodeStatus] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [kioskMode, setKioskMode] = useState(false);

  const [identityLoading, setIdentityLoading] = useState(false);
  const [selfProfile, setSelfProfile] = useState<IdentityMatch | null>(null);
  const [matches, setMatches] = useState<IdentityMatch[]>([]);
  const [identityResolved, setIdentityResolved] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // ── Load ministry + validate code ──────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      if (!slug) { setCodeStatus('not_found'); setStage('error'); return; }
      const { data, error } = await supabase.rpc('validate_join', {
        p_slug: slug, p_code: code, p_version: version,
      });
      if (!active) return;
      const row: MinistryBranding | undefined = Array.isArray(data) ? data[0] : data;
      if (error || !row || row.code_status === 'not_found') {
        setCodeStatus(row?.code_status || 'not_found');
        setStage('error');
        return;
      }
      setMinistry(row);
      setCodeStatus(row.code_status);
      if (row.code_status === 'invalid_code' || row.code_status === 'version_changed') {
        setStage('error');
        return;
      }
      setStage('branding');

      // Kiosk detection — a registered tablet stores its raw device token locally.
      try {
        const tok = localStorage.getItem('kiosk_device_token');
        if (tok) {
          const hash = await sha256Hex(tok);
          const { data: k } = await supabase.rpc('check_kiosk_session', {
            p_slug: slug, p_token_hash: hash,
          });
          const kr = Array.isArray(k) ? k[0] : k;
          if (active && kr?.valid) setKioskMode(true);
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [slug, code, version]);

  // ── Identity matching (after auth) ─────────────────────────────────────────
  const runIdentityMatch = async () => {
    if (!user || !ministry) return;
    setIdentityLoading(true);
    try {
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('phone, full_name')
        .eq('user_id', user.id)
        .maybeSingle();
      const phone = (prof as any)?.phone || '';
      const email = (user as any)?.email || (prof as any)?.email || '';
      const { data } = await supabase.rpc('find_join_identity_matches', {
        p_ministry_id: ministry.ministry_id, p_phone: phone, p_email: email,
      });
      const rows: IdentityMatch[] = data || [];
      setSelfProfile(rows.find((r) => r.is_self) || null);
      setMatches(rows.filter((r) => !r.is_self));
    } finally {
      setIdentityLoading(false);
    }
  };

  useEffect(() => {
    if (stage === 'branding' && user && ministry) runIdentityMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, user, ministry?.ministry_id]);

  const claim = async (profileId: string) => {
    setClaimingId(profileId);
    try {
      const { data } = await supabase.rpc('claim_join_profile', { p_profile_id: profileId });
      if (data) { setIdentityResolved(true); await runIdentityMatch(); }
    } finally {
      setClaimingId(null);
    }
  };

  // ── UI building blocks ──────────────────────────────────────────────────────
  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex flex-col items-center">
      {ministry?.banner_url && (
        <div className="w-full h-32 sm:h-44 bg-gray-200 overflow-hidden">
          <img src={ministry.banner_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="w-full max-w-md px-4 -mt-10 pb-10 flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-white shadow-lg border flex items-center justify-center overflow-hidden">
          {ministry?.logo_url
            ? <img src={ministry.logo_url} alt="" className="w-full h-full object-cover" />
            : <Building2 className="h-9 w-9 text-purple-500" />}
        </div>
        {ministry?.name && <h1 className="mt-3 text-xl font-bold text-gray-900 text-center">{ministry.name}</h1>}
        {kioskMode && (
          <span className="mt-2 inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
            <Monitor className="h-3 w-3" /> Kiosk mode
          </span>
        )}
        <div className="w-full mt-5">{children}</div>
      </div>
    </div>
  );

  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-purple-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (stage === 'error') {
    const msg =
      codeStatus === 'version_changed'
        ? 'This invite code has been updated. Please get the latest QR code or link from your pastor or ministry admin.'
        : codeStatus === 'invalid_code'
        ? 'This invite code is not valid. Please check the link or ask your ministry for a new one.'
        : 'We couldn’t find this ministry. The link may be mistyped or no longer active.';
    return (
      <Shell>
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-900 mb-1">
            {codeStatus === 'version_changed' ? 'Code updated' : codeStatus === 'invalid_code' ? 'Invalid code' : 'Not found'}
          </h2>
          <p className="text-sm text-gray-600">{msg}</p>
        </div>
      </Shell>
    );
  }

  // stage === 'branding'
  if (!user) {
    return (
      <Shell>
        {ministry?.welcome_message && (
          <p className="text-sm text-gray-600 text-center mb-4">{ministry.welcome_message}</p>
        )}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-center text-sm font-medium text-gray-700 mb-4">
            {authMode === 'login' ? 'Already on Rekindle? Sign in to continue' : 'New here? Create your account'}
          </p>
          {authMode === 'login' ? (
            <LoginForm onSwitchToSignup={() => setAuthMode('signup')} onSuccess={() => {}} />
          ) : (
            <SignupForm onSwitchToLogin={() => setAuthMode('login')} onSuccess={() => {}} />
          )}
        </div>
      </Shell>
    );
  }

  // authed → identity matching
  if (identityLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-purple-600" />
        </div>
      </Shell>
    );
  }

  // Already an active member of this ministry
  if (selfProfile && selfProfile.registration_status === 'active' && !identityResolved) {
    return (
      <Shell>
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-900 mb-1">Welcome back{selfProfile.display_name ? `, ${selfProfile.display_name.split(' ')[0]}` : ''}!</h2>
          <p className="text-sm text-gray-600 mb-4">You’re already a member of {ministry?.name}.</p>
          <Button className="w-full" onClick={() => { window.location.href = '/'; }}>
            Go to Rekindle <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </Shell>
    );
  }

  // Possible existing record(s) to claim — "Is this you?"
  if (matches.length > 0 && !identityResolved && !selfProfile) {
    return (
      <Shell>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-5 w-5 text-purple-600" />
            <h2 className="font-semibold text-gray-900">Is this you?</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            We found an existing record at {ministry?.name} that may be you. Claim it to avoid creating a duplicate.
          </p>
          <div className="space-y-2">
            {matches.map((m) => (
              <div key={m.profile_id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.display_name || 'Existing record'}</p>
                  <p className="text-xs text-gray-400 capitalize">{m.registration_status}{m.source ? ` · ${m.source.replace(/_/g, ' ')}` : ''}</p>
                </div>
                <Button size="sm" disabled={claimingId === m.profile_id} onClick={() => claim(m.profile_id)}>
                  {claimingId === m.profile_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'This is me'}
                </Button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setIdentityResolved(true)}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-4"
          >
            None of these — register as new
          </button>
        </div>
      </Shell>
    );
  }

  // Resolved → registration form (Tier 1)
  return (
    <Shell>
      <MinistryMemberRegistration
        ministryId={ministry!.ministry_id}
        ministryName={ministry!.name}
        country={ministry!.country}
        giftAidEnabled={ministry!.gift_aid_enabled}
        registrationMode={ministry!.registration_mode}
        registrationSource={kioskMode ? 'kiosk' : code ? 'qr_code' : 'invite_link'}
        kioskMode={kioskMode}
      />
    </Shell>
  );
};

export default MinistryJoinLanding;
