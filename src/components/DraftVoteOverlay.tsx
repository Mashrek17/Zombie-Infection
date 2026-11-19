import React, { useMemo } from 'react';
import { Map as MapIcon, Play, Shuffle, Skull, Users, Vote } from 'lucide-react';
import { HUMAN_ROLES } from '../game/roles';
import type {
  ClientRoomView,
  ClientVisiblePlayer,
  HumanRoleId,
  PlayerRoleId,
} from '../game/types';
import { DraftCountdownTimer } from './DraftCountdownTimer';
import { RoleIcon } from './RoleBadgeIcon';

interface DraftVoteOverlayProps {
  room: ClientRoomView;
  selfPlayer: ClientVisiblePlayer | null;
  clockNow: number;
  onSelectRole: (playerId: string, role: PlayerRoleId) => void;
  onCastZombieVote: (targetPlayerId: string) => void;
  onFinalizeDraft: () => void;
  onMinimize?: () => void;
}

export function DraftVoteOverlay({
  room,
  selfPlayer,
  clockNow,
  onSelectRole,
  onCastZombieVote,
  onFinalizeDraft,
  onMinimize,
}: DraftVoteOverlayProps) {

  const voteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const targetId of Object.values(room.zombieVotes || {})) {
      counts[targetId] = (counts[targetId] ?? 0) + 1;
    }
    return counts;
  }, [room.zombieVotes]);

  const myVoteTargetId = selfPlayer
    ? room.zombieVotes?.[selfPlayer.id] ?? null
    : null;
  const totalVotesCast = Object.keys(room.zombieVotes || {}).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-vote-title"
      data-testid="draft-vote-overlay"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/78 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[#13191f] border border-white/15 shadow-2xl overflow-hidden my-auto">
        {/* Visual 15-Second Drafting & Zombie Vote Countdown Timer */}
        <DraftCountdownTimer
          draftEndsAt={room.draftEndsAt}
          serverNow={room.serverNow || clockNow}
          totalVotesCast={totalVotesCast}
          totalPlayers={room.players.length}
          variant="panel"
        />

        <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 max-h-[68vh] overflow-y-auto">
          {/* Left: Select Survivor Role */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                1. Choose Your Survivor Role
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {selfPlayer?.hasSelectedRole ? 'Locked' : 'Random if unchosen'}
              </span>
            </div>

            <div className="space-y-2">
              {HUMAN_ROLES.map((role) => {
                const isSelected =
                  selfPlayer?.hasSelectedRole && selfPlayer.role === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    disabled={!selfPlayer}
                    onClick={() =>
                      selfPlayer &&
                      onSelectRole(selfPlayer.id, role.id as HumanRoleId)
                    }
                    className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-400 text-white'
                        : 'bg-[#0b0f12] border-white/10 hover:border-white/25 text-slate-200'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                          : 'bg-[#13191f] text-emerald-400 border-white/10'
                      }`}
                    >
                      <RoleIcon role={role.id} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{role.name}</span>
                        <span className="text-[11px] font-mono text-emerald-400">
                          {isSelected
                            ? 'SELECTED'
                            : `${Math.round(role.cooldownMs / 1000)}s CD`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                        {role.abilityName} — {role.tagline}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 flex items-start gap-1.5 pt-1">
              <Shuffle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Any runner roles left unchosen after 15 seconds are randomly assigned across the squad.
              </span>
            </p>
          </div>

          {/* Right: Vote Who Should Be the Zombie */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Skull className="w-4 h-4 text-red-400" aria-hidden="true" />
                2. Vote Patient Zero (Zombie)
              </h3>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {totalVotesCast} vote{totalVotesCast === 1 ? '' : 's'} cast
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {room.players.map((p) => {
                const votes = voteCounts[p.id] ?? 0;
                const isMyVote = myVoteTargetId === p.id;
                const isSelf = p.id === selfPlayer?.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onCastZombieVote(p.id)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                      isMyVote
                        ? 'bg-red-500/20 border-red-400 text-white'
                        : 'bg-[#0b0f12] border-white/10 hover:border-white/25 text-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {p.name}
                        {isSelf ? ' (You)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {p.hasSelectedRole ? `Picked ${p.role}` : 'Unchosen role'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-mono text-red-300 tabular-nums">
                        {votes} vote{votes === 1 ? '' : 's'}
                      </span>
                      <span
                        className={`text-xs font-semibold flex items-center gap-1 ${
                          isMyVote ? 'text-red-300' : 'text-slate-400'
                        }`}
                      >
                        <Vote className="w-3.5 h-3.5" aria-hidden="true" />
                        {isMyVote ? 'Voted' : 'Vote'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400">
              Top-voted player{room.config.startingZombieCount > 1 ? 's' : ''} mutate into Patient Zero. If infected during the hunt, survivors have 2:00 to be revived!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#0d1217] border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Hunt begins automatically when 15s countdown reaches 00:00.
          </span>

          <div className="flex items-center gap-2.5 shrink-0">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                View Map
              </button>
            )}

            {selfPlayer?.isHost && (
              <button
                type="button"
                onClick={onFinalizeDraft}
                data-testid="finalize-draft-btn"
                className="min-h-[44px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                Lock Roles & Start Hunt
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
