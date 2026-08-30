import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, Loader2, Settings, ShieldCheck, AlertCircle } from 'lucide-react';
import { StatusIndicator, type ServiceStatus } from './StatusIndicator';
import { LatencyDisplay } from './LatencyDisplay';
import { AudioVUMeter } from './AudioVUMeter';
import { deviceStartSession, deviceUpdateSession } from '../../api/supabase';
import { fetchDevicePublishToken, LiveKitBridge } from '../../api/livekit';
import { useHeartbeat } from '../../hooks/useHeartbeat';
import type { AppSettings } from '../../utils/secureStore';

interface ServiceViewProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onStatusChange?: (status: ServiceStatus) => void;
}

export const ServiceView: React.FC<ServiceViewProps> = ({
  settings,
  onOpenSettings,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<ServiceStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [rttMs, setRttMs] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const bridgeRef = useRef<LiveKitBridge | null>(null);

  const updateStatus = useCallback((nextStatus: ServiceStatus) => {
    setStatus(nextStatus);
    onStatusChange?.(nextStatus);
  }, [onStatusChange]);

  // Keepalive heartbeat running every 60s
  const { lastHeartbeat, isHealthy } = useHeartbeat({
    bearerToken: settings.bearerToken,
    intervalMs: 60000,
    enabled: !!settings.bearerToken,
    onFailed: (failures) => {
      if (failures >= 3) {
        console.warn('[ServiceView] Consecutive heartbeat failures detected.');
      }
    },
  });

  const handleStartService = async () => {
    if (status === 'live' || status === 'connecting') return;

    setErrorMessage(null);
    updateStatus('connecting');

    try {
      // 1. Trigger device_start_session RPC
      const sessionResult = await deviceStartSession(
        settings.bearerToken,
        settings.sourceLanguage,
        settings.targetLanguage
      );

      const activeSessionId = sessionResult.session_id;
      setSessionId(activeSessionId);
      setRoomName(sessionResult.room_name);

      // 2. Mint LiveKit publish + subscribe token via Edge Function
      const tokenResult = await fetchDevicePublishToken(activeSessionId, settings.bearerToken);

      // 3. Connect LiveKit bridge with raw sound board constraints
      const bridge = new LiveKitBridge({
        onStatusChange: (bridgeStatus) => {
          updateStatus(bridgeStatus);
        },
        onError: (err) => {
          setErrorMessage(err.message || 'LiveKit connection error');
          updateStatus('error');
        },
        onLatencyChange: (ms) => setRttMs(ms),
        onInputLevelChange: (lvl) => setInputLevel(lvl),
        onOutputLevelChange: (lvl) => setOutputLevel(lvl),
      });

      bridgeRef.current = bridge;

      await bridge.connect({
        url: tokenResult.url,
        token: tokenResult.token,
        targetLanguage: settings.targetLanguage,
        inputDeviceId: settings.inputDeviceId,
        outputDeviceId: settings.outputDeviceId,
      });

      setSessionStartTime(new Date());
      updateStatus('live');
    } catch (err: any) {
      console.error('[ServiceView] Failed to start service:', err);
      setErrorMessage(err.message || 'Failed to initialize live translation service');
      updateStatus('error');
      bridgeRef.current?.disconnect();
      bridgeRef.current = null;
    }
  };

  const handleStopService = async () => {
    if (status === 'idle') return;

    const currentSessionId = sessionId;

    // Disconnect audio capture and LiveKit room
    bridgeRef.current?.disconnect();
    bridgeRef.current = null;

    setSessionStartTime(null);
    setInputLevel(0);
    setOutputLevel(0);
    setRttMs(0);
    updateStatus('idle');

    // Notify backend that session has ended
    if (currentSessionId && settings.bearerToken) {
      try {
        await deviceUpdateSession(currentSessionId, 'ended', null, settings.bearerToken);
      } catch (err) {
        console.error('[ServiceView] Failed to mark session ended:', err);
      }
    }
    setSessionId(null);
  };

  // Teardown on unmount or window close
  useEffect(() => {
    return () => {
      bridgeRef.current?.disconnect();
    };
  }, []);

  const isLive = status === 'live';
  const isConnecting = status === 'connecting';

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
      {/* Top Status Header */}
      <StatusIndicator status={status} errorMessage={errorMessage} />

      {/* Main Two-Button Sound-Booth Console */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* START SERVICE BUTTON */}
        <button
          type="button"
          onClick={handleStartService}
          disabled={isLive || isConnecting}
          className={`h-40 rounded-2xl flex flex-col items-center justify-center space-y-3 p-6 transition-all relative overflow-hidden border ${
            isLive
              ? 'bg-emerald-950/20 border-emerald-900/40 opacity-50 cursor-not-allowed'
              : isConnecting
              ? 'bg-amber-950/20 border-amber-800/40 opacity-75'
              : 'bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 border-emerald-400/40 text-white shadow-xl shadow-emerald-900/30 hover:scale-[1.01] active:scale-[0.99]'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
              <span className="text-sm font-bold tracking-wider uppercase">
                Dispatching Translation Bot...
              </span>
            </>
          ) : isLive ? (
            <>
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="w-4 h-4 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <span className="text-sm font-bold tracking-wider uppercase text-emerald-400">
                Service Active
              </span>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center shadow-inner">
                <Play className="w-7 h-7 fill-white text-white ml-1" />
              </div>
              <div className="text-center">
                <div className="text-lg font-black tracking-wider uppercase">
                  Start Service
                </div>
                <div className="text-[11px] text-emerald-100 font-medium opacity-90 mt-0.5">
                  Begin audio capture & cloud translation
                </div>
              </div>
            </>
          )}
        </button>

        {/* STOP SERVICE BUTTON */}
        <button
          type="button"
          onClick={handleStopService}
          disabled={!isLive && !isConnecting}
          className={`h-40 rounded-2xl flex flex-col items-center justify-center space-y-3 p-6 transition-all relative overflow-hidden border ${
            !isLive && !isConnecting
              ? 'bg-slate-900/40 border-slate-800 text-slate-600 opacity-50 cursor-not-allowed'
              : 'bg-gradient-to-br from-rose-700 to-red-800 hover:from-rose-600 hover:to-red-700 border-rose-500/40 text-white shadow-xl shadow-rose-950/40 hover:scale-[1.01] active:scale-[0.99]'
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center shadow-inner">
            <Square className="w-6 h-6 fill-white text-white" />
          </div>
          <div className="text-center">
            <div className="text-lg font-black tracking-wider uppercase">
              Stop Service
            </div>
            <div className="text-[11px] text-rose-100 font-medium opacity-90 mt-0.5">
              Disconnect room & mute PA return
            </div>
          </div>
        </button>
      </div>

      {/* Dual VU Meter (Mixer In vs. Bot Out) */}
      <AudioVUMeter inputLevel={inputLevel} outputLevel={outputLevel} />

      {/* Real-time Telemetry Bar */}
      <LatencyDisplay
        rttMs={rttMs}
        sessionStartTime={sessionStartTime}
        sourceLanguage={settings.sourceLanguage}
        targetLanguage={settings.targetLanguage}
        roomName={roomName}
        lastHeartbeat={lastHeartbeat}
        isHeartbeatHealthy={isHealthy}
      />

      {/* Sound Booth Footer Info */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-surface-border">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Device ID: <code className="text-slate-300 font-mono">{settings.deviceId || 'Local Hardware'}</code></span>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center space-x-1 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Reconfigure Hardware & Languages</span>
        </button>
      </div>
    </div>
  );
};
