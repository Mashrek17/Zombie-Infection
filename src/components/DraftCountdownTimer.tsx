import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { DRAFT_DURATION_MS } from '../game/rules';
import { formatSecondsClock } from './RoleBadgeIcon';

interface DraftCountdownTimerProps {
  draftEndsAt: number | null;
  serverNow: number;
  durationMs?: number;
  totalVotesCast?: number;
  totalPlayers?: number;
  variant?: 'panel' | 'compact';
  testId?: string;
}

const TOTAL_SEGMENTS = 15;

export function DraftCountdownTimer({
  draftEndsAt,
  serverNow,
  durationMs = DRAFT_DURATION_MS,
  totalVotesCast,
  totalPlayers,
  variant = 'panel',
  testId = 'draft-countdown',
}: DraftCountdownTimerProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!draftEndsAt) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 100);
    return () => window.clearInterval(id);
  }, [draftEndsAt]);

  const currentNow = Math.max(nowMs, serverNow || 0);
  const remainingMs = draftEndsAt
    ? Math.max(0, draftEndsAt - currentNow)
    : durationMs;
  const progress = Math.min(1, Math.max(0, remainingMs / durationMs));
  const remainingSec = Math.min(
    TOTAL_SEGMENTS,
    Math.max(0, Math.ceil(remainingMs / 1000)),
  );
  const isUrgent = remainingSec <= 5 && remainingSec > 0;
  const isExpired = remainingSec === 0;

  if (variant === 'compact') {
    const size = 40;
    const strokeWidth = 3.5;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - progress);

    return (
      <div
        role="timer"
        aria-live="polite"
        aria-label={`${remainingSec} seconds remaining to vote for a zombie`}
        data-testid={`${testId}-compact`}
        className={`relative overflow-hidden rounded-xl border bg-[#13191f]/95 px-3.5 py-2 shadow-xl ${
          isUrgent || isExpired ? 'border-red-500/60' : 'border-amber-500/45'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="-rotate-90"
              aria-hidden="true"
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={isUrgent || isExpired ? '#ef4444' : '#f59e0b'}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <span
              className={`absolute font-mono text-xs font-bold tabular-nums ${
                isUrgent || isExpired ? 'text-red-300' : 'text-amber-300'
              }`}
            >
              {remainingSec}s
            </span>
          </div>

          <div className="min-w-0">
            <p
              className={`text-xs font-bold whitespace-nowrap ${
                isUrgent || isExpired ? 'text-red-300' : 'text-amber-200'
              }`}
            >
              {isExpired
                ? 'Locking Zombie Votes...'
                : isUrgent
                  ? `Final ${remainingSec}s to Vote Zombie`
                  : `Zombie Vote Open · ${formatSecondsClock(remainingSec)}`}
            </p>
            <p className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
              {typeof totalVotesCast === 'number' && typeof totalPlayers === 'number'
                ? `${totalVotesCast} of ${totalPlayers} votes cast`
                : 'Unchosen runner roles randomize at 00:00'}
            </p>
          </div>
        </div>

        <div
          aria-hidden="true"
          className={`mt-2 h-1 w-full rounded-full ${
            isUrgent || isExpired ? 'bg-red-950' : 'bg-amber-950'
          }`}
        >
          <div
            className={`h-full rounded-full origin-left transition-transform duration-100 ease-linear ${
              isUrgent || isExpired ? 'bg-red-500' : 'bg-amber-400'
            }`}
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      </div>
    );
  }

  const size = 84;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const accentStroke = isUrgent || isExpired ? '#ef4444' : '#f59e0b';

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`${remainingSec} seconds left to vote for a zombie`}
      className={`px-5 py-4 border-b border-white/10 transition-colors ${
        isUrgent || isExpired ? 'bg-red-950/30' : 'bg-[#0d1217]'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Radial Precision Dial */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative w-[84px] h-[84px] flex items-center justify-center shrink-0">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="-rotate-90"
              aria-hidden="true"
            >
              {/* 15 Outer Second Tick Marks */}
              {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => {
                const angleDeg = (i / TOTAL_SEGMENTS) * 360;
                const activeTick = i < remainingSec;
                return (
                  <line
                    key={i}
                    x1={size / 2 + radius + 5}
                    y1={size / 2}
                    x2={size / 2 + radius + 8.5}
                    y2={size / 2}
                    stroke={
                      activeTick
                        ? isUrgent
                          ? 'rgba(248, 113, 113, 0.9)'
                          : 'rgba(251, 191, 36, 0.85)'
                        : 'rgba(255, 255, 255, 0.14)'
                    }
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    transform={`rotate(${angleDeg} ${size / 2} ${size / 2})`}
                  />
                );
              })}

              {/* Background Ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={strokeWidth}
              />

              {/* Active Smooth Sweep Ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={accentStroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                data-testid={testId}
                className={`font-mono text-xl font-extrabold leading-none tabular-nums ${
                  isUrgent || isExpired ? 'text-red-400' : 'text-amber-300'
                }`}
              >
                {formatSecondsClock(remainingSec)}
              </span>
              <span className="text-[10px] font-mono text-slate-400 mt-0.5 tabular-nums">
                {remainingSec}s left
              </span>
            </div>
          </div>

          <div className="sm:hidden min-w-0">
            <p
              className={`text-xs font-semibold flex items-center gap-1.5 ${
                isUrgent || isExpired ? 'text-red-300' : 'text-amber-300'
              }`}
            >
              {isUrgent || isExpired ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              {isExpired
                ? 'Resolving Zombie Vote...'
                : isUrgent
                  ? 'Final Seconds to Vote'
                  : 'Time Left to Vote Zombie'}
            </p>
            <h2
              id="draft-vote-title"
              className="font-display text-xl font-extrabold text-white mt-0.5"
            >
              Pick Your Role or Vote Patient Zero
            </h2>
          </div>
        </div>

        {/* Title, Segmented 15-Second Meter & Smooth Progress Bar */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="hidden sm:flex items-center justify-between gap-3">
            <div>
              <p
                className={`text-xs font-semibold flex items-center gap-1.5 ${
                  isUrgent || isExpired ? 'text-red-300' : 'text-amber-300'
                }`}
              >
                {isUrgent || isExpired ? (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {isExpired
                    ? 'Time Expired — Assigning Zombie & Roles'
                    : isUrgent
                      ? 'Final Seconds — Cast Your Zombie Vote Now'
                      : 'Time Remaining to Vote for Patient Zero'}
                </span>
              </p>
              <h2
                id="draft-vote-title"
                className="font-display text-2xl font-extrabold text-white leading-tight mt-0.5"
              >
                Pick Your Role or Vote Patient Zero
              </h2>
            </div>

            {typeof totalVotesCast === 'number' && typeof totalPlayers === 'number' && (
              <div className="text-right shrink-0">
                <span className="block text-[11px] text-slate-400">Votes Cast</span>
                <span className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                  {totalVotesCast} / {totalPlayers}
                </span>
              </div>
            )}
          </div>

          {/* 15 Individual Second Segments + Smooth Continuous Drain */}
          <div className="space-y-1.5" aria-hidden="true">
            <div className="grid grid-cols-15 gap-1">
              {Array.from({ length: TOTAL_SEGMENTS }).map((_, index) => {
                const filled = index < remainingSec;
                return (
                  <div
                    key={index}
                    className={`h-2 rounded-sm transition-opacity duration-150 ${
                      filled
                        ? isUrgent
                          ? 'bg-red-500 opacity-100'
                          : 'bg-amber-400 opacity-100'
                        : 'bg-white/10 opacity-45'
                    }`}
                  />
                );
              })}
            </div>

            <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full w-full origin-left ${
                  isUrgent || isExpired ? 'bg-red-500' : 'bg-amber-400'
                }`}
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 tabular-nums">
            <span>
              15-second drafting window · Unchosen runner roles randomize at 00:00
            </span>
            {typeof totalVotesCast === 'number' && typeof totalPlayers === 'number' && (
              <span className="sm:hidden font-mono text-slate-300">
                {totalVotesCast}/{totalPlayers} voted
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
