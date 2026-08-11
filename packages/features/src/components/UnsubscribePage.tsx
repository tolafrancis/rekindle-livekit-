import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Loader2, CheckCircle2, XCircle, Mail, MailX, ArrowLeft } from 'lucide-react';

type Status = 'idle' | 'loading' | 'unsubscribed' | 'resubscribed' | 'error' | 'invalid';

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token  = searchParams.get('token') ?? '';
  const action = searchParams.get('action') ?? 'unsubscribe';

  const [status, setStatus]   = useState<Status>('idle');
  const [email, setEmail]     = useState('');
  const [message, setMessage] = useState('');

  // Auto-confirm on mount if action === 'unsubscribe'
  // (user clicked the one-click link in the email)
  useEffect(() => {
    if (token && action === 'unsubscribe') {
      handleUnsubscribe();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const callEdgeFunction = async (resubscribe: boolean) => {
    setStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('email-unsubscribe', {
        body: { token, resubscribe },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setEmail(data.email ?? '');
      setMessage(data.message ?? '');
      setStatus(resubscribe ? 'resubscribed' : 'unsubscribed');
    } catch (err: any) {
      setMessage(err.message ?? 'Something went wrong. Please try again.');
      setStatus(err.message?.includes('expired') || err.message?.includes('Invalid')
        ? 'invalid'
        : 'error',
      );
    }
  };

  const handleUnsubscribe  = () => callEdgeFunction(false);
  const handleResubscribe  = () => callEdgeFunction(true);

  // ── No token ──────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <Page>
        <IconWrap colour="text-red-500"><XCircle className="h-12 w-12" /></IconWrap>
        <h1>Invalid link</h1>
        <p>This unsubscribe link is missing required information. Please use the link from your email.</p>
        <BackHome />
      </Page>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <Page>
        <IconWrap colour="text-purple-500"><Loader2 className="h-12 w-12 animate-spin" /></IconWrap>
        <h1>Processing…</h1>
        <p>Please wait a moment.</p>
      </Page>
    );
  }

  // ── Successfully unsubscribed ─────────────────────────────────────────────
  if (status === 'unsubscribed') {
    return (
      <Page>
        <IconWrap colour="text-green-500"><CheckCircle2 className="h-12 w-12" /></IconWrap>
        <h1>Unsubscribed</h1>
        {email && <p className="email-pill">{email}</p>}
        <p>You've been removed from our email list. You won't receive any more marketing emails from ReKindle.</p>
        <p className="muted">Note: you may still receive essential account emails such as booking confirmations and security alerts.</p>
        <button className="btn-ghost" onClick={handleResubscribe}>
          Changed your mind? Re-subscribe
        </button>
        <BackHome />
      </Page>
    );
  }

  // ── Successfully resubscribed ─────────────────────────────────────────────
  if (status === 'resubscribed') {
    return (
      <Page>
        <IconWrap colour="text-purple-500"><Mail className="h-12 w-12" /></IconWrap>
        <h1>Welcome back!</h1>
        {email && <p className="email-pill">{email}</p>}
        <p>You've been re-subscribed to ReKindle emails. You'll receive devotionals, updates, and community news again.</p>
        <BackHome />
      </Page>
    );
  }

  // ── Invalid / expired token ───────────────────────────────────────────────
  if (status === 'invalid') {
    return (
      <Page>
        <IconWrap colour="text-amber-500"><XCircle className="h-12 w-12" /></IconWrap>
        <h1>Link expired</h1>
        <p>This unsubscribe link has expired or is invalid. Unsubscribe links are valid for 30 days.</p>
        <p className="muted">
          To unsubscribe, log in to ReKindle and update your notification preferences in your profile settings,
          or contact us at <a href="mailto:support@rekindlebc.com">support@rekindlebc.com</a>.
        </p>
        <BackHome />
      </Page>
    );
  }

  // ── Generic error ────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <Page>
        <IconWrap colour="text-red-500"><XCircle className="h-12 w-12" /></IconWrap>
        <h1>Something went wrong</h1>
        <p>{message || 'We couldn\'t process your request. Please try again.'}</p>
        <button className="btn-primary" onClick={handleUnsubscribe}>Try again</button>
        <BackHome />
      </Page>
    );
  }

  // ── Idle — shown briefly before useEffect fires, or if action !== 'unsubscribe' ──
  return (
    <Page>
      <IconWrap colour="text-red-400"><MailX className="h-12 w-12" /></IconWrap>
      <h1>Unsubscribe from ReKindle emails?</h1>
      <p>You'll stop receiving marketing and devotional emails. Essential account emails will still be delivered.</p>
      <button className="btn-primary" onClick={handleUnsubscribe}>
        Yes, unsubscribe me
      </button>
      <BackHome label="No, keep my subscription" />
    </Page>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <style>{`
        .card { background: #fff; border-radius: 16px; padding: 48px 40px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(109,40,217,0.08); }
        .card h1 { font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 16px 0 12px; }
        .card p { font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px; }
        .card p.muted { font-size: 13px; color: #999; }
        .card p.email-pill { display: inline-block; background: #f5f3ff; color: #7c3aed; border-radius: 20px; padding: 4px 14px; font-size: 14px; font-weight: 600; margin-bottom: 12px; }
        .card a { color: #7c3aed; }
        .btn-primary { display: inline-block; padding: 12px 28px; background: #7c3aed; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; margin: 8px 0; transition: background 0.15s; }
        .btn-primary:hover { background: #6d28d9; }
        .btn-ghost { display: inline-block; padding: 10px 20px; background: transparent; color: #7c3aed; border: 1.5px solid #7c3aed; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; margin: 8px 0; transition: all 0.15s; }
        .btn-ghost:hover { background: #f5f3ff; }
        .back-link { display: inline-flex; align-items: center; gap: 6px; color: #9ca3af; font-size: 14px; text-decoration: none; margin-top: 16px; cursor: pointer; border: none; background: none; }
        .back-link:hover { color: #7c3aed; }
        .icon-wrap { display: flex; justify-content: center; margin-bottom: 4px; }
      `}</style>
      <div className="card">{children}</div>
    </div>
  );
}

function IconWrap({ colour, children }: { colour: string; children: React.ReactNode }) {
  return <div className="icon-wrap" style={{ color: '' }}>
    <span className={colour}>{children}</span>
  </div>;
}

function BackHome({ label }: { label?: string }) {
  return (
    <div style={{ marginTop: '8px' }}>
      <a href="/" className="back-link">
        <ArrowLeft style={{ width: 14, height: 14 }} />
        {label ?? 'Back to ReKindle'}
      </a>
    </div>
  );
}
