import React, { useState } from 'react';
import { Trophy } from 'lucide-react';
import { ROLES } from '../game/roles';
import { buildLiveStandings } from '../game/rules';
import type { ClientRoomView, LeaderboardEntry } from '../game/types';
import { formatSecondsClock, RoleIcon } from './RoleBadgeIcon';

interface LeaderboardPanelProps {
  room: ClientRoomView;
  selfPlayerId: string;
  allTimeEntries: LeaderboardEntry[];
  onRefreshAllTime: (sort: 'score' | 'infections' | 'wins') => void;
}

export function LeaderboardPanel({
  room,
  selfPlayerId,
  allTimeEntries,
  onRefreshAllTime,
}: LeaderboardPanelProps) {
  const [view, setView] = useState<'live' | 'alltime'>('live');
  const [sortBy, setSortBy] = useState<'score' | 'infections' | 'wins'>('score');

  const liveStandings = buildLiveStandings(
    room,
    selfPlayerId,
    room.serverNow || Date.now(),
  );

  const handleSortChange = (next: 'score' | 'infections' | 'wins') => {
    setSortBy(next);
    onRefreshAllTime(next);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold tracking-wide text-white">
            Leaderboard
          </h2>
        </div>

        <div className="flex p-0.5 rounded-lg bg-[#0d1217] border border-white/10">
          <button
            type="button"
            onClick={() => setView('live')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              view === 'live'
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Match
          </button>
          <button
            type="button"
            onClick={() => {
              setView('alltime');
              onRefreshAllTime(sortBy);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              view === 'alltime'
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All-Time
          </button>
        </div>
      </div>

      {view === 'live' ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            Points award survival time, infections (+150), Medic assists (+50), and distance covered.
          </p>
          <div className="rounded-xl bg-[#0d1217] border border-white/10 divide-y divide-white/5 overflow-hidden">
            {liveStandings.map((row, idx) => (
              <div
                key={row.playerId}
                className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                  row.isSelf ? 'bg-emerald-500/[0.06]' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-5 text-xs font-mono font-bold text-slate-400 tabular-nums">
                    #{idx + 1}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                      row.team === 'zombie'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    <RoleIcon role={row.role} className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 truncate">
                      {row.name}
                      {row.isSelf ? ' (You)' : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      {ROLES[row.role].name} · {formatSecondsClock(row.survivedSeconds)} ·{' '}
                      {row.infectionsCount} tags
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-bold text-white tabular-nums">
                    {row.score}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {row.distanceMiles.toFixed(2)} mi
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            {(['score', 'infections', 'wins'] as const).map((criterion) => (
              <button
                key={criterion}
                type="button"
                onClick={() => handleSortChange(criterion)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                  sortBy === criterion
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-[#0d1217] text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                Top {criterion}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-[#0d1217] border border-white/10 divide-y divide-white/5 overflow-hidden">
            {allTimeEntries.map((entry, idx) => (
              <div
                key={entry.playerName}
                className="px-3.5 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-5 text-xs font-mono font-bold text-amber-400 tabular-nums">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 truncate">
                      {entry.playerName}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      {entry.wins}W / {entry.matchesPlayed}M · {entry.totalInfections} tags ·{' '}
                      {ROLES[entry.favoriteRole]?.name ?? entry.favoriteRole}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-bold text-white tabular-nums">
                    {entry.totalScore.toLocaleString()}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {entry.totalDistanceMiles.toFixed(1)} mi
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
