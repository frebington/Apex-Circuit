import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupLeaderboardByTrack,
  validateAndNormalizeLapPayload,
} from './leaderboard';

test('validateAndNormalizeLapPayload enforces schema bounds and normalizes valid records', () => {
  const valid = validateAndNormalizeLapPayload({
    uid: 'user_abc123',
    driverName: '  Alex   Fast  ',
    trackId: 'alpine_gorge',
    bestLapMs: 18423.6,
    chassisId: 'formula_open',
    paintFinish: 'chrome',
    color: '#2563EB',
  });
  assert.deepEqual(valid, {
    uid: 'user_abc123',
    driverName: 'Alex Fast',
    trackId: 'alpine_gorge',
    bestLapMs: 18424,
    chassisId: 'formula_open',
    paintFinish: 'chrome',
    color: '#2563EB',
  });

  // Reject impossible/cheated lap times (< 5s or > 600s)
  assert.equal(
    validateAndNormalizeLapPayload({
      uid: 'u1',
      driverName: 'Test',
      trackId: 'alpine_gorge',
      bestLapMs: 2500,
      color: '#dc2626',
    }),
    null,
  );
  assert.equal(
    validateAndNormalizeLapPayload({
      uid: 'u1',
      driverName: 'Test',
      trackId: 'alpine_gorge',
      bestLapMs: 650000,
      color: '#dc2626',
    }),
    null,
  );
  // Reject invalid uid
  assert.equal(
    validateAndNormalizeLapPayload({
      uid: 'bad/uid',
      driverName: 'Test',
      trackId: 'alpine_gorge',
      bestLapMs: 20000,
      color: '#dc2626',
    }),
    null,
  );
});

test('groupLeaderboardByTrack buckets records by track and sorts fastest ascending', () => {
  const grouped = groupLeaderboardByTrack([
    {
      id: 'u2_alpine_gorge',
      uid: 'u2',
      driverName: 'Second',
      trackId: 'alpine_gorge',
      bestLapMs: 22100,
      chassisId: 'gt_coupe',
      paintFinish: 'gloss',
      color: '#dc2626',
      updatedAtMs: 1000,
    },
    {
      id: 'u1_alpine_gorge',
      uid: 'u1',
      driverName: 'First',
      trackId: 'alpine_gorge',
      bestLapMs: 19450,
      chassisId: 'formula_open',
      paintFinish: 'chrome',
      color: '#2563eb',
      updatedAtMs: 2000,
    },
    {
      id: 'u1_sunset_valley',
      uid: 'u1',
      driverName: 'First',
      trackId: 'sunset_valley',
      bestLapMs: 25300,
      chassisId: 'rally_hatch',
      paintFinish: 'matte',
      color: '#d97706',
      updatedAtMs: 3000,
    },
  ]);

  assert.equal(grouped.alpine_gorge.length, 2);
  assert.equal(grouped.alpine_gorge[0].driverName, 'First');
  assert.equal(grouped.alpine_gorge[1].driverName, 'Second');
  assert.equal(grouped.sunset_valley.length, 1);
  assert.equal(grouped.frostpeak_pass.length, 0);
});
