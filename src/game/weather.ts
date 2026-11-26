import type {
  TrackPalette,
  WeatherCondition,
  WeatherMode,
} from '../shared/types.ts';

export interface WeatherOption {
  id: WeatherMode;
  label: string;
}

export const WEATHER_OPTIONS: WeatherOption[] = [
  { id: 'auto', label: 'Track' },
  { id: 'dynamic', label: 'Dynamic' },
  { id: 'clear', label: 'Clear' },
  { id: 'rain', label: 'Rain' },
  { id: 'fog', label: 'Fog' },
  { id: 'sunset', label: 'Sunset' },
];

export const WEATHER_LABELS: Record<WeatherCondition, string> = {
  clear: 'Clear',
  rain: 'Rain',
  fog: 'Heavy Fog',
  sunset: 'Sunset',
};

export interface WeatherVisualParams {
  activeCondition: WeatherCondition;
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  rainIntensity: number; // 0..1
  fogFactor: number; // 0..1
  sunsetFactor: number; // 0..1
  roadRoughness: number;
  roadMetalness: number;
  headlightIntensity: number;
  gripMultiplier: number;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function toHexRgb(r: number, g: number, b: number): string {
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function lerpHexColor(a: string, b: string, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = parseHexRgb(a);
  const [br, bg, bb] = parseHexRgb(b);
  return toHexRgb(ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

function buildConditionParams(
  palette: TrackPalette,
  condition: WeatherCondition,
): WeatherVisualParams {
  if (condition === 'rain') {
    return {
      activeCondition: 'rain',
      skyTop: lerpHexColor(palette.skyTop, '#1e293b', 0.82),
      skyHorizon: lerpHexColor(palette.skyHorizon, '#64748b', 0.78),
      fogColor: lerpHexColor(palette.fogColor, '#64748b', 0.75),
      fogDensity: Math.max(palette.fogDensity * 2.5, 0.0052),
      sunColor: '#cbd5e1',
      sunIntensity: palette.sunIntensity * 0.44,
      sunPosition: [45, 95, 50],
      hemiSky: '#94a3b8',
      hemiGround: lerpHexColor(palette.hemiGround, '#334155', 0.55),
      hemiIntensity: palette.hemiIntensity * 0.82,
      rainIntensity: 1.0,
      fogFactor: 0.4,
      sunsetFactor: 0,
      roadRoughness: 0.28,
      roadMetalness: 0.24,
      headlightIntensity: 2.5,
      gripMultiplier: 0.88,
    };
  }

  if (condition === 'fog') {
    const mistBase = lerpHexColor(palette.fogColor, '#cbd5e1', 0.62);
    return {
      activeCondition: 'fog',
      skyTop: lerpHexColor(palette.skyTop, '#94a3b8', 0.78),
      skyHorizon: mistBase,
      fogColor: mistBase,
      fogDensity: 0.0115,
      sunColor: '#e2e8f0',
      sunIntensity: palette.sunIntensity * 0.5,
      sunPosition: [60, 105, 65],
      hemiSky: '#cbd5e1',
      hemiGround: lerpHexColor(palette.hemiGround, '#64748b', 0.45),
      hemiIntensity: Math.max(0.95, palette.hemiIntensity * 1.05),
      rainIntensity: 0,
      fogFactor: 1.0,
      sunsetFactor: 0,
      roadRoughness: 0.76,
      roadMetalness: 0.06,
      headlightIntensity: 2.8,
      gripMultiplier: 0.96,
    };
  }

  if (condition === 'sunset') {
    return {
      activeCondition: 'sunset',
      skyTop: lerpHexColor(palette.skyTop, '#312e81', 0.76),
      skyHorizon: lerpHexColor(palette.skyHorizon, '#fb923c', 0.72),
      fogColor: lerpHexColor(palette.fogColor, '#fdba74', 0.65),
      fogDensity: Math.max(palette.fogDensity * 1.55, 0.0028),
      sunColor: '#ff9e5e',
      sunIntensity: palette.sunIntensity * 1.12,
      sunPosition: [185, 28, -95],
      hemiSky: '#818cf8',
      hemiGround: '#7c2d12',
      hemiIntensity: palette.hemiIntensity * 0.88,
      rainIntensity: 0,
      fogFactor: 0.25,
      sunsetFactor: 1.0,
      roadRoughness: 0.8,
      roadMetalness: 0.07,
      headlightIntensity: 2.2,
      gripMultiplier: 1.0,
    };
  }

  // Clear daylight baseline
  return {
    activeCondition: 'clear',
    skyTop: palette.skyTop,
    skyHorizon: palette.skyHorizon,
    fogColor: palette.fogColor,
    fogDensity: palette.fogDensity,
    sunColor: palette.sunColor,
    sunIntensity: palette.sunIntensity,
    sunPosition: [95, 130, 80],
    hemiSky: palette.hemiSky,
    hemiGround: palette.hemiGround,
    hemiIntensity: palette.hemiIntensity,
    rainIntensity: 0,
    fogFactor: 0,
    sunsetFactor: 0,
    roadRoughness: 0.85,
    roadMetalness: 0.05,
    headlightIntensity: 1.4,
    gripMultiplier: 1.0,
  };
}

function interpolateWeather(
  a: WeatherVisualParams,
  b: WeatherVisualParams,
  t: number,
): WeatherVisualParams {
  const u = smoothstep(t);
  return {
    activeCondition: u < 0.5 ? a.activeCondition : b.activeCondition,
    skyTop: lerpHexColor(a.skyTop, b.skyTop, u),
    skyHorizon: lerpHexColor(a.skyHorizon, b.skyHorizon, u),
    fogColor: lerpHexColor(a.fogColor, b.fogColor, u),
    fogDensity: lerp(a.fogDensity, b.fogDensity, u),
    sunColor: lerpHexColor(a.sunColor, b.sunColor, u),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, u),
    sunPosition: [
      lerp(a.sunPosition[0], b.sunPosition[0], u),
      lerp(a.sunPosition[1], b.sunPosition[1], u),
      lerp(a.sunPosition[2], b.sunPosition[2], u),
    ],
    hemiSky: lerpHexColor(a.hemiSky, b.hemiSky, u),
    hemiGround: lerpHexColor(a.hemiGround, b.hemiGround, u),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, u),
    rainIntensity: lerp(a.rainIntensity, b.rainIntensity, u),
    fogFactor: lerp(a.fogFactor, b.fogFactor, u),
    sunsetFactor: lerp(a.sunsetFactor, b.sunsetFactor, u),
    roadRoughness: lerp(a.roadRoughness, b.roadRoughness, u),
    roadMetalness: lerp(a.roadMetalness, b.roadMetalness, u),
    headlightIntensity: lerp(a.headlightIntensity, b.headlightIntensity, u),
    gripMultiplier: lerp(a.gripMultiplier, b.gripMultiplier, u),
  };
}

const ALL_CONDITIONS: WeatherCondition[] = ['clear', 'sunset', 'rain', 'fog'];

/**
 * Computes lighting, sky dome, fog density, precipitation, and road grip parameters
 * for either fixed track weather, manual override, or dynamic cycling weather.
 */
export function resolveWeatherVisuals(
  palette: TrackPalette,
  defaultWeather: WeatherCondition,
  mode: WeatherMode,
  elapsedMs: number,
): WeatherVisualParams {
  if (mode === 'auto') {
    return buildConditionParams(palette, defaultWeather);
  }
  if (mode !== 'dynamic') {
    return buildConditionParams(palette, mode);
  }

  // Dynamic cycle: starts on track's default weather and smoothly transitions every 18s
  const startIdx = Math.max(0, ALL_CONDITIONS.indexOf(defaultWeather));
  const sequence: WeatherCondition[] = [
    ALL_CONDITIONS[startIdx],
    ALL_CONDITIONS[(startIdx + 1) % ALL_CONDITIONS.length],
    ALL_CONDITIONS[(startIdx + 2) % ALL_CONDITIONS.length],
    ALL_CONDITIONS[(startIdx + 3) % ALL_CONDITIONS.length],
  ];

  const phaseMs = 18000;
  const fadeMs = 5500;
  const totalCycleMs = phaseMs * sequence.length;
  const wrapped = ((elapsedMs % totalCycleMs) + totalCycleMs) % totalCycleMs;
  const phaseIdx = Math.floor(wrapped / phaseMs);
  const withinPhase = wrapped - phaseIdx * phaseMs;

  const curCond = sequence[phaseIdx];
  const nextCond = sequence[(phaseIdx + 1) % sequence.length];
  const curParams = buildConditionParams(palette, curCond);

  const holdMs = phaseMs - fadeMs;
  if (withinPhase <= holdMs) {
    return curParams;
  }

  const nextParams = buildConditionParams(palette, nextCond);
  const fadeT = (withinPhase - holdMs) / fadeMs;
  return interpolateWeather(curParams, nextParams, fadeT);
}
