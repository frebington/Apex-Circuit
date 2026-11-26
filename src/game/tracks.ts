import type {
  BakedTrackData,
  SegmentType,
  TrackDefinition,
  TrackId,
  TrackSample,
} from '../shared/types.ts';

export const TRACK_DEFINITIONS: TrackDefinition[] = [
  {
    id: 'alpine_gorge',
    name: 'Alpine Gorge',
    climateLabel: 'Temperate Mountain',
    climate: 'temperate',
    defaultWeather: 'clear',
    terrainSummary: 'Suzuka-style Figure-8 overpass bridge, pine tunnel & canyon hairpin',
    features: ['Figure-8 Overpass', 'Under-Bridge Loop', 'Mountain Tunnel'],
    laps: 3,
    gripMultiplier: 1.0,
    worldRadius: 330,
    waterRadiusScale: 1,
    palette: {
      skyTop: '#3b82f6',
      skyHorizon: '#bae6fd',
      fogColor: '#b9e2f5',
      fogDensity: 0.0017,
      sunColor: '#fff3d6',
      sunIntensity: 2.1,
      hemiSky: '#93c5fd',
      hemiGround: '#3f5e3a',
      hemiIntensity: 0.85,
      terrainLow: '#4d7c3f',
      terrainMid: '#3f6a34',
      terrainHigh: '#64748b',
      roadColor: '#334155',
      roadStripeColor: '#f8fafc',
      curbA: '#dc2626',
      curbB: '#f8fafc',
      bridgeDeckColor: '#785a3c',
      bridgeRailColor: '#cbd5e1',
      tunnelWallColor: '#475569',
      tunnelLightColor: '#fde68a',
      waterColor: '#0284c7',
      waterLevel: -6.5,
      foliageA: '#2d5a27',
      foliageB: '#3d7a34',
      rockColor: '#64748b',
    },
    // Suzuka-inspired Figure-8: Cross OVER bridge at (0,0,y=11.5), loop around north tunnel & spoon hairpin, drive UNDER bridge at (0,0,y=0)!
    controlPoints: [
      { x: -65, y: 0, z: 122, width: 15.5, segmentType: 'road' },
      { x: 35, y: 0, z: 122, width: 15.5, segmentType: 'road' },
      { x: 122, y: 0.5, z: 112, width: 15.5, segmentType: 'road' },
      { x: 156, y: 2, z: 58, width: 15, segmentType: 'road' },
      { x: 126, y: 5, z: 8, width: 14.5, segmentType: 'road' },
      { x: 56, y: 9.5, z: 14, width: 14, segmentType: 'bridge' },
      { x: 0, y: 11.5, z: 0, width: 14, segmentType: 'bridge' },
      { x: -58, y: 10, z: -18, width: 14, segmentType: 'bridge' },
      { x: -135, y: 6.5, z: -48, width: 14.5, segmentType: 'road' },
      { x: -158, y: 5, z: -115, width: 14.5, segmentType: 'tunnel' },
      { x: -95, y: 4, z: -156, width: 14.5, segmentType: 'tunnel' },
      { x: -12, y: 2.5, z: -138, width: 15, segmentType: 'road' },
      { x: 75, y: 1.5, z: -125, width: 15, segmentType: 'road' },
      { x: 114, y: 0.5, z: -68, width: 15, segmentType: 'road' },
      { x: 54, y: 0, z: -42, width: 15, segmentType: 'road' },
      { x: 0, y: 0, z: 0, width: 15, segmentType: 'road' },
      { x: -64, y: 0, z: 48, width: 15, segmentType: 'road' },
      { x: -138, y: 0, z: 68, width: 15, segmentType: 'road' },
      { x: -132, y: 0, z: 118, width: 15.5, segmentType: 'road' },
    ],
  },
  {
    id: 'redrock_crossing',
    name: 'Redrock Crossing',
    climateLabel: 'Arid Canyonlands',
    climate: 'desert',
    defaultWeather: 'sunset',
    terrainSummary: 'Monza-style power straights, Rettifilo chicane, canyon bridge & mesa tunnel',
    features: ['Rettifilo Chicane', 'Iron Truss Bridge', 'Mesa Tunnel'],
    laps: 3,
    gripMultiplier: 0.94,
    worldRadius: 330,
    waterRadiusScale: 0,
    palette: {
      skyTop: '#2563eb',
      skyHorizon: '#fed7aa',
      fogColor: '#f6cfa8',
      fogDensity: 0.0016,
      sunColor: '#ffe4b5',
      sunIntensity: 2.35,
      hemiSky: '#fde68a',
      hemiGround: '#9a4626',
      hemiIntensity: 0.8,
      terrainLow: '#d97742',
      terrainMid: '#b4532a',
      terrainHigh: '#8c3b1e',
      roadColor: '#3f3b38',
      roadStripeColor: '#fbbf24',
      curbA: '#ea580c',
      curbB: '#fef3c7',
      bridgeDeckColor: '#57534e',
      bridgeRailColor: '#b91c1c',
      tunnelWallColor: '#7c2d12',
      tunnelLightColor: '#fdba74',
      waterColor: null,
      waterLevel: -12,
      foliageA: '#4d7c0f',
      foliageB: '#65a30d',
      rockColor: '#9a3412',
    },
    // Long power straight + sharp Turn 1 chicane + back straight + canyon bridge + inward mesa tunnel
    controlPoints: [
      { x: -90, y: 0, z: 136, width: 16, segmentType: 'road' },
      { x: 0, y: 0, z: 136, width: 16, segmentType: 'road' },
      { x: 105, y: 0, z: 136, width: 16, segmentType: 'road' },
      { x: 158, y: 0.5, z: 122, width: 14.5, segmentType: 'road' },
      { x: 155, y: 1.5, z: 74, width: 14.5, segmentType: 'road' },
      { x: 102, y: 2.5, z: 54, width: 14.5, segmentType: 'road' },
      { x: 152, y: 4, z: 10, width: 15, segmentType: 'road' },
      { x: 144, y: 6, z: -78, width: 15, segmentType: 'road' },
      { x: 88, y: 7.5, z: -144, width: 14.5, segmentType: 'road' },
      { x: 12, y: 8, z: -152, width: 14, segmentType: 'bridge' },
      { x: -58, y: 7, z: -124, width: 14, segmentType: 'bridge' },
      { x: -32, y: 5, z: -52, width: 14.5, segmentType: 'road' },
      { x: -96, y: 6, z: -26, width: 14.5, segmentType: 'tunnel' },
      { x: -162, y: 6, z: -58, width: 14.5, segmentType: 'tunnel' },
      { x: -165, y: 2.5, z: 38, width: 15, segmentType: 'road' },
      { x: -142, y: 0.5, z: 116, width: 15.5, segmentType: 'road' },
    ],
  },
  {
    id: 'frostpeak_pass',
    name: 'Frostpeak Pass',
    climateLabel: 'Arctic Snowfield',
    climate: 'arctic',
    defaultWeather: 'fog',
    terrainSummary: 'Spa/Silverstone-style Eau Rouge climb, glacier bore & stadium esses',
    features: ['Eau Rouge Climb', 'Glacier Tunnel', 'Stadium Esses'],
    laps: 3,
    gripMultiplier: 0.88,
    worldRadius: 330,
    waterRadiusScale: 1,
    palette: {
      skyTop: '#1d4ed8',
      skyHorizon: '#e0f2fe',
      fogColor: '#dbeafe',
      fogDensity: 0.0018,
      sunColor: '#f8fafc',
      sunIntensity: 2.0,
      hemiSky: '#bae6fd',
      hemiGround: '#64748b',
      hemiIntensity: 0.95,
      terrainLow: '#e2e8f0',
      terrainMid: '#cbd5e1',
      terrainHigh: '#64748b',
      roadColor: '#3b4758',
      roadStripeColor: '#38bdf8',
      curbA: '#0284c7',
      curbB: '#f8fafc',
      bridgeDeckColor: '#475569',
      bridgeRailColor: '#e2e8f0',
      tunnelWallColor: '#334155',
      tunnelLightColor: '#7dd3fc',
      waterColor: '#7dd3fc',
      waterLevel: -6.0,
      foliageA: '#1e3a34',
      foliageB: '#2d544b',
      rockColor: '#475569',
    },
    // Boot/Hammerhead F1 Circuit: La Source Hairpin -> Uphill Kemmel Straight -> Glacier Tunnel -> Zig-Zag Stadium Esses -> Ice Lake Bridge
    controlPoints: [
      { x: -82, y: 0, z: 132, width: 15.5, segmentType: 'road' },
      { x: 0, y: 0, z: 132, width: 15.5, segmentType: 'road' },
      { x: 92, y: 0, z: 132, width: 15.5, segmentType: 'road' },
      { x: 148, y: 1.5, z: 118, width: 14.5, segmentType: 'road' },
      { x: 126, y: 3.5, z: 68, width: 14.5, segmentType: 'road' },
      { x: 164, y: 7.5, z: 8, width: 15, segmentType: 'road' },
      { x: 156, y: 11.5, z: -82, width: 15, segmentType: 'road' },
      { x: 112, y: 13, z: -148, width: 14.5, segmentType: 'road' },
      { x: 36, y: 13, z: -152, width: 14.5, segmentType: 'tunnel' },
      { x: -42, y: 11, z: -140, width: 14.5, segmentType: 'tunnel' },
      { x: -42, y: 7, z: -72, width: 14.5, segmentType: 'road' },
      { x: -96, y: 5.5, z: -42, width: 14.5, segmentType: 'road' },
      { x: -44, y: 3.5, z: 8, width: 14.5, segmentType: 'road' },
      { x: -106, y: 2.5, z: 42, width: 14.5, segmentType: 'road' },
      { x: -158, y: 4.5, z: -10, width: 14, segmentType: 'bridge' },
      { x: -154, y: 3.5, z: 76, width: 14, segmentType: 'bridge' },
      { x: -128, y: 0.5, z: 124, width: 15, segmentType: 'road' },
    ],
  },
  {
    id: 'coastal_causeway',
    name: 'Coastal Causeway',
    climateLabel: 'Tropical Coast',
    climate: 'tropical',
    defaultWeather: 'rain',
    terrainSummary: 'Sea overpass loop-under, headland tunnel & Monaco harbor chicane',
    features: ['Sea Overpass Loop', 'Headland Tunnel', 'Harbor Chicane'],
    laps: 3,
    gripMultiplier: 1.0,
    worldRadius: 340,
    waterRadiusScale: 1,
    palette: {
      skyTop: '#0284c7',
      skyHorizon: '#bae6fd',
      fogColor: '#bae6fd',
      fogDensity: 0.0015,
      sunColor: '#fffbeb',
      sunIntensity: 2.25,
      hemiSky: '#7dd3fc',
      hemiGround: '#ca8a04',
      hemiIntensity: 0.9,
      terrainLow: '#eab308',
      terrainMid: '#65a30d',
      terrainHigh: '#57534e',
      roadColor: '#334155',
      roadStripeColor: '#f8fafc',
      curbA: '#ef4444',
      curbB: '#fef08a',
      bridgeDeckColor: '#94a3b8',
      bridgeRailColor: '#f8fafc',
      tunnelWallColor: '#44403c',
      tunnelLightColor: '#fef08a',
      waterColor: '#0ea5e9',
      waterLevel: -5.5,
      foliageA: '#15803d',
      foliageB: '#22c55e',
      rockColor: '#57534e',
    },
    // Sea Overpass Bridge at (-10, -40, y=12): cross OVER bridge, loop around west bay, dive UNDER bridge at (-10, -40, y=0.5), then harbor chicane!
    controlPoints: [
      { x: -65, y: 1, z: 132, width: 15.5, segmentType: 'road' },
      { x: 42, y: 1, z: 132, width: 15.5, segmentType: 'road' },
      { x: 138, y: 1.5, z: 120, width: 15.5, segmentType: 'road' },
      { x: 168, y: 3.5, z: 54, width: 15, segmentType: 'road' },
      { x: 152, y: 6, z: -28, width: 14.5, segmentType: 'tunnel' },
      { x: 108, y: 7.5, z: -104, width: 14.5, segmentType: 'tunnel' },
      { x: 36, y: 9.5, z: -134, width: 14.5, segmentType: 'road' },
      { x: 16, y: 11.5, z: -86, width: 14, segmentType: 'bridge' },
      { x: -10, y: 12, z: -40, width: 14, segmentType: 'bridge' },
      { x: -42, y: 10.5, z: 8, width: 14, segmentType: 'bridge' },
      { x: -124, y: 5.5, z: 26, width: 14.5, segmentType: 'road' },
      { x: -164, y: 2, z: -32, width: 14.5, segmentType: 'road' },
      { x: -138, y: 0.5, z: -102, width: 14.5, segmentType: 'road' },
      { x: -72, y: 0.5, z: -92, width: 14.5, segmentType: 'road' },
      { x: -10, y: 0.5, z: -40, width: 15, segmentType: 'road' },
      { x: 60, y: 1, z: 12, width: 15, segmentType: 'road' },
      { x: 50, y: 1, z: 74, width: 15, segmentType: 'road' },
      { x: -42, y: 1, z: 76, width: 15, segmentType: 'road' },
      { x: -112, y: 1, z: 110, width: 15.5, segmentType: 'road' },
    ],
  },
  {
    id: 'sunset_valley',
    name: 'Sunset Valley',
    climateLabel: 'Golden Highlands',
    climate: 'autumn',
    defaultWeather: 'sunset',
    terrainSummary: 'Interlagos Senna-S drop, twin-arch gorge bridge & inward hairpin complex',
    features: ['Senna-S Drop', 'Twin-Arch Bridge', 'Viaduct Tunnel'],
    laps: 3,
    gripMultiplier: 0.98,
    worldRadius: 330,
    waterRadiusScale: 1,
    palette: {
      skyTop: '#4338ca',
      skyHorizon: '#fdba74',
      fogColor: '#f5b895',
      fogDensity: 0.0017,
      sunColor: '#ffedd5',
      sunIntensity: 2.2,
      hemiSky: '#fb923c',
      hemiGround: '#713f12',
      hemiIntensity: 0.85,
      terrainLow: '#a16207',
      terrainMid: '#854d0e',
      terrainHigh: '#57534e',
      roadColor: '#292524',
      roadStripeColor: '#fcd34d',
      curbA: '#dc2626',
      curbB: '#fde68a',
      bridgeDeckColor: '#78716c',
      bridgeRailColor: '#f5f5f4',
      tunnelWallColor: '#44403c',
      tunnelLightColor: '#fbbf24',
      waterColor: '#0369a1',
      waterLevel: -6.5,
      foliageA: '#c2410c',
      foliageB: '#d97706',
      rockColor: '#57534e',
    },
    // Spearhead F1 Layout: Fast straight -> Steep Senna-S Drop -> Sweeping Twin-Arch Bridge -> North Viaduct Tunnel -> Double Hairpin
    controlPoints: [
      { x: -86, y: 0, z: 128, width: 15.5, segmentType: 'road' },
      { x: 0, y: 0, z: 128, width: 15.5, segmentType: 'road' },
      { x: 96, y: 0, z: 128, width: 15.5, segmentType: 'road' },
      { x: 162, y: -1, z: 114, width: 15, segmentType: 'road' },
      { x: 116, y: -2, z: 56, width: 14.5, segmentType: 'road' },
      { x: 164, y: 1.5, z: 0, width: 15, segmentType: 'road' },
      { x: 146, y: 5.5, z: -82, width: 15, segmentType: 'road' },
      { x: 78, y: 8.5, z: -142, width: 14.5, segmentType: 'bridge' },
      { x: -8, y: 9, z: -152, width: 14.5, segmentType: 'bridge' },
      { x: -84, y: 8, z: -132, width: 15, segmentType: 'road' },
      { x: -132, y: 7, z: -76, width: 14.5, segmentType: 'tunnel' },
      { x: -160, y: 5, z: -2, width: 14.5, segmentType: 'tunnel' },
      { x: -120, y: 3, z: 46, width: 14.5, segmentType: 'road' },
      { x: -52, y: 2, z: 24, width: 14.5, segmentType: 'road' },
      { x: -66, y: 1, z: 80, width: 14.5, segmentType: 'road' },
      { x: -136, y: 0.5, z: 96, width: 15, segmentType: 'road' },
    ],
  },
];

const TRACK_MAP = new Map<TrackId, TrackDefinition>(
  TRACK_DEFINITIONS.map((t) => [t.id, t]),
);

const BAKED_CACHE = new Map<TrackId, BakedTrackData>();

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function getTrackDefinition(trackId: TrackId): TrackDefinition {
  return TRACK_MAP.get(trackId) ?? TRACK_DEFINITIONS[0];
}

export function getBakedTrack(trackId: TrackId): BakedTrackData {
  const cached = BAKED_CACHE.get(trackId);
  if (cached) return cached;
  const def = getTrackDefinition(trackId);
  const baked = bakeTrack(def, 360);
  BAKED_CACHE.set(trackId, baked);
  return baked;
}

export function bakeTrack(definition: TrackDefinition, sampleCount = 360): BakedTrackData {
  const pts = definition.controlPoints;
  const n = pts.length;

  const denseCount = sampleCount * 4;
  const dense: Array<{
    x: number;
    y: number;
    z: number;
    width: number;
    segmentType: SegmentType;
  }> = [];

  for (let i = 0; i < denseCount; i++) {
    const u = (i / denseCount) * n;
    const idx = Math.floor(u) % n;
    const localT = u - Math.floor(u);

    const p0 = pts[(idx - 1 + n) % n];
    const p1 = pts[idx];
    const p2 = pts[(idx + 1) % n];
    const p3 = pts[(idx + 2) % n];

    const x = catmullRom(p0.x, p1.x, p2.x, p3.x, localT);
    const y = catmullRom(p0.y, p1.y, p2.y, p3.y, localT);
    const z = catmullRom(p0.z, p1.z, p2.z, p3.z, localT);
    const width = p1.width + (p2.width - p1.width) * localT;
    const segmentType: SegmentType =
      p1.segmentType === p2.segmentType
        ? p1.segmentType
        : localT < 0.5
          ? p1.segmentType
          : p2.segmentType;

    dense.push({ x, y, z, width, segmentType });
  }

  const cumLen = new Float64Array(denseCount + 1);
  for (let i = 0; i < denseCount; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % denseCount];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    cumLen[i + 1] = cumLen[i] + Math.hypot(dx, dy, dz);
  }
  const totalLength = cumLen[denseCount];

  const samples: TrackSample[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  let denseCursor = 0;
  for (let i = 0; i < sampleCount; i++) {
    const targetS = (i / sampleCount) * totalLength;
    while (denseCursor < denseCount - 1 && cumLen[denseCursor + 1] < targetS) {
      denseCursor++;
    }
    const s0 = cumLen[denseCursor];
    const s1 = cumLen[denseCursor + 1];
    const alpha = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;

    const a = dense[denseCursor];
    const b = dense[(denseCursor + 1) % denseCount];

    const x = a.x + (b.x - a.x) * alpha;
    const y = a.y + (b.y - a.y) * alpha;
    const z = a.z + (b.z - a.z) * alpha;
    const width = a.width + (b.width - a.width) * alpha;
    const segmentType = alpha < 0.5 ? a.segmentType : b.segmentType;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;

    samples.push({
      index: i,
      t: i / sampleCount,
      s: targetS,
      x,
      y,
      z,
      tx: 1,
      ty: 0,
      tz: 0,
      rx: 0,
      rz: 1,
      width,
      segmentType,
      isOverpass: false,
    });
  }

  // Compute smooth tangents & right vectors
  for (let i = 0; i < sampleCount; i++) {
    const prev = samples[(i - 1 + sampleCount) % sampleCount];
    const next = samples[(i + 1) % sampleCount];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    tx /= len;
    ty /= len;
    tz /= len;

    const hLen = Math.hypot(tx, tz) || 1;
    const rx = -tz / hLen;
    const rz = tx / hLen;

    samples[i].tx = tx;
    samples[i].ty = ty;
    samples[i].tz = tz;
    samples[i].rx = rx;
    samples[i].rz = rz;
  }

  // Tag bridge samples that pass over or near a ground-level road leg (Figure-8 overpasses)
  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    if (s.segmentType !== 'bridge') continue;
    for (let j = 0; j < sampleCount; j++) {
      const diff = Math.abs(i - j);
      const wrapDiff = Math.min(diff, sampleCount - diff);
      if (wrapDiff < 28) continue;
      const other = samples[j];
      if (other.segmentType !== 'bridge' && s.y - other.y > 3.5) {
        const dist = Math.hypot(s.x - other.x, s.z - other.z);
        if (dist < 42) {
          s.isOverpass = true;
          break;
        }
      }
    }
  }

  return {
    definition,
    samples,
    totalLength,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

export interface TrackProjection {
  sampleIndex: number;
  sample: TrackSample;
  t: number;
  s: number;
  roadY: number;
  lateralOffset: number;
  absLateral: number;
  halfWidth: number;
  segmentType: SegmentType;
  distSq: number;
}

export function projectPointOnTrack(
  x: number,
  z: number,
  baked: BakedTrackData,
  hintIndex?: number,
): TrackProjection {
  const samples = baked.samples;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
    const windowRadius = 24;
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const idx = (hintIndex + offset + n) % n;
      const s = samples[idx];
      const dx = x - s.x;
      const dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = idx;
      }
    }
    if (bestDistSq > 320) {
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = i;
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const dx = x - s.x;
      const dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  const s = samples[bestIdx];
  const next = samples[(bestIdx + 1) % n];
  const dx = x - s.x;
  const dz = z - s.z;
  const lateralOffset = dx * s.rx + dz * s.rz;

  const along = dx * s.tx + dz * s.tz;
  const segLen = baked.totalLength / n;
  const frac = Math.max(-0.5, Math.min(0.5, along / (segLen || 1)));
  const prev = samples[(bestIdx - 1 + n) % n];
  const roadY =
    frac >= 0
      ? s.y + (next.y - s.y) * frac
      : s.y + (s.y - prev.y) * frac;

  return {
    sampleIndex: bestIdx,
    sample: s,
    t: (bestIdx + Math.max(0, frac)) / n,
    s: s.s + along,
    roadY,
    lateralOffset,
    absLateral: Math.abs(lateralOffset),
    halfWidth: s.width * 0.5,
    segmentType: s.segmentType,
    distSq: bestDistSq,
  };
}

/**
 * Nearest non-bridge sample projection so terrain beneath Figure-8 overpass bridges
 * stays level with the lower roadway instead of carving a gorge through it.
 */
function projectGroundTrack(
  x: number,
  z: number,
  baked: BakedTrackData,
): TrackProjection {
  const samples = baked.samples;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    if (s.segmentType === 'bridge') continue;
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }

  const s = samples[bestIdx];
  const dx = x - s.x;
  const dz = z - s.z;
  const lateralOffset = dx * s.rx + dz * s.rz;
  return {
    sampleIndex: bestIdx,
    sample: s,
    t: s.t,
    s: s.s,
    roadY: s.y,
    lateralOffset,
    absLateral: Math.abs(lateralOffset),
    halfWidth: s.width * 0.5,
    segmentType: s.segmentType,
    distSq: bestDistSq,
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Minimum horizontal distance from (x, z) to ANY track sample (safe across Figure-8 crossings).
 */
export function minDistanceToTrack(
  x: number,
  z: number,
  baked: BakedTrackData,
): number {
  let minD2 = Infinity;
  const samples = baked.samples;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD2) minD2 = d2;
  }
  return Math.sqrt(minD2);
}

/**
 * Deterministic terrain height at world (x, z).
 * - Under non-overpass 'bridge' segments: carves a deep canyon/riverbed well below the bridge deck.
 * - Under Figure-8 overpass bridges: defers to the lower ground roadway so the underpass stays flat & open.
 * - Along 'tunnel' segments: keeps roadway clear while raising dramatic mountain flanks on both sides.
 */
export function computeTerrainHeightWithHint(
  baked: BakedTrackData,
  x: number,
  z: number,
  hintIndex?: number,
): { y: number; sampleIndex: number } {
  let proj = projectPointOnTrack(x, z, baked, hintIndex);

  if (proj.sample.segmentType === 'bridge' && proj.sample.isOverpass) {
    const groundProj = projectGroundTrack(x, z, baked);
    if (groundProj.distSq < 2500) {
      proj = groundProj;
    }
  }

  const distFromCenter = Math.sqrt(proj.distSq);
  const halfW = proj.halfWidth;

  const hillNoise =
    Math.sin(x * 0.024) * Math.cos(z * 0.024) * 6.0 +
    Math.sin(x * 0.052 + 1.3) * Math.sin(z * 0.046 + 0.7) * 2.8 +
    Math.cos((x + z) * 0.015) * 4.0;

  const radial = Math.hypot(x, z);
  const outerRim = smoothstep(185, 315, radial) * 28;

  if (proj.segmentType === 'bridge') {
    const gorgeDepth = -12.0 + Math.sin(x * 0.08 + z * 0.08) * 1.2;
    const blendOut = smoothstep(halfW + 10, halfW + 44, distFromCenter);
    const baseTerrain = proj.roadY - 1.5 + hillNoise * 0.65 + outerRim;
    return {
      y: gorgeDepth * (1 - blendOut) + baseTerrain * blendOut,
      sampleIndex: proj.sampleIndex,
    };
  }

  if (proj.segmentType === 'tunnel') {
    const roadBedY = proj.roadY - 0.16;
    if (distFromCenter <= halfW + 2.4) {
      return { y: roadBedY, sampleIndex: proj.sampleIndex };
    }
    const flankRise = smoothstep(halfW + 2.4, halfW + 14.5, distFromCenter);
    const ridgeHeight =
      proj.roadY + 21.5 + Math.abs(Math.sin(x * 0.045 + z * 0.045)) * 7.5;
    const farTerrain = proj.roadY + 3.5 + hillNoise + outerRim;
    const blendToFar = smoothstep(halfW + 18, halfW + 58, distFromCenter);
    const mountainVal = ridgeHeight * (1 - blendToFar) + farTerrain * blendToFar;
    return {
      y: roadBedY * (1 - flankRise) + mountainVal * flankRise,
      sampleIndex: proj.sampleIndex,
    };
  }

  const roadBedY = proj.roadY - 0.14;
  if (distFromCenter <= halfW + 2.5) {
    return { y: roadBedY, sampleIndex: proj.sampleIndex };
  }
  const shoulderBlend = smoothstep(halfW + 2.5, halfW + 26, distFromCenter);
  const naturalGround = proj.roadY - 0.8 + hillNoise + outerRim;
  return {
    y: roadBedY * (1 - shoulderBlend) + naturalGround * shoulderBlend,
    sampleIndex: proj.sampleIndex,
  };
}

export function computeTerrainHeight(
  baked: BakedTrackData,
  x: number,
  z: number,
): number {
  return computeTerrainHeightWithHint(baked, x, z).y;
}

/**
 * Staggered 2-column starting grid behind the start/finish line (facing +tx, +tz).
 */
export function getGridSlotTransform(
  baked: BakedTrackData,
  slotIndex: number,
): { x: number; y: number; z: number; yaw: number } {
  const n = baked.samples.length;
  const row = Math.floor(slotIndex / 2);
  const col = slotIndex % 2 === 0 ? -1 : 1;

  const metersBack = 7 + row * 9;
  const sampleStep = Math.round((metersBack / baked.totalLength) * n);
  const idx = (n - (sampleStep % n)) % n;
  const s = baked.samples[idx];

  const lateral = col * 3.1;
  const x = s.x + s.rx * lateral;
  const z = s.z + s.rz * lateral;
  const yaw = Math.atan2(s.tx, s.tz);

  return {
    x,
    y: s.y,
    z,
    yaw,
  };
}
