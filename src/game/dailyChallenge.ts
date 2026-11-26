import {
  DAILY_REWARD_LIVERIES,
  type DailyChallengeProgress,
  type DailyChallengeSpec,
  type DailyRewardLivery,
  type DailyRewardLiveryId,
  type TrackId,
} from '../shared/types';
import { TRACK_DEFINITIONS } from './tracks';

const STORAGE_KEY = 'apex_circuit_daily_v1';

const BASE_TRACK_TARGET_MS: Record<TrackId, number> = {
  alpine_gorge: 112000, // 1:52.000 (3 laps)
  redrock_crossing: 103000, // 1:43.000 (3 laps)
  frostpeak_pass: 110000, // 1:50.000 (3 laps)
  coastal_causeway: 118000, // 1:58.000 (3 laps)
  sunset_valley: 102000, // 1:42.000 (3 laps)
};

const VALID_REWARD_IDS = new Set<DailyRewardLiveryId>(
  DAILY_REWARD_LIVERIES.map((l) => l.id),
);

export function getTodayDateKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPreviousDateKey(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const prev = new Date(ms - 86400000);
  return getTodayDateKey(prev);
}

function dateKeyToDayIndex(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return 0;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.floor(ms / 86400000);
}

export function getDailyChallengeForDate(dateKey: string): DailyChallengeSpec {
  const dayIdx = Math.abs(dateKeyToDayIndex(dateKey));
  const track = TRACK_DEFINITIONS[dayIdx % TRACK_DEFINITIONS.length] ?? TRACK_DEFINITIONS[0];
  const baseTarget = BASE_TRACK_TARGET_MS[track.id] ?? 110000;
  // Subtle daily variation (-1.0s, 0s, +1.0s)
  const deltaOffsets = [-1000, 0, 1000];
  const targetTimeMs = baseTarget + deltaOffsets[dayIdx % deltaOffsets.length];
  const rewardLivery =
    DAILY_REWARD_LIVERIES[(dayIdx * 3 + 1) % DAILY_REWARD_LIVERIES.length] ??
    DAILY_REWARD_LIVERIES[0];

  return {
    dateKey,
    trackId: track.id,
    targetTimeMs,
    rewardLivery,
  };
}

export interface DailyCompletionResult {
  achieved: boolean;
  alreadyCompletedToday: boolean;
  newlyUnlockedLivery: DailyRewardLivery | null;
  nextProgress: DailyChallengeProgress | null;
}

export function evaluateDailyChallengeCompletion(params: {
  challenge: DailyChallengeSpec;
  trackId: TrackId;
  finishTimeMs: number | null;
  existing: DailyChallengeProgress | null;
  nowMs?: number;
}): DailyCompletionResult {
  const { challenge, trackId, finishTimeMs, existing } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (
    trackId !== challenge.trackId ||
    finishTimeMs === null ||
    !Number.isFinite(finishTimeMs) ||
    finishTimeMs <= 0 ||
    finishTimeMs > challenge.targetTimeMs
  ) {
    return {
      achieved: false,
      alreadyCompletedToday: false,
      newlyUnlockedLivery: null,
      nextProgress: existing,
    };
  }

  if (existing && existing.lastCompletedDate === challenge.dateKey) {
    return {
      achieved: true,
      alreadyCompletedToday: true,
      newlyUnlockedLivery: null,
      nextProgress: existing,
    };
  }

  const prevDate = getPreviousDateKey(challenge.dateKey);
  const isConsecutive = existing?.lastCompletedDate === prevDate;
  const currentStreak = isConsecutive ? (existing?.currentStreak ?? 0) + 1 : 1;
  const bestStreak = Math.max(existing?.bestStreak ?? 0, currentStreak);
  const totalCompleted = (existing?.totalCompleted ?? 0) + 1;

  const currentUnlocked = (existing?.unlockedLiveryIds ?? []).filter((id) =>
    VALID_REWARD_IDS.has(id),
  );
  const unlockedSet = new Set<DailyRewardLiveryId>(currentUnlocked);

  let newlyUnlockedLivery: DailyRewardLivery | null = null;
  if (!unlockedSet.has(challenge.rewardLivery.id)) {
    unlockedSet.add(challenge.rewardLivery.id);
    newlyUnlockedLivery = challenge.rewardLivery;
  } else {
    const nextLocked = DAILY_REWARD_LIVERIES.find((l) => !unlockedSet.has(l.id));
    if (nextLocked) {
      unlockedSet.add(nextLocked.id);
      newlyUnlockedLivery = nextLocked;
    }
  }

  const nextProgress: DailyChallengeProgress = {
    currentStreak,
    bestStreak,
    totalCompleted,
    lastCompletedDate: challenge.dateKey,
    unlockedLiveryIds: Array.from(unlockedSet),
    updatedAtMs: nowMs,
  };

  return {
    achieved: true,
    alreadyCompletedToday: false,
    newlyUnlockedLivery,
    nextProgress,
  };
}

export function getDisplayStreak(
  progress: DailyChallengeProgress | null,
  todayKey: string,
): number {
  if (!progress || !progress.lastCompletedDate) return 0;
  if (
    progress.lastCompletedDate === todayKey ||
    progress.lastCompletedDate === getPreviousDateKey(todayKey)
  ) {
    return progress.currentStreak;
  }
  return 0;
}

export function mergeDailyProgress(
  local: DailyChallengeProgress | null,
  remote: DailyChallengeProgress | null,
): DailyChallengeProgress | null {
  if (!local) return remote;
  if (!remote) return local;

  const unlocked = Array.from(
    new Set<DailyRewardLiveryId>([
      ...remote.unlockedLiveryIds,
      ...local.unlockedLiveryIds,
    ]),
  ).filter((id) => VALID_REWARD_IDS.has(id));

  const useLocalDate =
    (local.lastCompletedDate ?? '') > (remote.lastCompletedDate ?? '');

  return {
    currentStreak: useLocalDate
      ? Math.max(local.currentStreak, remote.currentStreak)
      : remote.currentStreak,
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    totalCompleted: Math.max(local.totalCompleted, remote.totalCompleted),
    lastCompletedDate: useLocalDate
      ? local.lastCompletedDate
      : remote.lastCompletedDate,
    unlockedLiveryIds: unlocked,
    updatedAtMs: Math.max(local.updatedAtMs, remote.updatedAtMs),
  };
}

export function loadLocalDailyProgress(): DailyChallengeProgress | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyChallengeProgress>;
    if (
      !parsed ||
      typeof parsed.currentStreak !== 'number' ||
      typeof parsed.bestStreak !== 'number' ||
      typeof parsed.totalCompleted !== 'number' ||
      !Array.isArray(parsed.unlockedLiveryIds)
    ) {
      return null;
    }
    return {
      currentStreak: Math.max(0, Math.floor(parsed.currentStreak)),
      bestStreak: Math.max(0, Math.floor(parsed.bestStreak)),
      totalCompleted: Math.max(0, Math.floor(parsed.totalCompleted)),
      lastCompletedDate:
        typeof parsed.lastCompletedDate === 'string'
          ? parsed.lastCompletedDate
          : null,
      unlockedLiveryIds: parsed.unlockedLiveryIds.filter((id): id is DailyRewardLiveryId =>
        VALID_REWARD_IDS.has(id as DailyRewardLiveryId),
      ),
      updatedAtMs:
        typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveLocalDailyProgress(progress: DailyChallengeProgress): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota / private mode restrictions
  }
}
