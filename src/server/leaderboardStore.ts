import fs from 'node:fs';
import path from 'node:path';
import { computePlayerScore, sortLeaderboard } from '../game/rules';
import type { LeaderboardEntry, RoomState } from '../game/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

const SEED_ENTRIES: LeaderboardEntry[] = [
  {
    playerName: 'Maya Chen',
    matchesPlayed: 14,
    wins: 10,
    totalInfections: 6,
    totalAssists: 12,
    bestSurvivalSeconds: 1200,
    totalDistanceMiles: 28.4,
    totalScore: 8420,
    favoriteRole: 'runner',
    lastPlayedAt: Date.now() - 86_400_000,
  },
  {
    playerName: 'Marcus Vance',
    matchesPlayed: 11,
    wins: 8,
    totalInfections: 19,
    totalAssists: 4,
    bestSurvivalSeconds: 940,
    totalDistanceMiles: 24.1,
    totalScore: 7690,
    favoriteRole: 'tank',
    lastPlayedAt: Date.now() - 172_800_000,
  },
  {
    playerName: 'Elena Rostova',
    matchesPlayed: 12,
    wins: 9,
    totalInfections: 3,
    totalAssists: 27,
    bestSurvivalSeconds: 1200,
    totalDistanceMiles: 19.7,
    totalScore: 7150,
    favoriteRole: 'medic',
    lastPlayedAt: Date.now() - 259_200_000,
  },
  {
    playerName: 'Devon Brooks',
    matchesPlayed: 9,
    wins: 6,
    totalInfections: 14,
    totalAssists: 9,
    bestSurvivalSeconds: 1080,
    totalDistanceMiles: 22.8,
    totalScore: 6340,
    favoriteRole: 'speedster',
    lastPlayedAt: Date.now() - 345_600_000,
  },
  {
    playerName: 'Liam OConnor',
    matchesPlayed: 8,
    wins: 5,
    totalInfections: 4,
    totalAssists: 18,
    bestSurvivalSeconds: 1140,
    totalDistanceMiles: 14.2,
    totalScore: 5480,
    favoriteRole: 'defender',
    lastPlayedAt: Date.now() - 432_000_000,
  },
];

function ensureStore(): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(
        LEADERBOARD_FILE,
        JSON.stringify(SEED_ENTRIES, null, 2),
        'utf-8',
      );
      return [...SEED_ENTRIES];
    }
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fallback to seed entries if read fails
  }
  return [...SEED_ENTRIES];
}

export function getLeaderboard(
  sortBy: 'score' | 'infections' | 'wins' = 'score',
): LeaderboardEntry[] {
  const entries = ensureStore();
  return sortLeaderboard(entries, sortBy);
}

export function recordMatchResults(room: RoomState, now: number): LeaderboardEntry[] {
  const entries = ensureStore();

  for (const player of room.players) {
    const matchScore = computePlayerScore(player, room, now);
    const won =
      (room.winner === 'survivors' && player.team === 'survivor') ||
      (room.winner === 'zombies' && player.team === 'zombie');
    const survivedSec =
      player.team === 'survivor' && room.startedAt
        ? Math.max(0, Math.floor((now - room.startedAt) / 1000))
        : Math.floor(player.survivedMs / 1000);

    const existing = entries.find(
      (e) => e.playerName.toLowerCase() === player.name.toLowerCase(),
    );

    if (existing) {
      existing.matchesPlayed += 1;
      if (won) existing.wins += 1;
      existing.totalInfections += player.infectionsCount;
      existing.totalAssists += player.assistsCount;
      existing.bestSurvivalSeconds = Math.max(
        existing.bestSurvivalSeconds,
        survivedSec,
      );
      existing.totalDistanceMiles = Number(
        (existing.totalDistanceMiles + player.distanceMiles).toFixed(2),
      );
      existing.totalScore += matchScore;
      existing.favoriteRole = player.role;
      existing.lastPlayedAt = now;
    } else {
      entries.push({
        playerName: player.name,
        matchesPlayed: 1,
        wins: won ? 1 : 0,
        totalInfections: player.infectionsCount,
        totalAssists: player.assistsCount,
        bestSurvivalSeconds: survivedSec,
        totalDistanceMiles: Number(player.distanceMiles.toFixed(2)),
        totalScore: matchScore,
        favoriteRole: player.role,
        lastPlayedAt: now,
      });
    }
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      LEADERBOARD_FILE,
      JSON.stringify(entries, null, 2),
      'utf-8',
    );
  } catch {
    // Ignore write failure in read-only edge cases
  }

  return sortLeaderboard(entries, 'score');
}
