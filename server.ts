import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  DRAFT_DURATION_MS,
  REVEAL_WINDOW_MS,
  activatePlayerAbility,
  clampRadiusMiles,
  createInitialPlayer,
  evaluateMatchOutcome,
  filterRoomStateForPlayer,
  getDefaultMatchConfig,
  haversineDistanceMeters,
  isWithinPerimeter,
  metersToMiles,
  processExpiredInfections,
  resolveDraftAndVotes,
  reviveInfectedPlayer,
  tagSurvivor,
} from './src/game/rules';
import { HUMAN_ROLES, ROLES } from './src/game/roles';
import type {
  LatLng,
  MatchConfig,
  RoomState,
  TacticalEvent,
  WSClientMessage,
  WSServerMessage,
} from './src/game/types';
import {
  getLeaderboard,
  recordMatchResults,
} from './src/server/leaderboardStore';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const rooms = new Map<string, RoomState>();
const clientMeta = new Map<WebSocket, { roomCode: string; playerId: string }>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ZMB';
  for (let i = 0; i < 3; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function pushEvent(
  room: RoomState,
  type: TacticalEvent['type'],
  message: string,
  actorId?: string,
) {
  room.events.unshift({
    id: generateId('evt'),
    timestamp: Date.now(),
    type,
    message,
    actorId,
  });
  if (room.events.length > 40) {
    room.events.length = 40;
  }
}

function sendWS(ws: WebSocket, msg: WSServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: RoomState) {
  const now = Date.now();
  for (const [ws, meta] of clientMeta.entries()) {
    if (meta.roomCode !== room.roomCode) continue;
    const filtered = filterRoomStateForPlayer(room, meta.playerId, now);
    sendWS(ws, { type: 'room:state', payload: filtered });
  }
}

function triggerRadarSweep(room: RoomState, now: number, manual = false) {
  room.revealActiveUntil = now + REVEAL_WINDOW_MS;
  room.nextRevealAt = now + room.config.revealIntervalSeconds * 1000;

  let pingedCount = 0;
  for (const player of room.players) {
    if (player.team !== 'survivor') continue;
    const isCloaked =
      player.role === 'runner' && player.abilityActiveUntil > now;
    if (!isCloaked) {
      player.lastKnownPing = { lat: player.lat, lng: player.lng };
      player.lastPingAt = now;
      pingedCount += 1;
    }
  }

  pushEvent(
    room,
    'radar',
    manual
      ? `Tactical radar sweep triggered (${pingedCount} survivor pings broadcasted for 18s).`
      : `2-minute radar sweep active! ${pingedCount} survivor GPS locations revealed to the horde.`,
  );
}

function offsetCoordinate(center: LatLng, northMeters: number, eastMeters: number): LatLng {
  const latOffset = northMeters / 111_320;
  const lngOffset =
    eastMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return {
    lat: Number((center.lat + latOffset).toFixed(6)),
    lng: Number((center.lng + lngOffset).toFixed(6)),
  };
}

function beginDraftPhase(room: RoomState, now: number) {
  room.status = 'drafting';
  room.winner = null;
  room.draftEndsAt = now + DRAFT_DURATION_MS;
  room.zombieVotes = {};
  room.startedAt = null;
  room.endsAt = null;
  room.nextRevealAt = null;
  room.revealActiveUntil = null;
  room.blackoutUntil = null;
  room.barriers = [];

  for (const p of room.players) {
    p.infectionStatus = p.team === 'zombie' ? 'zombie' : 'healthy';
    p.infectedPendingUntil = null;
    p.infectedByPlayerId = null;
    p.infectionsCount = 0;
    p.assistsCount = 0;
    p.distanceMiles = 0;
    p.survivedMs = 0;
    p.infectedAt = null;
    p.abilityActiveUntil = 0;
    p.abilityCooldownUntil = 0;
    p.shieldUntil = 0;
    p.slowedUntil = 0;
    p.lastKnownPing = null;
    p.lastPingAt = null;
  }

  pushEvent(
    room,
    'match',
    '15s Role Draft & Zombie Vote started! Pick your Survivor role or vote who turns into Patient Zero.',
  );
}

function beginActiveHunt(room: RoomState, now: number) {
  const { chosenZombies, eventMessage } = resolveDraftAndVotes(room);
  room.status = 'playing';
  room.winner = null;
  room.draftEndsAt = null;
  room.startedAt = now;
  room.endsAt = now + room.config.durationMinutes * 60_000;
  room.nextRevealAt = now + room.config.revealIntervalSeconds * 1000;
  room.revealActiveUntil = now + 10_000; // Brief initial ping at match start
  room.blackoutUntil = null;
  room.barriers = [];

  for (const p of room.players) {
    p.infectionsCount = 0;
    p.assistsCount = 0;
    p.distanceMiles = 0;
    p.survivedMs = 0;
    p.infectedAt = null;
    p.abilityActiveUntil = 0;
    p.abilityCooldownUntil = 0;
    p.abilityUsesRemaining = ROLES[p.role].cadence === 'one_time' ? 1 : null;
    p.shieldUntil = 0;
    p.slowedUntil = 0;
    p.lastKnownPing =
      p.team === 'survivor' ? { lat: p.lat, lng: p.lng } : null;
    p.lastPingAt = p.team === 'survivor' ? now : null;
  }

  pushEvent(room, 'match', eventMessage);
  pushEvent(
    room,
    'match',
    `Outbreak started! ${room.players.filter((p) => p.team === 'survivor').length} Survivors vs ${chosenZombies.length} Infected across a ${room.config.radiusMiles} mi zone.`,
  );
}

// Authoritative 1Hz match simulation tick
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    // Finalize 15-second role selection & zombie voting window
    if (
      room.status === 'drafting' &&
      room.draftEndsAt !== null &&
      now >= room.draftEndsAt
    ) {
      beginActiveHunt(room, now);
      broadcastRoom(room);
      continue;
    }

    if (room.status !== 'playing') continue;

    let changed = false;

    // Convert any infected players whose 2-minute revival window expired
    const expiredMessages = processExpiredInfections(room, now);
    if (expiredMessages.length > 0) {
      for (const msgText of expiredMessages) {
        pushEvent(room, 'infection', msgText);
      }
      changed = true;
    }

    // Expire Defender barriers
    const beforeBarriers = room.barriers.length;
    room.barriers = room.barriers.filter((b) => b.expiresAt > now);
    if (room.barriers.length !== beforeBarriers) {
      changed = true;
    }

    // 2-minute Survivor Radar Reveal Sweep
    if (room.nextRevealAt !== null && now >= room.nextRevealAt) {
      triggerRadarSweep(room, now, false);
      changed = true;
    }

    // Evaluate Win/Loss condition
    const outcome = evaluateMatchOutcome(room, now);
    if (outcome.ended) {
      room.status = 'ended';
      room.winner = outcome.winner;
      for (const p of room.players) {
        if (p.team === 'survivor' && room.startedAt) {
          p.survivedMs = Math.max(0, now - room.startedAt);
        }
      }
      pushEvent(
        room,
        'match',
        outcome.winner === 'survivors'
          ? 'Match complete — Survivors outran the horde until extraction!'
          : 'Match complete — All survivors have been infected!',
      );
      const updatedBoard = recordMatchResults(room, now);
      for (const [ws, meta] of clientMeta.entries()) {
        if (meta.roomCode === room.roomCode) {
          sendWS(ws, { type: 'leaderboard:update', payload: updatedBoard });
        }
      }
      changed = true;
    }

    if (changed) {
      broadcastRoom(room);
    }
  }
}, 1000);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      mapsApiKey:
        process.env.VITE_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        '',
    });
  });

  app.get('/api/rooms', (_req, res) => {
    const list = Array.from(rooms.values()).map((r) => ({
      roomCode: r.roomCode,
      roomName: r.config.roomName,
      status: r.status,
      playerCount: r.players.length,
      maxPlayers: r.config.maxPlayers,
      radiusMiles: r.config.radiusMiles,
      survivors: r.players.filter((p) => p.team === 'survivor').length,
      zombies: r.players.filter((p) => p.team === 'zombie').length,
    }));
    res.json(list);
  });

  app.get('/api/leaderboard', (req, res) => {
    const sort =
      req.query.sort === 'infections' || req.query.sort === 'wins'
        ? req.query.sort
        : 'score';
    res.json(getLeaderboard(sort));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: WSClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WSClientMessage;
      } catch {
        sendWS(ws, { type: 'room:error', payload: { message: 'Invalid JSON payload.' } });
        return;
      }

      const now = Date.now();

      switch (msg.type) {
        case 'room:create': {
          const { playerName, role, config, lat, lng } = msg.payload;
          const cleanName = (playerName || 'Host Runner').trim().slice(0, 24);
          const roomCode = generateRoomCode();
          const center: LatLng = {
            lat: Number.isFinite(lat) ? lat : 37.7749,
            lng: Number.isFinite(lng) ? lng : -122.4194,
          };
          const safeConfig: MatchConfig = {
            ...getDefaultMatchConfig(center),
            ...config,
            roomName: (config.roomName || 'Sector 7 Outbreak').trim().slice(0, 40),
            maxPlayers: Math.min(50, Math.max(2, Math.round(config.maxPlayers || 12))),
            radiusMiles: clampRadiusMiles(config.radiusMiles),
            durationMinutes: Math.min(90, Math.max(5, Math.round(config.durationMinutes || 20))),
            revealIntervalSeconds: Math.max(
              30,
              Math.round(config.revealIntervalSeconds || 120),
            ),
            startingZombieCount: Math.min(
              10,
              Math.max(1, Math.round(config.startingZombieCount || 1)),
            ),
            center: config.center?.lat ? config.center : center,
          };

          const hostId = generateId('plr');
          const hostPlayer = createInitialPlayer({
            id: hostId,
            name: cleanName,
            team: 'survivor',
            role: role || 'runner',
            hasSelectedRole: true,
            lat: center.lat,
            lng: center.lng,
            isHost: true,
            now,
          });

          const room: RoomState = {
            roomCode,
            config: safeConfig,
            status: 'lobby',
            winner: null,
            createdAt: now,
            draftEndsAt: null,
            zombieVotes: {},
            startedAt: null,
            endsAt: null,
            nextRevealAt: null,
            revealActiveUntil: null,
            blackoutUntil: null,
            players: [hostPlayer],
            barriers: [],
            events: [],
          };
          pushEvent(
            room,
            'match',
            `${cleanName} created room ${roomCode} (${safeConfig.radiusMiles} mi radius, 2-min reveal).`,
            hostId,
          );
          rooms.set(roomCode, room);
          clientMeta.set(ws, { roomCode, playerId: hostId });
          broadcastRoom(room);
          break;
        }

        case 'room:join': {
          const { roomCode, playerName, role, lat, lng } = msg.payload;
          const code = (roomCode || '').trim().toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            sendWS(ws, {
              type: 'room:error',
              payload: { message: `Room ${code} was not found.` },
            });
            return;
          }

          const cleanName = (playerName || 'Field Player').trim().slice(0, 24);
          // Reconnect if existing player with same name is disconnected or proxy
          const existing = room.players.find(
            (p) => p.name.toLowerCase() === cleanName.toLowerCase(),
          );
          if (existing) {
            existing.isConnected = true;
            existing.isFieldProxy = false;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              existing.lat = lat;
              existing.lng = lng;
            }
            clientMeta.set(ws, { roomCode: room.roomCode, playerId: existing.id });
            broadcastRoom(room);
            return;
          }

          if (room.players.length >= room.config.maxPlayers) {
            sendWS(ws, {
              type: 'room:error',
              payload: {
                message: `Room ${code} is full (${room.config.maxPlayers} players max).`,
              },
            });
            return;
          }

          const playerId = generateId('plr');
          const randomHuman =
            HUMAN_ROLES[Math.floor(Math.random() * HUMAN_ROLES.length)] ??
            HUMAN_ROLES[0];
          const joinRole = role || randomHuman.id;

          const pos =
            Number.isFinite(lat) && Number.isFinite(lng)
              ? { lat, lng }
              : offsetCoordinate(room.config.center, 45, 45);

          const player = createInitialPlayer({
            id: playerId,
            name: cleanName,
            team: 'survivor',
            role: joinRole,
            hasSelectedRole: Boolean(role) && room.status === 'lobby',
            lat: pos.lat,
            lng: pos.lng,
            isHost: false,
            now,
          });
          room.players.push(player);
          pushEvent(
            room,
            'match',
            `${cleanName} joined as ${ROLES[joinRole].name}.`,
            playerId,
          );
          clientMeta.set(ws, { roomCode: room.roomCode, playerId });
          broadcastRoom(room);
          break;
        }

        case 'room:add_players': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;

          if (msg.payload.targetMaxPlayers) {
            room.config.maxPlayers = Math.min(
              50,
              Math.max(room.players.length, Math.round(msg.payload.targetMaxPlayers)),
            );
          }

          let added = 0;
          for (const entry of msg.payload.players) {
            if (room.players.length >= room.config.maxPlayers) break;
            const name = entry.name.trim().slice(0, 24);
            if (!name) continue;
            if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
              continue;
            }
            const angle = (room.players.length * 1.35) % (Math.PI * 2);
            const distMeters = 120 + (room.players.length % 5) * 95;
            const pos = offsetCoordinate(
              room.config.center,
              Math.cos(angle) * distMeters,
              Math.sin(angle) * distMeters,
            );
            const p = createInitialPlayer({
              id: generateId('plr'),
              name,
              team: entry.team,
              role: entry.role,
              hasSelectedRole: false,
              lat: pos.lat,
              lng: pos.lng,
              isHost: false,
              isFieldProxy: true,
              now,
            });
            room.players.push(p);
            added += 1;
          }

          if (added > 0) {
            pushEvent(
              room,
              'match',
              `Added ${added} player${added > 1 ? 's' : ''} to the group roster.`,
              meta.playerId,
            );
            broadcastRoom(room);
          }
          break;
        }

        case 'room:update_config': {
          const room = rooms.get(msg.payload.roomCode);
          if (!room) return;
          const c = msg.payload.config;
          if (c.radiusMiles !== undefined) {
            room.config.radiusMiles = clampRadiusMiles(c.radiusMiles);
          }
          if (c.maxPlayers !== undefined) {
            room.config.maxPlayers = Math.min(
              50,
              Math.max(room.players.length, Math.round(c.maxPlayers)),
            );
          }
          if (c.durationMinutes !== undefined) {
            room.config.durationMinutes = Math.min(
              90,
              Math.max(5, Math.round(c.durationMinutes)),
            );
          }
          if (c.revealIntervalSeconds !== undefined) {
            room.config.revealIntervalSeconds = Math.max(
              30,
              Math.round(c.revealIntervalSeconds),
            );
          }
          if (c.startingZombieCount !== undefined) {
            room.config.startingZombieCount = Math.min(
              10,
              Math.max(1, Math.round(c.startingZombieCount)),
            );
          }
          if (c.roomName !== undefined && c.roomName.trim()) {
            room.config.roomName = c.roomName.trim().slice(0, 40);
          }
          broadcastRoom(room);
          break;
        }

        case 'player:select_role': {
          const room = rooms.get(msg.payload.roomCode);
          if (!room) return;
          const target = room.players.find((p) => p.id === msg.payload.playerId);
          if (!target) return;
          const roleDef = ROLES[msg.payload.role];
          if (!roleDef) return;
          if (
            room.status === 'playing' &&
            (target.hasSelectedRole || target.team !== 'survivor' || roleDef.team !== 'survivor')
          ) {
            return;
          }
          target.team = roleDef.team;
          target.role = roleDef.id;
          target.hasSelectedRole = true;
          target.infectionStatus = roleDef.team === 'zombie' ? 'zombie' : 'healthy';
          target.abilityUsesRemaining = roleDef.cadence === 'one_time' ? 1 : null;
          broadcastRoom(room);
          break;
        }

        case 'player:cast_zombie_vote': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta || room.status !== 'drafting') return;
          const target = room.players.find((p) => p.id === msg.payload.targetPlayerId);
          if (!target) return;
          room.zombieVotes[meta.playerId] = target.id;
          broadcastRoom(room);
          break;
        }

        case 'match:start': {
          const room = rooms.get(msg.payload.roomCode);
          if (!room) return;
          if (room.players.length < 2) {
            beginActiveHunt(room, now);
          } else {
            beginDraftPhase(room, now);
          }
          broadcastRoom(room);
          break;
        }

        case 'match:finalize_draft': {
          const room = rooms.get(msg.payload.roomCode);
          if (!room || room.status !== 'drafting') return;
          beginActiveHunt(room, now);
          broadcastRoom(room);
          break;
        }

        case 'match:trigger_reveal': {
          const room = rooms.get(msg.payload.roomCode);
          if (!room || room.status !== 'playing') return;
          triggerRadarSweep(room, now, true);
          broadcastRoom(room);
          break;
        }

        case 'match:reset': {
          const room = rooms.get(msg.payload.roomCode);
          if (!room) return;
          room.status = 'lobby';
          room.winner = null;
          room.draftEndsAt = null;
          room.zombieVotes = {};
          room.startedAt = null;
          room.endsAt = null;
          room.nextRevealAt = null;
          room.revealActiveUntil = null;
          room.blackoutUntil = null;
          room.barriers = [];
          room.players.forEach((p, idx) => {
            const isStartingZombie = idx === room.players.length - 1 && room.players.length > 1;
            p.team = isStartingZombie ? 'zombie' : 'survivor';
            p.role = isStartingZombie ? 'speedster' : 'runner';
            p.hasSelectedRole = p.isHost;
            p.infectionStatus = isStartingZombie ? 'zombie' : 'healthy';
            p.infectedPendingUntil = null;
            p.infectedByPlayerId = null;
            p.abilityActiveUntil = 0;
            p.abilityCooldownUntil = 0;
            p.abilityUsesRemaining = ROLES[p.role].cadence === 'one_time' ? 1 : null;
            p.shieldUntil = 0;
            p.slowedUntil = 0;
            p.infectionsCount = 0;
            p.assistsCount = 0;
            p.distanceMiles = 0;
            p.survivedMs = 0;
            p.infectedAt = null;
            p.outOfBounds = false;
          });
          pushEvent(room, 'match', 'Match reset to staging lobby.');
          broadcastRoom(room);
          break;
        }

        case 'player:update_location': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;

          const targetId = msg.payload.playerId || meta.playerId;
          const player = room.players.find((p) => p.id === targetId);
          if (!player) return;

          const { lat, lng, accuracyMeters, headingDeg, speedMps } = msg.payload;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          const stepMeters = haversineDistanceMeters(player, { lat, lng });
          if (room.status === 'playing' && stepMeters > 1 && stepMeters < 500) {
            player.distanceMiles = Number(
              (player.distanceMiles + metersToMiles(stepMeters)).toFixed(3),
            );
          }

          player.lat = lat;
          player.lng = lng;
          player.accuracyMeters = accuracyMeters ?? player.accuracyMeters;
          player.headingDeg = headingDeg ?? player.headingDeg;
          player.speedMps = speedMps ?? player.speedMps;
          player.lastUpdatedAt = now;

          const wasOut = player.outOfBounds;
          player.outOfBounds = !isWithinPerimeter(
            { lat, lng },
            room.config.center,
            room.config.radiusMiles,
          );
          if (!wasOut && player.outOfBounds) {
            pushEvent(
              room,
              'perimeter',
              `Alert: ${player.name} crossed the ${room.config.radiusMiles} mi perimeter boundary!`,
              player.id,
            );
          }

          broadcastRoom(room);
          break;
        }

        case 'player:activate_ability': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;

          const targetId = msg.payload.playerId || meta.playerId;
          const res = activatePlayerAbility(room, targetId, now);
          if (!res.ok) {
            sendWS(ws, {
              type: 'room:error',
              payload: { message: res.reason || 'Ability unavailable.' },
            });
            return;
          }
          if (res.eventMessage) {
            pushEvent(room, 'ability', res.eventMessage, targetId);
          }
          broadcastRoom(room);
          break;
        }

        case 'player:tag': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;

          const res = tagSurvivor(
            room,
            meta.playerId,
            msg.payload.targetPlayerId,
            now,
          );
          if (!res.ok) {
            sendWS(ws, {
              type: 'room:error',
              payload: { message: res.reason || 'Tag failed.' },
            });
            return;
          }
          if (res.eventMessage) {
            pushEvent(room, 'infection', res.eventMessage, meta.playerId);
          }

          const outcome = evaluateMatchOutcome(room, now);
          if (outcome.ended) {
            room.status = 'ended';
            room.winner = outcome.winner;
            const updatedBoard = recordMatchResults(room, now);
            for (const [clientWs, cMeta] of clientMeta.entries()) {
              if (cMeta.roomCode === room.roomCode) {
                sendWS(clientWs, {
                  type: 'leaderboard:update',
                  payload: updatedBoard,
                });
              }
            }
          }
          broadcastRoom(room);
          break;
        }

        case 'player:self_infected': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;

          const res = tagSurvivor(room, null, meta.playerId, now, {
            forceSelfReport: true,
          });
          if (!res.ok) {
            sendWS(ws, {
              type: 'room:error',
              payload: { message: res.reason || 'Unable to convert team.' },
            });
            return;
          }
          if (res.eventMessage) {
            pushEvent(room, 'infection', res.eventMessage, meta.playerId);
          }

          const outcome = evaluateMatchOutcome(room, now);
          if (outcome.ended) {
            room.status = 'ended';
            room.winner = outcome.winner;
            const updatedBoard = recordMatchResults(room, now);
            for (const [clientWs, cMeta] of clientMeta.entries()) {
              if (cMeta.roomCode === room.roomCode) {
                sendWS(clientWs, {
                  type: 'leaderboard:update',
                  payload: updatedBoard,
                });
              }
            }
          }
          broadcastRoom(room);
          break;
        }

        case 'player:revive': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;

          const res = reviveInfectedPlayer(
            room,
            meta.playerId,
            msg.payload.targetPlayerId,
            now,
          );
          if (!res.ok) {
            sendWS(ws, {
              type: 'room:error',
              payload: { message: res.reason || 'Revive failed.' },
            });
            return;
          }
          if (res.eventMessage) {
            pushEvent(room, 'ability', res.eventMessage, meta.playerId);
          }
          broadcastRoom(room);
          break;
        }

        case 'voice:state': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;
          const player = room.players.find((p) => p.id === meta.playerId);
          if (!player) return;

          player.voiceMuted = msg.payload.muted;
          player.voiceSpeaking = msg.payload.speaking;
          player.voiceChannel = msg.payload.channel;
          broadcastRoom(room);
          break;
        }

        case 'voice:signal': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;
          const sender = room.players.find((p) => p.id === meta.playerId);
          const receiver = room.players.find(
            (p) => p.id === msg.payload.toPlayerId,
          );
          if (!sender || !receiver) return;

          // Respect team tactical channel isolation
          if (
            sender.voiceChannel === 'team' &&
            receiver.voiceChannel === 'team' &&
            sender.team !== receiver.team
          ) {
            return;
          }

          for (const [targetWs, targetMeta] of clientMeta.entries()) {
            if (
              targetMeta.roomCode === room.roomCode &&
              targetMeta.playerId === receiver.id
            ) {
              sendWS(targetWs, {
                type: 'voice:signal',
                payload: {
                  fromPlayerId: sender.id,
                  fromPlayerName: sender.name,
                  signalType: msg.payload.signalType,
                  data: msg.payload.data,
                },
              });
            }
          }
          break;
        }

        case 'chat:send': {
          const meta = clientMeta.get(ws);
          const room = rooms.get(msg.payload.roomCode);
          if (!room || !meta) return;
          const sender = room.players.find((p) => p.id === meta.playerId);
          const text = (msg.payload.text || '').trim().slice(0, 140);
          if (!sender || !text) return;

          pushEvent(
            room,
            'ability',
            `[${sender.team === 'zombie' ? 'HORDE' : 'SQUAD'}] ${sender.name}: ${text}`,
            sender.id,
          );
          broadcastRoom(room);
          break;
        }
      }
    });

    ws.on('close', () => {
      const meta = clientMeta.get(ws);
      clientMeta.delete(ws);
      if (!meta) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === meta.playerId);
      if (player) {
        player.isConnected = false;
        player.voiceSpeaking = false;
        broadcastRoom(room);
      }
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/ws')) {
        return next();
      }
      try {
        const fs = await import('node:fs');
        const indexHtml = fs.readFileSync(
          path.resolve(process.cwd(), 'index.html'),
          'utf-8',
        );
        const transformed = await vite.transformIndexHtml(
          req.originalUrl,
          indexHtml,
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Zombie Infection server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
