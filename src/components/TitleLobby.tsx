import { useMemo, useState } from 'react';
import {
  Check,
  CloudRain,
  Copy,
  Download,
  Flag,
  Flame,
  MapPin,
  Play,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import {
  CAR_CHASSIS_OPTIONS,
  CAR_LIVERIES,
  DAILY_REWARD_LIVERIES,
  PAINT_FINISH_OPTIONS,
  type CarChassisId,
  type DailyChallengeSpec,
  type DailyRewardLiveryId,
  type LeaderboardRecord,
  type PaintFinishId,
  type PlayerTelemetry,
  type TrackDefinition,
  type TrackId,
  type WeatherMode,
} from '../shared/types';
import { TRACK_DEFINITIONS, getBakedTrack, getTrackDefinition } from '../game/tracks';
import { WEATHER_LABELS, WEATHER_OPTIONS } from '../game/weather';
import {
  MAX_CPU_COUNT,
  buildCpuGridOpponents,
  difficultyToSkillParams,
} from '../game/ai';
import { formatRaceTime } from '../utils/formatTime';

interface TitleLobbyProps {
  selectedTrackId: TrackId;
  weatherMode: WeatherMode;
  driverName: string;
  driverColor: string;
  driverChassis: CarChassisId;
  driverFinish: PaintFinishId;
  cpuCount: number;
  cpuDifficulty: number;
  roomId: string;
  connected: boolean;
  players: PlayerTelemetry[];
  localPlayerId: string | null;
  hasSavedReplay: boolean;
  trackRecord: LeaderboardRecord | null;
  dailyChallenge: DailyChallengeSpec;
  dailyStreak: number;
  dailyCompletedToday: boolean;
  unlockedRewardIds: DailyRewardLiveryId[];
  onSelectTrack: (trackId: TrackId) => void;
  onSelectWeather: (mode: WeatherMode) => void;
  onDriverProfileChange: (
    name: string,
    color: string,
    chassisId: CarChassisId,
    paintFinish: PaintFinishId,
  ) => void;
  onCpuSettingsChange: (cpuCount: number, cpuDifficulty: number) => void;
  onJoinRoom: (roomId: string) => void;
  onStartRace: () => void;
  onWatchLastReplay: () => void;
  onOpenLeaderboard: () => void;
  onOpenDailyChallenge: () => void;
}

function TrackShapePreview({ trackId, active }: { trackId: TrackId; active: boolean }) {
  const pathData = useMemo(() => {
    const baked = getBakedTrack(trackId);
    const w = 44;
    const h = 30;
    const pad = 4;
    const spanX = Math.max(1, baked.maxX - baked.minX);
    const spanZ = Math.max(1, baked.maxZ - baked.minZ);
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const ox = (w - spanX * scale) * 0.5 - baked.minX * scale;
    const oz = (h - spanZ * scale) * 0.5 - baked.minZ * scale;

    const pts: string[] = [];
    for (let i = 0; i < baked.samples.length; i += 6) {
      const s = baked.samples[i];
      const x = (s.x * scale + ox).toFixed(1);
      const y = (s.z * scale + oz).toFixed(1);
      pts.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
    }
    return pts.join(' ') + ' Z';
  }, [trackId]);

  return (
    <svg
      width="44"
      height="30"
      viewBox="0 0 44 30"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d={pathData}
        stroke={active ? '#fbbf24' : '#94a3b8'}
        strokeWidth="2.3"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function TitleLobby({
  selectedTrackId,
  weatherMode,
  driverName,
  driverColor,
  driverChassis,
  driverFinish,
  cpuCount,
  cpuDifficulty,
  roomId,
  connected,
  players,
  localPlayerId,
  hasSavedReplay,
  trackRecord,
  dailyChallenge,
  dailyStreak,
  dailyCompletedToday,
  unlockedRewardIds,
  onSelectTrack,
  onSelectWeather,
  onDriverProfileChange,
  onCpuSettingsChange,
  onJoinRoom,
  onStartRace,
  onWatchLastReplay,
  onOpenLeaderboard,
  onOpenDailyChallenge,
}: TitleLobbyProps) {
  const [roomInput, setRoomInput] = useState(roomId);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const isPortableFile =
    typeof window !== 'undefined' && window.location.protocol === 'file:';

  const activeTrack: TrackDefinition =
    TRACK_DEFINITIONS.find((t) => t.id === selectedTrackId) ?? TRACK_DEFINITIONS[0];
  const dailyTrack = getTrackDefinition(dailyChallenge.trackId);
  const availableLiveries = useMemo(() => {
    const unlockedSet = new Set(unlockedRewardIds);
    return [
      ...CAR_LIVERIES,
      ...DAILY_REWARD_LIVERIES.filter((l) => unlockedSet.has(l.id)),
    ];
  }, [unlockedRewardIds]);

  const skillInfo = useMemo(
    () => difficultyToSkillParams(cpuDifficulty),
    [cpuDifficulty],
  );

  const cpuPreview = useMemo(() => {
    const humans =
      players.length > 0
        ? players.filter((p) => !p.isCpu)
        : [{ color: driverColor }];
    return buildCpuGridOpponents(humans, cpuCount, cpuDifficulty);
  }, [players, driverColor, cpuCount, cpuDifficulty]);

  const handleRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = roomInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
    if (cleaned) {
      setRoomInput(cleaned);
      onJoinRoom(cleaned);
    }
  };

  const handleCreateRandomRoom = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'RACE-';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setRoomInput(code);
    onJoinRoom(code);
  };

  const handleDownloadPortable = async () => {
    if (downloading || isPortableFile) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch('/api/download-standalone');
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Apex-Circuit-Portable.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('Could not bundle file. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (typeof window === 'undefined' || isPortableFile) return;
    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.search = `?room=${encodeURIComponent(roomId)}`;
      await navigator.clipboard.writeText(shareUrl.toString());
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Main Left Lobby Column + Unobstructed Right 3D Car & Track Showcase */}
      <div className="flex flex-col lg:flex-row items-start justify-between gap-6 h-full min-h-0">
        <aside
          className="pointer-events-auto w-full max-w-[446px] max-h-full overflow-y-auto rounded-xl border border-white/15 p-3 sm:p-3.5 flex flex-col gap-2 shadow-2xl"
          style={{ backgroundColor: 'rgba(11, 15, 23, 0.91)' }}
          aria-label="Race Setup and Multiplayer Lobby"
        >
          {/* Bespoke SVG Title Emblem + Lockup */}
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-2.5">
              <svg
                width="34"
                height="26"
                viewBox="0 0 42 34"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M4 28L13 6H24L15 28H4Z" fill="#ef4444" />
                <path d="M19 28L28 6H38L29 28H19Z" fill="#f59e0b" />
                <path d="M2 30H39" stroke="#f8fafc" strokeWidth="2" />
              </svg>
              <div>
                <h1 className="font-display text-lg font-bold tracking-wide text-white leading-none">
                  APEX CIRCUIT
                </h1>
                <p className="mt-0.5 text-[11px] text-slate-300">
                  {isPortableFile
                    ? 'Portable Edition · No Account Needed'
                    : 'No Account Needed · Online & CPU Racing'}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0">
              {isPortableFile
                ? 'Offline'
                : connected
                  ? `Online · ${roomId}`
                  : 'Solo + CPU'}
            </span>
          </div>

          {/* Driver Name, Paint Swatches, Chassis Model & Paint Finish */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="driver-name-input" className="text-xs font-semibold text-slate-200 whitespace-nowrap">
                Driver
              </label>
              <input
                id="driver-name-input"
                type="text"
                maxLength={16}
                value={driverName}
                onChange={(e) =>
                  onDriverProfileChange(
                    e.target.value,
                    driverColor,
                    driverChassis,
                    driverFinish,
                  )
                }
                placeholder="Enter name"
                className="w-36 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <div className="flex items-center gap-1 flex-wrap justify-end" role="group" aria-label="Car Paint">
                {availableLiveries.map((livery) => {
                  const selected = driverColor.toLowerCase() === livery.primary.toLowerCase();
                  return (
                    <button
                      key={livery.id}
                      type="button"
                      onClick={() =>
                        onDriverProfileChange(
                          driverName,
                          livery.primary,
                          driverChassis,
                          driverFinish,
                        )
                      }
                      aria-label={`Select ${livery.name} paint`}
                      aria-pressed={selected}
                      title={livery.name}
                      className={`h-5 w-5 rounded border-2 transition-transform ${
                        selected
                          ? 'border-white scale-110'
                          : 'border-white/20 hover:border-white/60'
                      }`}
                      style={{ backgroundColor: livery.primary }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div
                className="grid grid-cols-4 gap-1 rounded-md bg-slate-900/90 p-0.5 border border-white/10"
                role="group"
                aria-label="Car Chassis"
              >
                {CAR_CHASSIS_OPTIONS.map((c) => {
                  const active = driverChassis === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        onDriverProfileChange(driverName, driverColor, c.id, driverFinish)
                      }
                      aria-pressed={active}
                      title={c.name}
                      className={`rounded py-1 px-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {c.shortLabel}
                    </button>
                  );
                })}
              </div>

              <div
                className="grid grid-cols-4 gap-1 rounded-md bg-slate-900/90 p-0.5 border border-white/10"
                role="group"
                aria-label="Paint Finish"
              >
                {PAINT_FINISH_OPTIONS.map((f) => {
                  const active = driverFinish === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        onDriverProfileChange(driverName, driverColor, driverChassis, f.id)
                      }
                      aria-pressed={active}
                      className={`rounded py-1 px-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-100 text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Map Selection with Circuit Shape Previews */}
          <div className="border-t border-white/10 pt-1.5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                Circuit Selection
              </h2>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {activeTrack.laps} Laps
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1" role="radiogroup" aria-label="Select race track">
              {TRACK_DEFINITIONS.map((track) => {
                const isSelected = track.id === selectedTrackId;
                return (
                  <button
                    key={track.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onSelectTrack(track.id)}
                    className={`w-full text-left rounded-lg border px-2 py-1 transition-colors flex items-center gap-2 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 text-white'
                        : 'border-white/10 bg-slate-900/70 text-slate-200 hover:border-white/25 hover:bg-slate-800/80'
                    }`}
                  >
                    <TrackShapePreview trackId={track.id} active={isSelected} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-bold tracking-wide truncate leading-tight flex items-center gap-1.5">
                          <span className="truncate">{track.name}</span>
                          {track.id === dailyChallenge.trackId && (
                            <span className="rounded bg-amber-500/20 border border-amber-400/40 px-1 py-0 text-[9px] font-bold uppercase text-amber-300 shrink-0">
                              Daily
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-amber-300 whitespace-nowrap shrink-0">
                          {track.climateLabel} · {WEATHER_LABELS[track.defaultWeather]}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300 truncate leading-tight">
                        {track.features.join(' · ')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Weather Selector */}
          <div className="border-t border-white/10 pt-1.5 space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <CloudRain className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                Weather Conditions
              </h2>
              <span className="text-[11px] text-slate-400">
                {weatherMode === 'auto'
                  ? `Track (${WEATHER_LABELS[activeTrack.defaultWeather]})`
                  : weatherMode === 'dynamic'
                    ? 'Cycles Live'
                    : WEATHER_LABELS[weatherMode]}
              </span>
            </div>
            <div
              className="grid grid-cols-6 gap-1 rounded-lg bg-slate-900/90 p-0.5 border border-white/10"
              role="group"
              aria-label="Weather Condition"
            >
              {WEATHER_OPTIONS.map((opt) => {
                const active = weatherMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectWeather(opt.id)}
                    aria-pressed={active}
                    className={`rounded-md py-1 px-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CPU Pack Size & Skill Difficulty Sliders */}
          <div className="border-t border-white/10 pt-1.5 grid grid-cols-2 gap-2.5">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="cpu-count-slider" className="font-semibold text-slate-200">
                  CPU Rivals
                </label>
                <span className="font-mono-tabular font-bold text-amber-300">
                  {cpuCount}
                </span>
              </div>
              <input
                id="cpu-count-slider"
                type="range"
                min={0}
                max={MAX_CPU_COUNT}
                step={1}
                value={cpuCount}
                onChange={(e) =>
                  onCpuSettingsChange(Number(e.target.value), cpuDifficulty)
                }
                className="w-full h-1.5 accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="cpu-difficulty-slider" className="font-semibold text-slate-200">
                  CPU Skill
                </label>
                <span className="font-mono-tabular font-bold text-sky-300 whitespace-nowrap">
                  {skillInfo.tierLabel} ({cpuDifficulty}%)
                </span>
              </div>
              <input
                id="cpu-difficulty-slider"
                type="range"
                min={0}
                max={100}
                step={5}
                value={cpuDifficulty}
                onChange={(e) =>
                  onCpuSettingsChange(cpuCount, Number(e.target.value))
                }
                className="w-full h-1.5 accent-sky-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Multiplayer Room + CPU Auto-Fill Grid */}
          <div className="border-t border-white/10 pt-1.5 space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                Grid ({Math.max(1, players.filter((p) => !p.isCpu).length)} Human + {cpuPreview.length} CPU)
              </h2>
              {!isPortableFile && (
                <button
                  type="button"
                  onClick={handleCreateRandomRoom}
                  className="text-[11px] font-medium text-sky-300 hover:text-sky-200 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  New Room
                </button>
              )}
            </div>

            {!isPortableFile && (
              <form onSubmit={handleRoomSubmit} className="flex items-center gap-2">
                <label htmlFor="room-code-input" className="sr-only">
                  Room Code
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  maxLength={12}
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="Room code"
                  className="flex-1 min-w-0 rounded-md border border-white/15 bg-slate-900 px-2.5 py-1 font-mono-tabular text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <button
                  type="submit"
                  className="rounded-md border border-white/20 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 whitespace-nowrap shrink-0"
                >
                  Join Room
                </button>
              </form>
            )}

            <div className="max-h-14 overflow-y-auto space-y-0.5 pr-1">
              {(players.length > 0
                ? players
                : [
                    {
                      id: 'local',
                      name: driverName || 'Driver',
                      color: driverColor,
                      isCpu: false,
                    },
                  ]
              ).map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-[11px] py-0.5 px-2 rounded bg-slate-900/75"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2 w-2 rounded-sm shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-slate-100 font-medium truncate">
                      {p.name}
                      {p.id === localPlayerId || p.id === 'local' ? ' (You)' : ''}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">
                    Grid #{idx + 1}
                  </span>
                </div>
              ))}
              {cpuPreview.map((cpu, cIdx) => {
                const slot =
                  Math.max(1, players.filter((p) => !p.isCpu).length) + cIdx + 1;
                return (
                  <div
                    key={cpu.id}
                    className="flex items-center justify-between text-[11px] py-0.5 px-2 rounded bg-slate-900/45 border border-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-sm shrink-0"
                        style={{ backgroundColor: cpu.color }}
                      />
                      <span className="text-slate-300 truncate">{cpu.name}</span>
                      <span className="rounded bg-slate-800 px-1 text-[9px] font-semibold text-slate-300 shrink-0">
                        CPU
                      </span>
                    </div>
                    <span className="font-mono-tabular text-[10px] text-slate-500 shrink-0">
                      Grid #{slot}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary Start Race CTA */}
          <button
            type="button"
            data-start="true"
            onClick={onStartRace}
            className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-display font-bold text-base tracking-wide py-2 px-5 flex items-center justify-center gap-2 transition-colors shadow-lg whitespace-nowrap shrink-0"
          >
            <Flag className="w-4 h-4" aria-hidden="true" />
            Start Race
          </button>

          {/* Bottom Utility Row: Daily, Records, Download (.html), Last Replay, Invite */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onOpenDailyChallenge}
              className={`rounded-lg border text-xs font-semibold py-1.5 px-2.5 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                dailyCompletedToday
                  ? 'border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200'
                  : 'border-amber-400/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              Daily{dailyStreak > 0 ? ` · ${dailyStreak}d` : ''}
            </button>
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="rounded-lg border border-amber-400/35 bg-slate-900 hover:bg-slate-800 text-amber-200 text-xs font-semibold py-1.5 px-2.5 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              Records
            </button>
            {!isPortableFile && (
              <button
                type="button"
                onClick={handleDownloadPortable}
                disabled={downloading}
                className="flex-1 rounded-lg border border-white/15 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-60 text-slate-100 text-xs font-semibold py-1.5 px-2 flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                {downloading ? 'Bundling...' : 'Download'}
              </button>
            )}
            {hasSavedReplay && (
              <button
                type="button"
                onClick={onWatchLastReplay}
                className="rounded-lg border border-sky-400/35 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-semibold py-1.5 px-2 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                Replay
              </button>
            )}
            {!isPortableFile && (
              <button
                type="button"
                onClick={handleCopyInvite}
                className="rounded-lg border border-white/15 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold py-1.5 px-2 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedInvite ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    Invite
                  </>
                )}
              </button>
            )}
          </div>
          {downloadError && (
            <p className="text-[11px] text-red-400 text-center">{downloadError}</p>
          )}
        </aside>

        {/* Top-Right Selected Track Summary & Daily Challenge Card in Negative Space */}
        <div className="hidden lg:flex flex-col items-end gap-2.5 max-w-xs">
          <div
            className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-right"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.80)' }}
          >
            <div className="font-display text-lg font-bold text-white">
              {activeTrack.name}
            </div>
            <div className="text-xs text-slate-200 mt-0.5">
              {activeTrack.terrainSummary}
            </div>
            <div className="text-[11px] text-sky-300 mt-1">
              Weather:{' '}
              {weatherMode === 'auto'
                ? WEATHER_LABELS[activeTrack.defaultWeather]
                : weatherMode === 'dynamic'
                  ? `Dynamic (Starts ${WEATHER_LABELS[activeTrack.defaultWeather]})`
                  : WEATHER_LABELS[weatherMode]}
            </div>
            <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[11px] text-slate-300">
              {trackRecord ? (
                <span>
                  Track Record:{' '}
                  <strong className="font-mono-tabular text-amber-300">
                    {formatRaceTime(trackRecord.bestLapMs)}
                  </strong>{' '}
                  by {trackRecord.driverName}
                </span>
              ) : (
                <span className="text-slate-400">Track Record: Unclaimed</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDailyChallenge}
            className="pointer-events-auto w-full rounded-lg border border-amber-400/35 px-4 py-2.5 text-right hover:border-amber-300 transition-colors"
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.85)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                Daily Challenge
              </span>
              <span className="text-[11px] font-semibold text-slate-200 tabular-nums">
                {dailyCompletedToday ? 'Cleared' : `Streak: ${dailyStreak}d`}
              </span>
            </div>
            <div className="mt-1 text-xs font-semibold text-white">
              {dailyTrack.name} · ≤{' '}
              <span className="font-mono-tabular text-amber-300">
                {formatRaceTime(dailyChallenge.targetTimeMs)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-slate-300">
              <span>Reward: {dailyChallenge.rewardLivery.name}</span>
              <span
                className="inline-block h-3.5 w-3.5 rounded-sm border border-white/30 shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${dailyChallenge.rewardLivery.primary} 60%, ${dailyChallenge.rewardLivery.accent} 60%)`,
                }}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Flat Borderless Control Hint Strip */}
      <div className="hidden sm:flex justify-end pointer-events-none">
        <p
          className="text-xs text-slate-200 px-3 py-1 rounded"
          style={{
            backgroundColor: 'rgba(11, 15, 23, 0.72)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          WASD / Arrows Drive · Space Handbrake · C Camera · R Reset · P Pause
        </p>
      </div>
    </div>
  );
}
