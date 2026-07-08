import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';

interface PeerData {
  pc: RTCPeerConnection;
  audio?: HTMLAudioElement;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export const useWebRTC = (roomId: string | number, userId: string, userName: string) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const sendSignal = async (targetId: string, type: string, data: any) => {
    try {
      await supabase.functions.invoke('webrtc-signaling', {
        body: { 
          action: 'send_signal', 
          roomId: String(roomId), 
          senderId: userId, 
          senderName: userName, 
          targetId, 
          signalType: type, 
          signalData: data 
        }
      });
    } catch (err) {
      console.error('Failed to send signal:', err);
    }
  };

  const createPeer = useCallback(async (peerId: string, initiator: boolean) => {
    if (peersRef.current.has(peerId)) return peersRef.current.get(peerId)!.pc;
    
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = new Audio();
    peersRef.current.set(peerId, { pc, audio });

    pc.onicecandidate = (e) => { 
      if (e.candidate) sendSignal(peerId, 'ice-candidate', e.candidate); 
    };
    
    pc.ontrack = (e) => { 
      audio.srcObject = e.streams[0]; 
      audio.play().catch(() => {}); 
    };
    
    pc.onconnectionstatechange = () => { 
      if (pc.connectionState === 'failed') {
        peersRef.current.delete(peerId);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    if (initiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(peerId, 'offer', offer);
      } catch (err) {
        console.error('Failed to create offer:', err);
      }
    }
    return pc;
  }, [roomId, userId, userName]);

  const handleSignal = useCallback(async (signal: any) => {
    try {
      const { sender_id, signal_type, signal_data } = signal;
      let pc = peersRef.current.get(sender_id)?.pc;

      if (signal_type === 'join') {
        await createPeer(sender_id, true);
      } else if (signal_type === 'offer') {
        pc = await createPeer(sender_id, false);
        await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(sender_id, 'answer', answer);
      } else if (signal_type === 'answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
      } else if (signal_type === 'ice-candidate' && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(signal_data));
      }
    } catch (err) {
      console.error('Failed to handle signal:', err);
    }
  }, [createPeer]);

  const pollSignals = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('webrtc-signaling', {
        body: { action: 'get_signals', roomId: String(roomId), senderId: userId }
      });
      
      if (!error && data?.signals) {
        for (const sig of data.signals) {
          await handleSignal(sig);
        }
      }
    } catch (err) {
      // Silently fail on polling errors
    }
  }, [roomId, userId, handleSignal]);

  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      
      // Mute by default
      stream.getAudioTracks().forEach(t => {
        t.enabled = false;
      });
      
      setIsConnected(true);
      setIsMuted(true);
      
      // Broadcast join to other participants
      try {
        await supabase.functions.invoke('webrtc-signaling', {
          body: { 
            action: 'broadcast_join', 
            roomId: String(roomId), 
            senderId: userId, 
            senderName: userName 
          }
        });
      } catch (err) {
        console.error('Failed to broadcast join:', err);
        // Continue anyway - signaling server might not be set up
      }
      
      // Start polling for signals
      pollingRef.current = setInterval(pollSignals, 1000);
      
      toast({
        title: 'Connected',
        description: 'Audio connected successfully'
      });
      
    } catch (err: any) {
      console.error('Failed to initialize audio:', err);
      
      let errorMessage = 'Microphone access denied';
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Please allow microphone access to join the audio room';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found on this device';
      }
      
      setError(errorMessage);
      toast({
        title: 'Audio Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  }, [roomId, userId, userName, pollSignals]);

  const toggleMute = useCallback(async () => {
    if (localStreamRef.current) {
      const newMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !newMuted;
      });
      setIsMuted(newMuted);
      
      // Update in database
      try {
        await supabase
          .from('voice_room_participants')
          .update({ is_muted: newMuted })
          .eq('room_id', roomId)
          .eq('user_id', userId);
      } catch (err) {
        console.error('Failed to update mute status:', err);
      }
    }
  }, [isMuted, roomId, userId]);

  const cleanup = useCallback(() => {
    // Clear polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    
    // Close peer connections
    peersRef.current.forEach(({ pc, audio }) => { 
      pc.close(); 
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
    });
    peersRef.current.clear();
    
    setIsConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { 
    isMuted, 
    isConnected, 
    error, 
    initializeAudio, 
    toggleMute, 
    cleanup 
  };
};
