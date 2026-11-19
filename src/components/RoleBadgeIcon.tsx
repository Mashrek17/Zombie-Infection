import React from 'react';
import {
  Cross,
  EyeOff,
  Flame,
  Shield,
  Skull,
  Zap,
} from 'lucide-react';
import type { PlayerRoleId } from '../game/types';

export function BiohazardRadarLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="20"
        cy="20"
        r="17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeOpacity="0.35"
      />
      <circle
        cx="20"
        cy="20"
        r="11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeOpacity="0.65"
      />
      <path
        d="M20 3V11M20 29V37M3 20H11M29 20H37"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
      <path
        d="M20 20L30.5 9.5"
        stroke="#10B981"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="3.2" fill="#EF4444" />
    </svg>
  );
}

export function RoleIcon({
  role,
  className = 'w-4 h-4',
}: {
  role: PlayerRoleId;
  className?: string;
}) {
  switch (role) {
    case 'medic':
      return <Cross className={className} aria-hidden="true" />;
    case 'runner':
      return <Zap className={className} aria-hidden="true" />;
    case 'defender':
      return <Shield className={className} aria-hidden="true" />;
    case 'speedster':
      return <Flame className={className} aria-hidden="true" />;
    case 'tank':
      return <Skull className={className} aria-hidden="true" />;
    case 'stalker':
      return <EyeOff className={className} aria-hidden="true" />;
  }
}

export function formatSecondsClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
