import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  TRACK_DEFINITIONS,
  getBakedTrack,
  getGridSlotTransform,
} from './src/game/tracks.ts';
import {
  createInitialCarState,
  resolveCarCollisions,
  stepCarPhysics,
  type CarPhysicsState,
} from './src/game/physics.ts';
import {
  DEFAULT_CPU_COUNT,
  DEFAULT_CPU_DIFFICULTY,
  buildCpuGridOpponents,
  clampCpuCount,
  clampCpuDifficulty,
  computeCpuCarInput,
  cpuStateToTelemetry,
  type CpuProfile,
} from './src/game/ai.ts';
import { getStandaloneGameHtml } from './src/server/standaloneBuilder.ts';
import { resolveWeatherVisuals } from './src/game/weather.ts';
import {
  CAR_CHASSIS_OPTIONS,
  PAINT_FINISH_OPTIONS,
  type CarChassisId,
  type ClientWsMessage,
  type PaintFinishId,
  type PlayerTelemetry,
  type RoomPhase,
  type RoomSnapshot,
  type ServerWsMessage,
  type TrackId,
  type WeatherMode,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_TRACK_IDS = new Set<TrackId>(TRACK_DEFINITIONS.map((t) => t.id));

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  roomId: string | null;
}

interface ServerCpuEntry {
  profile: CpuProfile;
  slotIndex: number;
  state: CarPhysicsState;
}

const VALID_WEATHER_MODES = new Set<WeatherMode>([
  'auto',
  'dynamic',
  'clear',
  'rain',
  'fog',
  'sunset',
]);

const VALID_CHASSIS_IDS = new Set<CarChassisId>(
  CAR_CHASSIS_OPTIONS.map((c) => c.id),
);
const VALID_FINISH_IDS = new Set<PaintFinishId>(
  PAINT_FINISH_OPTIONS.map((f) => f.id),
);

interface ServerRoom {
  roomId: string;
  trackId: TrackId;
  weatherMode: WeatherMode;
  cpuCount: number;
  cpuDifficulty: number;
  hostId: string | null;
  phase: RoomPhase;
  countdownEndsAt: number;
  raceStartedAt: number;
  lastTickMs: number;
  players: Map<string, PlayerTelemetry>;
  cpuCars: Map<string, ServerCpuEntry>;
}

const rooms = new Map<string, ServerRoom>();
const clients = new Map<WebSocket, ConnectedClient>();

let nextClientSeq = 1;

function sanitizeRoomId(raw: unknown): string {
  if (typeof raw !== 'string') return 'OPEN-01';
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12);
  return cleaned || 'OPEN-01';
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Driver';
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 16);
  return cleaned || 'Driver';
}

function sanitizeColor(raw: unknown): string {
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
    return raw.trim();
  }
  return '#dc2626';
}

function sanitizeChassisId(raw: unknown): CarChassisId {
  if (typeof raw === 'string' && VALID_CHASSIS_IDS.has(raw as CarChassisId)) {
    return raw as CarChassisId;
  }
  return 'gt_coupe';
}

function sanitizePaintFinish(raw: unknown): PaintFinishId {
  if (typeof raw === 'string' && VALID_FINISH_IDS.has(raw as PaintFinishId)) {
    return raw as PaintFinishId;
  }
  return 'gloss';
}

function sanitizeTrackId(raw: unknown): TrackId {
  if (typeof raw === 'string' && VALID_TRACK_IDS.has(raw as TrackId)) {
    return raw as TrackId;
  }
  return 'alpine_gorge';
}

function sanitizeWeatherMode(raw: unknown): WeatherMode {
  if (typeof raw === 'string' && VALID_WEATHER_MODES.has(raw as WeatherMode)) {
    return raw as WeatherMode;
  }
  return 'auto';
}

function getOrCreateRoom(
  roomId: string,
  preferredTrack?: TrackId,
  preferredWeather?: WeatherMode,
  preferredCpuCount?: number,
  preferredCpuDifficulty?: number,
): ServerRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      trackId: preferredTrack ?? 'alpine_gorge',
      weatherMode: preferredWeather ?? 'auto',
      cpuCount:
        typeof preferredCpuCount === 'number'
          ? clampCpuCount(preferredCpuCount)
          : DEFAULT_CPU_COUNT,
      cpuDifficulty:
        typeof preferredCpuDifficulty === 'number'
          ? clampCpuDifficulty(preferredCpuDifficulty)
          : DEFAULT_CPU_DIFFICULTY,
      hostId: null,
      phase: 'lobby',
      countdownEndsAt: 0,
      raceStartedAt: 0,
      lastTickMs: Date.now(),
      players: new Map(),
      cpuCars: new Map(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

function buildRoomSnapshot(room: ServerRoom): RoomSnapshot {
  const now = Date.now();
  const def = TRACK_DEFINITIONS.find((t) => t.id === room.trackId) ?? TRACK_DEFINITIONS[0];
  return {
    roomId: room.roomId,
    trackId: room.trackId,
    weatherMode: room.weatherMode,
    cpuCount: room.cpuCount,
    cpuDifficulty: room.cpuDifficulty,
    hostId: room.hostId,
    phase: room.phase,
    countdownRemainingMs:
      room.phase === 'countdown' ? Math.max(0, room.countdownEndsAt - now) : 0,
    raceElapsedMs:
      room.phase === 'racing' || room.phase === 'finished'
        ? Math.max(0, now - room.raceStartedAt)
        : 0,
    laps: def.laps,
    players: Array.from(room.players.values()).sort((a, b) => a.slotIndex - b.slotIndex),
  };
}

function sendJson(ws: WebSocket, msg: ServerWsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoomState(room: ServerRoom): void {
  const payload = JSON.stringify({
    type: 'room_state',
    room: buildRoomSnapshot(room),
  } satisfies ServerWsMessage);

  for (const client of clients.values()) {
    if (client.roomId === room.roomId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function clearCpuCars(room: ServerRoom): void {
  for (const cpuId of room.cpuCars.keys()) {
    room.players.delete(cpuId);
  }
  room.cpuCars.clear();
}

function resetPlayersToGrid(room: ServerRoom, includeCpus: boolean): void {
  clearCpuCars(room);
  const baked = getBakedTrack(room.trackId);
  const humans = Array.from(room.players.values())
    .filter((p) => !p.isCpu)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  humans.forEach((p, idx) => {
    p.slotIndex = idx;
    const spawn = getGridSlotTransform(baked, idx);
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.yaw = spawn.yaw;
    p.speed = 0;
    p.steerAngle = 0;
    p.lap = 1;
    p.progress = -0.05;
    p.bestLapMs = null;
    p.finished = false;
    p.finishTimeMs = null;
  });

  if (includeCpus && room.cpuCount > 0 && humans.length < 12) {
    const cpuProfiles = buildCpuGridOpponents(
      humans,
      room.cpuCount,
      room.cpuDifficulty,
    );
    cpuProfiles.forEach((profile, i) => {
      const slotIndex = humans.length + i;
      const state = createInitialCarState(baked, slotIndex);
      room.cpuCars.set(profile.id, { profile, slotIndex, state });
      room.players.set(profile.id, cpuStateToTelemetry(profile, slotIndex, state));
    });
  }
}

function removeClientFromRoom(client: ConnectedClient): void {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) {
    client.roomId = null;
    return;
  }

  room.players.delete(client.id);
  if (room.hostId === client.id) {
    const next = Array.from(room.players.values()).find((p) => !p.isCpu);
    room.hostId = next ? next.id : null;
  }

  const remainingHumans = Array.from(room.players.values()).filter((p) => !p.isCpu);
  if (remainingHumans.length === 0) {
    rooms.delete(room.roomId);
  } else {
    broadcastRoomState(room);
  }
  client.roomId = null;
}

function findNextFreeSlot(room: ServerRoom): number {
  const used = new Set(
    Array.from(room.players.values())
      .filter((p) => !p.isCpu)
      .map((p) => p.slotIndex),
  );
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

function handleClientMessage(client: ConnectedClient, msg: ClientWsMessage): void {
  if (msg.type === 'join_room') {
    const targetRoomId = sanitizeRoomId(msg.roomId);
    if (client.roomId && client.roomId !== targetRoomId) {
      removeClientFromRoom(client);
    }

    const room = getOrCreateRoom(
      targetRoomId,
      msg.trackId ? sanitizeTrackId(msg.trackId) : undefined,
      msg.weatherMode ? sanitizeWeatherMode(msg.weatherMode) : undefined,
      msg.cpuCount,
      msg.cpuDifficulty,
    );
    client.roomId = room.roomId;

    const existing = room.players.get(client.id);
    if (!existing) {
      const slotIndex = findNextFreeSlot(room);
      const baked = getBakedTrack(room.trackId);
      const spawn = getGridSlotTransform(baked, slotIndex);
      const player: PlayerTelemetry = {
        id: client.id,
        name: sanitizeName(msg.name),
        color: sanitizeColor(msg.color),
        chassisId: sanitizeChassisId(msg.chassisId),
        paintFinish: sanitizePaintFinish(msg.paintFinish),
        slotIndex,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        yaw: spawn.yaw,
        speed: 0,
        steerAngle: 0,
        lap: 1,
        progress: -0.05,
        bestLapMs: null,
        finished: false,
        finishTimeMs: null,
        connected: true,
        isCpu: false,
      };
      room.players.set(client.id, player);
    } else {
      existing.name = sanitizeName(msg.name);
      existing.color = sanitizeColor(msg.color);
      if (msg.chassisId) existing.chassisId = sanitizeChassisId(msg.chassisId);
      if (msg.paintFinish) existing.paintFinish = sanitizePaintFinish(msg.paintFinish);
    }

    if (!room.hostId || !room.players.has(room.hostId)) {
      room.hostId = client.id;
    }

    sendJson(client.ws, {
      type: 'welcome',
      playerId: client.id,
      room: buildRoomSnapshot(room),
    });
    broadcastRoomState(room);
    return;
  }

  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) return;
  const player = room.players.get(client.id);
  if (!player) return;

  switch (msg.type) {
    case 'update_profile': {
      player.name = sanitizeName(msg.name);
      player.color = sanitizeColor(msg.color);
      if (msg.chassisId) player.chassisId = sanitizeChassisId(msg.chassisId);
      if (msg.paintFinish) player.paintFinish = sanitizePaintFinish(msg.paintFinish);
      broadcastRoomState(room);
      break;
    }
    case 'select_track': {
      if (room.phase === 'lobby' || room.phase === 'finished') {
        room.trackId = sanitizeTrackId(msg.trackId);
        room.phase = 'lobby';
        resetPlayersToGrid(room, false);
        broadcastRoomState(room);
      }
      break;
    }
    case 'select_weather': {
      if (room.phase === 'lobby' || room.phase === 'finished') {
        room.weatherMode = sanitizeWeatherMode(msg.weatherMode);
        broadcastRoomState(room);
      }
      break;
    }
    case 'select_cpu_settings': {
      if (room.phase === 'lobby' || room.phase === 'finished') {
        room.cpuCount = clampCpuCount(msg.cpuCount);
        room.cpuDifficulty = clampCpuDifficulty(msg.cpuDifficulty);
        broadcastRoomState(room);
      }
      break;
    }
    case 'start_race': {
      const humans = Array.from(room.players.values()).filter((p) => !p.isCpu);
      const allHumansDone = humans.length > 0 && humans.every((p) => p.finished);
      if (room.phase === 'lobby' || room.phase === 'finished' || allHumansDone || humans.length === 1) {
        resetPlayersToGrid(room, true);
        room.phase = 'countdown';
        room.countdownEndsAt = Date.now() + 3000;
        room.raceStartedAt = room.countdownEndsAt;
        room.lastTickMs = Date.now();
        broadcastRoomState(room);
      }
      break;
    }
    case 'return_lobby': {
      room.phase = 'lobby';
      room.countdownEndsAt = 0;
      room.raceStartedAt = 0;
      resetPlayersToGrid(room, false);
      broadcastRoomState(room);
      break;
    }
    case 'car_state': {
      if (
        !Number.isFinite(msg.x) ||
        !Number.isFinite(msg.y) ||
        !Number.isFinite(msg.z) ||
        !Number.isFinite(msg.yaw)
      ) {
        return;
      }
      player.x = msg.x;
      player.y = msg.y;
      player.z = msg.z;
      player.yaw = msg.yaw;
      player.speed = Number.isFinite(msg.speed) ? msg.speed : 0;
      player.steerAngle = Number.isFinite(msg.steerAngle) ? msg.steerAngle : 0;
      player.lap = Math.max(1, Math.floor(msg.lap || 1));
      player.progress = Number.isFinite(msg.progress) ? msg.progress : 0;
      player.bestLapMs =
        typeof msg.bestLapMs === 'number' && Number.isFinite(msg.bestLapMs)
          ? msg.bestLapMs
          : null;
      player.finished = Boolean(msg.finished);
      player.finishTimeMs =
        typeof msg.finishTimeMs === 'number' && Number.isFinite(msg.finishTimeMs)
          ? msg.finishTimeMs
          : null;

      // Transition room to finished once all connected human players cross the finish line
      const humanPlayers = Array.from(room.players.values()).filter((p) => !p.isCpu);
      if (room.phase === 'racing' && humanPlayers.length > 0) {
        const allHumansFinished = humanPlayers.every((p) => p.finished);
        if (allHumansFinished) {
          room.phase = 'finished';
          broadcastRoomState(room);
        }
      }
      break;
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, clients: clients.size });
  });

  app.get('/api/rooms', (_req, res) => {
    const list = Array.from(rooms.values()).map((r) => ({
      roomId: r.roomId,
      trackId: r.trackId,
      phase: r.phase,
      playerCount: Array.from(r.players.values()).filter((p) => !p.isCpu).length,
    }));
    res.json({ rooms: list });
  });

  app.get('/api/download-standalone', async (_req, res) => {
    try {
      const html = await getStandaloneGameHtml();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Apex-Circuit-Portable.html"',
      );
      res.send(html);
    } catch (err) {
      console.error('Standalone build failed:', err);
      res.status(500).json({ error: 'Failed to generate standalone game file.' });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const client: ConnectedClient = {
      id: `drv-${nextClientSeq++}`,
      ws,
      roomId: null,
    };
    clients.set(ws, client);

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ClientWsMessage;
        if (parsed && typeof parsed.type === 'string') {
          handleClientMessage(client, parsed);
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      removeClientFromRoom(client);
      clients.delete(ws);
    });
  });

  // 20 Hz room tick for countdown, CPU AI physics, and world telemetry snapshots
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const dt = Math.min(0.05, Math.max(0.01, (now - room.lastTickMs) / 1000));
      room.lastTickMs = now;

      if (room.phase === 'countdown' && now >= room.countdownEndsAt) {
        room.phase = 'racing';
        room.raceStartedAt = now;
        broadcastRoomState(room);
      }

      if (room.phase === 'racing' && room.cpuCars.size > 0) {
        const baked = getBakedTrack(room.trackId);
        const raceElapsedMs = Math.max(0, now - room.raceStartedAt);
        const weatherGrip = resolveWeatherVisuals(
          baked.definition.palette,
          baked.definition.defaultWeather,
          room.weatherMode,
          raceElapsedMs,
        ).gripMultiplier;
        const allPositions = Array.from(room.players.values());

        for (const [cpuId, entry] of room.cpuCars.entries()) {
          if (entry.state.finished) continue;
          const others = allPositions
            .filter((p) => p.id !== cpuId)
            .map((p) => ({ x: p.x, y: p.y, z: p.z }));
          const input = computeCpuCarInput(entry.state, baked, others, entry.profile);
          stepCarPhysics(
            entry.state,
            input,
            baked,
            dt,
            raceElapsedMs,
            true,
            weatherGrip,
            entry.profile.pace,
          );
          resolveCarCollisions(entry.state, others);
          room.players.set(
            cpuId,
            cpuStateToTelemetry(entry.profile, entry.slotIndex, entry.state),
          );
        }
      }

      if (room.phase === 'countdown' || room.phase === 'racing') {
        const snapshot: ServerWsMessage = {
          type: 'world_snapshot',
          roomId: room.roomId,
          phase: room.phase,
          countdownRemainingMs:
            room.phase === 'countdown' ? Math.max(0, room.countdownEndsAt - now) : 0,
          raceElapsedMs:
            room.phase === 'racing' ? Math.max(0, now - room.raceStartedAt) : 0,
          players: Array.from(room.players.values()),
        };
        const json = JSON.stringify(snapshot);
        for (const client of clients.values()) {
          if (client.roomId === room.roomId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(json);
          }
        }
      }
    }
  }, 50);

  if (IS_PROD) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Circuit server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
