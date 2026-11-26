import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_DEFINITIONS,
  computeTerrainHeight,
  getBakedTrack,
  getGridSlotTransform,
  projectPointOnTrack,
} from './tracks';
import { createInitialCarState, stepCarPhysics } from './physics';
import { computeCpuCarInput } from './ai';

test('all 5 tracks bake cleanly with tunnels, bridges, open tunnel mouths, and varied non-circular layouts', () => {
  assert.equal(TRACK_DEFINITIONS.length, 5);

  for (const def of TRACK_DEFINITIONS) {
    const baked = getBakedTrack(def.id);
    assert.ok(baked.totalLength > 600, `${def.id} should be a substantial track`);
    assert.equal(baked.samples.length, 360);
    assert.equal(baked.samples[0].segmentType, 'road', `${def.id} start/finish must be open road`);

    const hasBridge = baked.samples.some((s) => s.segmentType === 'bridge');
    const hasTunnel = baked.samples.some((s) => s.segmentType === 'tunnel');
    const hasRoad = baked.samples.some((s) => s.segmentType === 'road');

    assert.equal(hasBridge, true, `${def.id} must have a bridge section`);
    assert.equal(hasTunnel, true, `${def.id} must have a tunnel section`);
    assert.equal(hasRoad, true, `${def.id} must have regular road sections`);

    // Verify non-overpass bridges sit well above canyon terrain below
    const canyonBridge = baked.samples.find((s) => s.segmentType === 'bridge' && !s.isOverpass);
    if (canyonBridge) {
      const bridgeGroundY = computeTerrainHeight(baked, canyonBridge.x, canyonBridge.z);
      assert.ok(
        bridgeGroundY < canyonBridge.y - 6,
        `${def.id} bridge deck (${canyonBridge.y}) should clear canyon below (${bridgeGroundY})`,
      );
    }

    // Verify tunnel center roadbed stays open (never blocked by terrain heightmap)
    // AND mountain flanks immediately beside the tunnel rise tall above roadY!
    const tunnelSample = baked.samples.find((s) => s.segmentType === 'tunnel')!;
    const tunnelCenterY = computeTerrainHeight(baked, tunnelSample.x, tunnelSample.z);
    assert.ok(
      tunnelCenterY <= tunnelSample.y + 0.1,
      `${def.id} tunnel center terrain (${tunnelCenterY}) must stay open below road (${tunnelSample.y})`,
    );
    const flankX = tunnelSample.x + tunnelSample.rx * (tunnelSample.width * 0.5 + 15);
    const flankZ = tunnelSample.z + tunnelSample.rz * (tunnelSample.width * 0.5 + 15);
    const flankY = computeTerrainHeight(baked, flankX, flankZ);
    assert.ok(
      flankY > tunnelSample.y + 12,
      `${def.id} tunnel mountain flank (${flankY}) should tower above road (${tunnelSample.y})`,
    );

    // Verify non-circular silhouette variety: tracks must have significant radial variation (not a constant-radius ring)
    const cx = (baked.minX + baked.maxX) * 0.5;
    const cz = (baked.minZ + baked.maxZ) * 0.5;
    const radii = baked.samples.map((s) => Math.hypot(s.x - cx, s.z - cz));
    const minR = Math.min(...radii);
    const maxR = Math.max(...radii);
    assert.ok(
      maxR / Math.max(1, minR) > 1.85,
      `${def.id} should be non-circular (radial ratio ${(maxR / minR).toFixed(2)})`,
    );
  }
});

test('Figure-8 circuits cross over bridges and loop cleanly underneath with flat underpass terrain', () => {
  const figureEightIds = ['alpine_gorge', 'coastal_causeway'] as const;

  for (const id of figureEightIds) {
    const baked = getBakedTrack(id);
    const overpassSamples = baked.samples.filter((s) => s.isOverpass);
    assert.ok(overpassSamples.length > 0, `${id} should tag Figure-8 overpass samples`);

    // Find closest bridge-over-road crossing pair
    let bestPair: { bridgeY: number; roadY: number; x: number; z: number; dist: number } | null = null;
    for (let i = 0; i < baked.samples.length; i++) {
      const a = baked.samples[i];
      if (!a.isOverpass) continue;
      for (let j = 0; j < baked.samples.length; j++) {
        const b = baked.samples[j];
        if (b.segmentType === 'bridge') continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (!bestPair || d < bestPair.dist) {
          bestPair = { bridgeY: a.y, roadY: b.y, x: b.x, z: b.z, dist: d };
        }
      }
    }

    assert.ok(bestPair && bestPair.dist < 8, `${id} should have a direct bridge/road crossing`);
    assert.ok(
      bestPair.bridgeY - bestPair.roadY > 8.5,
      `${id} overpass clearance (${(bestPair.bridgeY - bestPair.roadY).toFixed(2)}m) must clear cars`,
    );

    const underpassTerrainY = computeTerrainHeight(baked, bestPair.x, bestPair.z);
    assert.ok(
      Math.abs(underpassTerrainY - bestPair.roadY) < 1.0,
      `${id} underpass terrain (${underpassTerrainY.toFixed(2)}) must stay level with lower road (${bestPair.roadY.toFixed(2)})`,
    );
  }
});

test('CPU driver completes a full lap over the bridge, through the tunnel, and under the bridge on Alpine Gorge', () => {
  const baked = getBakedTrack('alpine_gorge');
  const car = createInitialCarState(baked, 0);
  let visitedBridgeHigh = false;
  let visitedTunnel = false;
  let visitedUnderpassLow = false;

  for (let step = 0; step < 1800; step++) {
    const input = computeCpuCarInput(car, baked, [], { pace: 0.94, lineBias: 0 });
    stepCarPhysics(car, input, baked, 1 / 30, step * (1000 / 30), true);
    if (car.segmentType === 'bridge' && car.y > 8) {
      visitedBridgeHigh = true;
    }
    if (car.segmentType === 'tunnel') {
      visitedTunnel = true;
    }
    if (visitedBridgeHigh && visitedTunnel && car.segmentType === 'road' && Math.hypot(car.x, car.z) < 25 && car.y < 1.5) {
      visitedUnderpassLow = true;
    }
    if (car.lap >= 2 && visitedUnderpassLow) break;
  }

  assert.equal(visitedBridgeHigh, true, 'Car should cross over the Alpine Gorge bridge');
  assert.equal(visitedTunnel, true, 'Car should drive through the mountain tunnel');
  assert.equal(visitedUnderpassLow, true, 'Car should loop around and pass under the bridge');
  assert.ok(car.lap >= 2, `Car should complete a full lap (ended on lap ${car.lap})`);
});

test('starting grid slots (up to 12 cars) spawn safely on road facing forward', () => {
  for (const def of TRACK_DEFINITIONS) {
    const baked = getBakedTrack(def.id);
    for (let slot = 0; slot < 12; slot++) {
      const spawn = getGridSlotTransform(baked, slot);
      const proj = projectPointOnTrack(spawn.x, spawn.z, baked);
      assert.ok(
        proj.absLateral < proj.halfWidth - 1.5,
        `${def.id} slot ${slot} should be safely inside road width`,
      );
      const fx = Math.sin(spawn.yaw);
      const fz = Math.cos(spawn.yaw);
      const dot = fx * proj.sample.tx + fz * proj.sample.tz;
      assert.ok(dot > 0.95, `${def.id} slot ${slot} should face forward along track`);
    }
  }
});
