import type { User } from 'firebase/auth';
import { Check, Flame, Lock, LogIn, Play, Sparkles, X } from 'lucide-react';
import {
  DAILY_REWARD_LIVERIES,
  type DailyChallengeProgress,
  type DailyChallengeSpec,
  type DailyRewardLiveryId,
} from '../shared/types';
import { getDisplayStreak } from '../game/dailyChallenge';
import { getTrackDefinition } from '../game/tracks';
import { isFirebaseSupportedRuntime } from '../firebase/leaderboard';
import { formatRaceTime } from '../utils/formatTime';

interface DailyChallengeModalProps {
  open: boolean;
  challenge: DailyChallengeSpec;
  progress: DailyChallengeProgress | null;
  driverColor: string;
  authUser: User | null;
  authBusy: boolean;
  dailySyncError: string | null;
  onClose: () => void;
  onSelectLiveryColor: (hexColor: string) => void;
  onStartChallengeRace: () => void;
  onSignIn: () => void;
}

export function DailyChallengeModal({
  open,
  challenge,
  progress,
  driverColor,
  authUser,
  authBusy,
  dailySyncError,
  onClose,
  onSelectLiveryColor,
  onStartChallengeRace,
  onSignIn,
}: DailyChallengeModalProps) {
  if (!open) return null;

  const track = getTrackDefinition(challenge.trackId);
  const displayStreak = getDisplayStreak(progress, challenge.dateKey);
  const completedToday = progress?.lastCompletedDate === challenge.dateKey;
  const unlockedSet = new Set<DailyRewardLiveryId>(progress?.unlockedLiveryIds ?? []);
  const isSupported = isFirebaseSupportedRuntime();

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(7, 10, 16, 0.82)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Daily Challenge"
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-white/15 p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: '#0f1520' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-bold text-white leading-tight">
                Daily Circuit Challenge
              </h2>
              <p className="text-xs text-slate-400">
                UTC Date: {challenge.dateKey} · Beat the target time to build your streak & unlock paints
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close daily challenge"
            className="rounded-lg border border-white/15 bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Today's Challenge Card */}
        <div className="rounded-xl border border-amber-400/35 bg-slate-900/90 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Today&apos;s Circuit
                </span>
                {completedToday && (
                  <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                    <Check className="w-3 h-3" aria-hidden="true" />
                    Cleared Today
                  </span>
                )}
              </div>
              <h3 className="font-display text-2xl font-bold text-white mt-1">
                {track.name}
              </h3>
              <p className="text-xs text-slate-300">
                {track.laps} Laps · {track.climateLabel} · {track.features.join(' · ')}
              </p>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-950/90 px-3.5 py-2 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Target Time ({track.laps} Laps)
              </div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                ≤ {formatRaceTime(challenge.targetTimeMs)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-7 w-7 rounded-md border-2 border-white/30 shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${challenge.rewardLivery.primary} 65%, ${challenge.rewardLivery.accent} 65%)`,
                }}
                aria-hidden="true"
              />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Featured Livery Reward
                </div>
                <div className="text-xs font-bold text-white">
                  {challenge.rewardLivery.name}{' '}
                  <span className="text-[11px] font-normal text-slate-400">
                    {unlockedSet.has(challenge.rewardLivery.id)
                      ? '(Unlocked — clears unlock next locked paint)'
                      : '(Unlocks on completion)'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartChallengeRace}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm px-4 py-2 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              {completedToday ? 'Race Challenge Again' : "Race Today's Challenge"}
            </button>
          </div>
        </div>

        {/* Streak Stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-lg border border-white/10 bg-slate-900/75 p-3">
            <div className="text-[11px] text-slate-400">Current Streak</div>
            <div className="font-display text-xl font-bold text-amber-300 tabular-nums mt-0.5 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              {displayStreak} {displayStreak === 1 ? 'day' : 'days'}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/75 p-3">
            <div className="text-[11px] text-slate-400">Best Streak</div>
            <div className="font-display text-xl font-bold text-white tabular-nums mt-0.5">
              {progress?.bestStreak ?? 0}{' '}
              {(progress?.bestStreak ?? 0) === 1 ? 'day' : 'days'}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/75 p-3">
            <div className="text-[11px] text-slate-400">Paints Unlocked</div>
            <div className="font-display text-xl font-bold text-emerald-300 tabular-nums mt-0.5">
              {unlockedSet.size} / {DAILY_REWARD_LIVERIES.length}
            </div>
          </div>
        </div>

        {/* Reward Livery Vault */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              Challenge Reward Liveries
            </h3>
            <span className="text-[11px] text-slate-400">
              Click any unlocked paint to equip
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DAILY_REWARD_LIVERIES.map((livery) => {
              const unlocked = unlockedSet.has(livery.id);
              const equipped =
                driverColor.toLowerCase() === livery.primary.toLowerCase();
              return (
                <button
                  key={livery.id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => unlocked && onSelectLiveryColor(livery.primary)}
                  aria-pressed={equipped}
                  className={`rounded-lg border p-2 text-left transition-colors flex items-center gap-2 ${
                    !unlocked
                      ? 'border-white/10 bg-slate-900/40 opacity-60 cursor-not-allowed'
                      : equipped
                        ? 'border-amber-400 bg-amber-500/15 text-white'
                        : 'border-white/15 bg-slate-900/85 hover:border-white/35 text-slate-100'
                  }`}
                >
                  <span
                    className="h-6 w-6 rounded border border-white/25 shrink-0 flex items-center justify-center"
                    style={{
                      background: unlocked
                        ? `linear-gradient(135deg, ${livery.primary} 65%, ${livery.accent} 65%)`
                        : '#1e293b',
                    }}
                  >
                    {!unlocked && (
                      <Lock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{livery.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {!unlocked ? 'Locked' : equipped ? 'Equipped' : 'Equip'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cloud Streak Sync Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2">
          {!isSupported ? (
            <p className="text-xs text-slate-300">
              Streaks and unlocked liveries are saved locally in Portable mode.
            </p>
          ) : authUser ? (
            <p className="text-xs text-emerald-300">
              Synced to Firestore for{' '}
              <strong className="text-white">
                {authUser.displayName || authUser.email || 'Driver'}
              </strong>
              .
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                Saving streaks on this device — sign in with Google to sync streaks in Firestore.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                disabled={authBusy}
                className="rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                {authBusy ? 'Signing in...' : 'Sign in with Google'}
              </button>
            </>
          )}
        </div>

        {dailySyncError && (
          <p className="text-xs text-red-300 px-1">{dailySyncError}</p>
        )}
      </div>
    </div>
  );
}
