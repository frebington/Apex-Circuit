import test from 'node:test';
import assert from 'node:assert/strict';
import { getBakedTrack } from './tracks';
import {
  DEFAULT_CPU_COUNT,
  MAX_CPU_COUNT,
  buildCpuGridOpponents,
  computeCpuCarInput,
  difficultyToSkillParams,
} from './ai';
import {
  createInitialCarState,
  resolveCarCollisions,
  stepCarPhysics,
} from './physics';

test('car accelerates, steers, and stays contained inside barriers', () => {
  const baked = getBakedTrack('alpine_gorge');
  const car = createInitialCarState(baked, 0);

  // Survive 2 seconds with zero input without moving off road or NaN
  for (let i = 0; i < 60; i++) {
    stepCarPhysics(
      car,
      { throttle: 0, brake: 0, steer: 0, handbrake: false },
      baked,
      1 / 30,
      i * 33,
      true,
    );
  }
  assert.equal(Number.isFinite(car.x), true);
  assert.equal(Math.abs(car.speed) < 0.01, true);

  // Accelerate for 2 seconds
  for (let i = 0; i < 60; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, handbrake: false },
      baked,
      1 / 30,
      2000 + i * 33,
      true,
    );
  }
  assert.ok(car.speed > 18, `Expected car to accelerate, got speed ${car.speed}`);

  // Steer hard into wall to verify containment keeps car within road/shoulder limit
  for (let i = 0; i < 90; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 1, handbrake: false },
      baked,
      1 / 30,
      4000 + i * 33,
      true,
    );
  }
  assert.equal(Number.isFinite(car.x), true);
  assert.equal(Number.isFinite(car.z), true);
});

test('lap counter prevents reverse-crossing cheat and increments on full lap', () => {
  const baked = getBakedTrack('redrock_crossing');
  const car = createInitialCarState(baked, 0);

  // Try reversing across start line without sectors visited
  car.lastT = 0.95;
  stepCarPhysics(
    car,
    { throttle: 0, brake: 1, steer: 0, handbrake: false },
    baked,
    1 / 30,
    500,
    true,
  );
  assert.equal(car.lap, 1);

  // Simulate visiting all 4 sectors cleanly then crossing finish
  car.sectorMask = 15;
  car.lastT = 0.96;
  const s0 = baked.samples[2];
  car.x = s0.x;
  car.z = s0.z;
  car.hintSampleIndex = 2;

  const res = stepCarPhysics(
    car,
    { throttle: 1, brake: 0, steer: 0, handbrake: false },
    baked,
    1 / 60,
    18500,
    true,
  );
  assert.equal(res.lapCompleted, 1);
  assert.equal(car.lap, 2);
  assert.equal(car.bestLapMs, 18500);
});

test('car-to-car collision separates overlapping cars', () => {
  const baked = getBakedTrack('coastal_causeway');
  const car = createInitialCarState(baked, 0);
  const startX = car.x;
  const bumped = resolveCarCollisions(car, [{ x: car.x + 1.0, y: car.y, z: car.z }]);
  assert.equal(bumped, true);
  assert.ok(car.x < startX, 'Local car should be pushed away from overlapping rival');
});

test('CPU opponents fill up to 11 grid slots, carry chassis/finish customization, and navigate tracks cleanly', () => {
  const defaultCpus = buildCpuGridOpponents([{ color: '#dc2626' }]);
  assert.equal(defaultCpus.length, DEFAULT_CPU_COUNT);
  assert.ok(defaultCpus.every((c) => c.color.toLowerCase() !== '#dc2626'));
  assert.ok(defaultCpus.every((c) => Boolean(c.chassisId) && Boolean(c.paintFinish)));

  const fullPack = buildCpuGridOpponents([{ color: '#dc2626' }], MAX_CPU_COUNT, 85);
  assert.equal(fullPack.length, MAX_CPU_COUNT);
  assert.equal(new Set(fullPack.map((c) => c.id)).size, MAX_CPU_COUNT);

  const zeroPack = buildCpuGridOpponents([{ color: '#dc2626' }], 0, 50);
  assert.equal(zeroPack.length, 0);

  const baked = getBakedTrack('frostpeak_pass');
  const cpuCar = createInitialCarState(baked, 1);

  // Simulate 12 seconds of CPU driving at 30 Hz
  for (let i = 0; i < 360; i++) {
    const input = computeCpuCarInput(cpuCar, baked, [], defaultCpus[0]);
    stepCarPhysics(cpuCar, input, baked, 1 / 30, i * 33.3, true);
  }

  assert.equal(Number.isFinite(cpuCar.x), true);
  assert.equal(cpuCar.wrongWay, false, 'CPU should never go wrong way');
  assert.ok(cpuCar.progress > 0.2, `CPU should advance along track, got progress ${cpuCar.progress}`);
  assert.ok(cpuCar.speed > 12, `CPU should maintain racing speed, got ${cpuCar.speed}`);
});

test('CPU difficulty slider meaningfully scales skill parameters and race pace', () => {
  const rookieParams = difficultyToSkillParams(10);
  const legendParams = difficultyToSkillParams(95);
  assert.equal(rookieParams.tierLabel, 'Rookie');
  assert.equal(legendParams.tierLabel, 'Legend');
  assert.ok(legendParams.speedScale > rookieParams.speedScale + 0.2);
  assert.ok(legendParams.cornerSkill > rookieParams.cornerSkill + 0.2);

  const rookieCpu = buildCpuGridOpponents([{ color: '#dc2626' }], 1, 10)[0];
  const legendCpu = buildCpuGridOpponents([{ color: '#dc2626' }], 1, 95)[0];
  const baked = getBakedTrack('alpine_gorge');
  const rookieCar = createInitialCarState(baked, 1);
  const legendCar = createInitialCarState(baked, 1);

  for (let i = 0; i < 540; i++) {
    const t = i * (1000 / 30);
    stepCarPhysics(
      rookieCar,
      computeCpuCarInput(rookieCar, baked, [], rookieCpu),
      baked,
      1 / 30,
      t,
      true,
      1.0,
      rookieCpu.pace,
    );
    stepCarPhysics(
      legendCar,
      computeCpuCarInput(legendCar, baked, [], legendCpu),
      baked,
      1 / 30,
      t,
      true,
      1.0,
      legendCpu.pace,
    );
  }

  assert.ok(
    legendCar.progress > rookieCar.progress + 0.08,
    `Legend CPU (${legendCar.progress.toFixed(3)}) should pull ahead of Rookie CPU (${rookieCar.progress.toFixed(3)})`,
  );
});

test('Pro CPU launches at full throttle and completes Redrock Crossing & Frostpeak Pass competitively', () => {
  const proCpu = buildCpuGridOpponents([{ color: '#dc2626' }], 7, 55)[0];
  for (const trackId of ['redrock_crossing', 'frostpeak_pass'] as const) {
    const baked = getBakedTrack(trackId);
    const car = createInitialCarState(baked, 1);
    const launchInput = computeCpuCarInput(car, baked, [], proCpu);
    assert.equal(launchInput.throttle, 1, `${trackId} Pro CPU must launch at full throttle`);

    for (let i = 0; i < 4200 && !car.finished; i++) {
      const input = computeCpuCarInput(car, baked, [], proCpu);
      stepCarPhysics(car, input, baked, 1 / 30, i * (1000 / 30), true, 1.0, proCpu.pace);
    }

    assert.equal(car.finished, true, `${trackId} Pro CPU should finish full 3-lap race without stalling`);
    assert.ok(
      (car.finishTimeMs ?? Infinity) < 105000,
      `${trackId} Pro CPU finish (${car.finishTimeMs}ms) should be fast and competitive`,
    );
  }
});
