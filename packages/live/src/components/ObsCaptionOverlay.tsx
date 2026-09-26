import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { ObsCaptionSender, type ObsCaptionStatus } from '../obsCaptionSender';

/**
 * /obs-captions/:sessionId — a transparent caption overlay meant to be added
 * to OBS as a Browser Source. OBS composites it into its program output, so
 * the translated captions become part of whatever OBS sends out: the RTMP
 * feed into a ReKindle broadcast/meeting (and from there HLS viewers,
 * simulcasts and recordings), OBS's own local recording, and any platform
 * OBS streams to directly. See docs/obs-live-captions.md for the four
 * caption modes and the OBS setup steps.
 *
 * Public and unauthenticated, exactly like /display/:sessionId (same RLS
 * rules: works for public translation sessions). All configuration is in the
 * URL, because an OBS Browser Source can't be interacted with:
 *
 *   ?show=translated|original|both   which text to show        (translated)
 *   &lines=1..3                      lines kept on screen      (2)
 *   &size=<px>                       font size                 (44)
 *   &pos=bottom|top                  placement                 (bottom)
 *   &style=box|outline               background box or outlined text (box)
 *   &clear=<seconds>                 hide after this much silence, 0 = never (6)
 *   &interim=0|1                     show words as they're heard (1)
 *   &debug=1                         show connection + measured caption lag
 *   &cc=1                            ALSO send each finished line to OBS as
 *                                    CEA-608 closed captions via obs-websocket
 *   &obsport=<port>                  obs-websocket port        (4455)
 *   #obsws=<password>                obs-websocket password — in the URL
 *                                    FRAGMENT so it never leaves the machine
 *                                    (fragments aren't sent to any server)
 */

interface LogRow {
  id: string;
  source_text: string;
  translated_text: string;
  created_at: string;
  stt_ms?: number | null;
  translate_ms?: number | null;
}

interface Line {
  id: string;
  original: string;
  translated: string;
}

const num = (v: string | null, def: number, min: number, max: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export const ObsCaptionOverlay: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();

  const opts = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const show = q.get('show');
    return {
      show: (show === 'original' || show === 'both' ? show : 'translated') as 'translated' | 'original' | 'both',
      lines: num(q.get('lines'), 2, 1, 3),
      size: num(q.get('size'), 44, 16, 120),
      pos: q.get('pos') === 'top' ? 'top' : 'bottom',
      style: q.get('style') === 'outline' ? 'outline' : 'box',
      clearMs: num(q.get('clear'), 6, 0, 600) * 1000,
      interim: q.get('interim') !== '0',
      debug: q.get('debug') === '1',
      cc: q.get('cc') === '1',
      obsPort: num(q.get('obsport'), 4455, 1, 65535),
      obsPassword: hash.get('obsws') ?? '',
    };
  }, []);

  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState('');
  const [visible, setVisible] = useState(true);
  const [feed, setFeed] = useState<'connecting' | 'live' | 'reconnecting' | 'ended' | 'unavailable'>('connecting');
  const [ccStatus, setCcStatus] = useState<ObsCaptionStatus>('off');
  // Measured lag, for the operator to set OBS's video/audio delay (debug=1).
  const [lag, setLag] = useState<{ pipelineMs: number; deliveryMs: number; samples: number } | null>(null);

  const senderRef = useRef<ObsCaptionSender | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A Browser Source composites whatever this page paints — every background
  // up the tree has to be transparent, not just this component's.
  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById('root')];
    const prev = els.map((el) => el?.style.background ?? '');
    els.forEach((el) => el && (el.style.background = 'transparent'));
    return () => els.forEach((el, i) => el && (el.style.background = prev[i]));
  }, []);

  // Optional mode 4: forward finished lines to OBS as CEA-608 captions.
  useEffect(() => {
    if (!opts.cc) return;
    const sender = new ObsCaptionSender({ port: opts.obsPort, password: opts.obsPassword, onStatus: setCcStatus });
    senderRef.current = sender;
    sender.connect();
    return () => { sender.close(); senderRef.current = null; };
  }, [opts.cc, opts.obsPort, opts.obsPassword]);

  // Hide captions after a stretch of silence, so the last line doesn't sit
  // burned into the video through every pause.
  const bump = () => {
    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (opts.clearMs > 0) hideTimerRef.current = setTimeout(() => setVisible(false), opts.clearMs);
  };
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const samples: { pipeline: number; delivery: number }[] = [];

    const addFinal = (row: LogRow, live: boolean) => {
      setLines((prev) =>
        prev.some((l) => l.id === row.id)
          ? prev
          : [...prev, { id: row.id, original: row.source_text, translated: row.translated_text }].slice(-opts.lines));
      setInterim(''); // a finished line supersedes the growing one
      if (!live) return;
      bump();
      const ccText = opts.show === 'original' ? row.source_text : row.translated_text;
      senderRef.current?.send(ccText);
      // Pipeline = speech recognition + translation time reported by the bot;
      // delivery = row written → shown here. Their sum is roughly how far the
      // caption trails the speaker, i.e. how much to delay OBS's video.
      const pipeline = (row.stt_ms ?? 0) + (row.translate_ms ?? 0);
      const delivery = Math.max(0, Date.now() - new Date(row.created_at).getTime());
      samples.push({ pipeline, delivery });
      if (samples.length > 20) samples.shift();
      const avg = (k: 'pipeline' | 'delivery') => Math.round(samples.reduce((s, x) => s + x[k], 0) / samples.length);
      setLag({ pipelineMs: avg('pipeline'), deliveryMs: avg('delivery'), samples: samples.length });
    };

    (async () => {
      const { data: session } = await supabase
        .from('translation_sessions')
        .select('id, status')
        .eq('id', sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (!session) { setFeed('unavailable'); return; } // missing, or private (RLS)
      if ((session as { status: string }).status === 'ended') setFeed('ended');

      const { data } = await supabase
        .from('translation_logs')
        .select('id, source_text, translated_text, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(opts.lines);
      if (!cancelled && data) [...data].reverse().forEach((r) => addFinal(r as LogRow, false));
    })();

    const channel = supabase
      .channel(`obs-captions-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => addFinal(payload.new as LogRow, true))
      // Word-by-word text while someone is still speaking. The bot fills this
      // for same-language caption sessions; translated sessions deliver
      // finished lines only (a translation needs the whole sentence).
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'translation_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { interim_text?: string | null; status?: string };
          if (row.status === 'ended') setFeed('ended');
          if (opts.interim && row.interim_text) { setInterim(row.interim_text); bump(); }
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setFeed((f) => (f === 'ended' || f === 'unavailable' ? f : 'live'));
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setFeed((f) => (f === 'ended' ? f : 'reconnecting'));
      });

    return () => { cancelled = true; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const textOf = (l: Line) =>
    opts.show === 'original' ? l.original : opts.show === 'both' ? `${l.original}\n${l.translated}` : l.translated;

  const shown = [...lines.map((l) => ({ key: l.id, text: textOf(l), interim: false }))];
  if (opts.interim && interim) shown.push({ key: 'interim', text: interim, interim: true });
  const onScreen = shown.slice(-opts.lines);

  const textStyle: React.CSSProperties = {
    fontSize: opts.size,
    lineHeight: 1.25,
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'pre-line',
    ...(opts.style === 'outline'
      ? { textShadow: '0 0 4px #000, 0 0 4px #000, 2px 2px 2px #000, -2px -2px 2px #000' }
      : { background: 'rgba(0,0,0,0.72)', padding: '0.12em 0.45em', borderRadius: 8, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }),
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', background: 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: opts.pos === 'top' ? 'flex-start' : 'flex-end',
        padding: '4vh 5vw', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '90vw', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.3em',
          opacity: visible ? 1 : 0, transition: 'opacity 400ms ease',
        }}
      >
        {onScreen.map((l) => (
          <div key={l.key}>
            <span style={{ ...textStyle, opacity: l.interim ? 0.85 : 1 }}>{l.text}</span>
          </div>
        ))}
      </div>

      {opts.debug && (
        <div
          style={{
            position: 'fixed', top: 8, left: 8, background: 'rgba(0,0,0,0.75)', color: '#fff',
            font: '14px/1.4 ui-monospace, monospace', padding: '8px 10px', borderRadius: 6,
          }}
        >
          <div>session {sessionId?.slice(0, 8)} · feed: {feed}</div>
          {opts.cc && <div>OBS closed captions: {ccStatus}</div>}
          {lag ? (
            <>
              <div>caption lag ≈ {((lag.pipelineMs + lag.deliveryMs) / 1000).toFixed(1)} s</div>
              <div style={{ opacity: 0.75 }}>
                (recognise+translate {lag.pipelineMs} ms, delivery {lag.deliveryMs} ms, {lag.samples} lines)
              </div>
              <div style={{ opacity: 0.75 }}>
                → to sync: delay OBS video &amp; audio by ~{Math.round((lag.pipelineMs + lag.deliveryMs) / 100) * 100} ms
              </div>
              <div style={{ opacity: 0.6 }}>
                (only if the translation hears the speaker directly, e.g. a Speaker Link — not the OBS stream)
              </div>
            </>
          ) : (
            <div style={{ opacity: 0.75 }}>waiting for speech to measure lag…</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ObsCaptionOverlay;
