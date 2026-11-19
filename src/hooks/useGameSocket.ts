import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientRoomView,
  HumanRoleId,
  LeaderboardEntry,
  MatchConfig,
  PlayerRoleId,
  Team,
  VoiceChannel,
  WSClientMessage,
  WSServerMessage,
} from '../game/types';

export type VoiceSignalHandler = (payload: {
  fromPlayerId: string;
  fromPlayerName: string;
  signalType: 'offer' | 'answer' | 'ice';
  data: unknown;
}) => void;

export function useGameSocket(onVoiceSignal?: VoiceSignalHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const voiceHandlerRef = useRef<VoiceSignalHandler | undefined>(onVoiceSignal);
  voiceHandlerRef.current = onVoiceSignal;

  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<ClientRoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const fetchLeaderboard = useCallback(async (sort: 'score' | 'infections' | 'wins' = 'score') => {
    try {
      const res = await fetch(`/api/leaderboard?sort=${sort}`);
      if (res.ok) {
        const data = (await res.json()) as LeaderboardEntry[];
        setLeaderboard(data);
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSServerMessage;
        if (msg.type === 'room:state') {
          setRoom(msg.payload);
          setError(null);
        } else if (msg.type === 'room:error') {
          setError(msg.payload.message);
        } else if (msg.type === 'leaderboard:update') {
          setLeaderboard(msg.payload);
        } else if (msg.type === 'voice:signal') {
          voiceHandlerRef.current?.(msg.payload);
        }
      } catch {
        // Ignore malformed socket frames
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(connect, 2000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: WSClientMessage): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    wsRef.current.send(JSON.stringify(msg));
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback(
    (payload: {
      playerName: string;
      role: HumanRoleId;
      config: MatchConfig;
      lat: number;
      lng: number;
    }) => send({ type: 'room:create', payload }),
    [send],
  );

  const joinRoom = useCallback(
    (payload: {
      roomCode: string;
      playerName: string;
      role?: HumanRoleId;
      lat: number;
      lng: number;
    }) => send({ type: 'room:join', payload }),
    [send],
  );

  const addPlayers = useCallback(
    (
      roomCode: string,
      players: Array<{ name: string; team: Team; role: PlayerRoleId }>,
      targetMaxPlayers?: number,
    ) =>
      send({
        type: 'room:add_players',
        payload: { roomCode, players, targetMaxPlayers },
      }),
    [send],
  );

  const updateConfig = useCallback(
    (roomCode: string, config: Partial<MatchConfig>) =>
      send({ type: 'room:update_config', payload: { roomCode, config } }),
    [send],
  );

  const selectRole = useCallback(
    (roomCode: string, playerId: string, role: PlayerRoleId) =>
      send({ type: 'player:select_role', payload: { roomCode, playerId, role } }),
    [send],
  );

  const startMatch = useCallback(
    (roomCode: string) => send({ type: 'match:start', payload: { roomCode } }),
    [send],
  );

  const triggerReveal = useCallback(
    (roomCode: string) =>
      send({ type: 'match:trigger_reveal', payload: { roomCode } }),
    [send],
  );

  const resetMatch = useCallback(
    (roomCode: string) => send({ type: 'match:reset', payload: { roomCode } }),
    [send],
  );

  const updateLocation = useCallback(
    (payload: {
      roomCode: string;
      playerId?: string;
      lat: number;
      lng: number;
      accuracyMeters?: number;
      headingDeg?: number | null;
      speedMps?: number;
    }) => send({ type: 'player:update_location', payload }),
    [send],
  );

  const activateAbility = useCallback(
    (roomCode: string, playerId?: string) =>
      send({ type: 'player:activate_ability', payload: { roomCode, playerId } }),
    [send],
  );

  const tagPlayer = useCallback(
    (roomCode: string, targetPlayerId: string) =>
      send({ type: 'player:tag', payload: { roomCode, targetPlayerId } }),
    [send],
  );

  const reportSelfInfected = useCallback(
    (roomCode: string) =>
      send({ type: 'player:self_infected', payload: { roomCode } }),
    [send],
  );

  const revivePlayer = useCallback(
    (roomCode: string, targetPlayerId: string) =>
      send({
        type: 'player:revive',
        payload: { roomCode, targetPlayerId },
      }),
    [send],
  );

  const castZombieVote = useCallback(
    (roomCode: string, targetPlayerId: string) =>
      send({
        type: 'player:cast_zombie_vote',
        payload: { roomCode, targetPlayerId },
      }),
    [send],
  );

  const finalizeDraft = useCallback(
    (roomCode: string) =>
      send({ type: 'match:finalize_draft', payload: { roomCode } }),
    [send],
  );

  const sendVoiceState = useCallback(
    (
      roomCode: string,
      muted: boolean,
      speaking: boolean,
      channel: VoiceChannel,
    ) =>
      send({
        type: 'voice:state',
        payload: { roomCode, muted, speaking, channel },
      }),
    [send],
  );

  const sendVoiceSignal = useCallback(
    (
      roomCode: string,
      toPlayerId: string,
      signalType: 'offer' | 'answer' | 'ice',
      data: unknown,
    ) =>
      send({
        type: 'voice:signal',
        payload: { roomCode, toPlayerId, signalType, data },
      }),
    [send],
  );

  const sendChat = useCallback(
    (roomCode: string, text: string) =>
      send({ type: 'chat:send', payload: { roomCode, text } }),
    [send],
  );

  return {
    connected,
    room,
    error,
    clearError,
    leaderboard,
    fetchLeaderboard,
    createRoom,
    joinRoom,
    addPlayers,
    updateConfig,
    selectRole,
    startMatch,
    triggerReveal,
    resetMatch,
    updateLocation,
    activateAbility,
    tagPlayer,
    reportSelfInfected,
    revivePlayer,
    castZombieVote,
    finalizeDraft,
    sendVoiceState,
    sendVoiceSignal,
    sendChat,
  };
}
