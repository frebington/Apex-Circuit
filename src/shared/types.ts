export type TrackId =
  | 'alpine_gorge'
  | 'redrock_crossing'
  | 'frostpeak_pass'
  | 'coastal_causeway'
  | 'sunset_valley';

export type SegmentType = 'road' | 'bridge' | 'tunnel';

export type ClimateType = 'temperate' | 'desert' | 'arctic' | 'tropical' | 'autumn';

export type WeatherCondition = 'clear' | 'rain' | 'fog' | 'sunset';

export type WeatherMode = 'auto' | 'dynamic' | WeatherCondition;

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover' | 'replay';

export type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'finished';

export type CameraMode = 'chase' | 'hood' | 'overview';

export type CarChassisId = 'gt_coupe' | 'formula_open' | 'rally_hatch' | 'hyper_prototype';

export type PaintFinishId = 'gloss' | 'metallic' | 'matte' | 'chrome';

export interface CarChassisOption {
  id: CarChassisId;
  name: string;
  shortLabel: string;
}

export const CAR_CHASSIS_OPTIONS: CarChassisOption[] = [
  { id: 'gt_coupe', name: 'Apex GT', shortLabel: 'GT' },
  { id: 'formula_open', name: 'Formula Aero', shortLabel: 'Formula' },
  { id: 'rally_hatch', name: 'Rally Spec', shortLabel: 'Rally' },
  { id: 'hyper_prototype', name: 'Le Mans Proto', shortLabel: 'Proto' },
];

export interface PaintFinishOption {
  id: PaintFinishId;
  name: string;
}

export const PAINT_FINISH_OPTIONS: PaintFinishOption[] = [
  { id: 'gloss', name: 'Gloss' },
  { id: 'metallic', name: 'Metallic' },
  { id: 'matte', name: 'Matte' },
  { id: 'chrome', name: 'Chrome' },
];

export interface CarLivery {
  id: string;
  name: string;
  primary: string;
  accent: string;
}

export const CAR_LIVERIES: CarLivery[] = [
  { id: 'crimson', name: 'Crimson', primary: '#dc2626', accent: '#f8fafc' },
  { id: 'cobalt', name: 'Cobalt', primary: '#2563eb', accent: '#facc15' },
  { id: 'amber', name: 'Solar', primary: '#d97706', accent: '#1e293b' },
  { id: 'emerald', name: 'Emerald', primary: '#059669', accent: '#ecfdf5' },
  { id: 'alpine', name: 'Alpine', primary: '#f1f5f9', accent: '#ef4444' },
  { id: 'graphite', name: 'Graphite', primary: '#334155', accent: '#38bdf8' },
];

export type DailyRewardLiveryId =
  | 'rosso_neon'
  | 'hyper_cyan'
  | 'acid_lime'
  | 'royal_violet'
  | 'papaya_orange'
  | 'petronas_teal'
  | 'bwt_magenta'
  | 'championship_gold';

export interface DailyRewardLivery extends CarLivery {
  id: DailyRewardLiveryId;
}

export const DAILY_REWARD_LIVERIES: DailyRewardLivery[] = [
  { id: 'rosso_neon', name: 'Rosso Neon', primary: '#f43f5e', accent: '#fef08a' },
  { id: 'hyper_cyan', name: 'Hyper Cyan', primary: '#06b6d4', accent: '#0f172a' },
  { id: 'acid_lime', name: 'Acid Lime', primary: '#84cc16', accent: '#1e293b' },
  { id: 'royal_violet', name: 'Royal Violet', primary: '#8b5cf6', accent: '#f8fafc' },
  { id: 'papaya_orange', name: 'Papaya Spec', primary: '#f97316', accent: '#0f172a' },
  { id: 'petronas_teal', name: 'Aero Teal', primary: '#14b8a6', accent: '#f8fafc' },
  { id: 'bwt_magenta', name: 'Track Magenta', primary: '#d946ef', accent: '#1e293b' },
  { id: 'championship_gold', name: 'Champion Gold', primary: '#eab308', accent: '#1e293b' },
];

export const ALL_CAR_LIVERIES: CarLivery[] = [
  ...CAR_LIVERIES,
  ...DAILY_REWARD_LIVERIES,
];

export interface DailyChallengeSpec {
  dateKey: string; // YYYY-MM-DD (UTC)
  trackId: TrackId;
  targetTimeMs: number; // Total race time target for the track's full laps
  rewardLivery: DailyRewardLivery;
}

export interface DailyChallengeProgress {
  currentStreak: number;
  bestStreak: number;
  totalCompleted: number;
  lastCompletedDate: string | null;
  unlockedLiveryIds: DailyRewardLiveryId[];
  updatedAtMs: number;
}

export interface LeaderboardRecord {
  id: string;
  uid: string;
  driverName: string;
  trackId: TrackId;
  bestLapMs: number;
  chassisId: CarChassisId;
  paintFinish: PaintFinishId;
  color: string;
  updatedAtMs: number;
}

export interface TrackControlPoint {
  x: number;
  y: number;
  z: number;
  width: number;
  segmentType: SegmentType;
}

export interface TrackPalette {
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  terrainLow: string;
  terrainMid: string;
  terrainHigh: string;
  roadColor: string;
  roadStripeColor: string;
  curbA: string;
  curbB: string;
  bridgeDeckColor: string;
  bridgeRailColor: string;
  tunnelWallColor: string;
  tunnelLightColor: string;
  waterColor: string | null;
  waterLevel: number;
  foliageA: string;
  foliageB: string;
  rockColor: string;
}

export interface TrackDefinition {
  id: TrackId;
  name: string;
  climateLabel: string;
  climate: ClimateType;
  defaultWeather: WeatherCondition;
  terrainSummary: string;
  features: string[];
  laps: number;
  gripMultiplier: number;
  worldRadius: number;
  waterRadiusScale: number;
  palette: TrackPalette;
  controlPoints: TrackControlPoint[];
}

export interface TrackSample {
  index: number;
  t: number;
  s: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  rz: number;
  width: number;
  segmentType: SegmentType;
  isOverpass?: boolean;
}

export interface BakedTrackData {
  definition: TrackDefinition;
  samples: TrackSample[];
  totalLength: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerTelemetry {
  id: string;
  name: string;
  color: string;
  chassisId?: CarChassisId;
  paintFinish?: PaintFinishId;
  slotIndex: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steerAngle: number;
  lap: number;
  progress: number;
  bestLapMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;
  connected: boolean;
  isCpu?: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  trackId: TrackId;
  weatherMode?: WeatherMode;
  cpuCount?: number;
  cpuDifficulty?: number;
  hostId: string | null;
  phase: RoomPhase;
  countdownRemainingMs: number;
  raceElapsedMs: number;
  laps: number;
  players: PlayerTelemetry[];
}

export interface HudState {
  speedKmh: number;
  gear: number;
  throttle: number;
  brake: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  currentLapMs: number;
  bestLapMs: number | null;
  segmentType: SegmentType;
  offRoad: boolean;
  countdownText: string | null;
  lapBanner: string | null;
  wrongWay: boolean;
  weatherCondition: WeatherCondition;
}

export interface ReplayCarSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steerAngle: number;
  lap: number;
  progress: number;
}

export interface ReplayFrame {
  timeMs: number;
  cars: ReplayCarSnapshot[];
}

export interface ReplayDriverMeta {
  id: string;
  name: string;
  color: string;
  chassisId?: CarChassisId;
  paintFinish?: PaintFinishId;
  isCpu?: boolean;
  finishTimeMs: number | null;
  bestLapMs: number | null;
  rank: number;
}

export interface SavedRaceReplay {
  id: string;
  trackId: TrackId;
  weatherMode: WeatherMode;
  recordedAtIso: string;
  durationMs: number;
  drivers: ReplayDriverMeta[];
  frames: ReplayFrame[];
}

export type ClientWsMessage =
  | {
      type: 'join_room';
      roomId: string;
      name: string;
      color: string;
      chassisId?: CarChassisId;
      paintFinish?: PaintFinishId;
      trackId?: TrackId;
      weatherMode?: WeatherMode;
      cpuCount?: number;
      cpuDifficulty?: number;
    }
  | {
      type: 'update_profile';
      name: string;
      color: string;
      chassisId?: CarChassisId;
      paintFinish?: PaintFinishId;
    }
  | {
      type: 'select_track';
      trackId: TrackId;
    }
  | {
      type: 'select_weather';
      weatherMode: WeatherMode;
    }
  | {
      type: 'select_cpu_settings';
      cpuCount: number;
      cpuDifficulty: number;
    }
  | {
      type: 'start_race';
    }
  | {
      type: 'car_state';
      x: number;
      y: number;
      z: number;
      yaw: number;
      speed: number;
      steerAngle: number;
      lap: number;
      progress: number;
      bestLapMs: number | null;
      finished: boolean;
      finishTimeMs: number | null;
    }
  | {
      type: 'return_lobby';
    };

export type ServerWsMessage =
  | {
      type: 'welcome';
      playerId: string;
      room: RoomSnapshot;
    }
  | {
      type: 'room_state';
      room: RoomSnapshot;
    }
  | {
      type: 'world_snapshot';
      roomId: string;
      phase: RoomPhase;
      countdownRemainingMs: number;
      raceElapsedMs: number;
      players: PlayerTelemetry[];
    }
  | {
      type: 'error';
      message: string;
    };
