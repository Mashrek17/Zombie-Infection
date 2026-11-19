import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientVisiblePlayer, VoiceChannel } from '../game/types';

export type MicPermissionState = 'idle' | 'granted' | 'denied' | 'unavailable';

interface UseVoiceChatOptions {
  roomCode: string | null;
  selfPlayer: ClientVisiblePlayer | null;
  players: ClientVisiblePlayer[];
  sendVoiceState: (
    roomCode: string,
    muted: boolean,
    speaking: boolean,
    channel: VoiceChannel,
  ) => void;
  sendVoiceSignal: (
    roomCode: string,
    toPlayerId: string,
    signalType: 'offer' | 'answer' | 'ice',
    data: unknown,
  ) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function useVoiceChat({
  roomCode,
  selfPlayer,
  players,
  sendVoiceState,
  sendVoiceSignal,
}: UseVoiceChatOptions) {
  const [micPermission, setMicPermission] = useState<MicPermissionState>('idle');
  const [muted, setMuted] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [channel, setChannel] = useState<VoiceChannel>('team');
  const [audioLevel, setAudioLevel] = useState(0);
  const [pushToTalk, setPushToTalk] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanupPeers = useCallback(() => {
    for (const pc of Object.values(peersRef.current)) {
      pc.close();
    }
    peersRef.current = {};
    for (const audio of Object.values(audioElementsRef.current)) {
      audio.srcObject = null;
      audio.remove();
    }
    audioElementsRef.current = {};
  }, []);

  const stopMicrophone = useCallback(() => {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    cleanupPeers();
    setMuted(true);
    setSpeaking(false);
    setAudioLevel(0);
  }, [cleanupPeers]);

  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  const enableMicrophone = useCallback(async (): Promise<boolean> => {
    if (localStreamRef.current) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicPermission('unavailable');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;
      setMicPermission('granted');
      setMuted(false);

      // Setup Web Audio analyser for real speaking detection
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        // AudioContext optional
      }

      if (roomCode) {
        sendVoiceState(roomCode, false, false, channel);
      }
      return true;
    } catch {
      setMicPermission('denied');
      return false;
    }
  }, [channel, roomCode, sendVoiceState]);

  const toggleMute = useCallback(async () => {
    if (!localStreamRef.current) {
      await enableMicrophone();
      return;
    }
    const nextMuted = !muted;
    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setMuted(nextMuted);
    if (nextMuted) setSpeaking(false);
    if (roomCode) {
      sendVoiceState(roomCode, nextMuted, false, channel);
    }
  }, [channel, enableMicrophone, muted, roomCode, sendVoiceState]);

  const setPTTActive = useCallback(
    async (active: boolean) => {
      if (!pushToTalk) return;
      if (active && !localStreamRef.current) {
        const ok = await enableMicrophone();
        if (!ok) return;
      }
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getAudioTracks()) {
          track.enabled = active;
        }
      }
      setMuted(!active);
      setSpeaking(active);
      if (roomCode) {
        sendVoiceState(roomCode, !active, active, channel);
      }
    },
    [channel, enableMicrophone, pushToTalk, roomCode, sendVoiceState],
  );

  const switchChannel = useCallback(
    (nextChannel: VoiceChannel) => {
      setChannel(nextChannel);
      cleanupPeers();
      if (roomCode) {
        sendVoiceState(roomCode, muted, speaking, nextChannel);
      }
    },
    [cleanupPeers, muted, roomCode, sendVoiceState, speaking],
  );

  // Monitor local speaking energy at 10Hz when unmuted
  useEffect(() => {
    if (muted || !analyserRef.current) {
      setAudioLevel(0);
      return;
    }
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    let lastSpeaking = false;
    const timer = window.setInterval(() => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      const norm = Math.min(100, Math.round((avg / 64) * 100));
      setAudioLevel(norm);
      const isNowSpeaking = norm > 14;
      if (isNowSpeaking !== lastSpeaking) {
        lastSpeaking = isNowSpeaking;
        setSpeaking(isNowSpeaking);
        if (roomCode) {
          sendVoiceState(roomCode, muted, isNowSpeaking, channel);
        }
      }
    }, 150);

    return () => window.clearInterval(timer);
  }, [channel, muted, roomCode, sendVoiceState]);

  const getOrCreatePeer = useCallback(
    (remoteId: string): RTCPeerConnection | null => {
      if (!roomCode) return null;
      if (peersRef.current[remoteId]) return peersRef.current[remoteId];

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current[remoteId] = pc;

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendVoiceSignal(roomCode, remoteId, 'ice', e.candidate);
        }
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;
        let audio = audioElementsRef.current[remoteId];
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audioElementsRef.current[remoteId] = audio;
        }
        audio.srcObject = stream;
      };

      return pc;
    },
    [roomCode, sendVoiceSignal],
  );

  const handleIncomingSignal = useCallback(
    async (payload: {
      fromPlayerId: string;
      fromPlayerName: string;
      signalType: 'offer' | 'answer' | 'ice';
      data: unknown;
    }) => {
      if (!roomCode) return;
      const pc = getOrCreatePeer(payload.fromPlayerId);
      if (!pc) return;

      try {
        if (payload.signalType === 'offer') {
          await pc.setRemoteDescription(
            new RTCSessionDescription(payload.data as RTCSessionDescriptionInit),
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendVoiceSignal(roomCode, payload.fromPlayerId, 'answer', answer);
        } else if (payload.signalType === 'answer') {
          await pc.setRemoteDescription(
            new RTCSessionDescription(payload.data as RTCSessionDescriptionInit),
          );
        } else if (payload.signalType === 'ice') {
          await pc.addIceCandidate(
            new RTCIceCandidate(payload.data as RTCIceCandidateInit),
          );
        }
      } catch {
        // Ignore transient ICE/SDP negotiation race
      }
    },
    [getOrCreatePeer, roomCode, sendVoiceSignal],
  );

  // Initiate offers to eligible connected teammates when mic is active
  useEffect(() => {
    if (!roomCode || !selfPlayer || !localStreamRef.current) return;

    const eligiblePeers = players.filter((p) => {
      if (p.id === selfPlayer.id || !p.isConnected || p.isFieldProxy) return false;
      if (channel === 'team') return p.team === selfPlayer.team;
      return true;
    });

    for (const peer of eligiblePeers) {
      if (peersRef.current[peer.id]) continue;
      // Deterministic initiator rule: lower ID initiates offer
      if (selfPlayer.id < peer.id) {
        const pc = getOrCreatePeer(peer.id);
        if (!pc) continue;
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            sendVoiceSignal(roomCode, peer.id, 'offer', offer);
          })
          .catch(() => {});
      }
    }
  }, [channel, getOrCreatePeer, players, roomCode, selfPlayer, sendVoiceSignal]);

  return {
    micPermission,
    muted,
    speaking,
    channel,
    audioLevel,
    pushToTalk,
    setPushToTalk,
    enableMicrophone,
    toggleMute,
    setPTTActive,
    switchChannel,
    handleIncomingSignal,
    stopMicrophone,
  };
}
