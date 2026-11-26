import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { LogIn, LogOut, Trophy, Upload, X } from 'lucide-react';
import {
  CAR_CHASSIS_OPTIONS,
  PAINT_FINISH_OPTIONS,
  type LeaderboardRecord,
  type TrackId,
} from '../shared/types';
import { TRACK_DEFINITIONS } from '../game/tracks';
import { formatOrdinal, formatRaceTime } from '../utils/formatTime';
import { groupLeaderboardByTrack, isFirebaseSupportedRuntime } from '../firebase/leaderboard';

interface GlobalLeaderboardProps {
  open: boolean;
  initialTrackId: TrackId;
  records: LeaderboardRecord[];
  loading: boolean;
  error: string | null;
  authUser: User | null;
  authBusy: boolean;
  pendingBestLaps: Partial<Record<TrackId, number>>;
  submittingTrack: TrackId | null;
  submitFeedback: string | null;
  onClose: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSubmitPendingLap: (trackId: TrackId) => void;
}

const CHASSIS_LABEL_MAP = new Map(
  CAR_CHASSIS_OPTIONS.map((c) => [c.id, c.shortLabel]),
);
const FINISH_LABEL_MAP = new Map(
  PAINT_FINISH_OPTIONS.map((f) => [f.id, f.name]),
);

function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function GlobalLeaderboard({
  open,
  initialTrackId,
  records,
  loading,
  error,
  authUser,
  authBusy,
  pendingBestLaps,
  submittingTrack,
  submitFeedback,
  onClose,
  onSignIn,
  onSignOut,
  onSubmitPendingLap,
}: GlobalLeaderboardProps) {
  const [activeTrackId, setActiveTrackId] = useState<TrackId>(initialTrackId);
  const [lastInitialTrack, setLastInitialTrack] = useState<TrackId>(initialTrackId);

  if (initialTrackId !== lastInitialTrack) {
    setLastInitialTrack(initialTrackId);
    setActiveTrackId(initialTrackId);
  }

  const grouped = useMemo(() => groupLeaderboardByTrack(records), [records]);

  if (!open) return null;

  const isSupported = isFirebaseSupportedRuntime();
  const trackRecords = grouped[activeTrackId] ?? [];
  const localBestMs = pendingBestLaps[activeTrackId] ?? null;
  const userExisting = authUser
    ? trackRecords.find((r) => r.uid === authUser.uid) ?? null
    : null;
  const canPostLocalBest =
    localBestMs !== null &&
    localBestMs >= 5000 &&
    (!userExisting || localBestMs < userExisting.bestLapMs);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(7, 10, 16, 0.82)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Global Leaderboard"
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-white/15 p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col"
        style={{ backgroundColor: '#0f1520' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-bold text-white leading-tight">
                Global Lap Records
              </h2>
              <p className="text-xs text-slate-400">
                Verified personal best lap times per circuit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="rounded-lg border border-white/15 bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Auth Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2">
          {!isSupported ? (
            <p className="text-xs text-slate-300">
              Online leaderboard is unavailable in offline portable file mode.
            </p>
          ) : authUser ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs text-slate-200 truncate">
                  Signed in as{' '}
                  <strong className="text-white">
                    {authUser.displayName || authUser.email || 'Driver'}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                disabled={authBusy}
                className="rounded-md border border-white/15 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                Play freely anytime — sign in with Google to submit your lap times globally.
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

        {/* Pending Best Lap Banner */}
        {isSupported && canPostLocalBest && localBestMs !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2">
            <div className="text-xs text-amber-100">
              Your session best:{' '}
              <span className="font-mono-tabular font-bold text-amber-300">
                {formatRaceTime(localBestMs)}
              </span>
              {userExisting
                ? ` (beats your ${formatRaceTime(userExisting.bestLapMs)})`
                : ''}
            </div>
            <button
              type="button"
              disabled={authBusy || submittingTrack === activeTrackId}
              onClick={() =>
                authUser ? onSubmitPendingLap(activeTrackId) : onSignIn()
              }
              className="rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-bold px-3 py-1 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              {authUser
                ? submittingTrack === activeTrackId
                  ? 'Posting...'
                  : 'Post Lap Time'
                : 'Sign in & Post'}
            </button>
          </div>
        )}

        {submitFeedback && (
          <p className="text-xs text-emerald-300 px-1">{submitFeedback}</p>
        )}

        {/* Track Filter Tabs */}
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-1.5"
          role="tablist"
          aria-label="Filter leaderboard by track"
        >
          {TRACK_DEFINITIONS.map((t) => {
            const active = t.id === activeTrackId;
            const count = (grouped[t.id] ?? []).length;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTrackId(t.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? 'border-amber-400 bg-amber-500/15 text-white'
                    : 'border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25 hover:text-white'
                }`}
              >
                <div className="text-xs font-bold truncate">{t.name}</div>
                <div className="text-[10px] text-slate-400 tabular-nums">
                  {count} {count === 1 ? 'record' : 'records'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Records Table */}
        <div className="flex-1 min-h-[200px] max-h-[340px] overflow-y-auto rounded-lg border border-white/10 bg-slate-900/60">
          {error ? (
            <div className="p-6 text-center text-xs text-red-300">{error}</div>
          ) : loading ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Loading global records...
            </div>
          ) : trackRecords.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm font-semibold text-slate-200">
                No records posted yet for this circuit
              </p>
              <p className="text-xs text-slate-400">
                Complete a clean lap and sign in with Google to claim 1st place.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/90 sticky top-0">
                  <th className="py-2 px-3 w-14">Rank</th>
                  <th className="py-2 px-3">Driver</th>
                  <th className="py-2 px-3 hidden sm:table-cell">Car Setup</th>
                  <th className="py-2 px-3 text-right">Best Lap</th>
                  <th className="py-2 px-3 text-right hidden sm:table-cell w-20">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {trackRecords.slice(0, 50).map((rec, idx) => {
                  const isSelf = Boolean(authUser && rec.uid === authUser.uid);
                  const chassisLabel = CHASSIS_LABEL_MAP.get(rec.chassisId) ?? 'GT';
                  const finishLabel = FINISH_LABEL_MAP.get(rec.paintFinish) ?? 'Gloss';
                  return (
                    <tr
                      key={rec.id}
                      className={
                        isSelf
                          ? 'bg-amber-500/15 text-white'
                          : 'hover:bg-slate-800/60 text-slate-200'
                      }
                    >
                      <td className="py-2 px-3 font-display font-bold tabular-nums">
                        <span
                          className={
                            idx === 0
                              ? 'text-amber-400'
                              : idx === 1
                                ? 'text-slate-200'
                                : idx === 2
                                  ? 'text-orange-400'
                                  : 'text-slate-400'
                          }
                        >
                          {formatOrdinal(idx + 1)}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0 border border-white/20"
                            style={{ backgroundColor: rec.color }}
                          />
                          <span className="truncate max-w-[140px]">
                            {rec.driverName}
                            {isSelf ? ' (You)' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-300 hidden sm:table-cell">
                        {chassisLabel} · {finishLabel}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-tabular font-bold text-emerald-300">
                        {formatRaceTime(rec.bestLapMs)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400 hidden sm:table-cell">
                        {formatShortDate(rec.updatedAtMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
