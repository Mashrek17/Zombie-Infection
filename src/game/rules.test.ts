import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INFECTION_REVIVE_WINDOW_MS,
  MAX_RADIUS_MILES,
  MIN_RADIUS_MILES,
  REVEAL_WINDOW_MS,
  activatePlayerAbility,
  clampRadiusMiles,
  createInitialPlayer,
  evaluateMatchOutcome,
  filterRoomStateForPlayer,
  getDefaultMatchConfig,
  getEffectiveSpeedMultiplier,
  getEffectiveTagRadiusMeters,
  haversineDistanceMeters,
  isWithinPerimeter,
  milesToMeters,
  processExpiredInfections,
  resolveDraftAndVotes,
  reviveInfectedPlayer,
  tagSurvivor,
} from './rules';
import type { RoomState } from './types';

const CENTER = { lat: 37.7749, lng: -122.4194 };

function makeRoom(now = 1_000_000): RoomState {
  const host = createInitialPlayer({
    id: 'p1',
    name: 'Alex',
    team: 'survivor',
    role: 'medic',
    hasSelectedRole: true,
    lat: CENTER.lat,
    lng: CENTER.lng,
    isHost: true,
    now,
  });
  const runner = createInitialPlayer({
    id: 'p2',
    name: 'Maya',
    team: 'survivor',
    role: 'runner',
    hasSelectedRole: true,
    lat: CENTER.lat + 0.002, // ~222m north
    lng: CENTER.lng,
    isHost: false,
    now,
  });
  const defender = createInitialPlayer({
    id: 'p3',
    name: 'Liam',
    team: 'survivor',
    role: 'defender',
    hasSelectedRole: false,
    lat: CENTER.lat,
    lng: CENTER.lng + 0.0001, // ~8m east
    isHost: false,
    now,
  });
  const tank = createInitialPlayer({
    id: 'z1',
    name: 'Vex',
    team: 'zombie',
    role: 'tank',
    hasSelectedRole: true,
    lat: CENTER.lat,
    lng: CENTER.lng + 0.0002, // ~17m east
    isHost: false,
    now,
  });

  return {
    roomCode: 'ZMB101',
    config: { ...getDefaultMatchConfig(CENTER), radiusMiles: 5.0 },
    status: 'playing',
    winner: null,
    createdAt: now - 10_000,
    draftEndsAt: null,
    zombieVotes: {},
    startedAt: now,
    endsAt: now + 20 * 60_000,
    nextRevealAt: now + 120_000,
    revealActiveUntil: null,
    blackoutUntil: null,
    players: [host, runner, defender, tank],
    barriers: [],
    events: [],
  };
}

test('clamps perimeter radius strictly up to 5 miles maximum', () => {
  assert.equal(clampRadiusMiles(12.5), MAX_RADIUS_MILES);
  assert.equal(clampRadiusMiles(0.05), MIN_RADIUS_MILES);
  assert.equal(clampRadiusMiles(3.5), 3.5);
});

test('isWithinPerimeter enforces 5-mile boundary using Haversine distance', () => {
  assert.equal(isWithinPerimeter(CENTER, CENTER, 5.0), true);
  const farPoint = { lat: CENTER.lat + 0.1, lng: CENTER.lng };
  assert.equal(isWithinPerimeter(farPoint, CENTER, 5.0), false);
  const insidePoint = { lat: CENTER.lat + 0.05, lng: CENTER.lng };
  assert.equal(isWithinPerimeter(insidePoint, CENTER, 5.0), true);
  assert.ok(haversineDistanceMeters(CENTER, insidePoint) < milesToMeters(5.0));
});

test('15s draft resolves zombie votes and randomly assigns unchosen runner roles', () => {
  const now = 500_000;
  const room = makeRoom(now);
  room.status = 'drafting';
  // Reset p3 to unchosen and z1 back to survivor before vote
  const p3 = room.players.find((p) => p.id === 'p3')!;
  const z1 = room.players.find((p) => p.id === 'z1')!;
  z1.team = 'survivor';
  z1.infectionStatus = 'healthy';
  z1.role = 'runner';
  p3.hasSelectedRole = false;

  // Players vote for p2 (Maya) to be the starting zombie
  room.zombieVotes = {
    p1: 'p2',
    p3: 'p2',
    z1: 'p1',
  };

  const result = resolveDraftAndVotes(room, () => 0.1);
  assert.equal(result.chosenZombies.length, 1);
  assert.equal(result.chosenZombies[0].id, 'p2');
  assert.equal(room.players.find((p) => p.id === 'p2')!.team, 'zombie');
  // p1 had selected medic and kept it
  assert.equal(room.players.find((p) => p.id === 'p1')!.role, 'medic');
  // p3 had not selected a role and got randomly assigned a survivor role
  assert.ok(['medic', 'runner', 'defender'].includes(p3.role));
});

test('2-minute radar reveal controls survivor visibility to zombies and Runner Ghost Sprint cloaks', () => {
  const now = 1_000_000;
  const room = makeRoom(now);

  let zombieView = filterRoomStateForPlayer(room, 'z1', now);
  const hiddenRunner = zombieView.players.find((p) => p.id === 'p2')!;
  assert.equal(hiddenRunner.locationHidden, true);
  assert.equal(hiddenRunner.lat, null);

  room.revealActiveUntil = now + REVEAL_WINDOW_MS;
  zombieView = filterRoomStateForPlayer(room, 'z1', now + 1000);
  const revealedRunner = zombieView.players.find((p) => p.id === 'p2')!;
  assert.equal(revealedRunner.locationHidden, false);
  assert.ok(revealedRunner.lat !== null);

  const abilityRes = activatePlayerAbility(room, 'p2', now + 1500);
  assert.equal(abilityRes.ok, true);
  zombieView = filterRoomStateForPlayer(room, 'z1', now + 2000);
  const cloakedRunner = zombieView.players.find((p) => p.id === 'p2')!;
  assert.equal(cloakedRunner.locationHidden, true);
});

test('Medic Adrenaline Surge boosts nearby humans, shields, and revives infected allies', () => {
  const now = 2_000_000;
  const room = makeRoom(now);

  // Infect defender first
  const tagRes = tagSurvivor(room, 'z1', 'p3', now);
  assert.equal(tagRes.ok, true);
  const defender = room.players.find((p) => p.id === 'p3')!;
  assert.equal(defender.infectionStatus, 'infected_pending');

  // Medic triggers Adrenaline Surge -> revives and shields nearby defender
  const surge = activatePlayerAbility(room, 'p1', now + 500);
  assert.equal(surge.ok, true);
  assert.equal(defender.infectionStatus, 'healthy');
  assert.equal(defender.infectedPendingUntil, null);

  const mult = getEffectiveSpeedMultiplier(defender, room.players, room.barriers, now + 1000);
  assert.equal(mult, 1.25);
  assert.ok(defender.shieldUntil > now);
});

test('Defender places Quarantine Barrier that slows zombies, and Tank Seismic Lockdown expands tag reach to 35m', () => {
  const now = 3_000_000;
  const room = makeRoom(now);

  const barRes = activatePlayerAbility(room, 'p3', now);
  assert.equal(barRes.ok, true);
  assert.equal(room.barriers.length, 1);

  const tank = room.players.find((p) => p.id === 'z1')!;
  const slowedTankMult = getEffectiveSpeedMultiplier(tank, room.players, room.barriers, now + 500);
  assert.ok(slowedTankMult < 1.0);

  const lockRes = activatePlayerAbility(room, 'z1', now + 1000);
  assert.equal(lockRes.ok, true);
  assert.equal(room.barriers.length, 0);
  assert.equal(getEffectiveTagRadiusMeters(tank, now + 2000), 35);
});

test('Stalker Blackout Ambush is strictly one-time per game and hides zombies from survivors', () => {
  const now = 4_000_000;
  const room = makeRoom(now);
  const stalker = createInitialPlayer({
    id: 'z2',
    name: 'Shade',
    team: 'zombie',
    role: 'stalker',
    lat: CENTER.lat,
    lng: CENTER.lng + 0.001,
    isHost: false,
    now,
  });
  room.players.push(stalker);

  const firstUse = activatePlayerAbility(room, 'z2', now);
  assert.equal(firstUse.ok, true);

  const humanView = filterRoomStateForPlayer(room, 'p1', now + 1000);
  const hiddenStalker = humanView.players.find((p) => p.id === 'z2')!;
  assert.equal(hiddenStalker.locationHidden, true);

  const secondUse = activatePlayerAbility(room, 'z2', now + 30_000);
  assert.equal(secondUse.ok, false);
});

test('Infected player has 2 minutes to be revived; turns into zombie if timer expires', () => {
  const now = 5_000_000;
  const room = makeRoom(now);

  // Tag Liam (p3) -> enters 2-minute infected_pending window
  const tagRes = tagSurvivor(room, 'z1', 'p3', now + 5000);
  assert.equal(tagRes.ok, true);

  const defender = room.players.find((p) => p.id === 'p3')!;
  assert.equal(defender.team, 'survivor');
  assert.equal(defender.infectionStatus, 'infected_pending');
  assert.equal(defender.infectedPendingUntil, now + 5000 + INFECTION_REVIVE_WINDOW_MS);

  // Direct revival by nearby Medic (p1 is ~8m away, within 35m Medic reach)
  const reviveRes = reviveInfectedPlayer(room, 'p1', 'p3', now + 30_000);
  assert.equal(reviveRes.ok, true);
  assert.equal(defender.infectionStatus, 'healthy');
  assert.equal(room.players.find((p) => p.id === 'p1')!.assistsCount, 1);

  // Tag again after shield expires and let 2 minutes run out
  defender.shieldUntil = 0;
  const reTag = tagSurvivor(room, 'z1', 'p3', now + 40_000);
  assert.equal(reTag.ok, true);

  const expiredMsgs = processExpiredInfections(
    room,
    now + 40_000 + INFECTION_REVIVE_WINDOW_MS + 100,
  );
  assert.equal(expiredMsgs.length, 1);
  assert.equal(defender.team, 'zombie');
  assert.equal(defender.infectionStatus, 'zombie');
  assert.equal(defender.role, 'tank'); // defender mutates into tank
  assert.equal(room.players.find((p) => p.id === 'z1')!.infectionsCount, 1);
});

test('Win conditions award Survivors when timer expires with survivors left, and Zombies when 0 remain', () => {
  const now = 6_000_000;
  const room = makeRoom(now);

  let outcome = evaluateMatchOutcome(room, room.endsAt! + 100);
  assert.equal(outcome.ended, true);
  assert.equal(outcome.winner, 'survivors');

  for (const p of room.players) {
    if (p.team === 'survivor') {
      p.team = 'zombie';
      p.infectionStatus = 'zombie';
    }
  }
  outcome = evaluateMatchOutcome(room, now + 10_000);
  assert.equal(outcome.ended, true);
  assert.equal(outcome.winner, 'zombies');
});
