import React, { useEffect, useState } from 'react';
import { BookOpen, Compass, MapPin, Play, Users } from 'lucide-react';
import { HUMAN_ROLES, ZOMBIE_ROLES } from '../game/roles';
import { MAX_RADIUS_MILES, MIN_RADIUS_MILES } from '../game/rules';
import type { HumanRoleId, LatLng, MatchConfig } from '../game/types';
import { BiohazardRadarLogo, RoleIcon } from './RoleBadgeIcon';

interface PublicRoomSummary {
  roomCode: string;
  roomName: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  radiusMiles: number;
  survivors: number;
  zombies: number;
}

interface LobbyScreenProps {
  connected: boolean;
  gpsStatus: 'locating' | 'active' | 'denied' | 'manual';
  currentPos: LatLng;
  initialRoomCode?: string;
  error: string | null;
  onClearError: () => void;
  onCreateRoom: (params: {
    playerName: string;
    role: HumanRoleId;
    config: MatchConfig;
  }) => void;
  onJoinRoom: (params: {
    roomCode: string;
    playerName: string;
    role: HumanRoleId;
  }) => void;
  onQuickStartDemo: (playerName: string, role: HumanRoleId) => void;
  onOpenRoleGuide: () => void;
}

export function LobbyScreen({
  connected,
  gpsStatus,
  currentPos,
  initialRoomCode = '',
  error,
  onClearError,
  onCreateRoom,
  onJoinRoom,
  onQuickStartDemo,
  onOpenRoleGuide,
}: LobbyScreenProps) {
  const [tab, setTab] = useState<'create' | 'join'>(
    initialRoomCode ? 'join' : 'create',
  );
  const [playerName, setPlayerName] = useState('');
  const [selectedRole, setSelectedRole] = useState<HumanRoleId>('runner');
  const [roomName, setRoomName] = useState('Park Perimeter Outbreak');
  const [maxPlayers, setMaxPlayers] = useState(12);
  const [radiusMiles, setRadiusMiles] = useState(2.5);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [joinCode, setJoinCode] = useState(initialRoomCode);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [bgFailed, setBgFailed] = useState(false);

  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (Array.isArray(list)) setPublicRooms(list);
      })
      .catch(() => {});
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();
    if (!playerName.trim()) {
      setFormError('Enter your callsign to deploy.');
      return;
    }
    setFormError(null);
    onCreateRoom({
      playerName: playerName.trim(),
      role: selectedRole,
      config: {
        roomName: roomName.trim() || 'Sector 7 Outbreak',
        maxPlayers,
        radiusMiles,
        durationMinutes,
        revealIntervalSeconds: 120,
        startingZombieCount: 1,
        center: currentPos,
      },
    });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();
    if (!playerName.trim()) {
      setFormError('Enter your callsign before joining.');
      return;
    }
    if (!joinCode.trim()) {
      setFormError('Enter a room code to join.');
      return;
    }
    setFormError(null);
    onJoinRoom({
      roomCode: joinCode.trim().toUpperCase(),
      playerName: playerName.trim(),
      role: selectedRole,
    });
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0b0f12] text-slate-100 flex flex-col">
      {/* Generated Aerial Park Terrain Backdrop with Safe Dark Scrim */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {!bgFailed && (
          <img
            src="/src/assets/images/tactical_terrain_backdrop_1795105490730.jpg"
            alt="Twilight aerial park terrain sector"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f12] via-[#0b0f12]/88 to-[#0b0f12]/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f12] via-transparent to-[#0b0f12]/75" />
      </div>

      {/* Minimal Top Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <BiohazardRadarLogo className="w-8 h-8 text-slate-100" />
          <span className="font-display text-2xl font-extrabold tracking-wider text-white">
            ZOMBIE INFECTION
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={onOpenRoleGuide}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Tactical Roles
          </button>
          <a
            href="#rules-overview"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Field Rules
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onQuickStartDemo(playerName.trim() || 'Commander', selectedRole)}
            data-start="true"
            className="min-h-[44px] px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            Quick Launch
          </button>
        </div>
      </header>

      {/* Main Split Stage */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Editorial Briefing Column */}
        <section className="lg:col-span-6 space-y-6 pt-2">
          <div className="space-y-3">
            <p className="text-xs font-mono text-emerald-400 tracking-wide">
              OUTDOOR GPS SURVIVAL · MAX 5.0 MI PERIMETER · 2-MIN RADAR SWEEP
            </p>
            <h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[0.98]"
              style={{ textWrap: 'balance' }}
            >
              Outrun the horde across real terrain.
            </h1>
            <p className="text-base text-slate-300 max-w-xl leading-relaxed">
              Form an outdoor group, set a perimeter up to 5 miles, and coordinate over live squad voice comms. Every two minutes, survivor GPS locations flash onto the zombie radar. Once tagged, you mutate and hunt with the horde.
            </p>
          </div>

          {/* Key Rule Metrics Row */}
          <div
            id="rules-overview"
            className="grid grid-cols-3 gap-4 py-4 border-y border-white/10"
          >
            <div>
              <p className="font-mono text-2xl font-bold text-white tabular-nums">
                5.0 mi
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Max Play Zone</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold text-amber-400 tabular-nums">
                02:00
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Survivor Radar Ping</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                6 Roles
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Human & Zombie Kit</p>
            </div>
          </div>

          {/* Tactical Role Roster Summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Distinct Class Abilities & Strategy
              </h2>
              <button
                type="button"
                onClick={onOpenRoleGuide}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Full Role Codex
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#13191f]/90 border border-white/10 space-y-2">
                <p className="font-semibold text-emerald-400">
                  Human Survivors
                </p>
                {HUMAN_ROLES.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-slate-300">
                    <RoleIcon role={r.id} className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <p>
                      <span className="font-semibold text-white">{r.name}:</span>{' '}
                      {r.abilityName} ({Math.round(r.cooldownMs / 1000)}s CD)
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-[#13191f]/90 border border-white/10 space-y-2">
                <p className="font-semibold text-red-400">
                  Zombie Horde
                </p>
                {ZOMBIE_ROLES.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-slate-300">
                    <RoleIcon role={r.id} className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <p>
                      <span className="font-semibold text-white">{r.name}:</span>{' '}
                      {r.abilityName} (
                      {r.cadence === 'one_time'
                        ? '1x/Match'
                        : `${Math.round(r.cooldownMs / 1000)}s CD`}
                      )
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              {gpsStatus === 'active'
                ? `GPS Locked (${currentPos.lat.toFixed(4)}, ${currentPos.lng.toFixed(4)})`
                : 'Manual Sector Calibration Ready'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {connected ? 'Realtime Socket Ready' : 'Connecting to Match Server...'}
            </span>
          </div>
        </section>

        {/* Right Staging & Match Setup Console */}
        <section className="lg:col-span-6">
          <div className="rounded-2xl bg-[#13191f]/95 border border-white/10 shadow-2xl p-6 space-y-5">
            {/* Create / Join Segmented Switch */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0b0f12] border border-white/10">
              <button
                type="button"
                onClick={() => setTab('create')}
                className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  tab === 'create'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Group Match
              </button>
              <button
                type="button"
                onClick={() => setTab('join')}
                className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  tab === 'join'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Join Room Code
              </button>
            </div>

            {(formError || error) && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-950/70 border border-red-500/40 text-xs text-red-200"
              >
                {formError || error}
              </div>
            )}

            {/* Shared Callsign & Starting Human Role */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="player-callsign"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Your Callsign
                </label>
                <input
                  id="player-callsign"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Jordan, GhostLead, Alpha-1"
                  maxLength={24}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0b0f12] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-2">
                  Select Starting Human Role
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {HUMAN_ROLES.map((r) => {
                    const active = selectedRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRole(r.id as HumanRoleId)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-400 text-white'
                            : 'bg-[#0b0f12] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <RoleIcon
                            role={r.id}
                            className={`w-4 h-4 ${active ? 'text-emerald-400' : 'text-slate-400'}`}
                          />
                          <span className="text-xs font-semibold">{r.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {r.abilityName}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {tab === 'create' ? (
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="room-name"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Sector / Match Name
                    </label>
                    <input
                      id="room-name"
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-[#0b0f12] border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="max-players"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Group Size (Players)
                    </label>
                    <input
                      id="max-players"
                      type="number"
                      min={2}
                      max={50}
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl bg-[#0b0f12] border border-white/15 text-sm font-mono text-white tabular-nums focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <label htmlFor="radius-slider" className="text-slate-300 font-medium">
                        Perimeter Radius
                      </label>
                      <span className="font-mono text-amber-400 tabular-nums">
                        {radiusMiles.toFixed(2)} mi (max 5.0)
                      </span>
                    </div>
                    <input
                      id="radius-slider"
                      type="range"
                      min={MIN_RADIUS_MILES}
                      max={MAX_RADIUS_MILES}
                      step={0.25}
                      value={radiusMiles}
                      onChange={(e) => setRadiusMiles(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <label htmlFor="duration-slider" className="text-slate-300 font-medium">
                        Match Length
                      </label>
                      <span className="font-mono text-emerald-400 tabular-nums">
                        {durationMinutes} min
                      </span>
                    </div>
                    <input
                      id="duration-slider"
                      type="range"
                      min={5}
                      max={60}
                      step={5}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  Create Staging Lobby
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoinSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="join-code"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Room Code
                  </label>
                  <input
                    id="join-code"
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ZMB4K2"
                    maxLength={8}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#0b0f12] border border-white/15 font-mono text-sm tracking-widest uppercase text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4" aria-hidden="true" />
                  Join Group Match
                </button>

                {publicRooms.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <span className="text-xs font-medium text-slate-400">
                      Active Rooms Nearby
                    </span>
                    <div className="divide-y divide-white/5 rounded-xl bg-[#0b0f12] border border-white/10 overflow-hidden">
                      {publicRooms.map((r) => (
                        <button
                          key={r.roomCode}
                          type="button"
                          onClick={() => setJoinCode(r.roomCode)}
                          className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-white/5 cursor-pointer"
                        >
                          <div>
                            <p className="text-xs font-semibold text-white">
                              {r.roomName}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {r.roomCode} · {r.playerCount}/{r.maxPlayers} players ·{' '}
                              {r.radiusMiles} mi
                            </p>
                          </div>
                          <span className="text-xs text-emerald-400 font-medium">
                            Select
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
