import { useEffect } from 'react';
import { ArrowLeft, Camera, Pause, Play } from 'lucide-react';
import type {
  CameraMode,
  SavedRaceReplay,
  WeatherCondition,
} from '../shared/types';
import { WEATHER_LABELS } from '../game/weather';
import { formatOrdinal, formatRaceTime } from '../utils/formatTime';

interface ReplayOverlayProps {
  replay: SavedRaceReplay;
  localPlayerId: string | null;
  focusedDriverId: string;
  focusedStats: {
    lap: number;
    speedKmh: number;
  };
  currentTimeMs: number;
  playing: boolean;
  playbackSpeed: number;
  cameraMode: CameraMode;
  weatherCondition: WeatherCondition;
  trackName: string;
  totalLaps: number;
  onSelectDriver: (driverId: string) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
  onSeek: (timeMs: number) => void;
  onCycleCamera: () => void;
  onExitReplay: () => void;
}

export function ReplayOverlay({
  replay,
  localPlayerId,
  focusedDriverId,
  focusedStats,
  currentTimeMs,
  playing,
  playbackSpeed,
  cameraMode,
  weatherCondition,
  trackName,
  totalLaps,
  onSelectDriver,
  onTogglePlay,
  onCycleSpeed,
  onSeek,
  onCycleCamera,
  onExitReplay,
}: ReplayOverlayProps) {
  const focusedMeta =
    replay.drivers.find((d) => d.id === focusedDriverId) ?? replay.drivers[0];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.code === 'KeyC') {
        onCycleCamera();
      } else if (e.code === 'Escape') {
        onExitReplay();
      } else if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (replay.drivers[idx]) {
          onSelectDriver(replay.drivers[idx].id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [replay.drivers, onTogglePlay, onCycleCamera, onExitReplay, onSelectDriver]);

  const cameraLabel =
    cameraMode === 'chase'
      ? 'Chase'
      : cameraMode === 'hood'
        ? 'Hood'
        : 'Overview';

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5"
      aria-label="Race Replay Controls"
    >
      {/* Top Row: Followed Driver Readout (Left) + Camera / Exit Actions (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div
          className="rounded-lg border border-white/15 px-4 py-2.5 flex items-center gap-4"
          style={{ backgroundColor: 'rgba(11, 15, 23, 0.88)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="inline-block h-3.5 w-3.5 rounded-sm shrink-0"
              style={{ backgroundColor: focusedMeta?.color ?? '#f59e0b' }}
            />
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Replay</span>
                <span aria-hidden="true">·</span>
                <span>{trackName}</span>
                <span aria-hidden="true">·</span>
                <span>{WEATHER_LABELS[weatherCondition]}</span>
              </div>
              <div className="font-display text-lg font-bold text-white truncate leading-tight">
                {focusedMeta?.name ?? 'Driver'}
                {focusedMeta?.id === localPlayerId ? ' (You)' : ''}
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-white/10" aria-hidden="true" />

          <div className="flex items-center gap-4 shrink-0">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Finish
              </div>
              <div className="font-display text-lg font-bold text-amber-400 leading-tight tabular-nums">
                {formatOrdinal(focusedMeta?.rank ?? 1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Lap
              </div>
              <div className="font-display text-lg font-bold text-white leading-tight tabular-nums">
                {Math.min(totalLaps, Math.max(1, focusedStats.lap))}/{totalLaps}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Speed
              </div>
              <div className="font-display text-lg font-bold text-white leading-tight tabular-nums">
                {focusedStats.speedKmh}{' '}
                <span className="text-[10px] font-normal text-slate-400">KM/H</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCycleCamera}
            className="h-10 rounded-lg border border-white/15 px-3.5 text-xs font-semibold text-slate-100 hover:border-white/35 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.88)' }}
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            <span>View: {cameraLabel}</span>
          </button>
          <button
            type="button"
            onClick={onExitReplay}
            className="h-10 rounded-lg border border-white/20 px-4 text-xs font-semibold text-white hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: 'rgba(15, 21, 32, 0.92)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            <span>Back to Results</span>
          </button>
        </div>
      </div>

      {/* Bottom Center Compact Dock: Perspective Switcher + Timeline Transport */}
      <div className="flex justify-center">
        <div
          className="pointer-events-auto w-full max-w-2xl rounded-xl border border-white/15 p-3 space-y-2.5 shadow-2xl"
          style={{ backgroundColor: 'rgba(11, 15, 23, 0.9)' }}
        >
          {/* Driver Perspective Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Switch driver perspective">
            <span className="text-[11px] font-semibold text-slate-400 pr-1.5 whitespace-nowrap shrink-0">
              Perspective
            </span>
            {replay.drivers.map((drv, idx) => {
              const active = drv.id === focusedDriverId;
              return (
                <button
                  key={drv.id}
                  type="button"
                  onClick={() => onSelectDriver(drv.id)}
                  aria-pressed={active}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-amber-400 bg-amber-500/20 text-white'
                      : 'border-white/10 bg-slate-900/80 text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: drv.color }}
                  />
                  <span>
                    {idx + 1}. {drv.name}
                    {drv.id === localPlayerId ? ' (You)' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Playback Controls & Scrubber */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              className="h-9 w-9 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center transition-colors shrink-0"
            >
              {playing ? (
                <Pause className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onCycleSpeed}
              aria-label={`Playback speed ${playbackSpeed}x`}
              className="h-9 min-w-[46px] rounded-lg border border-white/15 bg-slate-900 hover:bg-slate-800 text-xs font-mono-tabular font-bold text-slate-100 px-2 transition-colors whitespace-nowrap shrink-0"
            >
              {playbackSpeed}x
            </button>

            <input
              type="range"
              aria-label="Replay timeline"
              min={0}
              max={Math.max(100, replay.durationMs)}
              step={50}
              value={Math.min(replay.durationMs, Math.max(0, currentTimeMs))}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="flex-1 accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />

            <div className="font-mono-tabular text-xs text-slate-200 whitespace-nowrap shrink-0">
              {formatRaceTime(currentTimeMs)} / {formatRaceTime(replay.durationMs)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
