import type { HumanRoleId, PlayerRoleId, RoleDefinition, ZombieRoleId } from './types';

export const ROLES: Record<PlayerRoleId, RoleDefinition> = {
  medic: {
    id: 'medic',
    team: 'survivor',
    name: 'Medic',
    tagline: 'Squad Support & Field Recovery',
    abilityName: 'Adrenaline Surge',
    abilityDescription:
      'Projects an 80m recovery aura for 18s, boosting nearby survivors by +25% speed, clearing slows, and granting a temporary tag-shield buffer.',
    cadence: 'cooldown',
    cooldownMs: 75_000,
    durationMs: 18_000,
    effectRadiusMeters: 80,
    speedMultiplier: 1.25,
    passiveSpeedMultiplier: 1.0,
    tagRadiusMeters: 0,
    mutatesTo: 'stalker',
    strategyTip:
      'Coordinate over team voice chat before the 2-minute radar sweep so allies can rally inside your 80m aura and sprint clear together.',
  },
  runner: {
    id: 'runner',
    team: 'survivor',
    name: 'Runner',
    tagline: 'High-Speed Evasion & Radar Cloak',
    abilityName: 'Ghost Sprint',
    abilityDescription:
      'Grants +45% burst speed for 12s and masks your GPS signature from the 2-minute survivor radar reveal while active.',
    cadence: 'cooldown',
    cooldownMs: 60_000,
    durationMs: 12_000,
    effectRadiusMeters: 0,
    speedMultiplier: 1.45,
    passiveSpeedMultiplier: 1.08,
    tagRadiusMeters: 0,
    mutatesTo: 'speedster',
    strategyTip:
      'Trigger Ghost Sprint 3 seconds before the 2-minute sweep hits 00:00 to deny zombies your coordinates and break line-of-sight.',
  },
  defender: {
    id: 'defender',
    team: 'survivor',
    name: 'Defender',
    tagline: 'Chokepoint Control & Barrier Deployment',
    abilityName: 'Quarantine Barrier',
    abilityDescription:
      'Deploys a 65m tactical barrier for 45s at your location that slows entering zombies by 45% and alerts the squad on breach.',
    cadence: 'cooldown',
    cooldownMs: 90_000,
    durationMs: 45_000,
    effectRadiusMeters: 65,
    speedMultiplier: 1.0,
    passiveSpeedMultiplier: 0.98,
    tagRadiusMeters: 0,
    mutatesTo: 'tank',
    strategyTip:
      'Drop barriers across park trail intersections, bridges, or alleys to choke off pursuing Speedsters while your squad relocates.',
  },
  speedster: {
    id: 'speedster',
    team: 'zombie',
    name: 'Speedster',
    tagline: 'Relentless Pursuit & Scent Tracking',
    abilityName: 'Bloodlust Frenzy',
    abilityDescription:
      'Surges movement speed by +40% for 14s and detects live survivor GPS trails within 200m even between 2-minute sweeps.',
    cadence: 'cooldown',
    cooldownMs: 65_000,
    durationMs: 14_000,
    effectRadiusMeters: 200,
    speedMultiplier: 1.4,
    passiveSpeedMultiplier: 1.12,
    tagRadiusMeters: 15,
    strategyTip:
      'Flank around Defender barriers and trigger Bloodlust right after a 2-minute ping fades to stay locked on fleeing Runners.',
  },
  tank: {
    id: 'tank',
    team: 'zombie',
    name: 'Tank',
    tagline: 'Extended Capture Reach & Crowd Lockdown',
    abilityName: 'Seismic Lockdown',
    abilityDescription:
      'Expands tag capture reach to 35m for 15s, slows nearby survivors within 90m by 30%, and shatters Quarantine Barriers in range.',
    cadence: 'cooldown',
    cooldownMs: 90_000,
    durationMs: 15_000,
    effectRadiusMeters: 90,
    speedMultiplier: 1.05,
    passiveSpeedMultiplier: 0.94,
    tagRadiusMeters: 35,
    strategyTip:
      'Lead coordinated pushes against Medic-Defender clusters; your 35m capture radius makes tight evasions nearly impossible.',
  },
  stalker: {
    id: 'stalker',
    team: 'zombie',
    name: 'Stalker',
    tagline: 'Silent Ambush & Tactical Radar Blackout',
    abilityName: 'Blackout Ambush',
    abilityDescription:
      'One-time per match: erases all zombie GPS blips from survivor radar for 25s while granting +25% ambush speed.',
    cadence: 'one_time',
    cooldownMs: 0,
    durationMs: 25_000,
    effectRadiusMeters: 0,
    speedMultiplier: 1.25,
    passiveSpeedMultiplier: 1.04,
    tagRadiusMeters: 20,
    strategyTip:
      'Save your single Blackout Ambush for the final 3 minutes when survivors try to kite the edge of the 5-mile zone.',
  },
};

export const HUMAN_ROLES: RoleDefinition[] = [
  ROLES.medic,
  ROLES.runner,
  ROLES.defender,
];

export const ZOMBIE_ROLES: RoleDefinition[] = [
  ROLES.speedster,
  ROLES.tank,
  ROLES.stalker,
];

export function getRolesForTeam(team: 'survivor' | 'zombie'): RoleDefinition[] {
  return team === 'survivor' ? HUMAN_ROLES : ZOMBIE_ROLES;
}

export function getMutatedZombieRole(humanRole: HumanRoleId | PlayerRoleId): ZombieRoleId {
  if (humanRole === 'medic') return 'stalker';
  if (humanRole === 'defender') return 'tank';
  return 'speedster';
}
