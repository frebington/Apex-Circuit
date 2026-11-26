import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  CameraMode,
  CarChassisId,
  GameScreenState,
  HudState,
  PaintFinishId,
  PlayerTelemetry,
  ReplayDriverMeta,
  ReplayFrame,
  RoomPhase,
  SavedRaceReplay,
  TrackId,
  WeatherCondition,
  WeatherMode,
} from '../shared/types';
import { getBakedTrack, getGridSlotTransform } from '../game/tracks';
import {
  computeGear,
  createInitialCarState,
  resetCarToTrack,
  resolveCarCollisions,
  stepCarPhysics,
  type CarInput,
  type CarPhysicsState,
} from '../game/physics';
import {
  buildCpuGridOpponents,
  computeCpuCarInput,
  cpuStateToTelemetry,
  type CpuProfile,
} from '../game/ai';
import { buildSavedReplay, sampleReplayFrame } from '../game/replay';
import { resolveWeatherVisuals } from '../game/weather';
import {
  applyPaintFinishToMaterial,
  buildLowPolyCar,
  type CarVisualRig,
} from '../three/carBuilder';
import { buildTrackWorld, type BuiltWorld } from '../three/worldBuilder';
import type { RaceAudioEngine } from '../three/audio';

export interface TouchInputState {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

interface RaceViewportProps {
  trackId: TrackId;
  weatherMode: WeatherMode;
  screenState: GameScreenState;
  roomPhase: RoomPhase;
  countdownRemainingMs: number;
  raceElapsedMs: number;
  localPlayerId: string | null;
  localName: string;
  localColor: string;
  localChassisId: CarChassisId;
  localPaintFinish: PaintFinishId;
  localSlotIndex: number;
  cpuCount: number;
  cpuDifficulty: number;
  connected: boolean;
  remotePlayers: PlayerTelemetry[];
  cameraMode: CameraMode;
  muted: boolean;
  audio: RaceAudioEngine;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  resetCounter: number;
  raceResetSeq: number;
  replayData: SavedRaceReplay | null;
  replayFocusId: string | null;
  replayTimeMs: number;
  replayPlaying: boolean;
  replaySpeed: number;
  onHudUpdate: (
    hud: HudState,
    localPos: { x: number; z: number; yaw: number; color: string },
  ) => void;
  onOfflineCpusUpdate?: (cpus: PlayerTelemetry[]) => void;
  onSendTelemetry: (payload: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    speed: number;
    steerAngle: number;
    lap: number;
    progress: number;
    bestLapMs: number | null;
    finished: boolean;
    finishTimeMs: number | null;
  }) => void;
  onBestLapRecorded?: (trackId: TrackId, bestLapMs: number) => void;
  onLocalFinish: (finishTimeMs: number | null, bestLapMs: number | null) => void;
  onSaveReplay: (replay: SavedRaceReplay) => void;
  onReplayTimeUpdate: (
    timeMs: number,
    focusedStats: { lap: number; speedKmh: number },
    weatherCondition: WeatherCondition,
    ended: boolean,
  ) => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onWebglStatus?: (ok: boolean) => void;
}

// Pre-allocated scratch vectors (Zero-GC render loop)
const _camDesired = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

export function RaceViewport(props: RaceViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest React props in ref so WebGL renderer mounts ONCE and never resets
  const propsRef = useRef(props);
  propsRef.current = props;

  // Track & simulation mutable state refs
  const simRef = useRef<{
    car: CarPhysicsState;
    offlineCpus: Array<{ profile: CpuProfile; slotIndex: number; state: CarPhysicsState }>;
    lastLapBanner: string | null;
    lapBannerTimer: number;
    lastCountdownStep: number;
    prevPhase: RoomPhase;
    prevScreenState: GameScreenState;
    prevResetCounter: number;
    prevRaceResetSeq: number;
    prevTrackId: TrackId;
    prevColor: string;
    prevChassisId: CarChassisId;
    prevPaintFinish: PaintFinishId;
    prevCpuCount: number;
    prevCpuDifficulty: number;
    lastReportedBestLapMs: number | null;
    lastHudPushMs: number;
    lastNetPushMs: number;
    lastBumpAudioMs: number;
    weatherClockMs: number;
    recordedFrames: ReplayFrame[];
    lastRecordAtMs: number;
    replayLocalTimeMs: number;
    lastPushedReplayTimeMs: number;
    lastReplayHudPushMs: number;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL (SwiftShader / llvmpipe / WARP)
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: isSoftwareGl,
      });
    } catch {
      propsRef.current.onWebglStatus?.(false);
      return;
    }

    propsRef.current.onWebglStatus?.(true);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    const canvasEl = renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    container.appendChild(canvasEl);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvasEl.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.2,
      580,
    );

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    let activeTrackId = propsRef.current.trackId;
    let bakedTrack = getBakedTrack(activeTrackId);
    let builtWorld: BuiltWorld = buildTrackWorld(scene, bakedTrack, {
      maxAnisotropy,
      isSoftwareGl,
    });

    let localRig: CarVisualRig = buildLowPolyCar({
      primaryColor: propsRef.current.localColor,
      chassisId: propsRef.current.localChassisId,
      paintFinish: propsRef.current.localPaintFinish,
      castShadow: !isSoftwareGl,
    });
    scene.add(localRig.root);

    const remoteRigs = new Map<
      string,
      {
        rig: CarVisualRig;
        color: string;
        chassisId: CarChassisId;
        paintFinish: PaintFinishId;
        name: string;
        targetX: number;
        targetY: number;
        targetZ: number;
        targetYaw: number;
        steerAngle: number;
        speed: number;
      }
    >();

    const createOfflineCpuCars = (
      track: typeof bakedTrack,
      humanColor: string,
      cpuCount: number,
      cpuDifficulty: number,
    ) => {
      const profiles = buildCpuGridOpponents(
        [{ color: humanColor }],
        cpuCount,
        cpuDifficulty,
      );
      return profiles.map((profile, idx) => ({
        profile,
        slotIndex: idx + 1,
        state: createInitialCarState(track, idx + 1),
      }));
    };

    const initialCar = createInitialCarState(bakedTrack, propsRef.current.localSlotIndex);
    simRef.current = {
      car: initialCar,
      offlineCpus: createOfflineCpuCars(
        bakedTrack,
        propsRef.current.localColor,
        propsRef.current.cpuCount,
        propsRef.current.cpuDifficulty,
      ),
      lastLapBanner: null,
      lapBannerTimer: 0,
      lastCountdownStep: -1,
      prevPhase: propsRef.current.roomPhase,
      prevScreenState: propsRef.current.screenState,
      prevResetCounter: propsRef.current.resetCounter,
      prevRaceResetSeq: propsRef.current.raceResetSeq,
      prevTrackId: activeTrackId,
      prevColor: propsRef.current.localColor,
      prevChassisId: propsRef.current.localChassisId,
      prevPaintFinish: propsRef.current.localPaintFinish,
      prevCpuCount: propsRef.current.cpuCount,
      prevCpuDifficulty: propsRef.current.cpuDifficulty,
      lastReportedBestLapMs: null,
      lastHudPushMs: 0,
      lastNetPushMs: 0,
      lastBumpAudioMs: 0,
      weatherClockMs: 0,
      recordedFrames: [],
      lastRecordAtMs: -1000,
      replayLocalTimeMs: 0,
      lastPushedReplayTimeMs: 0,
      lastReplayHudPushMs: 0,
    };

    // Place camera initially on overview of starting grid
    const grid0 = getGridSlotTransform(bakedTrack, 0);
    camera.position.set(grid0.x - Math.sin(grid0.yaw) * 18, grid0.y + 8, grid0.z - Math.cos(grid0.yaw) * 18);
    camera.lookAt(grid0.x, grid0.y + 1.2, grid0.z);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Unified keyboard input hub
    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTyping) return;

      const code = e.code;
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        if (propsRef.current.screenState === 'playing') {
          e.preventDefault();
        }
      }

      if (!e.repeat) {
        if (code === 'KeyP' || code === 'Escape') {
          if (
            propsRef.current.screenState === 'playing' ||
            propsRef.current.screenState === 'paused'
          ) {
            propsRef.current.onTogglePause();
          }
        } else if (code === 'KeyC' && propsRef.current.screenState === 'playing') {
          propsRef.current.onCycleCamera();
        } else if (code === 'KeyM') {
          propsRef.current.onToggleMute();
        } else if (code === 'KeyR' && propsRef.current.screenState === 'playing') {
          if (simRef.current && propsRef.current.roomPhase === 'racing') {
            resetCarToTrack(simRef.current.car, bakedTrack);
          }
        }
      }
      keysDown.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
    };

    const clearKeys = () => {
      keysDown.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    let lastTimeMs = performance.now();
    let titleOrbitAngle = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function readCarInput(): CarInput {
      const touch = propsRef.current.touchInputRef.current;
      const up = keysDown.has('KeyW') || keysDown.has('ArrowUp');
      const down = keysDown.has('KeyS') || keysDown.has('ArrowDown');
      const left = keysDown.has('KeyA') || keysDown.has('ArrowLeft');
      const right = keysDown.has('KeyD') || keysDown.has('ArrowRight');
      const hb = keysDown.has('Space');

      const steerKey = (left ? 1 : 0) - (right ? 1 : 0);
      return {
        throttle: Math.max(up ? 1 : 0, touch.throttle),
        brake: Math.max(down ? 1 : 0, touch.brake),
        steer: steerKey !== 0 ? steerKey : touch.steer,
        handbrake: hb || touch.handbrake,
      };
    }

    function tick(nowMs: number) {
      if (disposed) return;
      const p = propsRef.current;
      const sim = simRef.current!;
      const rawDt = (nowMs - lastTimeMs) / 1000;
      lastTimeMs = nowMs;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      // 1. Hot-swap Track World when user selects a different map
      if (p.trackId !== sim.prevTrackId) {
        sim.prevTrackId = p.trackId;
        activeTrackId = p.trackId;
        bakedTrack = getBakedTrack(activeTrackId);
        builtWorld.dispose();
        builtWorld = buildTrackWorld(scene, bakedTrack, {
          maxAnisotropy,
          isSoftwareGl,
        });
        sim.car = createInitialCarState(bakedTrack, p.localSlotIndex);
        sim.offlineCpus = createOfflineCpuCars(
          bakedTrack,
          p.localColor,
          p.cpuCount,
          p.cpuDifficulty,
        );
        sim.prevCpuCount = p.cpuCount;
        sim.prevCpuDifficulty = p.cpuDifficulty;
        sim.lastReportedBestLapMs = null;
        sim.lastLapBanner = null;
        sim.lapBannerTimer = 0;
      }

      // 2. Update Local Car Chassis Model, Color & Paint Finish
      if (p.localChassisId !== sim.prevChassisId) {
        scene.remove(localRig.root);
        localRig.dispose();
        localRig = buildLowPolyCar({
          primaryColor: p.localColor,
          chassisId: p.localChassisId,
          paintFinish: p.localPaintFinish,
          castShadow: !isSoftwareGl,
        });
        scene.add(localRig.root);
        sim.prevChassisId = p.localChassisId;
        sim.prevColor = p.localColor;
        sim.prevPaintFinish = p.localPaintFinish;
      } else if (
        p.localColor !== sim.prevColor ||
        p.localPaintFinish !== sim.prevPaintFinish
      ) {
        sim.prevColor = p.localColor;
        sim.prevPaintFinish = p.localPaintFinish;
        applyPaintFinishToMaterial(
          localRig.paintMat,
          p.localColor,
          p.localPaintFinish,
        );
      }

      // Live-sync offline CPU pack size/difficulty in Lobby
      if (
        p.screenState === 'title' &&
        (p.cpuCount !== sim.prevCpuCount || p.cpuDifficulty !== sim.prevCpuDifficulty)
      ) {
        sim.prevCpuCount = p.cpuCount;
        sim.prevCpuDifficulty = p.cpuDifficulty;
        sim.offlineCpus = createOfflineCpuCars(
          bakedTrack,
          p.localColor,
          p.cpuCount,
          p.cpuDifficulty,
        );
      }

      // 3. Reset Car to Grid & Clear Telemetry Buffer when a new race/countdown starts
      if (
        p.raceResetSeq !== sim.prevRaceResetSeq ||
        (p.roomPhase === 'countdown' && sim.prevPhase !== 'countdown')
      ) {
        sim.prevRaceResetSeq = p.raceResetSeq;
        sim.prevCpuCount = p.cpuCount;
        sim.prevCpuDifficulty = p.cpuDifficulty;
        sim.car = createInitialCarState(bakedTrack, p.localSlotIndex);
        sim.offlineCpus = createOfflineCpuCars(
          bakedTrack,
          p.localColor,
          p.cpuCount,
          p.cpuDifficulty,
        );
        sim.lastReportedBestLapMs = null;
        sim.lastLapBanner = null;
        sim.lapBannerTimer = 0;
        sim.lastCountdownStep = -1;
        sim.recordedFrames = [];
        sim.lastRecordAtMs = -1000;
      }
      sim.prevPhase = p.roomPhase;

      // Manual Car Track Reset button [R]
      if (p.resetCounter !== sim.prevResetCounter) {
        sim.prevResetCounter = p.resetCounter;
        if (p.roomPhase === 'racing') {
          resetCarToTrack(sim.car, bakedTrack);
        }
      }

      // Compute active weather visuals (drives sky, fog, sun, rain particles, wet road & tire grip)
      if (p.screenState === 'title') {
        sim.weatherClockMs += dt * 1000;
      }
      const isReplayMode = p.screenState === 'replay' && Boolean(p.replayData);
      const activeWeatherMode = isReplayMode && p.replayData
        ? p.replayData.weatherMode
        : p.weatherMode;
      const weatherClockForEval = isReplayMode
        ? sim.replayLocalTimeMs
        : p.screenState === 'title'
          ? sim.weatherClockMs
          : p.raceElapsedMs;
      const weather = resolveWeatherVisuals(
        bakedTrack.definition.palette,
        bakedTrack.definition.defaultWeather,
        activeWeatherMode,
        weatherClockForEval,
      );

      // Replay Playback Branch vs Live Race Simulation Branch
      if (isReplayMode && p.replayData) {
        const replay = p.replayData;
        const justEnteredReplay = sim.prevScreenState !== 'replay';
        if (justEnteredReplay) {
          sim.replayLocalTimeMs = p.replayTimeMs;
          sim.lastPushedReplayTimeMs = p.replayTimeMs;
        } else if (Math.abs(p.replayTimeMs - sim.lastPushedReplayTimeMs) > 90) {
          // User scrubbed timeline slider
          sim.replayLocalTimeMs = p.replayTimeMs;
          sim.lastPushedReplayTimeMs = p.replayTimeMs;
        } else if (p.replayPlaying) {
          sim.replayLocalTimeMs = Math.min(
            replay.durationMs,
            sim.replayLocalTimeMs + dt * 1000 * p.replaySpeed,
          );
        }

        const sampled = sampleReplayFrame(replay, sim.replayLocalTimeMs);
        const focusId = p.replayFocusId ?? replay.drivers[0]?.id ?? '';
        const focusCar =
          sampled.cars.find((c) => c.id === focusId) ?? sampled.cars[0];

        localRig.root.visible = false;

        // Sync all replay cars via remoteRigs
        const seenReplayIds = new Set<string>();
        const driverMetaById = new Map(replay.drivers.map((d) => [d.id, d]));

        for (const rc of sampled.cars) {
          seenReplayIds.add(rc.id);
          const meta = driverMetaById.get(rc.id);
          const color = meta?.color ?? '#f59e0b';
          const chassisId: CarChassisId = meta?.chassisId ?? 'gt_coupe';
          const paintFinish: PaintFinishId = meta?.paintFinish ?? 'gloss';
          const name = meta?.name ?? 'Driver';
          let entry = remoteRigs.get(rc.id);
          if (
            !entry ||
            entry.color !== color ||
            entry.chassisId !== chassisId ||
            entry.paintFinish !== paintFinish ||
            entry.name !== name
          ) {
            if (entry) {
              scene.remove(entry.rig.root);
              entry.rig.dispose();
            }
            const rig = buildLowPolyCar({
              primaryColor: color,
              chassisId,
              paintFinish,
              driverName: name,
              castShadow: !isSoftwareGl,
            });
            scene.add(rig.root);
            entry = {
              rig,
              color,
              chassisId,
              paintFinish,
              name,
              targetX: rc.x,
              targetY: rc.y,
              targetZ: rc.z,
              targetYaw: rc.yaw,
              steerAngle: rc.steerAngle,
              speed: rc.speed,
            };
            remoteRigs.set(rc.id, entry);
          }

          const prevSpeed = entry.speed;
          entry.speed = rc.speed;
          entry.rig.root.position.set(rc.x, rc.y, rc.z);
          entry.rig.root.rotation.y = rc.yaw;
          entry.rig.frontLeftPivot.rotation.y = rc.steerAngle;
          entry.rig.frontRightPivot.rotation.y = rc.steerAngle;
          for (const w of entry.rig.wheelMeshes) {
            w.rotation.x += rc.speed * dt * 2.2 * (p.replayPlaying ? p.replaySpeed : 0);
          }
          entry.rig.headlightMat.emissiveIntensity = weather.headlightIntensity;
          entry.rig.brakeLightMat.emissiveIntensity =
            rc.speed < prevSpeed - 0.15 ? 2.2 : 0.7;
          if (entry.rig.nameSprite) {
            const distSq = camera.position.distanceToSquared(entry.rig.root.position);
            entry.rig.nameSprite.visible =
              rc.id !== focusId && distSq > 64 && distSq < 22500;
          }
        }

        for (const [id, entry] of remoteRigs.entries()) {
          if (!seenReplayIds.has(id)) {
            scene.remove(entry.rig.root);
            entry.rig.dispose();
            remoteRigs.delete(id);
          }
        }

        // Camera following focused replay car
        if (focusCar) {
          const fx = Math.sin(focusCar.yaw);
          const fz = Math.cos(focusCar.yaw);
          const speedNorm = Math.min(1, Math.abs(focusCar.speed) / 46);

          if (p.cameraMode === 'hood') {
            _camDesired.set(
              focusCar.x + fx * 0.6,
              focusCar.y + 1.55,
              focusCar.z + fz * 0.6,
            );
            _camTarget.set(
              focusCar.x + fx * 22,
              focusCar.y + 1.2,
              focusCar.z + fz * 22,
            );
            camera.position.lerp(_camDesired, 1 - Math.exp(-22 * dt));
            camera.lookAt(_camTarget);
          } else if (p.cameraMode === 'overview') {
            _camDesired.set(
              focusCar.x - fx * 15,
              focusCar.y + 13.5,
              focusCar.z - fz * 15,
            );
            _camTarget.set(
              focusCar.x + fx * 6,
              focusCar.y + 1.0,
              focusCar.z + fz * 6,
            );
            camera.position.lerp(_camDesired, 1 - Math.exp(-8 * dt));
            camera.lookAt(_camTarget);
          } else {
            const chaseBack = 8.8 + speedNorm * 1.4;
            const chaseHeight = 3.8 + speedNorm * 0.35;
            _camDesired.set(
              focusCar.x - fx * chaseBack,
              focusCar.y + chaseHeight,
              focusCar.z - fz * chaseBack,
            );
            _camTarget.set(
              focusCar.x + fx * 8,
              focusCar.y + 1.45,
              focusCar.z + fz * 8,
            );
            camera.position.lerp(_camDesired, 1 - Math.exp(-9.5 * dt));
            camera.lookAt(_camTarget);
          }

          if (justEnteredReplay) {
            camera.position.copy(_camDesired);
            camera.lookAt(_camTarget);
          }
          const targetFov = 60 + speedNorm * 11;
          if (Math.abs(camera.fov - targetFov) > 0.15) {
            camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * dt));
            camera.updateProjectionMatrix();
          }

          p.audio.updateEngine(
            p.replayPlaying,
            focusCar.speed,
            focusCar.speed > 4 ? 0.5 : 0,
            0,
          );
        }

        builtWorld.applyWeather(weather, dt, camera.position);
        sim.prevScreenState = p.screenState;

        const reachedEnd = sim.replayLocalTimeMs >= replay.durationMs;
        if (nowMs - sim.lastReplayHudPushMs >= 65 || justEnteredReplay || reachedEnd) {
          sim.lastReplayHudPushMs = nowMs;
          sim.lastPushedReplayTimeMs = sim.replayLocalTimeMs;
          p.onReplayTimeUpdate(
            sim.replayLocalTimeMs,
            {
              lap: focusCar?.lap ?? 1,
              speedKmh: Math.round(Math.abs(focusCar?.speed ?? 0) * 3.6),
            },
            weather.activeCondition,
            reachedEnd && p.replayPlaying,
          );
        }

        renderer.render(scene, camera);
        if (isSoftwareGl) {
          afterDraw(() => {
            if (!disposed) frameId = requestAnimationFrame(tick);
          });
        } else {
          frameId = requestAnimationFrame(tick);
        }
        return;
      }

      localRig.root.visible = true;
      localRig.headlightMat.emissiveIntensity = weather.headlightIntensity;

      // Step offline CPU cars when running disconnected or in standalone portable mode
      const offlineCpuTelemetry: PlayerTelemetry[] = !p.connected
        ? sim.offlineCpus.map((cpu) => {
            if (p.screenState === 'playing' && p.roomPhase === 'racing' && !cpu.state.finished) {
              const others = [
                { x: sim.car.x, y: sim.car.y, z: sim.car.z },
                ...sim.offlineCpus
                  .filter((o) => o.profile.id !== cpu.profile.id)
                  .map((o) => ({ x: o.state.x, y: o.state.y, z: o.state.z })),
              ];
              const cpuInput = computeCpuCarInput(cpu.state, bakedTrack, others, cpu.profile);
              stepCarPhysics(
                cpu.state,
                cpuInput,
                bakedTrack,
                dt,
                p.raceElapsedMs,
                true,
                weather.gripMultiplier,
                cpu.profile.pace,
              );
              resolveCarCollisions(cpu.state, others);
            }
            return cpuStateToTelemetry(cpu.profile, cpu.slotIndex, cpu.state);
          })
        : [];

      const activeRemotes = p.connected ? p.remotePlayers : offlineCpuTelemetry;

      // 4. Sync Remote Multiplayer & CPU Cars
      const seenRemoteIds = new Set<string>();
      for (const rp of activeRemotes) {
        if (rp.id === p.localPlayerId) continue;
        seenRemoteIds.add(rp.id);
        const rpChassis: CarChassisId = rp.chassisId ?? 'gt_coupe';
        const rpFinish: PaintFinishId = rp.paintFinish ?? 'gloss';
        let entry = remoteRigs.get(rp.id);
        if (
          !entry ||
          entry.color !== rp.color ||
          entry.chassisId !== rpChassis ||
          entry.paintFinish !== rpFinish ||
          entry.name !== rp.name
        ) {
          if (entry) {
            scene.remove(entry.rig.root);
            entry.rig.dispose();
          }
          const rig = buildLowPolyCar({
            primaryColor: rp.color,
            chassisId: rpChassis,
            paintFinish: rpFinish,
            driverName: rp.name,
            castShadow: !isSoftwareGl,
          });
          rig.root.position.set(rp.x, rp.y, rp.z);
          rig.root.rotation.y = rp.yaw;
          scene.add(rig.root);
          entry = {
            rig,
            color: rp.color,
            chassisId: rpChassis,
            paintFinish: rpFinish,
            name: rp.name,
            targetX: rp.x,
            targetY: rp.y,
            targetZ: rp.z,
            targetYaw: rp.yaw,
            steerAngle: rp.steerAngle,
            speed: rp.speed,
          };
          remoteRigs.set(rp.id, entry);
        } else {
          entry.targetX = rp.x;
          entry.targetY = rp.y;
          entry.targetZ = rp.z;
          entry.targetYaw = rp.yaw;
          entry.steerAngle = rp.steerAngle;
          entry.speed = rp.speed;
        }
      }

      for (const [id, entry] of remoteRigs.entries()) {
        if (!seenRemoteIds.has(id)) {
          scene.remove(entry.rig.root);
          entry.rig.dispose();
          remoteRigs.delete(id);
        } else {
          const damp = 1 - Math.exp(-14 * dt);
          entry.rig.root.position.x += (entry.targetX - entry.rig.root.position.x) * damp;
          entry.rig.root.position.y += (entry.targetY - entry.rig.root.position.y) * damp;
          entry.rig.root.position.z += (entry.targetZ - entry.rig.root.position.z) * damp;
          // Shortest-angle yaw interpolation
          let dyaw = entry.targetYaw - entry.rig.root.rotation.y;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          entry.rig.root.rotation.y += dyaw * damp;
          entry.rig.frontLeftPivot.rotation.y = entry.steerAngle;
          entry.rig.frontRightPivot.rotation.y = entry.steerAngle;
          entry.rig.headlightMat.emissiveIntensity = weather.headlightIntensity;
          for (const w of entry.rig.wheelMeshes) {
            w.rotation.x += entry.speed * dt * 2.2;
          }
          if (entry.rig.nameSprite) {
            const distSq = camera.position.distanceToSquared(entry.rig.root.position);
            entry.rig.nameSprite.visible = distSq > 64 && distSq < 22500;
          }
        }
      }

      // 5. Gantry Signal Lights & Countdown Audio
      let countdownText: string | null = null;
      if (p.screenState === 'playing' && p.roomPhase === 'countdown') {
        const secs = Math.ceil(p.countdownRemainingMs / 1000);
        countdownText = secs > 0 ? String(secs) : 'GO!';
        if (secs !== sim.lastCountdownStep && secs >= 1 && secs <= 3) {
          sim.lastCountdownStep = secs;
          p.audio.playCountdownBeep(false);
        }
        builtWorld.gantryLights.redMat.emissiveIntensity = secs >= 2 ? 2.4 : 0.2;
        builtWorld.gantryLights.amberMat.emissiveIntensity = secs === 1 ? 2.4 : 0.2;
        builtWorld.gantryLights.greenMat.emissiveIntensity = 0.15;
      } else if (p.screenState === 'playing' && p.roomPhase === 'racing') {
        if (sim.lastCountdownStep !== 0 && p.raceElapsedMs < 1300) {
          sim.lastCountdownStep = 0;
          p.audio.playCountdownBeep(true);
          sim.lastLapBanner = 'GO!';
          sim.lapBannerTimer = 1.0;
        }
        builtWorld.gantryLights.redMat.emissiveIntensity = 0.15;
        builtWorld.gantryLights.amberMat.emissiveIntensity = 0.15;
        builtWorld.gantryLights.greenMat.emissiveIntensity = 2.4;
      } else {
        builtWorld.gantryLights.redMat.emissiveIntensity = 0.3;
        builtWorld.gantryLights.amberMat.emissiveIntensity = 0.3;
        builtWorld.gantryLights.greenMat.emissiveIntensity = 0.3;
      }

      // 6. Local Car Physics & Collisions
      const input = readCarInput();
      const isPlayingActive = p.screenState === 'playing';
      const canDrive = isPlayingActive && p.roomPhase === 'racing' && !sim.car.finished;

      if (p.screenState === 'playing') {
        const wasFinished = sim.car.finished;
        const stepRes = stepCarPhysics(
          sim.car,
          input,
          bakedTrack,
          dt,
          p.raceElapsedMs,
          canDrive,
          weather.gripMultiplier,
        );

        const remotesForCollision = activeRemotes
          .filter((rp) => rp.id !== p.localPlayerId)
          .map((rp) => ({ x: rp.x, y: rp.y, z: rp.z }));
        const bumpedRival = canDrive
          ? resolveCarCollisions(sim.car, remotesForCollision)
          : false;

        if ((stepRes.collidedWall || bumpedRival) && nowMs - sim.lastBumpAudioMs > 280) {
          if (Math.abs(sim.car.speed) > 8) {
            sim.lastBumpAudioMs = nowMs;
            p.audio.playBump();
          }
        }

        // Record telemetry frame at ~15Hz during active race
        if (
          p.roomPhase === 'racing' &&
          (p.raceElapsedMs - sim.lastRecordAtMs >= 66 || (sim.car.finished && !wasFinished))
        ) {
          sim.lastRecordAtMs = p.raceElapsedMs;
          const localId = p.localPlayerId ?? 'local';
          const frameCars = [
            {
              id: localId,
              x: sim.car.x,
              y: sim.car.y,
              z: sim.car.z,
              yaw: sim.car.yaw,
              speed: sim.car.speed,
              steerAngle: sim.car.steerAngle,
              lap: sim.car.lap,
              progress: sim.car.progress,
            },
            ...activeRemotes
              .filter((rp) => rp.id !== localId)
              .map((rp) => ({
                id: rp.id,
                x: rp.x,
                y: rp.y,
                z: rp.z,
                yaw: rp.yaw,
                speed: rp.speed,
                steerAngle: rp.steerAngle,
                lap: rp.lap,
                progress: rp.progress,
              })),
          ];
          sim.recordedFrames.push({
            timeMs: Math.max(0, p.raceElapsedMs),
            cars: frameCars,
          });
        }

        if (stepRes.lapCompleted !== null) {
          if (
            sim.car.bestLapMs !== null &&
            sim.car.bestLapMs >= 5000 &&
            sim.car.bestLapMs !== sim.lastReportedBestLapMs
          ) {
            sim.lastReportedBestLapMs = sim.car.bestLapMs;
            p.onBestLapRecorded?.(activeTrackId, sim.car.bestLapMs);
          }

          const finishedNow = sim.car.finished;
          p.audio.playLapChime(finishedNow);
          if (finishedNow && !wasFinished) {
            sim.lastLapBanner = 'FINISH!';
            sim.lapBannerTimer = 2.5;

            const localId = p.localPlayerId ?? 'local';
            const driverEntries = [
              {
                id: localId,
                name: p.localName || 'Driver',
                color: p.localColor,
                chassisId: p.localChassisId,
                paintFinish: p.localPaintFinish,
                isCpu: false,
                finished: true,
                finishTimeMs: sim.car.finishTimeMs,
                bestLapMs: sim.car.bestLapMs,
                progress: sim.car.progress,
              },
              ...activeRemotes
                .filter((rp) => rp.id !== localId)
                .map((rp) => ({
                  id: rp.id,
                  name: rp.name,
                  color: rp.color,
                  chassisId: rp.chassisId,
                  paintFinish: rp.paintFinish,
                  isCpu: rp.isCpu,
                  finished: rp.finished,
                  finishTimeMs: rp.finishTimeMs,
                  bestLapMs: rp.bestLapMs,
                  progress: rp.progress,
                })),
            ].sort((a, b) => {
              if (a.finished && b.finished) {
                return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
              }
              if (a.finished) return -1;
              if (b.finished) return 1;
              return b.progress - a.progress;
            });

            const driverMetas: ReplayDriverMeta[] = driverEntries.map((d, idx) => ({
              id: d.id,
              name: d.name,
              color: d.color,
              chassisId: d.chassisId,
              paintFinish: d.paintFinish,
              isCpu: d.isCpu,
              finishTimeMs: d.finishTimeMs,
              bestLapMs: d.bestLapMs,
              rank: idx + 1,
            }));

            const savedReplay = buildSavedReplay({
              trackId: activeTrackId,
              weatherMode: p.weatherMode,
              drivers: driverMetas,
              frames: sim.recordedFrames,
            });
            if (savedReplay) {
              p.onSaveReplay(savedReplay);
            }
            p.onLocalFinish(sim.car.finishTimeMs, sim.car.bestLapMs);
          } else if (sim.car.lap === bakedTrack.definition.laps) {
            sim.lastLapBanner = 'FINAL LAP!';
            sim.lapBannerTimer = 2.0;
          } else {
            sim.lastLapBanner = `LAP ${sim.car.lap}`;
            sim.lapBannerTimer = 1.8;
          }
        }

        if (sim.lapBannerTimer > 0) {
          sim.lapBannerTimer = Math.max(0, sim.lapBannerTimer - dt);
          if (sim.lapBannerTimer === 0) sim.lastLapBanner = null;
        }

        // Update Audio Engine
        const driftSlip =
          canDrive && Math.abs(sim.car.speed) > 12 && (input.handbrake || Math.abs(input.steer) > 0.7)
            ? Math.min(1, Math.abs(sim.car.speed) / 42) * (input.handbrake ? 0.9 : 0.35)
            : 0;
        p.audio.updateEngine(
          p.screenState === 'playing',
          sim.car.speed,
          canDrive ? input.throttle : 0,
          driftSlip,
        );
      } else {
        p.audio.updateEngine(false, 0, 0, 0);
      }

      // 7. Apply Local Car Visual Transform
      localRig.root.position.set(sim.car.x, sim.car.y, sim.car.z);
      localRig.root.rotation.y = sim.car.yaw;
      localRig.bodyGroup.rotation.x = sim.car.pitch;
      localRig.bodyGroup.rotation.z = sim.car.roll;
      localRig.frontLeftPivot.rotation.y = sim.car.steerAngle;
      localRig.frontRightPivot.rotation.y = sim.car.steerAngle;
      for (const w of localRig.wheelMeshes) {
        w.rotation.x = sim.car.wheelSpin;
      }
      localRig.brakeLightMat.emissiveIntensity =
        input.brake > 0 || input.handbrake ? 2.4 : 0.65;

      // 8. Camera Choreography
      if (p.screenState === 'title') {
        titleOrbitAngle += dt * 0.24;
        const radius = 10.5;
        const camX = sim.car.x + Math.cos(titleOrbitAngle) * radius;
        const camZ = sim.car.z + Math.sin(titleOrbitAngle) * radius;
        const toCarX = sim.car.x - camX;
        const toCarZ = sim.car.z - camZ;
        const len = Math.hypot(toCarX, toCarZ) || 1;
        // Camera right vector in XZ is (-toCarZ/len, toCarX/len); shift target left so car sits in open right space
        const leftOffsetX = (toCarZ / len) * 2.2;
        const leftOffsetZ = (-toCarX / len) * 2.2;
        camera.position.set(camX, sim.car.y + 3.6, camZ);
        camera.lookAt(
          sim.car.x + leftOffsetX,
          sim.car.y + 0.85,
          sim.car.z + leftOffsetZ,
        );
        if (camera.fov !== 52) {
          camera.fov = 52;
          camera.updateProjectionMatrix();
        }
      } else {
        const fx = Math.sin(sim.car.yaw);
        const fz = Math.cos(sim.car.yaw);
        const speedNorm = Math.min(1, Math.abs(sim.car.speed) / 46);

        if (p.cameraMode === 'hood') {
          _camDesired.set(
            sim.car.x + fx * 0.6,
            sim.car.y + 1.55,
            sim.car.z + fz * 0.6,
          );
          _camTarget.set(
            sim.car.x + fx * 22,
            sim.car.y + 1.2,
            sim.car.z + fz * 22,
          );
          camera.position.lerp(_camDesired, 1 - Math.exp(-22 * dt));
          camera.lookAt(_camTarget);
        } else if (p.cameraMode === 'overview') {
          _camDesired.set(
            sim.car.x - fx * 15,
            sim.car.y + 13.5,
            sim.car.z - fz * 15,
          );
          _camTarget.set(
            sim.car.x + fx * 6,
            sim.car.y + 1.0,
            sim.car.z + fz * 6,
          );
          camera.position.lerp(_camDesired, 1 - Math.exp(-8 * dt));
          camera.lookAt(_camTarget);
        } else {
          // Classic third-person chase cam with subtle speed FOV widening & tunnel clearance pull-in
          const inTunnel = sim.car.segmentType === 'tunnel';
          const chaseBack = inTunnel ? 7.6 : 8.8 + speedNorm * 1.4;
          const chaseHeight = inTunnel ? 3.05 : 3.8 + speedNorm * 0.35;
          _camDesired.set(
            sim.car.x - fx * chaseBack,
            sim.car.y + chaseHeight,
            sim.car.z - fz * chaseBack,
          );
          _camTarget.set(
            sim.car.x + fx * 8,
            sim.car.y + 1.45,
            sim.car.z + fz * 8,
          );
          camera.position.lerp(_camDesired, 1 - Math.exp(-9.5 * dt));
          camera.lookAt(_camTarget);
        }

        const targetFov = 60 + speedNorm * 11;
        const justEnteredPlaying =
          sim.prevScreenState === 'title' && p.screenState === 'playing';
        if (justEnteredPlaying) {
          camera.position.copy(_camDesired);
          camera.lookAt(_camTarget);
          camera.fov = targetFov;
          camera.updateProjectionMatrix();
        } else if (Math.abs(camera.fov - targetFov) > 0.15) {
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * dt));
          camera.updateProjectionMatrix();
        }
      }
      sim.prevScreenState = p.screenState;

      // 9. Send 20Hz Network Telemetry while racing
      if (
        p.screenState === 'playing' &&
        (p.roomPhase === 'racing' || p.roomPhase === 'countdown') &&
        nowMs - sim.lastNetPushMs >= 50
      ) {
        sim.lastNetPushMs = nowMs;
        p.onSendTelemetry({
          x: sim.car.x,
          y: sim.car.y,
          z: sim.car.z,
          yaw: sim.car.yaw,
          speed: sim.car.speed,
          steerAngle: sim.car.steerAngle,
          lap: sim.car.lap,
          progress: sim.car.progress,
          bestLapMs: sim.car.bestLapMs,
          finished: sim.car.finished,
          finishTimeMs: sim.car.finishTimeMs,
        });
      }

      // 10. Throttled React HUD Sync (~12Hz)
      if (p.screenState === 'playing' && nowMs - sim.lastHudPushMs >= 80) {
        sim.lastHudPushMs = nowMs;
        const allStandings = [
          {
            id: p.localPlayerId ?? 'local',
            progress: sim.car.progress,
            finished: sim.car.finished,
            finishTimeMs: sim.car.finishTimeMs,
          },
          ...activeRemotes
            .filter((rp) => rp.id !== p.localPlayerId)
            .map((rp) => ({
              id: rp.id,
              progress: rp.progress,
              finished: rp.finished,
              finishTimeMs: rp.finishTimeMs,
            })),
        ].sort((a, b) => {
          if (a.finished && b.finished) {
            return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
          }
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.progress - a.progress;
        });
        const pos = Math.max(
          1,
          allStandings.findIndex((r) => r.id === (p.localPlayerId ?? 'local')) + 1,
        );

        if (!p.connected) {
          p.onOfflineCpusUpdate?.(offlineCpuTelemetry);
        }

        p.onHudUpdate(
          {
            speedKmh: Math.round(Math.abs(sim.car.speed) * 3.6),
            gear: computeGear(sim.car.speed),
            throttle: input.throttle,
            brake: input.brake,
            lap: sim.car.lap,
            totalLaps: bakedTrack.definition.laps,
            position: pos,
            totalRacers: allStandings.length,
            currentLapMs:
              p.roomPhase === 'racing'
                ? Math.max(0, p.raceElapsedMs - sim.car.lapStartMs)
                : 0,
            bestLapMs: sim.car.bestLapMs,
            segmentType: sim.car.segmentType,
            offRoad: sim.car.offRoad,
            countdownText,
            lapBanner: sim.lastLapBanner,
            wrongWay: sim.car.wrongWay,
            weatherCondition: weather.activeCondition,
          },
          {
            x: sim.car.x,
            z: sim.car.z,
            yaw: sim.car.yaw,
            color: p.localColor,
          },
        );
      }

      builtWorld.applyWeather(weather, dt, camera.position);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => {
          if (!disposed) frameId = requestAnimationFrame(tick);
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);

      builtWorld.dispose();
      localRig.dispose();
      for (const entry of remoteRigs.values()) {
        entry.rig.dispose();
      }
      remoteRigs.clear();
      envTex.dispose();
      renderer.dispose();
      if (canvasEl.parentNode === container) {
        container.removeChild(canvasEl);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="race-canvas-container"
      className="fixed inset-0 w-full h-full bg-slate-950"
    />
  );
}
