import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { LoginForm } from '@rekindle/features/components/LoginForm';
import { SignupForm } from '@rekindle/features/components/SignupForm';
import { Button } from '@rekindle/ui/button';
import { Loader2, AlertTriangle, CheckCircle2, Mic } from 'lucide-react';

interface InviteInfo {
  webinar_id: string;
  ministry_id: string;
  webinar_title: string;
  ministry_name: string | null;
  role: 'host' | 'co-host' | 'speaker';
  status: 'invited' | 'confirmed' | 'declined' | 'removed';
  invited_name: string | null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/** Public route (/webinar-invite/:token) — the landing page for the "you're
 *  invited to speak" email createWebinarSpeaker() now sends. Unauthenticated
 *  visitors see who's inviting them and can sign in/up inline (same pattern
 *  as MinistryJoinLanding — onSuccess is a no-op, the component just
 *  re-renders once useAuth()'s user becomes non-null); once signed in, a
 *  single Accept claims the row (accept_webinar_speaker_invite) and sends
 *  them straight into the existing webinar join route as a speaker. */
export function WebinarSpeakerInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [stage, setStage] = useState<'loading' | 'error' | 'ready'>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) { setStage('error'); return; }
      const { data, error } = await supabase.rpc('get_webinar_speaker_invite', { p_token: token });
      if (!active) return;
      const row: InviteInfo | undefined = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setStage('error'); return; }
      setInvite(row);
      setStage('ready');
    })();
    return () => { active = false; };
  }, [token]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    const { data, error } = await supabase.rpc('accept_webinar_speaker_invite', { p_token: token });
    setAccepting(false);
    if (error) { setAcceptError(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const ministryId = row?.ministry_id || invite?.ministry_id;
    const webinarId = row?.webinar_id || invite?.webinar_id;
    navigate(`/ministry/${ministryId}/webinar/${webinarId}`, { replace: true });
  };

  if (stage === 'loading' || authLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-purple-600" />
        </div>
      </Shell>
    );
  }

  if (stage === 'error' || !invite) {
    return (
      <Shell>
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Invite not found</h1>
          <p className="text-sm text-gray-600">This invite link is invalid or has expired.</p>
        </div>
      </Shell>
    );
  }

  if (invite.status === 'declined' || invite.status === 'removed') {
    return (
      <Shell>
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Invite no longer available</h1>
          <p className="text-sm text-gray-600">This speaker invite for "{invite.webinar_title}" is no longer active.</p>
        </div>
      </Shell>
    );
  }

  const roleLabel = invite.role === 'host' || invite.role === 'co-host' ? 'co-host' : 'speaker';

  // Already claimed (e.g. re-clicking the email after accepting once) — skip
  // straight to the join route rather than re-running accept.
  if (invite.status === 'confirmed' && user) {
    return (
      <Shell>
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-1">You're all set</h1>
          <p className="text-sm text-gray-600 mb-4">You're confirmed as a {roleLabel} for "{invite.webinar_title}".</p>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={() => navigate(`/ministry/${invite.ministry_id}/webinar/${invite.webinar_id}`)}>
            Go to webinar
          </Button>
        </div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className="text-center mb-4">
          <Mic className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <h1 className="text-lg font-semibold text-gray-900">
            {invite.ministry_name || 'You'}{invite.ministry_name ? ' invited' : "'ve been invited"} you to speak
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            You're invited as a <b>{roleLabel}</b> for "{invite.webinar_title}". Sign in or create an account to accept.
          </p>
        </div>
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

  return (
    <Shell>
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
        <Mic className="h-8 w-8 text-purple-600 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-gray-900 mb-1">You're invited to speak</h1>
        <p className="text-sm text-gray-600 mb-4">
          You're invited as a <b>{roleLabel}</b> for "{invite.webinar_title}"{invite.ministry_name ? ` by ${invite.ministry_name}` : ''}.
        </p>
        {acceptError && <p className="text-sm text-red-600 mb-3">{acceptError}</p>}
        <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={accepting} onClick={accept}>
          {accepting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Accept invite
        </Button>
      </div>
    </Shell>
  );
}

export default WebinarSpeakerInvitePage;
