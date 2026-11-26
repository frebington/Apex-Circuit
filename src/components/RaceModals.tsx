import { Check, Flame, Play, Trophy } from 'lucide-react';
import type {
  DailyChallengeSpec,
  DailyRewardLivery,
  GameScreenState,
  PlayerTelemetry,
  TrackId,
} from '../shared/types';
import { formatOrdinal, formatRaceTime } from '../utils/formatTime';

export interface DailyRaceOutcome {
  achieved: boolean;
  alreadyCompletedToday: boolean;
  newlyUnlockedLivery: DailyRewardLivery | null;
  streak: number;
  targetTimeMs: number;
}

interface RaceModalsProps {
  screenState: GameScreenState;
  trackId: TrackId;
  trackName: string;
  players: PlayerTelemetry[];
  localPlayerId: string | null;
  localFinishTimeMs: number | null;
  localBestLapMs: number | null;
  hasReplay: boolean;
  leaderboardStatusText?: string | null;
  dailyChallenge: DailyChallengeSpec;
  dailyOutcome: DailyRaceOutcome | null;
  onResume: () => void;
  onRestartRace: () => void;
  onReturnLobby: () => void;
  onStartReplay: () => void;
  onOpenLeaderboard: () => void;
  onOpenDailyChallenge: () => void;
  onEquipDailyLivery: (hexColor: string) => void;
}

export function RaceModals({
  screenState,
  trackId,
  trackName,
  players,
  localPlayerId,
  localFinishTimeMs,
  localBestLapMs,
  hasReplay,
  leaderboardStatusText,
  dailyChallenge,
  dailyOutcome,
  onResume,
  onRestartRace,
  onReturnLobby,
  onStartReplay,
  onOpenLeaderboard,
  onOpenDailyChallenge,
  onEquipDailyLivery,
}: RaceModalsProps) {
  if (screenState !== 'paused' && screenState !== 'gameover') {
    return null;
  }

  if (screenState === 'paused') {
    return (
      <div
        className="fixed inset-0 z-20 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(7, 10, 16, 0.72)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Race Paused"
      >
        <div
          className="w-full max-w-sm rounded-xl border border-white/15 p-6 space-y-5 shadow-2xl"
          style={{ backgroundColor: '#0f1520' }}
        >
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Race Paused
            </h2>
            <p className="text-xs text-slate-300 mt-1">{trackName}</p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold py-2.5 px-4 text-sm transition-colors"
            >
              Resume Race
            </button>
            <button
              type="button"
              onClick={onRestartRace}
              className="w-full rounded-lg border border-white/15 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 px-4 text-sm transition-colors"
            >
              Restart Race
            </button>
            <button
              type="button"
              onClick={onReturnLobby}
              className="w-full rounded-lg border border-white/15 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold py-2.5 px-4 text-sm transition-colors"
            >
              Return to Track Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standings sorted by finish time first, then race progress
  const standings = [...players].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });

  const localRank =
    standings.findIndex((p) => p.id === localPlayerId) + 1 || 1;
  const isDailyTrack = trackId === dailyChallenge.trackId;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(7, 10, 16, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Race Results"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-white/15 p-6 space-y-4 shadow-2xl"
        style={{ backgroundColor: '#0f1520' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Checkered Flag
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">{trackName}</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase text-slate-400">Finish</div>
            <div className="font-display text-2xl font-bold text-amber-400 tabular-nums">
              {formatOrdinal(localRank)}
            </div>
          </div>
        </div>

        {/* Summary Tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/10 bg-slate-900/75 p-3">
            <div className="text-[11px] text-slate-400">Total Time</div>
            <div className="font-mono-tabular text-lg font-bold text-white mt-0.5">
              {formatRaceTime(localFinishTimeMs)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/75 p-3">
            <div className="text-[11px] text-slate-400">Best Lap</div>
            <div className="font-mono-tabular text-lg font-bold text-emerald-300 mt-0.5">
              {formatRaceTime(localBestLapMs)}
            </div>
          </div>
        </div>

        {/* Daily Challenge Outcome Banner */}
        {isDailyTrack && dailyOutcome && (
          <div
            className={`rounded-lg border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
              dailyOutcome.achieved
                ? 'border-emerald-400/40 bg-emerald-500/15'
                : 'border-amber-400/35 bg-amber-500/10'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {dailyOutcome.achieved ? (
                <Check className="w-4 h-4 text-emerald-300 shrink-0" aria-hidden="true" />
              ) : (
                <Flame className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              )}
              <div className="text-xs">
                {dailyOutcome.achieved ? (
                  <>
                    <div className="font-bold text-emerald-200">
                      Daily Challenge Cleared! · Streak: {dailyOutcome.streak}d
                    </div>
                    <div className="text-[11px] text-slate-200">
                      {dailyOutcome.newlyUnlockedLivery
                        ? `Unlocked paint: ${dailyOutcome.newlyUnlockedLivery.name}`
                        : dailyOutcome.alreadyCompletedToday
                          ? "Today's daily reward already claimed."
                          : 'All daily reward paints unlocked!'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-amber-200">
                      Daily Challenge Target: ≤ {formatRaceTime(dailyOutcome.targetTimeMs)}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {localFinishTimeMs !== null
                        ? `${((localFinishTimeMs - dailyOutcome.targetTimeMs) / 1000).toFixed(2)}s off target — run again to unlock ${dailyChallenge.rewardLivery.name}.`
                        : `Beat the target time to unlock ${dailyChallenge.rewardLivery.name}.`}
                    </div>
                  </>
                )}
              </div>
            </div>

            {dailyOutcome.newlyUnlockedLivery ? (
              <button
                type="button"
                onClick={() => onEquipDailyLivery(dailyOutcome.newlyUnlockedLivery!.primary)}
                className="rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-2.5 py-1 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-slate-950/40"
                  style={{ backgroundColor: dailyOutcome.newlyUnlockedLivery.primary }}
                />
                Equip Paint
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenDailyChallenge}
                className="rounded-md border border-white/20 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold px-2.5 py-1 whitespace-nowrap shrink-0"
              >
                Daily Vault
              </button>
            )}
          </div>
        )}

        {leaderboardStatusText && (
          <p className="text-xs text-sky-300">{leaderboardStatusText}</p>
        )}

        {/* Standings Table */}
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {standings.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-xs ${
                p.id === localPlayerId
                  ? 'bg-amber-500/15 border border-amber-400/40'
                  : 'bg-slate-900/80 border border-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-display font-bold text-amber-400 w-6 tabular-nums">
                  {formatOrdinal(idx + 1)}
                </span>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-semibold text-white truncate">
                  {p.name}
                  {p.id === localPlayerId ? ' (You)' : ''}
                </span>
                {p.isCpu && (
                  <span className="rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300 shrink-0">
                    CPU
                  </span>
                )}
              </div>
              <div className="font-mono-tabular text-slate-300 shrink-0">
                {p.finished ? formatRaceTime(p.finishTimeMs) : `Lap ${p.lap}`}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            data-start="true"
            onClick={onRestartRace}
            className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold py-2.5 px-3 text-sm transition-colors whitespace-nowrap"
          >
            Race Again
          </button>
          {hasReplay && (
            <button
              type="button"
              onClick={onStartReplay}
              className="rounded-lg border border-sky-400/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 font-display font-bold py-2.5 px-3 text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Replay</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="rounded-lg border border-amber-400/35 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold py-2.5 px-3 text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            <span>Records</span>
          </button>
          <button
            type="button"
            onClick={onReturnLobby}
            className="flex-1 rounded-lg border border-white/15 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 px-3 text-sm transition-colors whitespace-nowrap"
          >
            Change Track
          </button>
        </div>
      </div>
    </div>
  );
}
