import type { BakedTrackData, SegmentType } from '../shared/types.ts';
import { getGridSlotTransform, projectPointOnTrack } from './tracks.ts';

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  handbrake: boolean;
}

export interface CarPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  speed: number; // signed forward speed (m/s)
  steerAngle: number;
  pitch: number;
  roll: number;
  wheelSpin: number;
  hintSampleIndex: number;
  segmentType: SegmentType;
  offRoad: boolean;
  wrongWay: boolean;
  // Lap & race tracking
  lap: number; // 1-indexed current lap
  sectorMask: number; // bitmask of sectors visited in current lap (bits 0..3)
  lastT: number;
  progress: number; // continuous race progress: (lap - 1) + t
  lapStartMs: number;
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
}

export const PHYSICS_CONSTANTS = {
  MAX_SPEED: 46, // ~165 km/h
  MAX_REVERSE_SPEED: 14,
  ACCEL: 24,
  BRAKE_DECEL: 38,
  COAST_DECEL: 6.5,
  OFFROAD_DRAG: 18,
  STEER_RATE: 2.35,
  LATERAL_GRIP: 8.5,
  HANDBRAKE_GRIP: 2.8,
  CAR_RADIUS: 1.55,
};

export function createInitialCarState(
  baked: BakedTrackData,
  slotIndex: number,
): CarPhysicsState {
  const spawn = getGridSlotTransform(baked, slotIndex);
  const proj = projectPointOnTrack(spawn.x, spawn.z, baked);

  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vz: 0,
    yaw: spawn.yaw,
    speed: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    wheelSpin: 0,
    hintSampleIndex: proj.sampleIndex,
    segmentType: proj.segmentType,
    offRoad: false,
    wrongWay: false,
    lap: 1,
    sectorMask: 0,
    lastT: proj.t,
    progress: proj.t > 0.7 ? proj.t - 1 : proj.t, // negative pre-line grid position
    lapStartMs: 0,
    bestLapMs: null,
    finished: false,
    finishTimeMs: null,
  };
}

export function resetCarToTrack(
  state: CarPhysicsState,
  baked: BakedTrackData,
): void {
  const proj = projectPointOnTrack(state.x, state.z, baked, state.hintSampleIndex);
  const s = proj.sample;
  state.x = s.x;
  state.y = s.y;
  state.z = s.z;
  state.vx = 0;
  state.vz = 0;
  state.speed = 0;
  state.yaw = Math.atan2(s.tx, s.tz);
  state.pitch = 0;
  state.roll = 0;
  state.offRoad = false;
  state.wrongWay = false;
  state.hintSampleIndex = proj.sampleIndex;
}

export function stepCarPhysics(
  state: CarPhysicsState,
  input: CarInput,
  baked: BakedTrackData,
  dt: number,
  raceElapsedMs: number,
  canDrive: boolean,
  weatherGripMultiplier = 1.0,
  paceMultiplier = 1.0,
): { lapCompleted: number | null; collidedWall: boolean } {
  const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);
  const gripMult = baked.definition.gripMultiplier * weatherGripMultiplier;
  const clampedPace = Math.max(0.65, Math.min(1.12, paceMultiplier));
  const maxSpeed = PHYSICS_CONSTANTS.MAX_SPEED * clampedPace;
  const accel = PHYSICS_CONSTANTS.ACCEL * (0.94 + 0.06 * clampedPace);

  const activeInput: CarInput = canDrive
    ? input
    : { throttle: 0, brake: 0, steer: 0, handbrake: false };

  // Smooth steering wheel angle
  const targetSteer = activeInput.steer * 0.65;
  state.steerAngle += (targetSteer - state.steerAngle) * Math.min(1, 12 * clampedDt);

  const fx = Math.sin(state.yaw);
  const fz = Math.cos(state.yaw);
  const rx = Math.cos(state.yaw);
  const rz = -Math.sin(state.yaw);

  // Decompose current velocity into forward & lateral components
  let forwardVel = state.vx * fx + state.vz * fz;
  let lateralVel = state.vx * rx + state.vz * rz;

  // Longitudinal forces (pure driving: throttle, brake/reverse, natural drag)
  if (activeInput.throttle > 0) {
    if (forwardVel < -1) {
      forwardVel += PHYSICS_CONSTANTS.BRAKE_DECEL * clampedDt;
    } else {
      const speedRatio = Math.max(0, forwardVel / maxSpeed);
      const accelFactor = 1.0 - 0.55 * speedRatio * speedRatio;
      forwardVel += accel * accelFactor * activeInput.throttle * clampedDt;
    }
  }

  if (activeInput.brake > 0) {
    if (forwardVel > 0.8) {
      forwardVel -= PHYSICS_CONSTANTS.BRAKE_DECEL * activeInput.brake * clampedDt;
    } else {
      forwardVel -= accel * 0.65 * activeInput.brake * clampedDt;
    }
  }

  if (activeInput.throttle === 0 && activeInput.brake === 0) {
    const drag = PHYSICS_CONSTANTS.COAST_DECEL * clampedDt;
    if (Math.abs(forwardVel) <= drag) {
      forwardVel = 0;
    } else {
      forwardVel -= Math.sign(forwardVel) * drag;
    }
  }

  if (activeInput.handbrake) {
    const hbDrag = 14 * clampedDt;
    if (Math.abs(forwardVel) <= hbDrag) forwardVel = 0;
    else forwardVel -= Math.sign(forwardVel) * hbDrag;
  }

  // Off-road rolling resistance
  if (state.offRoad) {
    const extraDrag = PHYSICS_CONSTANTS.OFFROAD_DRAG * clampedDt;
    if (Math.abs(forwardVel) <= extraDrag) forwardVel = 0;
    else forwardVel -= Math.sign(forwardVel) * extraDrag;
    forwardVel = Math.min(forwardVel, maxSpeed * 0.68);
  }

  forwardVel = Math.max(
    -PHYSICS_CONSTANTS.MAX_REVERSE_SPEED,
    Math.min(maxSpeed, forwardVel),
  );

  // Speed-sensitive steering yaw rate
  const absSpeed = Math.abs(forwardVel);
  const steerResponse =
    absSpeed > 0.35
      ? Math.min(1, absSpeed / 7.5) * (1 - 0.32 * (absSpeed / maxSpeed))
      : 0;
  const reverseSign = forwardVel >= -0.1 ? 1 : -1;
  const handbrakeTurnBoost = activeInput.handbrake ? 1.28 : 1.0;
  state.yaw +=
    activeInput.steer *
    PHYSICS_CONSTANTS.STEER_RATE *
    steerResponse *
    reverseSign *
    handbrakeTurnBoost *
    clampedDt;

  // Recompute basis after yaw rotation & apply tire lateral grip
  const nfx = Math.sin(state.yaw);
  const nfz = Math.cos(state.yaw);
  const nrx = Math.cos(state.yaw);
  const nrz = -Math.sin(state.yaw);

  const gripRate =
    (activeInput.handbrake ? PHYSICS_CONSTANTS.HANDBRAKE_GRIP : PHYSICS_CONSTANTS.LATERAL_GRIP) *
    gripMult *
    (state.offRoad ? 0.68 : 1.0);
  lateralVel *= Math.exp(-gripRate * clampedDt);

  state.vx = nfx * forwardVel + nrx * lateralVel;
  state.vz = nfz * forwardVel + nrz * lateralVel;
  state.speed = forwardVel;

  // Integrate horizontal position
  state.x += state.vx * clampedDt;
  state.z += state.vz * clampedDt;
  state.wheelSpin += forwardVel * clampedDt * 2.2;

  // Project onto track for elevation, guardrails, bridges & tunnels
  const proj = projectPointOnTrack(state.x, state.z, baked, state.hintSampleIndex);
  state.hintSampleIndex = proj.sampleIndex;
  state.segmentType = proj.segmentType;

  // Smooth vertical ride height tracking road surface
  state.y += (proj.roadY - state.y) * Math.min(1, 18 * clampedDt);

  // Visual pitch (slope + accel/brake squat) and body roll (cornering)
  const targetPitch =
    -proj.sample.ty * 0.95 +
    (activeInput.brake > 0 && forwardVel > 3 ? 0.035 : 0) -
    (activeInput.throttle > 0 ? 0.025 : 0);
  const targetRoll = -activeInput.steer * Math.min(1, absSpeed / 25) * 0.065;
  state.pitch += (targetPitch - state.pitch) * Math.min(1, 10 * clampedDt);
  state.roll += (targetRoll - state.roll) * Math.min(1, 10 * clampedDt);

  // Road surface vs off-road shoulder vs hard barrier containment
  const roadEdge = proj.halfWidth;
  state.offRoad = proj.absLateral > roadEdge && proj.segmentType === 'road';

  // Bridges & tunnels have snug barriers; open road has wider gravel/grass shoulder before guardrail
  const wallLimit =
    proj.segmentType === 'bridge' || proj.segmentType === 'tunnel'
      ? roadEdge - 1.15
      : roadEdge + 4.8;

  let collidedWall = false;
  if (proj.absLateral > wallLimit) {
    collidedWall = true;
    const sign = Math.sign(proj.lateralOffset) || 1;
    const clampedOffset = sign * wallLimit;
    state.x = proj.sample.x + proj.sample.rx * clampedOffset;
    state.z = proj.sample.z + proj.sample.rz * clampedOffset;

    // Reflect/damp outward velocity component along road right normal
    const vDotR = state.vx * proj.sample.rx + state.vz * proj.sample.rz;
    if (vDotR * sign > 0) {
      state.vx -= proj.sample.rx * vDotR * 1.25;
      state.vz -= proj.sample.rz * vDotR * 1.25;
      state.vx *= 0.85;
      state.vz *= 0.85;
      state.speed = state.vx * nfx + state.vz * nfz;
    }
  }

  // Wrong-way check
  const dotForward = nfx * proj.sample.tx + nfz * proj.sample.tz;
  state.wrongWay = forwardVel > 6 && dotForward < -0.35;

  // Sector & Lap progression (4 sectors per lap: [0..0.25), [0.25..0.5), [0.5..0.75), [0.75..1))
  let lapCompleted: number | null = null;
  if (canDrive && !state.finished) {
    const t = proj.t;
    const sector = Math.min(3, Math.floor(t * 4));
    // Require sequential sector visits to prevent reverse-lap exploits
    if (sector === 0) {
      state.sectorMask |= 1;
    } else if (sector === 1 && (state.sectorMask & 1)) {
      state.sectorMask |= 2;
    } else if (sector === 2 && (state.sectorMask & 2)) {
      state.sectorMask |= 4;
    } else if (sector === 3 && (state.sectorMask & 4)) {
      state.sectorMask |= 8;
    }

    // Detect crossing start/finish line forward (from t > 0.8 to t < 0.2) with all 4 sectors cleared
    if (state.lastT > 0.8 && t < 0.2 && state.sectorMask === 15) {
      const lapDuration = raceElapsedMs - state.lapStartMs;
      if (lapDuration > 2000) {
        if (state.bestLapMs === null || lapDuration < state.bestLapMs) {
          state.bestLapMs = lapDuration;
        }
      }
      lapCompleted = state.lap;
      state.lapStartMs = raceElapsedMs;
      state.sectorMask = 1; // Entered sector 0 of new lap

      if (state.lap >= baked.definition.laps) {
        state.finished = true;
        state.finishTimeMs = raceElapsedMs;
        state.progress = baked.definition.laps;
      } else {
        state.lap += 1;
      }
    }

    state.lastT = t;
    if (!state.finished) {
      // Before crossing line on lap 1 from starting grid (t > 0.75 and sectorMask === 0)
      if (state.lap === 1 && state.sectorMask === 0 && t > 0.75) {
        state.progress = t - 1;
      } else {
        state.progress = (state.lap - 1) + t;
      }
    }
  }

  return { lapCompleted, collidedWall };
}

/**
 * Resolves elastic car-to-car collision against remote multiplayer cars.
 */
export function resolveCarCollisions(
  local: CarPhysicsState,
  remotes: Array<{ x: number; y: number; z: number }>,
): boolean {
  const minDist = PHYSICS_CONSTANTS.CAR_RADIUS * 2;
  const minDistSq = minDist * minDist;
  let bumped = false;

  for (let i = 0; i < remotes.length; i++) {
    const r = remotes[i];
    if (Math.abs(local.y - r.y) > 2.5) continue;
    const dx = local.x - r.x;
    const dz = local.z - r.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.0001 && d2 < minDistSq) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = minDist - d;
      local.x += nx * overlap * 0.65;
      local.z += nz * overlap * 0.65;

      const relDot = local.vx * nx + local.vz * nz;
      if (relDot < 0) {
        local.vx -= nx * relDot * 1.35;
        local.vz -= nz * relDot * 1.35;
        local.vx *= 0.9;
        local.vz *= 0.9;
      }
      bumped = true;
    }
  }
  return bumped;
}

export function computeGear(speedMs: number): number {
  const kmh = Math.abs(speedMs) * 3.6;
  if (kmh < 28) return 1;
  if (kmh < 62) return 2;
  if (kmh < 98) return 3;
  if (kmh < 132) return 4;
  return 5;
}
