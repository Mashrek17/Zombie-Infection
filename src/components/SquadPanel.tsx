import React, { useState } from 'react';
import { Crosshair, Play, Plus, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { HUMAN_ROLES, ROLES, ZOMBIE_ROLES } from '../game/roles';
import {
  MEDIC_REVIVE_RADIUS_METERS,
  SURVIVOR_REVIVE_RADIUS_METERS,
  haversineDistanceMeters,
} from '../game/rules';
import type {
  ClientRoomView,
  ClientVisiblePlayer,
  PlayerRoleId,
  Team,
} from '../game/types';
import { formatSecondsClock, RoleIcon } from './RoleBadgeIcon';

interface SquadPanelProps {
  room: ClientRoomView;
  selfPlayer: ClientVisiblePlayer | null;
  clockNow: number;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onAddPlayers: (
    players: Array<{ name: string; team: Team; role: PlayerRoleId }>,
    targetMaxPlayers?: number,
  ) => void;
  onSelectRole: (playerId: string, role: PlayerRoleId) => void;
  onStartMatch: () => void;
  onTagPlayer: (targetId: string) => void;
  onRevivePlayer: (targetId: string) => void;
  onMoveProxyToSelf: (proxyId: string) => void;
  onTriggerReveal: () => void;
}

export function SquadPanel({
  room,
  selfPlayer,
  clockNow,
  selectedPlayerId,
  onSelectPlayer,
  onAddPlayers,
  onSelectRole,
  onStartMatch,
  onTagPlayer,
  onRevivePlayer,
  onMoveProxyToSelf,
  onTriggerReveal,
}: SquadPanelProps) {
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState<Team>('survivor');
  const [newRole, setNewRole] = useState<PlayerRoleId>('runner');
  const [batchCount, setBatchCount] = useState(3);

  const survivors = room.players.filter((p) => p.team === 'survivor');
  const zombies = room.players.filter((p) => p.team === 'zombie');

  const handleTeamChange = (team: Team) => {
    setNewTeam(team);
    setNewRole(team === 'survivor' ? 'runner' : 'speedster');
  };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddPlayers([{ name: trimmed, team: newTeam, role: newRole }]);
    setNewName('');
  };

  const handleQuickAddGroup = () => {
    const rolesPool: Array<{ team: Team; role: PlayerRoleId }> = [
      { team: 'survivor', role: 'medic' },
      { team: 'survivor', role: 'defender' },
      { team: 'zombie', role: 'tank' },
      { team: 'survivor', role: 'runner' },
      { team: 'zombie', role: 'stalker' },
      { team: 'zombie', role: 'speedster' },
    ];
    const startIdx = room.players.length;
    const list: Array<{ name: string; team: Team; role: PlayerRoleId }> = [];
    for (let i = 0; i < batchCount; i++) {
      const slot = rolesPool[(startIdx + i) % rolesPool.length];
      list.push({
        name: `Player ${startIdx + i + 1}`,
        team: slot.team,
        role: slot.role,
      });
    }
    const neededMax = Math.max(room.config.maxPlayers, room.players.length + list.length);
    onAddPlayers(list, neededMax);
  };

  const roleChoices = newTeam === 'survivor' ? HUMAN_ROLES : ZOMBIE_ROLES;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      {/* Group Roster Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide text-white">
            Group Roster
          </h2>
          <p className="text-xs text-slate-400 tabular-nums">
            {room.players.length} / {room.config.maxPlayers} players ·{' '}
            <span className="text-emerald-400">{survivors.length} Survivors</span> ·{' '}
            <span className="text-red-400">{zombies.length} Infected</span>
          </p>
        </div>

        {room.status === 'lobby' && (
          <button
            type="button"
            onClick={onStartMatch}
            data-start="true"
            className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            Start Match
          </button>
        )}

        {room.status === 'playing' && (
          <button
            type="button"
            onClick={onTriggerReveal}
            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            Force Ping
          </button>
        )}
      </div>

      {/* Add Players to Group */}
      <div className="p-3.5 rounded-xl bg-[#0d1217] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            Add Group Players
          </span>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            Max {room.config.maxPlayers}
          </span>
        </div>

        <form onSubmit={handleAddSingle} className="space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Player callsign"
              aria-label="New player callsign"
              className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-[#13191f] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="min-h-[40px] px-3.5 rounded-lg bg-slate-100 hover:bg-white disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex rounded-lg bg-[#13191f] p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => handleTeamChange('survivor')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                  newTeam === 'survivor'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Human
              </button>
              <button
                type="button"
                onClick={() => handleTeamChange('zombie')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                  newTeam === 'zombie'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Zombie
              </button>
            </div>

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as PlayerRoleId)}
              aria-label="New player role"
              className="h-9 px-2.5 rounded-lg bg-[#13191f] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {roleChoices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </form>

        <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <label htmlFor="batch-player-count" className="whitespace-nowrap">
              Batch add:
            </label>
            <select
              id="batch-player-count"
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value))}
              className="h-8 px-2 rounded bg-[#13191f] border border-white/10 text-xs text-slate-200 tabular-nums"
            >
              <option value={2}>2 players</option>
              <option value={3}>3 players</option>
              <option value={5}>5 players</option>
              <option value={8}>8 players</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleQuickAddGroup}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 text-xs font-medium cursor-pointer whitespace-nowrap"
          >
            Add Squad
          </button>
        </div>
      </div>

      {/* Player List */}
      <div className="space-y-2">
        {room.players.map((p) => {
          const isSelf = p.id === selfPlayer?.id;
          const isInfectedPending = p.infectionStatus === 'infected_pending';
          const isZombie = p.team === 'zombie';
          const roleDef = ROLES[p.role];
          const canEditRole =
            (room.status === 'lobby' || room.status === 'drafting') &&
            (isSelf || selfPlayer?.isHost);
          const distMeters =
            selfPlayer &&
            selfPlayer.lat !== null &&
            selfPlayer.lng !== null &&
            p.lat !== null &&
            p.lng !== null &&
            !isSelf
              ? Math.round(
                  haversineDistanceMeters(
                    { lat: selfPlayer.lat, lng: selfPlayer.lng },
                    { lat: p.lat, lng: p.lng },
                  ),
                )
              : null;

          const reviveRemainingSec =
            isInfectedPending && p.infectedPendingUntil
              ? Math.max(0, Math.ceil((p.infectedPendingUntil - clockNow) / 1000))
              : 0;
          const reviveReachMeters =
            selfPlayer?.role === 'medic'
              ? MEDIC_REVIVE_RADIUS_METERS
              : SURVIVOR_REVIVE_RADIUS_METERS;
          const canRevive =
            room.status === 'playing' &&
            !isSelf &&
            selfPlayer?.team === 'survivor' &&
            selfPlayer.infectionStatus === 'healthy' &&
            isInfectedPending &&
            distMeters !== null &&
            distMeters <= reviveReachMeters;

          const canTag =
            room.status === 'playing' &&
            selfPlayer?.team === 'zombie' &&
            p.team === 'survivor' &&
            !isInfectedPending &&
            distMeters !== null &&
            distMeters <= (selfPlayer.effectiveTagRadiusMeters || 15);

          return (
            <div
              key={p.id}
              className={`p-3 rounded-xl border transition-colors ${
                selectedPlayerId === p.id
                  ? 'bg-[#1a222b] border-white/25'
                  : isInfectedPending
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-[#0d1217] border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(p.id)}
                  className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                      isInfectedPending
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                        : isZombie
                          ? 'bg-red-500/15 border-red-500/35 text-red-400'
                          : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                    }`}
                  >
                    <RoleIcon role={p.role} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {p.name}
                      {isSelf ? ' (You)' : ''}
                    </p>
                    <p className="text-xs text-slate-400 tabular-nums">
                      {isInfectedPending ? (
                        <span className="text-amber-300 font-semibold">
                          INFECTED · {formatSecondsClock(reviveRemainingSec)} to revive
                        </span>
                      ) : (
                        <>
                          {isZombie ? 'Infected' : 'Survivor'} · {roleDef.name}
                        </>
                      )}
                      {distMeters !== null ? ` · ${distMeters}m` : ''}
                      {p.locationHidden ? ' · Signal cloaked' : ''}
                    </p>
                  </div>
                </button>

                {p.outOfBounds && (
                  <span
                    title="Outside perimeter boundary"
                    className="text-xs font-mono text-red-400 flex items-center gap-1 shrink-0"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                    OOB
                  </span>
                )}
              </div>

              {/* Role assignment in lobby or drafting */}
              {canEditRole && (
                <div className="mt-2.5 pt-2.5 border-t border-white/5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">Assign Role</span>
                  <select
                    value={p.role}
                    onChange={(e) =>
                      onSelectRole(p.id, e.target.value as PlayerRoleId)
                    }
                    aria-label={`Role for ${p.name}`}
                    className="h-8 px-2 rounded bg-[#13191f] border border-white/15 text-xs text-slate-200"
                  >
                    <optgroup label="Human Survivors">
                      {HUMAN_ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          Human · {r.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Zombie Horde">
                      {ZOMBIE_ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          Zombie · {r.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}

              {/* Active game tactical actions */}
              {room.status === 'playing' && !isSelf && (
                <div className="mt-2.5 pt-2.5 border-t border-white/5 flex flex-wrap gap-2">
                  {canRevive && (
                    <button
                      type="button"
                      onClick={() => onRevivePlayer(p.id)}
                      className="flex-1 min-h-[36px] px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
                    >
                      Revive Ally ({distMeters}m)
                    </button>
                  )}
                  {!canRevive &&
                    isInfectedPending &&
                    selfPlayer?.team === 'survivor' &&
                    selfPlayer.infectionStatus === 'healthy' &&
                    distMeters !== null && (
                      <span className="text-[11px] text-amber-300 font-mono self-center">
                        Need ≤{reviveReachMeters}m to revive ({distMeters}m)
                      </span>
                    )}
                  {canTag && (
                    <button
                      type="button"
                      onClick={() => onTagPlayer(p.id)}
                      className="flex-1 min-h-[36px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Tag & Infect ({distMeters}m)
                    </button>
                  )}
                  {p.isFieldProxy && selfPlayer?.isHost && (
                    <button
                      type="button"
                      onClick={() => onMoveProxyToSelf(p.id)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Crosshair className="w-3 h-3" aria-hidden="true" />
                      Move Here
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
