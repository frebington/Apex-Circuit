import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateDailyChallengeCompletion,
  getDailyChallengeForDate,
  getDisplayStreak,
  getPreviousDateKey,
  getTodayDateKey,
  mergeDailyProgress,
} from './dailyChallenge';
import { DAILY_REWARD_LIVERIES } from '../shared/types';

test('date keys format UTC date and handle month/year rollbacks', () => {
  assert.equal(getTodayDateKey(new Date('2026-11-24T23:55:00Z')), '2026-11-24');
  assert.equal(getPreviousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(getPreviousDateKey('2026-01-01'), '2025-12-31');
});

test('daily challenge rotates tracks deterministically across days', () => {
  const tracks = new Set<string>();
  const rewards = new Set<string>();
  for (let day = 10; day <= 17; day++) {
    const c = getDailyChallengeForDate(`2026-11-${day}`);
    tracks.add(c.trackId);
    rewards.add(c.rewardLivery.id);
    assert.ok(c.targetTimeMs >= 95000 && c.targetTimeMs <= 125000);
  }
  assert.equal(tracks.size, 5, 'should rotate across all 5 circuits');
  assert.ok(rewards.size >= 5, 'should rotate across multiple unique reward liveries');
});

test('evaluateDailyChallengeCompletion enforces track, target time, streaks, and livery unlocks', () => {
  const day1 = getDailyChallengeForDate('2026-11-20');

  // Wrong track fails
  const wrongTrack = evaluateDailyChallengeCompletion({
    challenge: day1,
    trackId: day1.trackId === 'alpine_gorge' ? 'sunset_valley' : 'alpine_gorge',
    finishTimeMs: day1.targetTimeMs - 5000,
    existing: null,
  });
  assert.equal(wrongTrack.achieved, false);

  // Over target time fails
  const tooSlow = evaluateDailyChallengeCompletion({
    challenge: day1,
    trackId: day1.trackId,
    finishTimeMs: day1.targetTimeMs + 1,
    existing: null,
  });
  assert.equal(tooSlow.achieved, false);

  // Clean Day 1 completion
  const res1 = evaluateDailyChallengeCompletion({
    challenge: day1,
    trackId: day1.trackId,
    finishTimeMs: day1.targetTimeMs - 1200,
    existing: null,
    nowMs: 1000,
  });
  assert.equal(res1.achieved, true);
  assert.equal(res1.alreadyCompletedToday, false);
  assert.equal(res1.newlyUnlockedLivery?.id, day1.rewardLivery.id);
  assert.equal(res1.nextProgress?.currentStreak, 1);
  assert.equal(res1.nextProgress?.bestStreak, 1);
  assert.equal(res1.nextProgress?.totalCompleted, 1);

  // Same-day repeat is idempotent
  const repeat = evaluateDailyChallengeCompletion({
    challenge: day1,
    trackId: day1.trackId,
    finishTimeMs: day1.targetTimeMs - 3000,
    existing: res1.nextProgress,
  });
  assert.equal(repeat.achieved, true);
  assert.equal(repeat.alreadyCompletedToday, true);
  assert.equal(repeat.newlyUnlockedLivery, null);
  assert.equal(repeat.nextProgress?.currentStreak, 1);

  // Consecutive Day 2 increments streak and unlocks next livery
  const day2 = getDailyChallengeForDate('2026-11-21');
  const res2 = evaluateDailyChallengeCompletion({
    challenge: day2,
    trackId: day2.trackId,
    finishTimeMs: day2.targetTimeMs,
    existing: res1.nextProgress,
    nowMs: 2000,
  });
  assert.equal(res2.achieved, true);
  assert.equal(res2.nextProgress?.currentStreak, 2);
  assert.equal(res2.nextProgress?.bestStreak, 2);
  assert.equal(res2.nextProgress?.totalCompleted, 2);
  assert.equal(res2.nextProgress?.unlockedLiveryIds.length, 2);

  // Missed a day (Day 4 after Day 2): resets currentStreak to 1, preserves bestStreak = 2
  const day4 = getDailyChallengeForDate('2026-11-23');
  const res4 = evaluateDailyChallengeCompletion({
    challenge: day4,
    trackId: day4.trackId,
    finishTimeMs: day4.targetTimeMs - 500,
    existing: res2.nextProgress,
    nowMs: 3000,
  });
  assert.equal(res4.achieved, true);
  assert.equal(res4.nextProgress?.currentStreak, 1);
  assert.equal(res4.nextProgress?.bestStreak, 2);
  assert.equal(res4.nextProgress?.totalCompleted, 3);
  assert.equal(res4.nextProgress?.unlockedLiveryIds.length, 3);
});

test('already unlocked featured livery falls back to next locked livery', () => {
  const challenge = getDailyChallengeForDate('2026-11-24');
  const existing = {
    currentStreak: 1,
    bestStreak: 1,
    totalCompleted: 1,
    lastCompletedDate: '2026-11-23',
    unlockedLiveryIds: [challenge.rewardLivery.id],
    updatedAtMs: 500,
  };
  const res = evaluateDailyChallengeCompletion({
    challenge,
    trackId: challenge.trackId,
    finishTimeMs: challenge.targetTimeMs - 100,
    existing,
  });
  assert.equal(res.achieved, true);
  assert.ok(res.newlyUnlockedLivery);
  assert.notEqual(res.newlyUnlockedLivery?.id, challenge.rewardLivery.id);
  assert.equal(res.nextProgress?.unlockedLiveryIds.length, 2);
  assert.ok(
    DAILY_REWARD_LIVERIES.some((l) => l.id === res.newlyUnlockedLivery?.id),
  );
});

test('getDisplayStreak & mergeDailyProgress compute live streaks and union unlocked liveries', () => {
  const progress = {
    currentStreak: 4,
    bestStreak: 6,
    totalCompleted: 9,
    lastCompletedDate: '2026-11-23',
    unlockedLiveryIds: [DAILY_REWARD_LIVERIES[0].id],
    updatedAtMs: 1000,
  };
  assert.equal(getDisplayStreak(progress, '2026-11-23'), 4);
  assert.equal(getDisplayStreak(progress, '2026-11-24'), 4);
  assert.equal(getDisplayStreak(progress, '2026-11-25'), 0);

  const remote = {
    currentStreak: 2,
    bestStreak: 5,
    totalCompleted: 7,
    lastCompletedDate: '2026-11-22',
    unlockedLiveryIds: [DAILY_REWARD_LIVERIES[1].id],
    updatedAtMs: 900,
  };
  const merged = mergeDailyProgress(progress, remote);
  assert.equal(merged?.bestStreak, 6);
  assert.equal(merged?.totalCompleted, 9);
  assert.equal(merged?.lastCompletedDate, '2026-11-23');
  assert.equal(merged?.unlockedLiveryIds.length, 2);
});
