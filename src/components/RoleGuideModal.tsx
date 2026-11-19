import React from 'react';
import { X } from 'lucide-react';
import { HUMAN_ROLES, ZOMBIE_ROLES } from '../game/roles';
import { RoleIcon } from './RoleBadgeIcon';

interface RoleGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function RoleGuideModal({ open, onClose }: RoleGuideModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-codex-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#13191f] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2
              id="role-codex-title"
              className="font-display text-2xl font-bold tracking-wide text-white"
            >
              Tactical Roles & Field Strategy
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Players get 15 seconds in-game to select roles or vote Patient Zero (unchosen runner roles randomize). Infected survivors have 2 minutes to be revived before mutating into a Zombie.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tactical roles guide"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-emerald-500/20">
              <h3 className="font-display text-xl font-bold text-emerald-400">
                Human Survivor Classes
              </h3>
              <span className="text-xs text-slate-400">
                Objective · Outrun the horde until timer hits 00:00
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {HUMAN_ROLES.map((role) => (
                <div
                  key={role.id}
                  className="p-4 rounded-xl bg-[#0d1217] border border-white/10 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                        <RoleIcon role={role.id} className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-100 text-sm">
                          {role.name}
                        </h4>
                        <p className="text-xs text-slate-400">{role.tagline}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs font-semibold text-emerald-300">
                        {role.abilityName}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                        {role.cadence === 'one_time'
                          ? '1x Per Match'
                          : `Cooldown ${Math.round(role.cooldownMs / 1000)}s`}{' '}
                        · Duration {Math.round(role.durationMs / 1000)}s
                      </p>
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                        {role.abilityDescription}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 text-xs text-slate-400 space-y-1">
                    <p>
                      <span className="text-slate-200 font-medium">Strategy:</span>{' '}
                      {role.strategyTip}
                    </p>
                    {role.mutatesTo && (
                      <p className="font-mono text-[11px] text-red-400">
                        If infected → mutates into {role.mutatesTo.toUpperCase()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-red-500/20">
              <h3 className="font-display text-xl font-bold text-red-400">
                Zombie Infected Classes
              </h3>
              <span className="text-xs text-slate-400">
                Objective · Track 2-minute pings & infect every survivor
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ZOMBIE_ROLES.map((role) => (
                <div
                  key={role.id}
                  className="p-4 rounded-xl bg-[#0d1217] border border-white/10 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                        <RoleIcon role={role.id} className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-100 text-sm">
                          {role.name}
                        </h4>
                        <p className="text-xs text-slate-400">{role.tagline}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs font-semibold text-red-300">
                        {role.abilityName}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                        {role.cadence === 'one_time'
                          ? '1x Per Match'
                          : `Cooldown ${Math.round(role.cooldownMs / 1000)}s`}{' '}
                        · Duration {Math.round(role.durationMs / 1000)}s · Reach{' '}
                        {role.tagRadiusMeters}m
                      </p>
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                        {role.abilityDescription}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 text-xs text-slate-400">
                    <p>
                      <span className="text-slate-200 font-medium">Strategy:</span>{' '}
                      {role.strategyTip}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
