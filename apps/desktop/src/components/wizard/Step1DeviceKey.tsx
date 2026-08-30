import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { authenticateDevice, type AuthenticateDeviceResult } from '../../api/supabase';

interface Step1DeviceKeyProps {
  initialKey: string;
  onSuccess: (authData: {
    deviceKey: string;
    bearerToken: string;
    tokenExpiresAt: string;
    deviceId: string;
    ministryId: string;
  }) => void;
}

export const Step1DeviceKey: React.FC<Step1DeviceKeyProps> = ({ initialKey, onSuccess }) => {
  const [deviceKey, setDeviceKey] = useState(initialKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<AuthenticateDeviceResult | null>(null);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = deviceKey.trim();

    if (!clean) {
      setError('Please paste your device key from the ReKindle Ministry Dashboard.');
      return;
    }

    if (!clean.startsWith('rlt_') || clean.split('_').length < 3) {
      setError('Invalid key format. ReKindle device keys start with "rlt_" followed by two random hashes.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await authenticateDevice(clean);
      setVerifiedResult(result);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify the device key has not been revoked.');
      setVerifiedResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (verifiedResult) {
      onSuccess({
        deviceKey: deviceKey.trim(),
        bearerToken: verifiedResult.token,
        tokenExpiresAt: verifiedResult.expires_at,
        deviceId: verifiedResult.device_id,
        ministryId: verifiedResult.ministry_id,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-500" />
          Step 1: Device Authentication
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Pair this PC with your church ministry by pasting your Hardware Device Key.
        </p>
      </div>

      <div className="bg-surface p-5 rounded-xl border border-surface-border space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
            Device Key
          </label>
          <div className="relative">
            <input
              type="text"
              value={deviceKey}
              onChange={(e) => {
                setDeviceKey(e.target.value);
                setError(null);
                setVerifiedResult(null);
              }}
              placeholder="rlt_a1b2c3d4e5f6_1234567890abcdef..."
              className="w-full bg-surface-elevated border border-slate-700 focus:border-blue-500 rounded-lg px-4 py-3 text-slate-100 font-mono text-xs placeholder:text-slate-500 focus:outline-none transition-colors"
            />
            {verifiedResult && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-emerald-500 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Verified
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Keys are issued by your church admin in Ministry Hub &rarr; Live Translation &rarr; Devices.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2.5 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Authentication Failed</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {verifiedResult && (
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-2.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Device Key Verified Successfully</p>
              <p className="mt-0.5 text-slate-300 font-mono text-[11px]">
                Device ID: {verifiedResult.device_id}
              </p>
              <p className="text-slate-400 text-[11px]">
                Authentication token active for 24 hours (auto-refreshed via heartbeat).
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {!verifiedResult ? (
          <button
            type="button"
            onClick={() => handleVerify()}
            disabled={loading || !deviceKey.trim()}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-blue-600/20 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Key...</span>
              </>
            ) : (
              <span>Verify & Continue</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleProceed}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <span>Continue to Audio Setup</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
