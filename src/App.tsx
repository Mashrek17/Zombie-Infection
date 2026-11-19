import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameArena } from './components/GameArena';
import { LobbyScreen } from './components/LobbyScreen';
import { RoleGuideModal } from './components/RoleGuideModal';
import { getDefaultMatchConfig } from './game/rules';
import type { HumanRoleId, MatchConfig, PlayerRoleId, Team } from './game/types';
import { useGameSocket } from './hooks/useGameSocket';
import { useGeolocation } from './hooks/useGeolocation';
import { useVoiceChat } from './hooks/useVoiceChat';
import {
  playAbilitySound,
  playInfectionStingSound,
  playRadarPingSound,
} from './utils/soundEffects';

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '',
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [roleGuideOpen, setRoleGuideOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const voiceSignalBridgeRef = useRef<
    ((payload: {
      fromPlayerId: string;
      fromPlayerName: string;
      signalType: 'offer' | 'answer' | 'ice';
      data: unknown;
    }) => void) | null
  >(null);

  const socket = useGameSocket((payload) => {
    voiceSignalBridgeRef.current?.(payload);
  });

  const geo = useGeolocation();

  const selfPlayer = useMemo(() => {
    if (!socket.room) return null;
    return (
      socket.room.players.find((p) => p.id === socket.room?.selfPlayerId) ?? null
    );
  }, [socket.room]);

  const voice = useVoiceChat({
    roomCode: socket.room?.roomCode ?? null,
    selfPlayer,
    players: socket.room?.players ?? [],
    sendVoiceState: socket.sendVoiceState,
    sendVoiceSignal: socket.sendVoiceSignal,
  });

  useEffect(() => {
    voiceSignalBridgeRef.current = voice.handleIncomingSignal;
  }, [voice.handleIncomingSignal]);

  // Listen for Google Maps Demo Key quota exceeded events
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Fetch runtime Google Maps API key config if not bundled via Vite env
  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg?.mapsApiKey) setMapsApiKey(cfg.mapsApiKey);
      })
      .catch(() => {});
  }, [mapsApiKey]);

  // Reflect current game state on document.body.dataset.state
  useEffect(() => {
    if (!socket.room) {
      document.body.dataset.state = 'title';
    } else if (socket.room.status === 'ended') {
      document.body.dataset.state = 'gameover';
    } else if (socket.room.status === 'drafting') {
      document.body.dataset.state = 'drafting';
    } else if (socket.room.status === 'playing') {
      document.body.dataset.state = 'playing';
    } else {
      document.body.dataset.state = 'lobby';
    }
  }, [socket.room]);

  // Stream live GPS / Manual position updates to the room server
  useEffect(() => {
    if (!socket.room) return;
    socket.updateLocation({
      roomCode: socket.room.roomCode,
      lat: geo.position.lat,
      lng: geo.position.lng,
      accuracyMeters: geo.position.accuracyMeters,
      headingDeg: geo.position.headingDeg,
      speedMps: geo.position.speedMps,
    });
  }, [
    geo.position.accuracyMeters,
    geo.position.headingDeg,
    geo.position.lat,
    geo.position.lng,
    geo.position.speedMps,
    socket.room?.roomCode,
    socket.updateLocation,
  ]);

  // Audio feedback for 2-min radar sweep & self infection conversion
  const prevRevealRef = useRef<number | null>(null);
  const prevTeamRef = useRef<Team | null>(null);
  useEffect(() => {
    if (!socket.room) {
      prevRevealRef.current = null;
      prevTeamRef.current = null;
      return;
    }
    if (
      socket.room.revealActiveUntil &&
      socket.room.revealActiveUntil !== prevRevealRef.current
    ) {
      prevRevealRef.current = socket.room.revealActiveUntil;
      playRadarPingSound(soundEnabled);
    }
    if (selfPlayer) {
      if (prevTeamRef.current === 'survivor' && selfPlayer.team === 'zombie') {
        playInfectionStingSound(soundEnabled);
      }
      prevTeamRef.current = selfPlayer.team;
    }
  }, [selfPlayer, socket.room, soundEnabled]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      autostart: params.get('autostart') === '1',
      roomCode: params.get('room') || '',
    };
  }, []);

  const handleQuickStartDemo = useCallback(
    (name: string, role: HumanRoleId) => {
      const cfg = getDefaultMatchConfig({
        lat: geo.position.lat,
        lng: geo.position.lng,
      });
      socket.createRoom({
        playerName: name || 'Commander',
        role,
        config: cfg,
        lat: geo.position.lat,
        lng: geo.position.lng,
      });
    },
    [geo.position.lat, geo.position.lng, socket],
  );

  // Support ?autostart=1 to jump straight into a populated playable arena
  const autostartDoneRef = useRef(false);
  useEffect(() => {
    if (
      queryParams.autostart &&
      socket.connected &&
      !socket.room &&
      !autostartDoneRef.current
    ) {
      autostartDoneRef.current = true;
      handleQuickStartDemo('Commander', 'runner');
    }
  }, [handleQuickStartDemo, queryParams.autostart, socket.connected, socket.room]);

  const autoPopulatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      queryParams.autostart &&
      socket.room &&
      socket.room.status === 'lobby' &&
      autoPopulatedRef.current !== socket.room.roomCode
    ) {
      autoPopulatedRef.current = socket.room.roomCode;
      socket.addPlayers(
        socket.room.roomCode,
        [
          { name: 'Elena', team: 'survivor', role: 'medic' },
          { name: 'Liam', team: 'survivor', role: 'defender' },
          { name: 'Vex', team: 'zombie', role: 'speedster' },
          { name: 'Brute', team: 'zombie', role: 'tank' },
        ],
        12,
      );
      socket.startMatch(socket.room.roomCode);
    }
  }, [queryParams.autostart, socket]);

  const handleCreateRoom = (params: {
    playerName: string;
    role: HumanRoleId;
    config: MatchConfig;
  }) => {
    socket.createRoom({
      playerName: params.playerName,
      role: params.role,
      config: params.config,
      lat: geo.position.lat,
      lng: geo.position.lng,
    });
  };

  const handleJoinRoom = (params: {
    roomCode: string;
    playerName: string;
    role: HumanRoleId;
  }) => {
    socket.joinRoom({
      roomCode: params.roomCode,
      playerName: params.playerName,
      role: params.role,
      lat: geo.position.lat,
      lng: geo.position.lng,
    });
  };

  const handleLeaveRoom = () => {
    voice.stopMicrophone();
    window.location.href = window.location.pathname;
  };

  return (
    <>
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {!socket.room ? (
        <LobbyScreen
          connected={socket.connected}
          gpsStatus={geo.status}
          currentPos={{ lat: geo.position.lat, lng: geo.position.lng }}
          initialRoomCode={queryParams.roomCode}
          error={socket.error}
          onClearError={socket.clearError}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onQuickStartDemo={handleQuickStartDemo}
          onOpenRoleGuide={() => setRoleGuideOpen(true)}
        />
      ) : (
        <GameArena
          mapsApiKey={mapsApiKey}
          room={socket.room}
          selfPlayer={selfPlayer}
          leaderboard={socket.leaderboard}
          gpsMode={geo.mode}
          gpsStatus={geo.status}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((s) => !s)}
          onSetGpsMode={geo.setMode}
          onStepPosition={geo.stepManualPosition}
          onMapClickCoordinate={geo.setManualLatLng}
          onAddPlayers={(players, targetMax) =>
            socket.addPlayers(socket.room!.roomCode, players, targetMax)
          }
          onSelectRole={(playerId: string, role: PlayerRoleId) =>
            socket.selectRole(socket.room!.roomCode, playerId, role)
          }
          onCastZombieVote={(targetId: string) =>
            socket.castZombieVote(socket.room!.roomCode, targetId)
          }
          onFinalizeDraft={() => socket.finalizeDraft(socket.room!.roomCode)}
          onStartMatch={() => socket.startMatch(socket.room!.roomCode)}
          onResetMatch={() => socket.resetMatch(socket.room!.roomCode)}
          onTriggerReveal={() => socket.triggerReveal(socket.room!.roomCode)}
          onActivateAbility={() => {
            playAbilitySound(soundEnabled);
            socket.activateAbility(socket.room!.roomCode);
          }}
          onTagPlayer={(targetId) => {
            playInfectionStingSound(soundEnabled);
            socket.tagPlayer(socket.room!.roomCode, targetId);
          }}
          onSelfInfected={() => {
            playInfectionStingSound(soundEnabled);
            socket.reportSelfInfected(socket.room!.roomCode);
          }}
          onRevivePlayer={(targetId) => {
            playAbilitySound(soundEnabled);
            socket.revivePlayer(socket.room!.roomCode, targetId);
          }}
          onMoveProxyToSelf={(proxyId) => {
            if (!selfPlayer || selfPlayer.lat === null || selfPlayer.lng === null) {
              return;
            }
            socket.updateLocation({
              roomCode: socket.room!.roomCode,
              playerId: proxyId,
              lat: selfPlayer.lat,
              lng: selfPlayer.lng,
            });
          }}
          onRefreshLeaderboard={socket.fetchLeaderboard}
          onOpenRoleGuide={() => setRoleGuideOpen(true)}
          onLeaveRoom={handleLeaveRoom}
          voice={{
            micPermission: voice.micPermission,
            muted: voice.muted,
            speaking: voice.speaking,
            channel: voice.channel,
            audioLevel: voice.audioLevel,
            pushToTalk: voice.pushToTalk,
            setPushToTalk: voice.setPushToTalk,
            toggleMute: voice.toggleMute,
            switchChannel: voice.switchChannel,
            setPTTActive: voice.setPTTActive,
          }}
          onSendChat={(text) => socket.sendChat(socket.room!.roomCode, text)}
        />
      )}

      <RoleGuideModal
        open={roleGuideOpen}
        onClose={() => setRoleGuideOpen(false)}
      />
    </>
  );
}
