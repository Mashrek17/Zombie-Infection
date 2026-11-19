import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  HeartPulse,
  Map as MapIcon,
  Mic,
  MicOff,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  Skull,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { HUMAN_ROLES, ROLES } from '../game/roles';
import {
  MEDIC_REVIVE_RADIUS_METERS,
  SURVIVOR_REVIVE_RADIUS_METERS,
  canActivateAbility,
  haversineDistanceMeters,
  isRadarRevealWindowActive,
  metersToMiles,
} from '../game/rules';
import type {
  ClientRoomView,
  ClientVisiblePlayer,
  HumanRoleId,
  LeaderboardEntry,
  PlayerRoleId,
  Team,
  VoiceChannel,
} from '../game/types';
import type { GpsMode } from '../hooks/useGeolocation';
import type { MicPermissionState } from '../hooks/useVoiceChat';
import { DraftCountdownTimer } from './DraftCountdownTimer';
import { DraftVoteOverlay } from './DraftVoteOverlay';
import { LeaderboardPanel } from './LeaderboardPanel';
import { BiohazardRadarLogo, formatSecondsClock, RoleIcon } from './RoleBadgeIcon';
import { SquadPanel } from './SquadPanel';
import { TacticalMap } from './TacticalMap';
import { VoiceCommsPanel } from './VoiceCommsPanel';

type SideTab = 'squad' | 'voice' | 'ranks' | 'feed';

interface GameArenaProps {
  mapsApiKey: string;
  room: ClientRoomView;
  selfPlayer: ClientVisiblePlayer | null;
  leaderboard: LeaderboardEntry[];
  gpsMode: GpsMode;
  gpsStatus: 'locating' | 'active' | 'denied' | 'manual';
  soundEnabled: boolean;
  onToggleSound: () => void;
  onSetGpsMode: (mode: GpsMode) => void;
  onStepPosition: (northM: number, eastM: number, speedMult: number) => void;
  onMapClickCoordinate: (lat: number, lng: number) => void;
  onAddPlayers: (
    players: Array<{ name: string; team: Team; role: PlayerRoleId }>,
    targetMaxPlayers?: number,
  ) => void;
  onSelectRole: (playerId: string, role: PlayerRoleId) => void;
  onCastZombieVote: (targetPlayerId: string) => void;
  onFinalizeDraft: () => void;
  onStartMatch: () => void;
  onResetMatch: () => void;
  onTriggerReveal: () => void;
  onActivateAbility: () => void;
  onTagPlayer: (targetId: string) => void;
  onSelfInfected: () => void;
  onRevivePlayer: (targetId: string) => void;
  onMoveProxyToSelf: (proxyId: string) => void;
  onRefreshLeaderboard: (sort: 'score' | 'infections' | 'wins') => void;
  onOpenRoleGuide: () => void;
  onLeaveRoom: () => void;
  voice: {
    micPermission: MicPermissionState;
    muted: boolean;
    speaking: boolean;
    channel: VoiceChannel;
    audioLevel: number;
    pushToTalk: boolean;
    setPushToTalk: (v: boolean) => void;
    toggleMute: () => void;
    switchChannel: (c: VoiceChannel) => void;
    setPTTActive: (a: boolean) => void;
  };
  onSendChat: (text: string) => void;
}

export function GameArena({
  mapsApiKey,
  room,
  selfPlayer,
  leaderboard,
  gpsMode,
  gpsStatus,
  soundEnabled,
  onToggleSound,
  onSetGpsMode,
  onStepPosition,
  onMapClickCoordinate,
  onAddPlayers,
  onSelectRole,
  onCastZombieVote,
  onFinalizeDraft,
  onStartMatch,
  onResetMatch,
  onTriggerReveal,
  onActivateAbility,
  onTagPlayer,
  onSelfInfected,
  onRevivePlayer,
  onMoveProxyToSelf,
  onRefreshLeaderboard,
  onOpenRoleGuide,
  onLeaveRoom,
  voice,
  onSendChat,
}: GameArenaProps) {
  const [desktopTab, setDesktopTab] = useState<SideTab>('squad');
  const [mobileScreen, setMobileScreen] = useState<'map' | SideTab>('map');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [draftMinimized, setDraftMinimized] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (room.status !== 'drafting') {
      setDraftMinimized(false);
    }
  }, [room.status]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const clockNow = Math.max(nowTick, room.serverNow || 0);
  const survivorsCount = room.players.filter((p) => p.team === 'survivor').length;
  const zombiesCount = room.players.filter((p) => p.team === 'zombie').length;

  const draftRemainingSec =
    room.status === 'drafting' && room.draftEndsAt
      ? Math.max(0, Math.ceil((room.draftEndsAt - clockNow) / 1000))
      : 0;

  const matchRemainingSec =
    room.status === 'playing' && room.endsAt
      ? Math.max(0, Math.ceil((room.endsAt - clockNow) / 1000))
      : room.config.durationMinutes * 60;

  const revealRemainingSec =
    room.status === 'playing' && room.nextRevealAt
      ? Math.max(0, Math.ceil((room.nextRevealAt - clockNow) / 1000))
      : room.config.revealIntervalSeconds;

  const revealActive =
    room.status === 'playing' && isRadarRevealWindowActive(room, clockNow);

  const selfRoleDef = selfPlayer ? ROLES[selfPlayer.role] : ROLES.runner;
  const selfInfectedRemainingSec =
    selfPlayer?.infectionStatus === 'infected_pending' &&
    selfPlayer.infectedPendingUntil
      ? Math.max(0, Math.ceil((selfPlayer.infectedPendingUntil - clockNow) / 1000))
      : 0;

  const abilityReadyCheck = selfPlayer
    ? canActivateAbility(selfPlayer, clockNow)
    : { ok: false, reason: '' };

  const abilityActiveSec =
    selfPlayer && selfPlayer.abilityActiveUntil > clockNow
      ? Math.ceil((selfPlayer.abilityActiveUntil - clockNow) / 1000)
      : 0;
  const abilityCooldownSec =
    selfPlayer && selfPlayer.abilityCooldownUntil > clockNow
      ? Math.ceil((selfPlayer.abilityCooldownUntil - clockNow) / 1000)
      : 0;

  const distFromCenterMiles = useMemo(() => {
    if (!selfPlayer || selfPlayer.lat === null || selfPlayer.lng === null) return 0;
    return metersToMiles(
      haversineDistanceMeters(
        { lat: selfPlayer.lat, lng: selfPlayer.lng },
        room.config.center,
      ),
    );
  }, [room.config.center, selfPlayer]);

  // Nearest infected ally that selfPlayer (as healthy survivor) can revive
  const reviveReachMeters =
    selfPlayer?.role === 'medic'
      ? MEDIC_REVIVE_RADIUS_METERS
      : SURVIVOR_REVIVE_RADIUS_METERS;

  const { infectedAllies, nearestReviveTarget } = useMemo(() => {
    const infected = room.players.filter(
      (p) => p.infectionStatus === 'infected_pending' && p.id !== selfPlayer?.id,
    );
    if (
      !selfPlayer ||
      selfPlayer.team !== 'survivor' ||
      selfPlayer.infectionStatus !== 'healthy' ||
      selfPlayer.lat === null ||
      selfPlayer.lng === null
    ) {
      return { infectedAllies: infected, nearestReviveTarget: null };
    }
    let best: { player: ClientVisiblePlayer; distanceMeters: number } | null = null;
    for (const p of infected) {
      if (p.lat === null || p.lng === null) continue;
      const d = Math.round(
        haversineDistanceMeters(
          { lat: selfPlayer.lat, lng: selfPlayer.lng },
          { lat: p.lat, lng: p.lng },
        ),
      );
      if (!best || d < best.distanceMeters) {
        best = { player: p, distanceMeters: d };
      }
    }
    return { infectedAllies: infected, nearestReviveTarget: best };
  }, [room.players, selfPlayer]);

  const canReviveNearest =
    room.status === 'playing' &&
    selfPlayer?.team === 'survivor' &&
    selfPlayer.infectionStatus === 'healthy' &&
    nearestReviveTarget !== null &&
    nearestReviveTarget.distanceMeters <= reviveReachMeters;

  // Nearest taggable survivor (or last 2m radar ping) when self is Zombie
  const { nearestTagTarget, nearestPingTarget } = useMemo(() => {
    if (
      !selfPlayer ||
      selfPlayer.team !== 'zombie' ||
      selfPlayer.lat === null ||
      selfPlayer.lng === null
    ) {
      return { nearestTagTarget: null, nearestPingTarget: null };
    }
    let bestLive: { player: ClientVisiblePlayer; distanceMeters: number } | null = null;
    let bestPing: { player: ClientVisiblePlayer; distanceMeters: number } | null = null;
    for (const p of room.players) {
      if (p.team !== 'survivor' || p.infectionStatus === 'infected_pending') continue;
      if (p.lat !== null && p.lng !== null) {
        const d = haversineDistanceMeters(
          { lat: selfPlayer.lat, lng: selfPlayer.lng },
          { lat: p.lat, lng: p.lng },
        );
        if (!bestLive || d < bestLive.distanceMeters) {
          bestLive = { player: p, distanceMeters: Math.round(d) };
        }
      } else if (p.lastKnownPing) {
        const d = haversineDistanceMeters(
          { lat: selfPlayer.lat, lng: selfPlayer.lng },
          p.lastKnownPing,
        );
        if (!bestPing || d < bestPing.distanceMeters) {
          bestPing = { player: p, distanceMeters: Math.round(d) };
        }
      }
    }
    return { nearestTagTarget: bestLive, nearestPingTarget: bestPing };
  }, [room.players, selfPlayer]);

  const canTagNearest =
    room.status === 'playing' &&
    selfPlayer?.team === 'zombie' &&
    nearestTagTarget !== null &&
    nearestTagTarget.distanceMeters <= (selfPlayer.effectiveTagRadiusMeters || 15);

  // Keyboard WASD / Arrow stepping when in Manual GPS mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!selfPlayer) return;
      const mult = selfPlayer.effectiveSpeedMultiplier || 1;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        onStepPosition(35, 0, mult);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        onStepPosition(-35, 0, mult);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        onStepPosition(0, 35, mult);
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        onStepPosition(0, -35, mult);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStepPosition, selfPlayer]);

  const copyRoomCode = () => {
    const shareUrl = `${window.location.origin}/?room=${room.roomCode}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  const renderDrawerBody = (tab: SideTab) => {
    if (tab === 'squad') {
      return (
        <SquadPanel
          room={room}
          selfPlayer={selfPlayer}
          clockNow={clockNow}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={setSelectedPlayerId}
          onAddPlayers={onAddPlayers}
          onSelectRole={onSelectRole}
          onStartMatch={onStartMatch}
          onTagPlayer={onTagPlayer}
          onRevivePlayer={onRevivePlayer}
          onMoveProxyToSelf={onMoveProxyToSelf}
          onTriggerReveal={onTriggerReveal}
        />
      );
    }
    if (tab === 'voice') {
      return (
        <VoiceCommsPanel
          selfPlayer={selfPlayer}
          players={room.players}
          micPermission={voice.micPermission}
          muted={voice.muted}
          speaking={voice.speaking}
          channel={voice.channel}
          audioLevel={voice.audioLevel}
          pushToTalk={voice.pushToTalk}
          onSetPushToTalk={voice.setPushToTalk}
          onToggleMute={voice.toggleMute}
          onSwitchChannel={voice.switchChannel}
          onPTTActive={voice.setPTTActive}
          onSendChat={onSendChat}
        />
      );
    }
    if (tab === 'ranks') {
      return (
        <LeaderboardPanel
          room={room}
          selfPlayerId={selfPlayer?.id || ''}
          allTimeEntries={leaderboard}
          onRefreshAllTime={onRefreshLeaderboard}
        />
      );
    }
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 space-y-3">
        <div className="pb-3 border-b border-white/10">
          <h2 className="font-display text-lg font-bold tracking-wide text-white">
            Tactical Event Feed
          </h2>
          <p className="text-xs text-slate-400">
            Live radar sweeps, role activations, infections, and perimeter warnings
          </p>
        </div>
        {room.events.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No events logged yet.
          </p>
        ) : (
          <div className="space-y-2">
            {room.events.map((evt) => (
              <div
                key={evt.id}
                className="p-3 rounded-xl bg-[#0d1217] border border-white/10 text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span
                    className={
                      evt.type === 'infection'
                        ? 'text-red-400 font-semibold'
                        : evt.type === 'radar'
                          ? 'text-amber-400 font-semibold'
                          : 'text-emerald-400 font-semibold'
                    }
                  >
                    {evt.type.toUpperCase()}
                  </span>
                  <span className="tabular-nums">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-slate-200 leading-relaxed">{evt.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0b0f12] text-slate-100 overflow-hidden">
      {/* Compact Top Tactical Telemetry Strip */}
      <header className="h-14 shrink-0 px-3 sm:px-5 bg-[#13191f] border-b border-white/10 flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onLeaveRoom}
            aria-label="Return to match lobby"
            className="flex items-center gap-2 text-left hover:opacity-85 cursor-pointer shrink-0"
          >
            <BiohazardRadarLogo className="w-6 h-6 text-slate-100" />
            <span className="font-display text-lg font-extrabold tracking-wide text-white hidden sm:inline whitespace-nowrap">
              ZOMBIE INFECTION
            </span>
          </button>

          <button
            type="button"
            onClick={copyRoomCode}
            aria-label="Copy room invite link"
            className="h-8 px-2.5 rounded-lg bg-[#0b0f12] border border-white/15 text-xs font-mono text-slate-200 hover:border-white/30 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>{room.roomCode}</span>
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Center Match Clocks & Team Counts */}
        <div className="flex items-center gap-3 sm:gap-5 text-xs tabular-nums shrink-0">
          <div className="text-center">
            <span className="block text-[10px] text-slate-400 uppercase tracking-wider">
              {room.status === 'drafting' ? 'Draft' : 'Match'}
            </span>
            <span
              className={`font-mono font-bold text-sm ${
                room.status === 'drafting' ? 'text-amber-400' : 'text-white'
              }`}
            >
              {room.status === 'drafting'
                ? formatSecondsClock(draftRemainingSec)
                : formatSecondsClock(matchRemainingSec)}
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" aria-hidden="true" />

          <div className="text-center">
            <span className="block text-[10px] text-slate-400 uppercase tracking-wider">
              2m Radar
            </span>
            <span
              className={`font-mono font-bold text-sm ${
                revealActive ? 'text-amber-400' : 'text-slate-200'
              }`}
            >
              {revealActive ? 'SWEEPING' : formatSecondsClock(revealRemainingSec)}
            </span>
          </div>

          <div className="hidden md:block h-6 w-px bg-white/10" aria-hidden="true" />

          <div className="hidden md:flex items-center gap-2 font-mono text-xs">
            <span className="text-emerald-400 font-bold">
              {survivorsCount} Survivors
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-red-400 font-bold">
              {zombiesCount} Infected
            </span>
          </div>
        </div>

        {/* Right Utility Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenRoleGuide}
            aria-label="Open tactical roles guide"
            className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg bg-[#0b0f12] border border-white/10 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            <span className="hidden xl:inline">Roles</span>
          </button>
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Mute sound cues' : 'Enable sound cues'}
            className="min-h-[40px] min-w-[40px] rounded-lg bg-[#0b0f12] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace: Map + Right Tactical Console */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Map & Perimeter HUD */}
        <div
          className={`flex-1 relative min-h-0 ${
            mobileScreen === 'map' ? 'block' : 'hidden lg:block'
          }`}
        >
          <TacticalMap
            mapsApiKey={mapsApiKey}
            room={room}
            selfPlayer={selfPlayer}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayerId}
            onMapClickCoordinate={onMapClickCoordinate}
            manualMode={gpsMode === 'manual'}
          />

          {/* Non-Blocking Perimeter HUD Overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
            {/* Top HUD Row: Role Ability Card & GPS Calibration */}
            <div className="flex items-start justify-between gap-3">
              {selfPlayer && (
                <div className="pointer-events-auto max-w-xs rounded-xl bg-[#13191f]/92 border border-white/15 p-3 shadow-xl space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                          selfPlayer.team === 'zombie'
                            ? 'bg-red-500/20 border-red-500/40 text-red-400'
                            : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        }`}
                      >
                        <RoleIcon role={selfPlayer.role} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white leading-tight">
                          {selfRoleDef.name}
                          <span className="md:hidden ml-2 font-mono font-normal text-[11px] text-slate-300">
                            {survivorsCount}S / {zombiesCount}Z
                          </span>
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {selfPlayer.effectiveSpeedMultiplier.toFixed(2)}x speed ·{' '}
                          {distFromCenterMiles.toFixed(2)}/{room.config.radiusMiles} mi
                        </p>
                      </div>
                    </div>
                  </div>

                  {room.status === 'playing' &&
                    !selfPlayer.hasSelectedRole &&
                    selfPlayer.team === 'survivor' &&
                    selfPlayer.infectionStatus === 'healthy' && (
                      <div className="pt-1 border-t border-white/10 space-y-1.5">
                        <p className="text-[11px] font-semibold text-amber-300">
                          Choose Your Role In-Game:
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {HUMAN_ROLES.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() =>
                                onSelectRole(selfPlayer.id, r.id as HumanRoleId)
                              }
                              className="min-h-[32px] px-1.5 rounded bg-[#0b0f12] hover:bg-emerald-500/20 border border-white/15 hover:border-emerald-400 text-[11px] font-semibold text-slate-200 cursor-pointer"
                            >
                              {r.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  <button
                    type="button"
                    onClick={onActivateAbility}
                    disabled={
                      room.status !== 'playing' ||
                      selfPlayer.infectionStatus === 'infected_pending' ||
                      !abilityReadyCheck.ok
                    }
                    className={`w-full min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      selfPlayer.infectionStatus === 'infected_pending'
                        ? 'bg-amber-950/90 text-amber-200 border border-amber-500/60 cursor-not-allowed'
                        : abilityActiveSec > 0
                          ? 'bg-amber-500 text-slate-950'
                          : abilityReadyCheck.ok && room.status === 'playing'
                            ? selfPlayer.team === 'zombie'
                              ? 'bg-red-600 hover:bg-red-500 text-white'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                            : 'bg-[#0b0f12] text-slate-400 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {selfPlayer.infectionStatus === 'infected_pending'
                        ? 'Need Teammate Revive'
                        : selfRoleDef.abilityName}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums shrink-0">
                      {selfPlayer.infectionStatus === 'infected_pending'
                        ? formatSecondsClock(selfInfectedRemainingSec)
                        : room.status !== 'playing'
                          ? 'Standby'
                          : abilityActiveSec > 0
                            ? `ACTIVE ${abilityActiveSec}s`
                            : abilityCooldownSec > 0
                              ? `${abilityCooldownSec}s`
                              : selfRoleDef.cadence === 'one_time'
                                ? `${selfPlayer.abilityUsesRemaining ?? 0}x LEFT`
                                : 'READY'}
                    </span>
                  </button>
                </div>
              )}

              {/* Mobile GPS / Manual Walk Toggle */}
              <div className="pointer-events-auto sm:hidden">
                <button
                  type="button"
                  onClick={() =>
                    onSetGpsMode(gpsMode === 'manual' ? 'live' : 'manual')
                  }
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold border shadow-lg cursor-pointer ${
                    gpsMode === 'manual'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-[#13191f]/92 text-slate-200 border-white/15'
                  }`}
                >
                  {gpsMode === 'manual' ? 'Tap Map Move' : 'Auto GPS'}
                </button>
              </div>

              {/* GPS Mode & Field Stepper */}
              <div className="pointer-events-auto rounded-xl bg-[#13191f]/92 border border-white/15 p-2.5 shadow-xl space-y-2 hidden sm:block">
                <div className="flex items-center gap-1 bg-[#0b0f12] p-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => onSetGpsMode('live')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      gpsMode === 'live'
                        ? 'bg-emerald-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {gpsStatus === 'active' ? 'Live GPS' : 'Auto GPS'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetGpsMode('manual')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      gpsMode === 'manual'
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Manual Walk
                  </button>
                </div>

                {gpsMode === 'manual' && (
                  <div className="grid grid-cols-3 gap-1 w-28 mx-auto">
                    <div />
                    <button
                      type="button"
                      aria-label="Move North"
                      onClick={() =>
                        onStepPosition(
                          45,
                          0,
                          selfPlayer?.effectiveSpeedMultiplier || 1,
                        )
                      }
                      className="h-8 rounded bg-[#0b0f12] hover:bg-white/15 border border-white/10 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <div />
                    <button
                      type="button"
                      aria-label="Move West"
                      onClick={() =>
                        onStepPosition(
                          0,
                          -45,
                          selfPlayer?.effectiveSpeedMultiplier || 1,
                        )
                      }
                      className="h-8 rounded bg-[#0b0f12] hover:bg-white/15 border border-white/10 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move South"
                      onClick={() =>
                        onStepPosition(
                          -45,
                          0,
                          selfPlayer?.effectiveSpeedMultiplier || 1,
                        )
                      }
                      className="h-8 rounded bg-[#0b0f12] hover:bg-white/15 border border-white/10 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move East"
                      onClick={() =>
                        onStepPosition(
                          0,
                          45,
                          selfPlayer?.effectiveSpeedMultiplier || 1,
                        )
                      }
                      className="h-8 rounded bg-[#0b0f12] hover:bg-white/15 border border-white/10 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Active 2-Minute Radar Reveal / Infection Revival / Draft Timer / Out-of-Bounds Alerts */}
            <div className="flex flex-col items-center gap-2">
              {room.status === 'drafting' && draftMinimized && (
                <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5">
                  <DraftCountdownTimer
                    draftEndsAt={room.draftEndsAt}
                    serverNow={room.serverNow || clockNow}
                    totalVotesCast={Object.keys(room.zombieVotes || {}).length}
                    totalPlayers={room.players.length}
                    variant="compact"
                  />
                  <button
                    type="button"
                    onClick={() => setDraftMinimized(false)}
                    className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer shadow-lg whitespace-nowrap"
                  >
                    Open Role & Zombie Vote
                  </button>
                </div>
              )}

              {selfPlayer?.infectionStatus === 'infected_pending' && (
                <div
                  data-testid="self-infected-banner"
                  className="pointer-events-auto px-4 py-2 rounded-xl bg-amber-950/95 border border-amber-400 text-amber-100 text-xs font-semibold flex items-center gap-2 shadow-lg tabular-nums"
                >
                  <HeartPulse className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>
                    INFECTED — {formatSecondsClock(selfInfectedRemainingSec)} TO BE REVIVED BEFORE TURNING INTO A ZOMBIE!
                  </span>
                </div>
              )}

              {selfPlayer?.infectionStatus !== 'infected_pending' &&
                selfPlayer?.team === 'survivor' &&
                infectedAllies.length > 0 && (
                  <div className="pointer-events-auto px-4 py-2 rounded-xl bg-amber-950/95 border border-amber-500/70 text-amber-100 text-xs font-semibold flex items-center gap-2 shadow-lg tabular-nums">
                    <HeartPulse className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                    <span>
                      {infectedAllies[0].name} IS INFECTED — Reach within {reviveReachMeters}m to revive before 2:00 expires!
                    </span>
                  </div>
                )}

              {selfPlayer?.outOfBounds && (
                <div className="pointer-events-auto px-4 py-2 rounded-xl bg-red-950/95 border border-red-500 text-red-100 text-xs font-semibold flex items-center gap-2 shadow-lg">
                  <ShieldAlert className="w-4 h-4 text-red-400" aria-hidden="true" />
                  OUT OF BOUNDS — Return inside the {room.config.radiusMiles} mi perimeter!
                </div>
              )}

              {revealActive && (
                <div className="pointer-events-auto px-4 py-2 rounded-xl bg-amber-950/95 border border-amber-500/70 text-amber-100 text-xs font-semibold flex items-center gap-2 shadow-lg">
                  <Radio className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  2-MINUTE RADAR SWEEP ACTIVE — Survivor coordinates revealed
                </div>
              )}

              {/* Bottom Center Primary Tactical Action Dock */}
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 bg-[#13191f]/95 border border-white/15 rounded-2xl p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={voice.toggleMute}
                  aria-label={voice.muted ? 'Unmute squad voice' : 'Mute squad voice'}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer ${
                    voice.muted
                      ? 'bg-[#0b0f12] text-slate-300 border border-white/10 hover:text-white'
                      : 'bg-emerald-500 text-slate-950'
                  }`}
                >
                  {voice.muted ? (
                    <MicOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Mic className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">
                    {voice.muted ? 'Mic Off' : 'Voice Live'}
                  </span>
                </button>

                {room.status === 'lobby' ? (
                  <button
                    type="button"
                    onClick={onStartMatch}
                    data-start="true"
                    className="min-h-[44px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                    Start Outbreak ({room.players.length} Players)
                  </button>
                ) : room.status === 'drafting' ? (
                  <button
                    type="button"
                    onClick={() => setDraftMinimized(false)}
                    className="min-h-[44px] px-5 rounded-xl bg-amber-950/90 hover:bg-amber-900 border border-amber-400/60 text-amber-200 font-bold text-sm flex items-center gap-2 tabular-nums cursor-pointer"
                  >
                    Role Draft & Zombie Vote ({formatSecondsClock(draftRemainingSec)})
                  </button>
                ) : selfPlayer?.infectionStatus === 'infected_pending' ? (
                  <div
                    data-testid="infected-timer-dock"
                    className="min-h-[44px] px-4 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-200 font-bold text-xs flex items-center gap-2 tabular-nums"
                  >
                    <HeartPulse className="w-4 h-4 text-amber-300" aria-hidden="true" />
                    Infected · {formatSecondsClock(selfInfectedRemainingSec)} Until Zombie
                  </div>
                ) : selfPlayer?.team === 'zombie' ? (
                  <button
                    type="button"
                    disabled={!canTagNearest || !nearestTagTarget}
                    onClick={() =>
                      nearestTagTarget && onTagPlayer(nearestTagTarget.player.id)
                    }
                    className={`min-h-[44px] px-5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors ${
                      canTagNearest
                        ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer'
                        : 'bg-[#0b0f12] text-slate-400 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    <Skull className="w-4 h-4" aria-hidden="true" />
                    {canTagNearest && nearestTagTarget
                      ? `Tag ${nearestTagTarget.player.name} (${nearestTagTarget.distanceMeters}m)`
                      : nearestTagTarget
                        ? `Nearest Target: ${nearestTagTarget.distanceMeters}m (Need ≤${selfPlayer.effectiveTagRadiusMeters}m)`
                        : nearestPingTarget
                          ? `Last Ping: ${nearestPingTarget.player.name} ~${nearestPingTarget.distanceMeters}m`
                          : 'Awaiting 2m Radar Sweep'}
                  </button>
                ) : (
                  <>
                    {canReviveNearest && nearestReviveTarget && (
                      <button
                        type="button"
                        onClick={() => onRevivePlayer(nearestReviveTarget.player.id)}
                        className="min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer"
                      >
                        <HeartPulse className="w-4 h-4" aria-hidden="true" />
                        Revive {nearestReviveTarget.player.name} ({nearestReviveTarget.distanceMeters}m)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onSelfInfected}
                      disabled={room.status !== 'playing'}
                      className="min-h-[44px] px-4 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-semibold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <Skull className="w-4 h-4 text-red-400" aria-hidden="true" />
                      I Was Tagged (Join Zombies)
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Full-Height Drawer View when not on Map */}
        {mobileScreen !== 'map' && (
          <div className="flex-1 lg:hidden bg-[#13191f] min-h-0">
            {renderDrawerBody(mobileScreen)}
          </div>
        )}

        {/* Desktop Right Tactical Console */}
        <aside className="hidden lg:flex lg:w-[390px] xl:w-[420px] shrink-0 flex-col bg-[#13191f] border-l border-white/10 min-h-0">
          <div className="grid grid-cols-4 border-b border-white/10 shrink-0">
            {(
              [
                { id: 'squad', label: 'Squad', icon: Users },
                { id: 'voice', label: 'Voice', icon: Mic },
                { id: 'ranks', label: 'Ranks', icon: Trophy },
                { id: 'feed', label: 'Feed', icon: Activity },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = desktopTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDesktopTab(t.id)}
                  className={`min-h-[48px] flex items-center justify-center gap-1.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-400 text-white bg-white/[0.03]'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex-1 min-h-0">{renderDrawerBody(desktopTab)}</div>
        </aside>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile tactical navigation"
        className="lg:hidden h-16 shrink-0 bg-[#13191f] border-t border-white/10 grid grid-cols-5 items-center z-30"
      >
        {(
          [
            { id: 'map', label: 'Map', icon: MapIcon },
            { id: 'squad', label: 'Squad', icon: Users },
            { id: 'voice', label: 'Voice', icon: Mic },
            { id: 'ranks', label: 'Ranks', icon: Trophy },
            { id: 'feed', label: 'Feed', icon: Activity },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = mobileScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMobileScreen(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
                active ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 15-Second In-Game Role Selection & Zombie Voting Modal */}
      {room.status === 'drafting' && !draftMinimized && (
        <DraftVoteOverlay
          room={room}
          selfPlayer={selfPlayer}
          clockNow={clockNow}
          onSelectRole={onSelectRole}
          onCastZombieVote={onCastZombieVote}
          onFinalizeDraft={onFinalizeDraft}
          onMinimize={() => setDraftMinimized(true)}
        />
      )}

      {/* Match Ended Victory / Infection Modal */}
      {room.status === 'ended' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-outcome-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#13191f] border border-white/15 p-6 shadow-2xl space-y-5 text-center">
            <div
              className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center border ${
                room.winner === 'survivors'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-red-500/15 border-red-500/40 text-red-400'
              }`}
            >
              <Trophy className="w-7 h-7" aria-hidden="true" />
            </div>

            <div>
              <h2
                id="match-outcome-heading"
                className="font-display text-3xl font-extrabold text-white"
              >
                {room.winner === 'survivors'
                  ? 'Survivors Escaped!'
                  : 'Horde Overrun!'}
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                {room.winner === 'survivors'
                  ? `${survivorsCount} survivor${survivorsCount === 1 ? '' : 's'} outran the zombies until time expired.`
                  : 'Every survivor inside the perimeter has been infected.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#0b0f12] border border-white/10 tabular-nums">
              <div>
                <p className="text-xs text-slate-400">Survivors Left</p>
                <p className="font-mono text-xl font-bold text-emerald-400">
                  {survivorsCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Infected</p>
                <p className="font-mono text-xl font-bold text-red-400">
                  {zombiesCount}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onResetMatch}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Play Again
              </button>
              <button
                type="button"
                onClick={onLeaveRoom}
                className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium cursor-pointer"
              >
                Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
