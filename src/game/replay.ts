import type {
  ReplayCarSnapshot,
  ReplayDriverMeta,
  ReplayFrame,
  SavedRaceReplay,
  TrackId,
  WeatherMode,
} from '../shared/types';

export const REPLAY_STORAGE_KEY = 'apex_circuit_last_replay_v1';
export const MAX_REPLAY_FRAMES = 4500;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function quantizeCarSnapshot(car: ReplayCarSnapshot): ReplayCarSnapshot {
  return {
    id: car.id,
    x: round2(car.x),
    y: round2(car.y),
    z: round2(car.z),
    yaw: round3(car.yaw),
    speed: round2(car.speed),
    steerAngle: round3(car.steerAngle),
    lap: car.lap,
    progress: round3(car.progress),
  };
}

function downsampleFrames(frames: ReplayFrame[], maxFrames: number): ReplayFrame[] {
  if (frames.length <= maxFrames) return frames;
  const step = frames.length / maxFrames;
  const out: ReplayFrame[] = [];
  for (let i = 0; i < maxFrames - 1; i++) {
    out.push(frames[Math.floor(i * step)]);
  }
  out.push(frames[frames.length - 1]);
  return out;
}

export function buildSavedReplay(params: {
  trackId: TrackId;
  weatherMode: WeatherMode;
  drivers: ReplayDriverMeta[];
  frames: ReplayFrame[];
}): SavedRaceReplay | null {
  if (params.frames.length < 2 || params.drivers.length === 0) {
    return null;
  }
  const boundedFrames = downsampleFrames(params.frames, MAX_REPLAY_FRAMES);
  const startMs = boundedFrames[0].timeMs;
  const normalizedFrames: ReplayFrame[] = boundedFrames.map((f) => ({
    timeMs: Math.max(0, Math.round(f.timeMs - startMs)),
    cars: f.cars.map(quantizeCarSnapshot),
  }));
  const durationMs = Math.max(
    100,
    normalizedFrames[normalizedFrames.length - 1].timeMs,
  );

  return {
    id: `replay-${Date.now()}`,
    trackId: params.trackId,
    weatherMode: params.weatherMode,
    recordedAtIso: new Date().toISOString(),
    durationMs,
    drivers: [...params.drivers].sort((a, b) => a.rank - b.rank),
    frames: normalizedFrames,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Samples and smoothly interpolates all car states at a given replay timestamp.
 */
export function sampleReplayFrame(
  replay: SavedRaceReplay,
  timeMs: number,
): ReplayFrame {
  const frames = replay.frames;
  if (frames.length === 0) {
    return { timeMs: 0, cars: [] };
  }
  const clampedTime = Math.max(0, Math.min(replay.durationMs, timeMs));
  if (frames.length === 1 || clampedTime <= frames[0].timeMs) {
    return { timeMs: clampedTime, cars: frames[0].cars };
  }
  const lastIdx = frames.length - 1;
  if (clampedTime >= frames[lastIdx].timeMs) {
    return { timeMs: clampedTime, cars: frames[lastIdx].cars };
  }

  // Binary search for bracketing frames
  let lo = 0;
  let hi = lastIdx;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timeMs <= clampedTime) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const fa = frames[lo];
  const fb = frames[hi];
  const span = fb.timeMs - fa.timeMs;
  const alpha = span > 0 ? Math.max(0, Math.min(1, (clampedTime - fa.timeMs) / span)) : 0;

  const bMap = new Map<string, ReplayCarSnapshot>();
  for (let i = 0; i < fb.cars.length; i++) {
    bMap.set(fb.cars[i].id, fb.cars[i]);
  }

  const cars: ReplayCarSnapshot[] = fa.cars.map((ca) => {
    const cb = bMap.get(ca.id);
    if (!cb) return ca;
    return {
      id: ca.id,
      x: ca.x + (cb.x - ca.x) * alpha,
      y: ca.y + (cb.y - ca.y) * alpha,
      z: ca.z + (cb.z - ca.z) * alpha,
      yaw: lerpAngle(ca.yaw, cb.yaw, alpha),
      speed: ca.speed + (cb.speed - ca.speed) * alpha,
      steerAngle: ca.steerAngle + (cb.steerAngle - ca.steerAngle) * alpha,
      lap: ca.lap,
      progress: ca.progress + (cb.progress - ca.progress) * alpha,
    };
  });

  return { timeMs: clampedTime, cars };
}

export function saveLastRaceReplay(replay: SavedRaceReplay): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(replay));
  } catch {
    // If localStorage quota is tight, compact frames by 50% and retry once
    try {
      const compact: SavedRaceReplay = {
        ...replay,
        frames: downsampleFrames(replay.frames, Math.max(120, Math.floor(replay.frames.length * 0.45))),
      };
      window.localStorage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore storage failures in private browsing or full quota
    }
  }
}

export function loadLastRaceReplay(): SavedRaceReplay | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(REPLAY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRaceReplay;
    if (
      !parsed ||
      typeof parsed.durationMs !== 'number' ||
      !Number.isFinite(parsed.durationMs) ||
      parsed.durationMs <= 0 ||
      !Array.isArray(parsed.frames) ||
      parsed.frames.length < 2 ||
      typeof parsed.frames[0]?.timeMs !== 'number' ||
      !Array.isArray(parsed.drivers) ||
      parsed.drivers.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
