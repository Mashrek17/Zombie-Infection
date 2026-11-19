import { HUMAN_ROLES, ROLES, getMutatedZombieRole } from './roles';
import type {
  Barrier,
  ClientRoomView,
  ClientVisiblePlayer,
  HumanRoleId,
  LatLng,
  LeaderboardEntry,
  LiveStandingRow,
  MatchConfig,
  MatchWinner,
  Player,
  PlayerRoleId,
  RoomState,
} from './types';

export const MIN_RADIUS_MILES = 0.25;
export const MAX_RADIUS_MILES = 5.0;
export const DRAFT_DURATION_MS = 15_000; // 15 seconds in-game role select + zombie vote
export const INFECTION_REVIVE_WINDOW_MS = 120_000; // 2 minutes before infected turns into zombie
export const DEFAULT_REVEAL_INTERVAL_SECONDS = 120; // 2 minutes
export const REVEAL_WINDOW_MS = 18_000; // 18s live sweep visibility
export const DEFAULT_TAG_RADIUS_METERS = 15;
export const MEDIC_REVIVE_RADIUS_METERS = 35;
export const SURVIVOR_REVIVE_RADIUS_METERS = 15;
export const TANK_LOCKDOWN_TAG_RADIUS_METERS = 35;
export const BARRIER_SLOW_MULTIPLIER = 0.55;
export const TANK_LOCKDOWN_SLOW_MULTIPLIER = 0.7;
export const INFECTED_LIMP_SPEED_MULTIPLIER = 0.65;

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1609.344;

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function clampRadiusMiles(miles: number): number {
  if (!Number.isFinite(miles)) return 1.0;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, Number(miles.toFixed(2))));
}

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinPerimeter(
  point: LatLng,
  center: LatLng,
  radiusMiles: number,
): boolean {
  const clamped = clampRadiusMiles(radiusMiles);
  const distanceMeters = haversineDistanceMeters(point, center);
  return distanceMeters <= milesToMeters(clamped);
}

export function getEffectiveSpeedMultiplier(
  player: Player,
  allPlayers: Player[],
  barriers: Barrier[],
  now: number,
): number {
  if (player.infectionStatus === 'infected_pending') {
    return INFECTED_LIMP_SPEED_MULTIPLIER;
  }

  const roleDef = ROLES[player.role];
  let multiplier = roleDef.passiveSpeedMultiplier;

  if (player.abilityActiveUntil > now && roleDef.speedMultiplier > 1) {
    multiplier = Math.max(multiplier, roleDef.speedMultiplier);
  }

  if (player.team === 'survivor') {
    // Check nearby Medic Adrenaline Surge aura (80m)
    const medicBoosting = allPlayers.some((other) => {
      if (
        other.team !== 'survivor' ||
        other.role !== 'medic' ||
        other.infectionStatus !== 'healthy'
      ) {
        return false;
      }
      if (other.abilityActiveUntil <= now) return false;
      return (
        haversineDistanceMeters(player, other) <=
        ROLES.medic.effectRadiusMeters
      );
    });
    if (medicBoosting) {
      multiplier = Math.max(multiplier, ROLES.medic.speedMultiplier);
    }

    // Check Tank Seismic Lockdown slow unless shielded by Medic surge
    const hasMedicShield = player.shieldUntil > now || medicBoosting;
    if (!hasMedicShield) {
      const tankSlowing = allPlayers.some((other) => {
        if (other.team !== 'zombie' || other.role !== 'tank') return false;
        if (other.abilityActiveUntil <= now) return false;
        return (
          haversineDistanceMeters(player, other) <= ROLES.tank.effectRadiusMeters
        );
      });
      if (tankSlowing || player.slowedUntil > now) {
        multiplier *= TANK_LOCKDOWN_SLOW_MULTIPLIER;
      }
    }
  } else {
    // Zombie slowed inside active Defender Quarantine Barrier
    const insideBarrier = barriers.some(
      (b) =>
        b.expiresAt > now &&
        haversineDistanceMeters(player, b) <= b.radiusMeters,
    );
    if (insideBarrier || player.slowedUntil > now) {
      multiplier *= BARRIER_SLOW_MULTIPLIER;
    }
  }

  return Number(multiplier.toFixed(2));
}

export function getEffectiveTagRadiusMeters(player: Player, now: number): number {
  if (player.team !== 'zombie') return 0;
  const roleDef = ROLES[player.role];
  if (player.role === 'tank' && player.abilityActiveUntil > now) {
    return TANK_LOCKDOWN_TAG_RADIUS_METERS;
  }
  return roleDef.tagRadiusMeters || DEFAULT_TAG_RADIUS_METERS;
}

export function canActivateAbility(
  player: Pick<
    Player,
    'role' | 'abilityUsesRemaining' | 'abilityActiveUntil' | 'abilityCooldownUntil'
  >,
  now: number,
): { ok: boolean; reason?: string } {
  const roleDef = ROLES[player.role];
  if (roleDef.cadence === 'one_time') {
    if ((player.abilityUsesRemaining ?? 0) <= 0) {
      return { ok: false, reason: 'One-time ability already expended this match.' };
    }
  }
  if (player.abilityActiveUntil > now) {
    return { ok: false, reason: 'Ability is already active.' };
  }
  if (player.abilityCooldownUntil > now) {
    const remainingSec = Math.ceil((player.abilityCooldownUntil - now) / 1000);
    return { ok: false, reason: `Recharging (${remainingSec}s remaining).` };
  }
  return { ok: true };
}

export function activatePlayerAbility(
  room: RoomState,
  playerId: string,
  now: number,
): { ok: boolean; reason?: string; eventMessage?: string } {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: 'Player not found.' };
  if (room.status !== 'playing') {
    return { ok: false, reason: 'Abilities can only be activated during an active match.' };
  }
  if (player.infectionStatus === 'infected_pending') {
    return { ok: false, reason: 'You are infected — get revived before your 2m timer expires!' };
  }

  const check = canActivateAbility(player, now);
  if (!check.ok) return check;

  const roleDef = ROLES[player.role];
  player.abilityActiveUntil = now + roleDef.durationMs;
  player.abilityCooldownUntil =
    roleDef.cadence === 'cooldown' ? now + roleDef.cooldownMs : 0;

  if (roleDef.cadence === 'one_time') {
    player.abilityUsesRemaining = Math.max(
      0,
      (player.abilityUsesRemaining ?? 1) - 1,
    );
  }

  let eventMessage = `${player.name} (${roleDef.name}) activated ${roleDef.abilityName}!`;

  if (player.role === 'medic') {
    let boostedCount = 0;
    let revivedCount = 0;
    for (const ally of room.players) {
      if (ally.team !== 'survivor') continue;
      if (
        haversineDistanceMeters(player, ally) <= roleDef.effectRadiusMeters
      ) {
        if (ally.infectionStatus === 'infected_pending') {
          ally.infectionStatus = 'healthy';
          ally.infectedPendingUntil = null;
          ally.infectedByPlayerId = null;
          revivedCount += 1;
        }
        ally.shieldUntil = Math.max(ally.shieldUntil, now + roleDef.durationMs);
        ally.slowedUntil = 0;
        if (ally.id !== player.id) boostedCount += 1;
      }
    }
    player.assistsCount += boostedCount + revivedCount;
    eventMessage = `${player.name} triggered Adrenaline Surge (${boostedCount} allies shielded${revivedCount > 0 ? `, ${revivedCount} revived` : ''}).`;
  } else if (player.role === 'defender') {
    const barrier: Barrier = {
      id: `bar_${now}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: player.id,
      ownerName: player.name,
      lat: player.lat,
      lng: player.lng,
      radiusMeters: roleDef.effectRadiusMeters,
      createdAt: now,
      expiresAt: now + roleDef.durationMs,
    };
    room.barriers.push(barrier);
    eventMessage = `${player.name} deployed a ${roleDef.effectRadiusMeters}m Quarantine Barrier!`;
  } else if (player.role === 'tank') {
    // Tank Seismic Lockdown shatters nearby Defender barriers and slows nearby unshielded humans
    const beforeCount = room.barriers.length;
    room.barriers = room.barriers.filter(
      (b) =>
        haversineDistanceMeters(player, b) >
        roleDef.effectRadiusMeters + b.radiusMeters * 0.5,
    );
    const shattered = beforeCount - room.barriers.length;
    for (const target of room.players) {
      if (target.team !== 'survivor') continue;
      if (target.shieldUntil > now) continue;
      if (
        haversineDistanceMeters(player, target) <= roleDef.effectRadiusMeters
      ) {
        target.slowedUntil = Math.max(
          target.slowedUntil,
          now + roleDef.durationMs,
        );
      }
    }
    eventMessage = `${player.name} triggered Seismic Lockdown (35m tag reach${shattered > 0 ? `, shattered ${shattered} barrier` : ''})!`;
  } else if (player.role === 'stalker') {
    room.blackoutUntil = now + roleDef.durationMs;
    eventMessage = `${player.name} unleashed Blackout Ambush — zombie radar signatures scrambled for 25s!`;
  }

  return { ok: true, eventMessage };
}

export function isRadarRevealWindowActive(
  room: Pick<RoomState, 'revealActiveUntil'>,
  now: number,
): boolean {
  return room.revealActiveUntil !== null && room.revealActiveUntil > now;
}

export function isPlayerLocationVisibleToViewer(
  target: Player,
  viewer: Player,
  room: RoomState,
  now: number,
): boolean {
  if (room.status !== 'playing') return true;
  if (target.id === viewer.id) return true;
  if (target.team === viewer.team) return true;

  // Viewer is Zombie looking for a Survivor
  if (viewer.team === 'zombie' && target.team === 'survivor') {
    // Runner Ghost Sprint cloaks from radar sweeps
    const isRunnerCloaked =
      target.role === 'runner' && target.abilityActiveUntil > now;
    if (isRunnerCloaked) return false;

    // 2-minute global radar reveal window
    if (isRadarRevealWindowActive(room, now)) return true;

    // Speedster Bloodlust Scent Trail detects within 200m
    if (
      viewer.role === 'speedster' &&
      viewer.abilityActiveUntil > now &&
      haversineDistanceMeters(viewer, target) <=
        ROLES.speedster.effectRadiusMeters
    ) {
      return true;
    }

    // Close visual sightline (within 40m)
    if (haversineDistanceMeters(viewer, target) <= 40) return true;

    return false;
  }

  // Viewer is Survivor looking at a Zombie
  if (viewer.team === 'survivor' && target.team === 'zombie') {
    // Stalker Blackout Ambush hides all zombie blips
    if (room.blackoutUntil !== null && room.blackoutUntil > now) {
      return false;
    }
    return true;
  }

  return true;
}

export function filterRoomStateForPlayer(
  room: RoomState,
  viewerId: string,
  now: number,
): ClientRoomView {
  const viewer = room.players.find((p) => p.id === viewerId) ?? room.players[0];

  const visiblePlayers: ClientVisiblePlayer[] = room.players.map((p) => {
    const visible = viewer
      ? isPlayerLocationVisibleToViewer(p, viewer, room, now)
      : true;
    return {
      ...p,
      lat: visible ? p.lat : null,
      lng: visible ? p.lng : null,
      locationHidden: !visible,
      effectiveSpeedMultiplier: getEffectiveSpeedMultiplier(
        p,
        room.players,
        room.barriers,
        now,
      ),
      effectiveTagRadiusMeters: getEffectiveTagRadiusMeters(p, now),
    };
  });

  return {
    ...room,
    players: visiblePlayers,
    selfPlayerId: viewerId,
    serverNow: now,
  };
}

export function resolveDraftAndVotes(
  room: RoomState,
  randomFn: () => number = Math.random,
): { chosenZombies: Player[]; eventMessage: string } {
  const voteCounts: Record<string, number> = {};
  for (const targetId of Object.values(room.zombieVotes)) {
    if (room.players.some((p) => p.id === targetId)) {
      voteCounts[targetId] = (voteCounts[targetId] ?? 0) + 1;
    }
  }

  const targetZombieCount = Math.min(
    Math.max(1, room.config.startingZombieCount || 1),
    Math.max(1, room.players.length - 1),
  );

  // Sort candidates by vote count descending, with deterministic/random tie-breaker
  const candidates = [...room.players].sort((a, b) => {
    const diff = (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0);
    if (diff !== 0) return diff;
    // Prefer already-assigned zombie if 0 votes, else random
    if (a.team !== b.team) return a.team === 'zombie' ? -1 : 1;
    return randomFn() - 0.5;
  });

  const chosenZombieIds = new Set<string>();
  const hasAnyVotes = Object.keys(voteCounts).length > 0;
  if (hasAnyVotes) {
    for (const p of candidates) {
      if (chosenZombieIds.size >= targetZombieCount) break;
      chosenZombieIds.add(p.id);
    }
  } else {
    // Preserve pre-marked zombies if any, else pick randomly (non-host preferred)
    for (const p of room.players) {
      if (p.team === 'zombie' && chosenZombieIds.size < targetZombieCount) {
        chosenZombieIds.add(p.id);
      }
    }
    while (chosenZombieIds.size < targetZombieCount && room.players.length > 1) {
      const pool = room.players.filter((p) => !chosenZombieIds.has(p.id));
      const nonHostPool = pool.filter((p) => !p.isHost);
      const source = nonHostPool.length > 0 ? nonHostPool : pool;
      const pick = source[Math.floor(randomFn() * source.length)];
      if (!pick) break;
      chosenZombieIds.add(pick.id);
    }
  }

  const chosenZombies: Player[] = [];
  for (const p of room.players) {
    if (chosenZombieIds.has(p.id)) {
      p.team = 'zombie';
      p.infectionStatus = 'zombie';
      p.infectedPendingUntil = null;
      p.infectedByPlayerId = null;
      if (ROLES[p.role].team !== 'zombie') {
        p.role = getMutatedZombieRole(p.role);
      }
      p.abilityUsesRemaining =
        ROLES[p.role].cadence === 'one_time' ? 1 : null;
      chosenZombies.push(p);
    } else {
      p.team = 'survivor';
      p.infectionStatus = 'healthy';
      p.infectedPendingUntil = null;
      p.infectedByPlayerId = null;
      if (!p.hasSelectedRole || ROLES[p.role].team !== 'survivor') {
        const randRole =
          HUMAN_ROLES[Math.floor(randomFn() * HUMAN_ROLES.length)] ??
          HUMAN_ROLES[0];
        p.role = randRole.id as HumanRoleId;
      }
      p.abilityUsesRemaining =
        ROLES[p.role].cadence === 'one_time' ? 1 : null;
    }
  }

  const zombieNames = chosenZombies.map((z) => z.name).join(', ');
  const eventMessage = hasAnyVotes
    ? `Draft complete! Players voted ${zombieNames} as Patient Zero. Unchosen runner roles randomly assigned.`
    : `Draft complete! ${zombieNames} became Patient Zero and unchosen survivor roles were randomly assigned.`;

  return { chosenZombies, eventMessage };
}

export function tagSurvivor(
  room: RoomState,
  taggerId: string | null,
  targetId: string,
  now: number,
  options?: { forceSelfReport?: boolean },
): { ok: boolean; reason?: string; eventMessage?: string } {
  if (room.status !== 'playing') {
    return { ok: false, reason: 'Match is not active.' };
  }

  const target = room.players.find((p) => p.id === targetId);
  if (!target) return { ok: false, reason: 'Target player not found.' };
  if (target.team === 'zombie' || target.infectionStatus === 'zombie') {
    return { ok: false, reason: `${target.name} is already a zombie.` };
  }
  if (target.infectionStatus === 'infected_pending') {
    return {
      ok: false,
      reason: `${target.name} is already infected and incubating (2-min revive timer active).`,
    };
  }

  let tagger: Player | undefined;
  if (taggerId) {
    tagger = room.players.find((p) => p.id === taggerId);
    if (!tagger || tagger.team !== 'zombie') {
      return { ok: false, reason: 'Only zombies can tag survivors.' };
    }

    if (!options?.forceSelfReport) {
      const dist = haversineDistanceMeters(tagger, target);
      const reach = getEffectiveTagRadiusMeters(tagger, now);
      if (dist > reach) {
        return {
          ok: false,
          reason: `Out of tag reach (${Math.round(dist)}m away; max ${reach}m).`,
        };
      }
      if (target.shieldUntil > now) {
        target.shieldUntil = 0;
        return {
          ok: false,
          reason: `${target.name}'s Medic Adrenaline Shield absorbed the tag!`,
        };
      }
    }
  }

  target.infectionStatus = 'infected_pending';
  target.infectedPendingUntil = now + INFECTION_REVIVE_WINDOW_MS;
  target.infectedByPlayerId = tagger?.id ?? null;
  target.infectedAt = now;
  target.abilityActiveUntil = 0;

  const eventMessage = tagger
    ? `${tagger.name} infected ${target.name}! Teammates have 2:00 to revive ${target.name} before they turn into a Zombie.`
    : `${target.name} was tagged! 2:00 remaining for a teammate or Medic to revive them before turning into a Zombie.`;

  return { ok: true, eventMessage };
}

export function reviveInfectedPlayer(
  room: RoomState,
  reviverId: string,
  targetId: string,
  now: number,
): { ok: boolean; reason?: string; eventMessage?: string } {
  if (room.status !== 'playing') {
    return { ok: false, reason: 'Match is not active.' };
  }

  const reviver = room.players.find((p) => p.id === reviverId);
  const target = room.players.find((p) => p.id === targetId);
  if (!reviver || !target) {
    return { ok: false, reason: 'Player not found.' };
  }
  if (reviver.team !== 'survivor' || reviver.infectionStatus !== 'healthy') {
    return { ok: false, reason: 'Only healthy survivors can revive infected allies.' };
  }
  if (target.infectionStatus !== 'infected_pending') {
    return { ok: false, reason: `${target.name} does not need revival.` };
  }
  if (target.infectedPendingUntil !== null && now >= target.infectedPendingUntil) {
    return { ok: false, reason: 'Revival window expired — player has turned.' };
  }

  const maxReach =
    reviver.role === 'medic'
      ? MEDIC_REVIVE_RADIUS_METERS
      : SURVIVOR_REVIVE_RADIUS_METERS;
  const dist = haversineDistanceMeters(reviver, target);
  if (dist > maxReach) {
    return {
      ok: false,
      reason: `Move closer to revive ${target.name} (${Math.round(dist)}m away; max ${maxReach}m).`,
    };
  }

  const secsRemaining = target.infectedPendingUntil
    ? Math.max(0, Math.ceil((target.infectedPendingUntil - now) / 1000))
    : 0;

  target.infectionStatus = 'healthy';
  target.infectedPendingUntil = null;
  target.infectedByPlayerId = null;
  target.shieldUntil = now + 10_000; // 10s post-revive protection
  reviver.assistsCount += 1;

  return {
    ok: true,
    eventMessage: `${reviver.name} revived ${target.name} with ${secsRemaining}s left before turning!`,
  };
}

export function processExpiredInfections(
  room: RoomState,
  now: number,
): string[] {
  if (room.status !== 'playing') return [];
  const messages: string[] = [];

  for (const target of room.players) {
    if (
      target.infectionStatus === 'infected_pending' &&
      target.infectedPendingUntil !== null &&
      now >= target.infectedPendingUntil
    ) {
      const previousRole = target.role as HumanRoleId;
      const mutatedRole = getMutatedZombieRole(previousRole);

      if (target.infectedByPlayerId) {
        const tagger = room.players.find(
          (p) => p.id === target.infectedByPlayerId,
        );
        if (tagger) tagger.infectionsCount += 1;
      }

      target.team = 'zombie';
      target.infectionStatus = 'zombie';
      target.role = mutatedRole;
      target.infectedPendingUntil = null;
      target.infectedByPlayerId = null;
      target.voiceChannel = 'team';
      target.abilityActiveUntil = 0;
      target.abilityCooldownUntil = 0;
      target.abilityUsesRemaining =
        ROLES[mutatedRole].cadence === 'one_time' ? 1 : null;
      target.shieldUntil = 0;
      target.slowedUntil = 0;
      if (room.startedAt) {
        target.survivedMs = Math.max(0, now - room.startedAt);
      }

      messages.push(
        `2:00 revival timer expired — ${target.name} turned into a ${ROLES[mutatedRole].name} Zombie!`,
      );
    }
  }

  return messages;
}

export function evaluateMatchOutcome(
  room: RoomState,
  now: number,
): { ended: boolean; winner: MatchWinner } {
  if (room.status !== 'playing') {
    return { ended: room.status === 'ended', winner: room.winner };
  }

  const survivorsRemaining = room.players.filter(
    (p) => p.team === 'survivor',
  ).length;

  if (survivorsRemaining === 0 && room.players.length > 0) {
    return { ended: true, winner: 'zombies' };
  }

  if (room.endsAt !== null && now >= room.endsAt) {
    return {
      ended: true,
      winner: survivorsRemaining > 0 ? 'survivors' : 'zombies',
    };
  }

  return { ended: false, winner: null };
}

export function computePlayerScore(
  player: Pick<
    Player,
    'team' | 'survivedMs' | 'infectionsCount' | 'assistsCount' | 'distanceMiles'
  >,
  room: Pick<RoomState, 'startedAt' | 'status' | 'endsAt' | 'winner'>,
  now: number,
): number {
  const survivedSec =
    player.team === 'survivor' && room.startedAt
      ? Math.max(0, Math.floor(((room.status === 'ended' && room.endsAt ? Math.min(now, room.endsAt) : now) - room.startedAt) / 1000))
      : Math.floor(player.survivedMs / 1000);

  const survivalPoints = Math.floor(survivedSec / 10) * 5;
  const infectionPoints = player.infectionsCount * 150;
  const assistPoints = player.assistsCount * 50;
  const distancePoints = Math.round(player.distanceMiles * 40);
  const victoryBonus =
    room.status === 'ended' &&
    ((room.winner === 'survivors' && player.team === 'survivor') ||
      (room.winner === 'zombies' && player.team === 'zombie'))
      ? 250
      : 0;

  return (
    survivalPoints +
    infectionPoints +
    assistPoints +
    distancePoints +
    victoryBonus
  );
}

export function buildLiveStandings(
  room: Pick<RoomState, 'startedAt' | 'status' | 'endsAt' | 'winner'> & {
    players: Array<
      Pick<
        Player,
        | 'id'
        | 'name'
        | 'team'
        | 'role'
        | 'infectionsCount'
        | 'assistsCount'
        | 'distanceMiles'
        | 'survivedMs'
      >
    >;
  },
  selfPlayerId: string,
  now: number,
): LiveStandingRow[] {
  return room.players
    .map((p) => {
      const survivedSeconds =
        p.team === 'survivor' && room.startedAt
          ? Math.max(
              0,
              Math.floor(
                ((room.status === 'ended' && room.endsAt
                  ? Math.min(now, room.endsAt)
                  : now) -
                  room.startedAt) /
                  1000,
              ),
            )
          : Math.floor(p.survivedMs / 1000);

      return {
        playerId: p.id,
        name: p.name,
        team: p.team,
        role: p.role,
        infectionsCount: p.infectionsCount,
        assistsCount: p.assistsCount,
        survivedSeconds,
        distanceMiles: Number(p.distanceMiles.toFixed(2)),
        score: computePlayerScore(p, room, now),
        isSelf: p.id === selfPlayerId,
      };
    })
    .sort((a, b) => b.score - a.score || b.infectionsCount - a.infectionsCount);
}

export function sortLeaderboard(
  entries: LeaderboardEntry[],
  sortBy: 'score' | 'infections' | 'wins' = 'score',
): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (sortBy === 'infections') {
      return b.totalInfections - a.totalInfections || b.totalScore - a.totalScore;
    }
    if (sortBy === 'wins') {
      return b.wins - a.wins || b.totalScore - a.totalScore;
    }
    return b.totalScore - a.totalScore || b.wins - a.wins;
  });
}

export function getDefaultMatchConfig(center: LatLng): MatchConfig {
  return {
    roomName: 'Sector 7 Outbreak',
    maxPlayers: 12,
    radiusMiles: 2.0,
    durationMinutes: 20,
    revealIntervalSeconds: DEFAULT_REVEAL_INTERVAL_SECONDS,
    startingZombieCount: 1,
    center,
  };
}

export function createInitialPlayer(params: {
  id: string;
  name: string;
  team: 'survivor' | 'zombie';
  role: PlayerRoleId;
  hasSelectedRole?: boolean;
  lat: number;
  lng: number;
  isHost: boolean;
  isFieldProxy?: boolean;
  now: number;
}): Player {
  const roleDef = ROLES[params.role];
  return {
    id: params.id,
    name: params.name,
    team: params.team,
    role: params.role,
    hasSelectedRole: Boolean(params.hasSelectedRole),
    infectionStatus: params.team === 'zombie' ? 'zombie' : 'healthy',
    infectedPendingUntil: null,
    infectedByPlayerId: null,
    lat: params.lat,
    lng: params.lng,
    accuracyMeters: 8,
    headingDeg: null,
    speedMps: 0,
    lastUpdatedAt: params.now,
    lastKnownPing: null,
    lastPingAt: null,
    isConnected: !params.isFieldProxy,
    isHost: params.isHost,
    isFieldProxy: Boolean(params.isFieldProxy),
    abilityActiveUntil: 0,
    abilityCooldownUntil: 0,
    abilityUsesRemaining: roleDef.cadence === 'one_time' ? 1 : null,
    shieldUntil: 0,
    slowedUntil: 0,
    infectionsCount: 0,
    assistsCount: 0,
    distanceMiles: 0,
    survivedMs: 0,
    infectedAt: null,
    outOfBounds: false,
    voiceMuted: true,
    voiceSpeaking: false,
    voiceChannel: 'team',
  };
}
