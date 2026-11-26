import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_DEFINITIONS } from './tracks';
import { buildSavedReplay, sampleReplayFrame } from './replay';
import { resolveWeatherVisuals } from './weather';

test('buildSavedReplay and sampleReplayFrame interpolate positions and wrap yaw across +/-PI cleanly', () => {
  const replay = buildSavedReplay({
    trackId: 'alpine_gorge',
    weatherMode: 'rain',
    drivers: [
      {
        id: 'local',
        name: 'Player 1',
        color: '#dc2626',
        isCpu: false,
        finishTimeMs: 42100,
        bestLapMs: 13800,
        rank: 1,
      },
      {
        id: 'cpu-1',
        name: 'Apex Bot',
        color: '#2563eb',
        isCpu: true,
        finishTimeMs: 43500,
        bestLapMs: 14100,
        rank: 2,
      },
    ],
    frames: [
      {
        timeMs: 1000,
        cars: [
          {
            id: 'local',
            x: 0,
            y: 0,
            z: 0,
            yaw: 3.04,
            speed: 30,
            steerAngle: 0.1,
            lap: 1,
            progress: 0.1,
          },
          {
            id: 'cpu-1',
            x: -5,
            y: 0,
            z: -10,
            yaw: 0,
            speed: 28,
            steerAngle: 0,
            lap: 1,
            progress: 0.08,
          },
        ],
      },
      {
        timeMs: 2000,
        cars: [
          {
            id: 'local',
            x: 20,
            y: 4,
            z: 40,
            yaw: -3.04, // crosses +/-PI boundary (+0.203 rad short turn)
            speed: 40,
            steerAngle: -0.1,
            lap: 2,
            progress: 1.1,
          },
          {
            id: 'cpu-1',
            x: 15,
            y: 2,
            z: 30,
            yaw: 0.5,
            speed: 34,
            steerAngle: 0.2,
            lap: 1,
            progress: 0.9,
          },
        ],
      },
    ],
  });

  assert.ok(replay, 'Saved replay should build cleanly');
  assert.equal(replay.durationMs, 1000);
  assert.equal(replay.weatherMode, 'rain');
  assert.equal(replay.drivers.length, 2);

  const mid = sampleReplayFrame(replay, 500);
  const localMid = mid.cars.find((c) => c.id === 'local')!;
  const cpuMid = mid.cars.find((c) => c.id === 'cpu-1')!;

  assert.ok(Math.abs(localMid.x - 10) < 0.05);
  assert.ok(Math.abs(localMid.y - 2) < 0.05);
  assert.ok(Math.abs(localMid.z - 20) < 0.05);
  // Midpoint across +3.04 -> -3.04 should be near +/-PI (~3.1415), NOT 0!
  assert.ok(
    Math.abs(Math.abs(localMid.yaw) - Math.PI) < 0.05,
    `Yaw should wrap across PI cleanly, got ${localMid.yaw}`,
  );
  assert.ok(Math.abs(cpuMid.x - 5) < 0.05);

  const clampedEnd = sampleReplayFrame(replay, 5000);
  assert.equal(clampedEnd.timeMs, 1000);
  assert.equal(clampedEnd.cars[0].lap, 2);
});

test('dynamic weather system varies visibility, lighting, rain, road wetness, and grip across tracks and cycles', () => {
  const alpine = TRACK_DEFINITIONS.find((t) => t.id === 'alpine_gorge')!;
  const frost = TRACK_DEFINITIONS.find((t) => t.id === 'frostpeak_pass')!;
  const coastal = TRACK_DEFINITIONS.find((t) => t.id === 'coastal_causeway')!;
  const redrock = TRACK_DEFINITIONS.find((t) => t.id === 'redrock_crossing')!;

  const alpineAuto = resolveWeatherVisuals(alpine.palette, alpine.defaultWeather, 'auto', 0);
  const frostAuto = resolveWeatherVisuals(frost.palette, frost.defaultWeather, 'auto', 0);
  const coastalAuto = resolveWeatherVisuals(coastal.palette, coastal.defaultWeather, 'auto', 0);
  const redrockAuto = resolveWeatherVisuals(redrock.palette, redrock.defaultWeather, 'auto', 0);

  assert.equal(alpineAuto.activeCondition, 'clear');
  assert.equal(frostAuto.activeCondition, 'fog');
  assert.equal(coastalAuto.activeCondition, 'rain');
  assert.equal(redrockAuto.activeCondition, 'sunset');

  // Fog severely reduces visibility (higher fogDensity than clear)
  assert.ok(frostAuto.fogDensity > alpineAuto.fogDensity * 4);
  // Rain activates precipitation, slick wet asphalt (low roughness), and slightly lowers grip
  assert.equal(coastalAuto.rainIntensity, 1);
  assert.ok(coastalAuto.roadRoughness < 0.4);
  assert.ok(coastalAuto.gripMultiplier < 0.95);
  // Sunset lowers sun height near horizon
  assert.ok(redrockAuto.sunPosition[1] < 45);
  assert.equal(redrockAuto.sunsetFactor, 1);

  // Dynamic mode cycles conditions smoothly over race duration
  const dyn0 = resolveWeatherVisuals(alpine.palette, alpine.defaultWeather, 'dynamic', 0);
  const dynMid = resolveWeatherVisuals(alpine.palette, alpine.defaultWeather, 'dynamic', 20000);
  const dynLater = resolveWeatherVisuals(alpine.palette, alpine.defaultWeather, 'dynamic', 40000);
  assert.equal(dyn0.activeCondition, 'clear');
  assert.equal(dynMid.activeCondition, 'sunset');
  assert.equal(dynLater.activeCondition, 'rain');
  assert.ok(dynLater.rainIntensity > 0.9);
});
