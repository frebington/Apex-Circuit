import {
  CAR_CHASSIS_OPTIONS,
  CAR_LIVERIES,
  PAINT_FINISH_OPTIONS,
  type BakedTrackData,
  type CarChassisId,
  type PaintFinishId,
  type PlayerTelemetry,
} from '../shared/types.ts';
import {
  PHYSICS_CONSTANTS,
  type CarInput,
  type CarPhysicsState,
} from './physics.ts';
import { projectPointOnTrack } from './tracks.ts';

export interface CpuProfile {
  id: string;
  name: string;
  color: string;
  chassisId: CarChassisId;
  paintFinish: PaintFinishId;
  pace: number; // base speed multiplier
  cornerSkill: number; // cornering & braking precision multiplier
  steerResponsiveness: number;
  lineBias: number; // preferred lateral offset (m)
}

export interface CpuSkillParams {
  speedScale: number;
  cornerSkill: number;
  steerResponsiveness: number;
  tierLabel: 'Rookie' | 'Club' | 'Pro' | 'Master' | 'Legend';
}

export const MAX_CPU_COUNT = 11;
export const DEFAULT_CPU_COUNT = 7;
export const DEFAULT_CPU_DIFFICULTY = 55;
export const TARGET_GRID_SIZE = DEFAULT_CPU_COUNT + 1;

const CPU_BASE_PROFILES: Array<{
  name: string;
  pace: number;
  lineBias: number;
  chassisId: CarChassisId;
  paintFinish: PaintFinishId;
}> = [
  { name: 'Apex Bot', pace: 1.025, lineBias: -1.4, chassisId: 'formula_open', paintFinish: 'metallic' },
  { name: 'Titan GP', pace: 1.015, lineBias: -1.8, chassisId: 'hyper_prototype', paintFinish: 'metallic' },
  { name: 'Vortex AI', pace: 1.008, lineBias: 1.4, chassisId: 'hyper_prototype', paintFinish: 'gloss' },
  { name: 'Nova Spec', pace: 0.998, lineBias: -1.0, chassisId: 'gt_coupe', paintFinish: 'chrome' },
  { name: 'Pulse Bot', pace: 0.990, lineBias: -0.6, chassisId: 'gt_coupe', paintFinish: 'matte' },
  { name: 'Drift CPU', pace: 0.982, lineBias: 0.0, chassisId: 'rally_hatch', paintFinish: 'matte' },
  { name: 'Vector RS', pace: 0.975, lineBias: 1.0, chassisId: 'formula_open', paintFinish: 'gloss' },
  { name: 'Blitz CPU', pace: 0.968, lineBias: -1.5, chassisId: 'rally_hatch', paintFinish: 'chrome' },
  { name: 'Kestrel AI', pace: 0.962, lineBias: 1.6, chassisId: 'rally_hatch', paintFinish: 'gloss' },
  { name: 'Zephyr GT', pace: 0.956, lineBias: 0.7, chassisId: 'gt_coupe', paintFinish: 'metallic' },
  { name: 'Orion R', pace: 0.950, lineBias: 1.2, chassisId: 'hyper_prototype', paintFinish: 'matte' },
];

const EXTRA_CPU_PALETTE = [
  '#dc2626',
  '#2563eb',
  '#d97706',
  '#059669',
  '#f1f5f9',
  '#334155',
  '#0ea5e9',
  '#e11d48',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
];

export function clampCpuCount(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_CPU_COUNT;
  return Math.max(0, Math.min(MAX_CPU_COUNT, Math.round(raw)));
}

export function clampCpuDifficulty(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_CPU_DIFFICULTY;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function difficultyToSkillParams(difficulty: number): CpuSkillParams {
  const d = clampCpuDifficulty(difficulty);
  const t = d / 100;
  // Balanced curve: 0 -> 0.81x, 55 (Pro) -> 0.982x (~164 km/h top pack), 100 (Legend) -> 1.08x
  const speedScale = 0.81 + Math.pow(t, 0.75) * 0.27;
  const cornerSkill = 0.78 + t * 0.44;
  const steerResponsiveness = 0.86 + t * 0.36;

  let tierLabel: CpuSkillParams['tierLabel'] = 'Pro';
  if (d < 22) tierLabel = 'Rookie';
  else if (d < 45) tierLabel = 'Club';
  else if (d < 70) tierLabel = 'Pro';
  else if (d < 88) tierLabel = 'Master';
  else tierLabel = 'Legend';

  return {
    speedScale,
    cornerSkill,
    steerResponsiveness,
    tierLabel,
  };
}

/**
 * Generates CPU opponent profiles for up to desiredCpuCount slots (or filling up to maxTotal).
 */
export function buildCpuGridOpponents(
  existingHumans: Array<{ color: string }>,
  desiredCpuCount = DEFAULT_CPU_COUNT,
  difficulty = DEFAULT_CPU_DIFFICULTY,
): CpuProfile[] {
  const maxCpusAllowed = Math.max(0, 12 - existingHumans.length);
  const needed = Math.min(maxCpusAllowed, clampCpuCount(desiredCpuCount));
  if (needed === 0) return [];

  const skill = difficultyToSkillParams(difficulty);
  const usedColors = new Set(existingHumans.map((h) => h.color.toLowerCase()));
  const pool = [...CAR_LIVERIES.map((l) => l.primary), ...EXTRA_CPU_PALETTE].filter(
    (c, idx, arr) =>
      arr.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === idx &&
      !usedColors.has(c.toLowerCase()),
  );
  const fallbackColors = EXTRA_CPU_PALETTE;

  const cpus: CpuProfile[] = [];
  for (let i = 0; i < needed; i++) {
    const template = CPU_BASE_PROFILES[i % CPU_BASE_PROFILES.length];
    const color =
      pool[i] ?? fallbackColors[(i + existingHumans.length) % fallbackColors.length];
    const chassisId =
      template.chassisId ??
      CAR_CHASSIS_OPTIONS[i % CAR_CHASSIS_OPTIONS.length].id;
    const paintFinish =
      template.paintFinish ??
      PAINT_FINISH_OPTIONS[i % PAINT_FINISH_OPTIONS.length].id;

    cpus.push({
      id: `cpu-${i + 1}`,
      name: needed <= CPU_BASE_PROFILES.length ? template.name : `${template.name} ${i + 1}`,
      color,
      chassisId,
      paintFinish,
      pace: Math.max(0.75, Math.min(1.09, template.pace * skill.speedScale)),
      cornerSkill: skill.cornerSkill,
      steerResponsiveness: skill.steerResponsiveness,
      lineBias: template.lineBias,
    });
  }
  return cpus;
}

/**
 * Pure deterministic steering, throttle, and braking policy for a CPU driver.
 * Drives using the exact same stepCarPhysics rules as human players.
 */
export function computeCpuCarInput(
  car: CarPhysicsState,
  baked: BakedTrackData,
  otherCars: Array<{ x: number; y: number; z: number }>,
  profile: {
    pace: number;
    lineBias: number;
    cornerSkill?: number;
    steerResponsiveness?: number;
  },
): CarInput {
  const samples = baked.samples;
  const n = samples.length;
  const proj = projectPointOnTrack(car.x, car.z, baked, car.hintSampleIndex);
  const curIdx = proj.sampleIndex;

  const cornerSkill = profile.cornerSkill ?? 1.0;
  const steerResp = profile.steerResponsiveness ?? 1.0;

  const segLen = baked.totalLength / n || 3.5;
  const speed = Math.max(0, car.speed);

  const safeHalfWidth = Math.max(1.2, proj.halfWidth - 2.45);
  const nearWall = proj.absLateral > safeHalfWidth;

  // Dynamic lookahead tightens near walls/low speeds so hairpins never clip inside barriers
  const lookAheadMeters = nearWall || speed < 10 ? 7.2 : 8.5 + speed * 0.27;
  const lookAheadSteps = Math.max(2, Math.round(lookAheadMeters / segLen));
  const targetSample = samples[(curIdx + lookAheadSteps) % n];

  // Check nearby cars ahead for smooth overtaking without diving off-road
  let avoidBias = 0;
  const detectRange = 10 + cornerSkill * 4.5;
  for (let i = 0; i < otherCars.length; i++) {
    const other = otherCars[i];
    if (Math.abs(other.y - car.y) > 2.5) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const along = dx * fx + dz * fz;
    if (along > 1.0 && along < detectRange) {
      const rx = Math.cos(car.yaw);
      const rz = -Math.sin(car.yaw);
      const side = dx * rx + dz * rz;
      if (Math.abs(side) < 3.0) {
        const urgency = 1 - along / detectRange;
        avoidBias += (side >= 0 ? -1 : 1) * (2.1 + urgency * 1.4);
      }
    }
  }

  let desiredLateral: number;
  if (nearWall) {
    // Steer back cleanly toward road center when close to guardrail/tunnel wall
    desiredLateral =
      Math.sign(proj.lateralOffset) * Math.max(0, safeHalfWidth - 1.2);
  } else {
    desiredLateral = Math.max(
      -safeHalfWidth,
      Math.min(safeHalfWidth, profile.lineBias + avoidBias),
    );
  }

  const tx = targetSample.x + targetSample.rx * desiredLateral;
  const tz = targetSample.z + targetSample.rz * desiredLateral;

  const desiredYaw = Math.atan2(tx - car.x, tz - car.z);
  let yawError = desiredYaw - car.yaw;
  while (yawError > Math.PI) yawError -= Math.PI * 2;
  while (yawError < -Math.PI) yawError += Math.PI * 2;

  const steerDenom = Math.max(0.24, 0.34 / Math.max(0.7, steerResp));
  const steer = Math.max(-1, Math.min(1, yawError / steerDenom));

  // Physics-true curvature cornering speed across short & medium lookahead windows
  const maxPaceSpeed = PHYSICS_CONSTANTS.MAX_SPEED * profile.pace;
  const gripFactor = Math.sqrt(Math.max(0.75, baked.definition.gripMultiplier));
  const cornerAggression = 1.24 + 0.17 * Math.min(1.25, cornerSkill);
  const windows: Array<[number, number, number]> = [
    [2, 12, 0],
    [10, 22, 0.5],
    [20, 34, 3.5],
    [32, 46, 7.5],
  ];

  let curveLimit = maxPaceSpeed;
  for (let w = 0; w < windows.length; w++) {
    const [mA, mB, margin] = windows[w];
    const idxA = (curIdx + Math.max(1, Math.round(mA / segLen))) % n;
    const idxB = (curIdx + Math.max(2, Math.round(mB / segLen))) % n;
    const sA = samples[idxA];
    const sB = samples[idxB];
    const dot = Math.max(-1, Math.min(1, sA.tx * sB.tx + sA.tz * sB.tz));
    const angle = Math.acos(dot);
    const ds = Math.max(segLen, mB - mA);
    if (angle > 0.01) {
      const radius = ds / angle;
      const vSafe = radius * cornerAggression * gripFactor + margin;
      if (vSafe < curveLimit) {
        curveLimit = vSafe;
      }
    }
  }

  const minCornerSpeed = 16.5 * Math.min(1.08, Math.max(0.84, profile.pace));
  const targetSpeed = Math.min(maxPaceSpeed, Math.max(minCornerSpeed, curveLimit));

  // Recover forward cleanly if stalled or facing wrong way
  if (car.wrongWay || car.speed < 1.5) {
    return {
      throttle: 1,
      brake: 0,
      steer,
      handbrake: false,
    };
  }

  const launchThrottle = Math.min(1.0, 0.86 + cornerSkill * 0.16);
  let throttle = 0;
  let brake = 0;

  if (speed > targetSpeed + 2.6) {
    brake = Math.min(1, (speed - targetSpeed) / 10.5);
  } else if (speed > targetSpeed + 0.6) {
    throttle = 0.45 * Math.min(1.15, cornerSkill);
  } else {
    throttle = launchThrottle;
  }

  return {
    throttle,
    brake,
    steer,
    handbrake: false,
  };
}

export function cpuStateToTelemetry(
  profile: CpuProfile,
  slotIndex: number,
  state: CarPhysicsState,
): PlayerTelemetry {
  return {
    id: profile.id,
    name: profile.name,
    color: profile.color,
    chassisId: profile.chassisId,
    paintFinish: profile.paintFinish,
    slotIndex,
    x: state.x,
    y: state.y,
    z: state.z,
    yaw: state.yaw,
    speed: state.speed,
    steerAngle: state.steerAngle,
    lap: state.lap,
    progress: state.progress,
    bestLapMs: state.bestLapMs,
    finished: state.finished,
    finishTimeMs: state.finishTimeMs,
    connected: true,
    isCpu: true,
  };
}
