import type {
  BakedTrackData,
  CameraMode,
  HudState,
  PlayerTelemetry,
} from '../shared/types';
import { WEATHER_LABELS } from '../game/weather';
import { formatOrdinal, formatRaceTime } from '../utils/formatTime';
import { TrackMinimap } from './TrackMinimap';
import type { TouchInputState } from './RaceViewport';

interface RaceHudProps {
  track: BakedTrackData;
  hud: HudState;
  localPos: { x: number; z: number; yaw: number; color: string };
  remotes: PlayerTelemetry[];
  cameraMode: CameraMode;
  muted: boolean;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onResetCar: () => void;
  onPause: () => void;
}

export function RaceHud({
  track,
  hud,
  localPos,
  remotes,
  cameraMode,
  muted,
  touchInputRef,
  onCycleCamera,
  onToggleMute,
  onResetCar,
  onPause,
}: RaceHudProps) {
  const segmentLabel =
    hud.segmentType === 'bridge'
      ? 'Bridge Crossing'
      : hud.segmentType === 'tunnel'
        ? 'Mountain Tunnel'
        : hud.offRoad
          ? 'Off-Road Shoulder'
          : null;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Position/Lap/Timing (Left) & Utility Icon Controls (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
        {/* Top-Left Cluster */}
        <div
          className="rounded-lg border border-white/15 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3 sm:gap-5"
          style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pos
            </div>
            <div
              className="font-display text-lg sm:text-2xl font-bold text-amber-400 leading-tight tabular-nums"
              data-testid="hud-position"
            >
              {formatOrdinal(hud.position)}
              <span className="text-xs sm:text-sm text-slate-400 font-normal">
                /{hud.totalRacers}
              </span>
            </div>
          </div>

          <div className="h-7 sm:h-8 w-px bg-white/10" aria-hidden="true" />

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Lap
            </div>
            <div
              className="font-display text-lg sm:text-2xl font-bold text-white leading-tight tabular-nums"
              data-testid="hud-lap"
            >
              {hud.lap}
              <span className="text-xs sm:text-sm text-slate-400 font-normal">
                /{hud.totalLaps}
              </span>
            </div>
          </div>

          <div className="hidden sm:block h-8 w-px bg-white/10" aria-hidden="true" />

          <div className="hidden sm:block space-y-0.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-400">Time</span>
              <span className="font-mono-tabular font-semibold text-white">
                {formatRaceTime(hud.currentLapMs)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-400">Best</span>
              <span className="font-mono-tabular font-semibold text-emerald-300">
                {formatRaceTime(hud.bestLapMs)}
              </span>
            </div>
          </div>

          <div className="hidden md:block h-8 w-px bg-white/10" aria-hidden="true" />

          <div className="hidden md:block">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Weather
            </div>
            <div className="text-xs font-semibold text-sky-200 whitespace-nowrap">
              {WEATHER_LABELS[hud.weatherCondition]}
            </div>
          </div>
        </div>

        {/* Top-Right Utility Controls (Square SVG Buttons) */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            title={muted ? 'Unmute [M]' : 'Mute [M]'}
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:text-white hover:border-white/35 transition-colors"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {muted ? (
                <>
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCamera();
            }}
            aria-label={`Cycle camera (${cameraMode}) [C]`}
            title={`Camera: ${cameraMode} [C]`}
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:text-white hover:border-white/35 transition-colors"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCar();
            }}
            aria-label="Reset car to track (R)"
            title="Reset to Track [R]"
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:text-white hover:border-white/35 transition-colors"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause race (P)"
            title="Pause [P]"
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:text-white hover:border-white/35 transition-colors"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Center Transient Countdown / Lap / Wrong-Way Callouts */}
      <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
        {hud.countdownText && (
          <div
            className="font-display text-6xl sm:text-7xl font-bold text-amber-400 tracking-wider"
            style={{ textShadow: '0 4px 18px rgba(0, 0, 0, 0.85)' }}
            data-testid="countdown-banner"
          >
            {hud.countdownText}
          </div>
        )}
        {!hud.countdownText && hud.lapBanner && (
          <div
            className="font-display text-4xl sm:text-5xl font-bold text-white tracking-wider"
            style={{ textShadow: '0 4px 16px rgba(0, 0, 0, 0.85)' }}
          >
            {hud.lapBanner}
          </div>
        )}
        {hud.wrongWay && (
          <div
            className="rounded-md border border-red-400/60 px-4 py-1.5 font-display text-lg font-bold text-red-300"
            style={{ backgroundColor: 'rgba(127, 29, 29, 0.88)' }}
          >
            WRONG WAY
          </div>
        )}
        {segmentLabel && !hud.wrongWay && (
          <div
            className="text-xs font-semibold uppercase tracking-wider text-slate-200 px-3 py-1 rounded"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.72)' }}
          >
            {segmentLabel}
          </div>
        )}
      </div>

      {/* Bottom Row: Minimap (Desktop/Tablet) + Speedometer + Mobile Touch Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-end justify-between gap-3">
          <div className="hidden sm:block">
            <TrackMinimap track={track} localPos={localPos} remotes={remotes} />
          </div>

          <div className="sm:hidden text-xs font-mono-tabular text-slate-200 px-2.5 py-1 rounded border border-white/15" style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}>
            {formatRaceTime(hud.currentLapMs)}
          </div>

          {/* Digital Speedometer */}
          <div
            className="rounded-lg border border-white/15 px-3 py-2 sm:px-4 sm:py-2.5 min-w-[122px] sm:min-w-[162px] ml-auto"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.86)' }}
          >
            <div className="flex items-baseline justify-between gap-2 sm:gap-3">
              <div className="flex items-baseline gap-1 sm:gap-1.5">
                <span
                  className="font-display text-2xl sm:text-4xl font-bold text-white leading-none tabular-nums"
                  data-testid="hud-speed"
                >
                  {hud.speedKmh}
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400">
                  KM/H
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] sm:text-[10px] uppercase text-slate-400 block">
                  Gear
                </span>
                <span className="font-display text-sm sm:text-lg font-bold text-amber-400 leading-none tabular-nums">
                  {hud.gear}
                </span>
              </div>
            </div>

            <div className="mt-1.5 sm:mt-2 space-y-1">
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-transform duration-75 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.02, hud.throttle)})` }}
                />
              </div>
              <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-transform duration-75 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.02, hud.brake)})` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Touch Controls Row (Mobile Only, full width so zero clipping) */}
        <div className="pointer-events-auto flex lg:hidden items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Steer Left"
              onPointerDown={() => {
                touchInputRef.current.steer = 1;
              }}
              onPointerUp={() => {
                touchInputRef.current.steer = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.steer = 0;
              }}
              className="h-11 w-14 rounded-lg border border-white/20 text-white font-bold active:bg-amber-500/40"
              style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Steer Right"
              onPointerDown={() => {
                touchInputRef.current.steer = -1;
              }}
              onPointerUp={() => {
                touchInputRef.current.steer = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.steer = 0;
              }}
              className="h-11 w-14 rounded-lg border border-white/20 text-white font-bold active:bg-amber-500/40"
              style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
            >
              ▶
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Brake"
              onPointerDown={() => {
                touchInputRef.current.brake = 1;
              }}
              onPointerUp={() => {
                touchInputRef.current.brake = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.brake = 0;
              }}
              className="h-11 px-4 rounded-lg border border-red-400/40 text-red-200 text-xs font-bold active:bg-red-500/40"
              style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
            >
              BRAKE
            </button>
            <button
              type="button"
              aria-label="Accelerate"
              onPointerDown={() => {
                touchInputRef.current.throttle = 1;
              }}
              onPointerUp={() => {
                touchInputRef.current.throttle = 0;
              }}
              onPointerLeave={() => {
                touchInputRef.current.throttle = 0;
              }}
              className="h-11 px-5 rounded-lg border border-amber-400/50 text-amber-200 text-xs font-bold active:bg-amber-500/40"
              style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
            >
              GAS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
