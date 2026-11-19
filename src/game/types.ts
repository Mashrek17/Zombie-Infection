export type Team = 'survivor' | 'zombie';

export type HumanRoleId = 'medic' | 'runner' | 'defender';
export type ZombieRoleId = 'speedster' | 'tank' | 'stalker';
export type PlayerRoleId = HumanRoleId | ZombieRoleId;

export type AbilityCadence = 'cooldown' | 'one_time';

export interface RoleDefinition {
  id: PlayerRoleId;
  team: Team;
  name: string;
  tagline: string;
  abilityName: string;
  abilityDescription: string;
  cadence: AbilityCadence;
  cooldownMs: number;
  durationMs: number;
  effectRadiusMeters: number;
  speedMultiplier: number;
  passiveSpeedMultiplier: number;
  tagRadiusMeters: number;
  mutatesTo?: ZombieRoleId;
  strategyTip: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type VoiceChannel = 'team' | 'all';
export type InfectionStatus = 'healthy' | 'infected_pending' | 'zombie';

export interface Player {
  id: string;
  name: string;
  team: Team;
  role: PlayerRoleId;
  hasSelectedRole: boolean;
  infectionStatus: InfectionStatus;
  infectedPendingUntil: number | null;
  infectedByPlayerId: string | null;
  lat: number;
  lng: number;
  accuracyMeters: number;
  headingDeg: number | null;
  speedMps: number;
  lastUpdatedAt: number;
  lastKnownPing: LatLng | null;
  lastPingAt: number | null;
  isConnected: boolean;
  isHost: boolean;
  isFieldProxy: boolean; // True when added by host for group roster/field tablet tracking
  abilityActiveUntil: number;
  abilityCooldownUntil: number;
  abilityUsesRemaining: number | null; // null = unlimited (cooldown), number = remaining uses
  shieldUntil: number; // Medic Adrenaline Surge tag grace/shield
  slowedUntil: number; // Defender Barrier / Tank Lockdown slow
  infectionsCount: number;
  assistsCount: number;
  distanceMiles: number;
  survivedMs: number;
  infectedAt: number | null;
  outOfBounds: boolean;
  voiceMuted: boolean;
  voiceSpeaking: boolean;
  voiceChannel: VoiceChannel;
}

export interface Barrier {
  id: string;
  ownerId: string;
  ownerName: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  createdAt: number;
  expiresAt: number;
}

export interface TacticalEvent {
  id: string;
  timestamp: number;
  type: 'match' | 'radar' | 'infection' | 'ability' | 'perimeter';
  message: string;
  actorId?: string;
}

export type MatchStatus = 'lobby' | 'drafting' | 'playing' | 'ended';
export type MatchWinner = 'survivors' | 'zombies' | null;

export interface MatchConfig {
  roomName: string;
  maxPlayers: number;
  radiusMiles: number; // strictly <= 5.0
  durationMinutes: number;
  revealIntervalSeconds: number; // default 120 (2 minutes)
  startingZombieCount: number;
  center: LatLng;
}

export interface RoomState {
  roomCode: string;
  config: MatchConfig;
  status: MatchStatus;
  winner: MatchWinner;
  createdAt: number;
  draftEndsAt: number | null; // 15s role selection & zombie voting window
  zombieVotes: Record<string, string>; // voterPlayerId -> targetPlayerId
  startedAt: number | null;
  endsAt: number | null;
  nextRevealAt: number | null;
  revealActiveUntil: number | null;
  blackoutUntil: number | null; // Stalker one-time blackout
  players: Player[];
  barriers: Barrier[];
  events: TacticalEvent[];
}

export interface ClientVisiblePlayer extends Omit<Player, 'lat' | 'lng'> {
  lat: number | null;
  lng: number | null;
  locationHidden: boolean;
  effectiveSpeedMultiplier: number;
  effectiveTagRadiusMeters: number;
}

export interface ClientRoomView extends Omit<RoomState, 'players'> {
  players: ClientVisiblePlayer[];
  selfPlayerId: string;
  serverNow: number;
}

export interface LeaderboardEntry {
  playerName: string;
  matchesPlayed: number;
  wins: number;
  totalInfections: number;
  totalAssists: number;
  bestSurvivalSeconds: number;
  totalDistanceMiles: number;
  totalScore: number;
  favoriteRole: PlayerRoleId;
  lastPlayedAt: number;
}

export interface LiveStandingRow {
  playerId: string;
  name: string;
  team: Team;
  role: PlayerRoleId;
  infectionsCount: number;
  assistsCount: number;
  survivedSeconds: number;
  distanceMiles: number;
  score: number;
  isSelf: boolean;
}

export type WSClientMessage =
  | {
      type: 'room:create';
      payload: {
        playerName: string;
        role: HumanRoleId;
        config: MatchConfig;
        lat: number;
        lng: number;
      };
    }
  | {
      type: 'room:join';
      payload: {
        roomCode: string;
        playerName: string;
        role?: HumanRoleId;
        lat: number;
        lng: number;
      };
    }
  | {
      type: 'room:add_players';
      payload: {
        roomCode: string;
        players: Array<{ name: string; team: Team; role: PlayerRoleId }>;
        targetMaxPlayers?: number;
      };
    }
  | {
      type: 'room:update_config';
      payload: {
        roomCode: string;
        config: Partial<MatchConfig>;
      };
    }
  | {
      type: 'player:select_role';
      payload: {
        roomCode: string;
        playerId: string;
        role: PlayerRoleId;
        team?: Team;
      };
    }
  | {
      type: 'match:start';
      payload: {
        roomCode: string;
      };
    }
  | {
      type: 'match:trigger_reveal';
      payload: {
        roomCode: string;
      };
    }
  | {
      type: 'match:reset';
      payload: {
        roomCode: string;
      };
    }
  | {
      type: 'player:update_location';
      payload: {
        roomCode: string;
        playerId?: string;
        lat: number;
        lng: number;
        accuracyMeters?: number;
        headingDeg?: number | null;
        speedMps?: number;
      };
    }
  | {
      type: 'player:activate_ability';
      payload: {
        roomCode: string;
        playerId?: string;
      };
    }
  | {
      type: 'player:tag';
      payload: {
        roomCode: string;
        targetPlayerId: string;
      };
    }
  | {
      type: 'player:self_infected';
      payload: {
        roomCode: string;
      };
    }
  | {
      type: 'player:revive';
      payload: {
        roomCode: string;
        targetPlayerId: string;
      };
    }
  | {
      type: 'player:cast_zombie_vote';
      payload: {
        roomCode: string;
        targetPlayerId: string;
      };
    }
  | {
      type: 'match:finalize_draft';
      payload: {
        roomCode: string;
      };
    }
  | {
      type: 'voice:state';
      payload: {
        roomCode: string;
        muted: boolean;
        speaking: boolean;
        channel: VoiceChannel;
      };
    }
  | {
      type: 'voice:signal';
      payload: {
        roomCode: string;
        toPlayerId: string;
        signalType: 'offer' | 'answer' | 'ice';
        data: unknown;
      };
    }
  | {
      type: 'chat:send';
      payload: {
        roomCode: string;
        text: string;
      };
    };

export type WSServerMessage =
  | {
      type: 'room:state';
      payload: ClientRoomView;
    }
  | {
      type: 'room:error';
      payload: { message: string };
    }
  | {
      type: 'voice:signal';
      payload: {
        fromPlayerId: string;
        fromPlayerName: string;
        signalType: 'offer' | 'answer' | 'ice';
        data: unknown;
      };
    }
  | {
      type: 'leaderboard:update';
      payload: LeaderboardEntry[];
    };
