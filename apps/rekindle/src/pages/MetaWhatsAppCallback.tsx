import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function MetaWhatsAppCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const stateParam = searchParams.get('state');

      if (!code) {
        setStatus('error');
        setErrorMessage('No OAuth code returned from Meta.');
        return;
      }

      let ministryId = '';
      if (stateParam) {
        try {
          const decoded = JSON.parse(atob(stateParam));
          ministryId = decoded.ministryId || '';
        } catch (e) {
          console.error('Failed to parse state parameter:', e);
        }
      }

      // Retrieve cached wabaId and phoneNumberId from sessionStorage if present
      let wabaId = '';
      let phoneNumberId = '';
      try {
        const stored = sessionStorage.getItem('wa_signup_info');
        if (stored) {
          const parsed = JSON.parse(stored);
          wabaId = parsed.wabaId || '';
          phoneNumberId = parsed.phoneNumberId || '';
        }
      } catch (e) {
        console.warn('Failed to parse wa_signup_info from sessionStorage', e);
      }

      try {
        const { data, error } = await supabase.functions.invoke('whatsapp-embedded-signup-complete', {
          body: {
            ministryId,
            wabaId,
            phoneNumberId,
            code,
          },
        });

        if (error || !data?.ok) {
          throw new Error(error?.message || data?.error || 'Failed to complete WhatsApp signup');
        }

        setStatus('success');

        // Clear stored signup info
        sessionStorage.removeItem('wa_signup_info');

        // If opened inside a popup, notify parent and close window after brief delay
        setTimeout(() => {
          if (window.opener && window.opener !== window) {
            window.close();
          } else {
            navigate('/admin?tab=whatsapp', { replace: true });
          }
        }, 1200);
      } catch (err: any) {
        console.error('WhatsApp OAuth callback error:', err);
        setStatus('error');
        setErrorMessage(err.message || 'An unexpected error occurred during WhatsApp connection.');
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  const handleTryAgain = () => {
    if (window.opener && window.opener !== window) {
      window.close();
    } else {
      navigate('/admin?tab=whatsapp', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border shadow-sm p-6 text-center space-y-4">
        {status === 'loading' && (
          <div className="py-8 space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-800">Connecting WhatsApp...</h2>
            <p className="text-sm text-slate-500">Exchanging credentials and finalizing setup with Meta.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-800">WhatsApp Connected!</h2>
            <p className="text-sm text-slate-500">Your WhatsApp Business Account was successfully linked.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="py-4 space-y-4 text-left">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection Failed</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {errorMessage}
              </AlertDescription>
            </Alert>
            <Button onClick={handleTryAgain} className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
