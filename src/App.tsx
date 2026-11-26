import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CAR_LIVERIES,
  type CameraMode,
  type CarChassisId,
  type DailyChallengeProgress,
  type GameScreenState,
  type HudState,
  type LeaderboardRecord,
  type PaintFinishId,
  type PlayerTelemetry,
  type RoomPhase,
  type RoomSnapshot,
  type SavedRaceReplay,
  type TrackId,
  type WeatherCondition,
  type WeatherMode,
} from './shared/types';
import { getBakedTrack, getTrackDefinition } from './game/tracks';
import {
  DEFAULT_CPU_COUNT,
  DEFAULT_CPU_DIFFICULTY,
  clampCpuCount,
  clampCpuDifficulty,
} from './game/ai';
import { loadLastRaceReplay, saveLastRaceReplay } from './game/replay';
import {
  evaluateDailyChallengeCompletion,
  getDailyChallengeForDate,
  getDisplayStreak,
  getTodayDateKey,
  loadLocalDailyProgress,
  mergeDailyProgress,
  saveLocalDailyProgress,
} from './game/dailyChallenge';
import { MultiplayerClient } from './net/multiplayerClient';
import { RaceAudioEngine } from './three/audio';
import { RaceViewport, type TouchInputState } from './components/RaceViewport';
import { TitleLobby } from './components/TitleLobby';
import { RaceHud } from './components/RaceHud';
import { RaceModals, type DailyRaceOutcome } from './components/RaceModals';
import { ReplayOverlay } from './components/ReplayOverlay';
import { GlobalLeaderboard } from './components/GlobalLeaderboard';
import { DailyChallengeModal } from './components/DailyChallengeModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  groupLeaderboardByTrack,
  isFirebaseSupportedRuntime,
  signInWithGoogle,
  signOutFromLeaderboard,
  subscribeAuthUser,
  subscribeDailyChallengeProgress,
  subscribeLeaderboardRecords,
  submitBestLapToLeaderboard,
  syncDailyChallengeToFirestore,
} from './firebase/leaderboard';
import { formatRaceTime } from './utils/formatTime';

const INITIAL_HUD: HudState = {
  speedKmh: 0,
  gear: 1,
  throttle: 0,
  brake: 0,
  lap: 1,
  totalLaps: 3,
  position: 1,
  totalRacers: 1,
  currentLapMs: 0,
  bestLapMs: null,
  segmentType: 'road',
  offRoad: false,
  countdownText: null,
  lapBanner: null,
  wrongWay: false,
  weatherCondition: 'clear',
};

export default function App() {
  const autostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const initialRoom = useMemo(() => {
    if (typeof window === 'undefined') return 'OPEN-01';
    const raw = new URLSearchParams(window.location.search).get('room') || '';
    const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
    return cleaned || 'OPEN-01';
  }, []);

  const [screenState, setScreenState] = useState<GameScreenState>(
    autostart ? 'playing' : 'title',
  );
  const [selectedTrackId, setSelectedTrackId] = useState<TrackId>('alpine_gorge');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('auto');
  const [driverName, setDriverName] = useState<string>(() => {
    const suffix = Math.floor(10 + Math.random() * 89);
    return `Racer ${suffix}`;
  });
  const [driverColor, setDriverColor] = useState<string>(CAR_LIVERIES[0].primary);
  const [driverChassis, setDriverChassis] = useState<CarChassisId>('gt_coupe');
  const [driverFinish, setDriverFinish] = useState<PaintFinishId>('gloss');
  const [cpuCount, setCpuCount] = useState<number>(DEFAULT_CPU_COUNT);
  const [cpuDifficulty, setCpuDifficulty] = useState<number>(DEFAULT_CPU_DIFFICULTY);

  const [roomId, setRoomId] = useState<string>(initialRoom);
  const [connected, setConnected] = useState<boolean>(false);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);

  const [roomPhase, setRoomPhase] = useState<RoomPhase>(
    autostart ? 'racing' : 'lobby',
  );
  const [players, setPlayers] = useState<PlayerTelemetry[]>([]);
  const [offlineCpus, setOfflineCpus] = useState<PlayerTelemetry[]>([]);
  const [countdownRemainingMs, setCountdownRemainingMs] = useState<number>(0);
  const [raceElapsedMs, setRaceElapsedMs] = useState<number>(0);

  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [muted, setMuted] = useState<boolean>(false);
  const [webglOk, setWebglOk] = useState<boolean>(true);
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [raceResetSeq, setRaceResetSeq] = useState<number>(0);

  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [localPos, setLocalPos] = useState<{
    x: number;
    z: number;
    yaw: number;
    color: string;
  }>({ x: 0, z: 75, yaw: Math.PI / 2, color: CAR_LIVERIES[0].primary });

  const [finishSnapshot, setFinishSnapshot] = useState<{
    finishTimeMs: number | null;
    bestLapMs: number | null;
  }>({ finishTimeMs: null, bestLapMs: null });

  const [lastReplay, setLastReplay] = useState<SavedRaceReplay | null>(() =>
    loadLastRaceReplay(),
  );
  const [replayFocusId, setReplayFocusId] = useState<string | null>(null);
  const [replayTimeMs, setReplayTimeMs] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState<boolean>(true);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayStats, setReplayStats] = useState<{ lap: number; speedKmh: number }>({
    lap: 1,
    speedKmh: 0,
  });
  const [replayWeatherCond, setReplayWeatherCond] = useState<WeatherCondition>('clear');
  const [replayReturnTo, setReplayReturnTo] = useState<'title' | 'gameover'>('gameover');
  const preReplayTrackRef = useRef<TrackId>('alpine_gorge');

  // Global Firestore Leaderboard State
  const [leaderboardOpen, setLeaderboardOpen] = useState<boolean>(false);
  const [leaderboardRecords, setLeaderboardRecords] = useState<LeaderboardRecord[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(
    isFirebaseSupportedRuntime(),
  );
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [pendingBestLaps, setPendingBestLaps] = useState<Partial<Record<TrackId, number>>>({});
  const [submittingTrack, setSubmittingTrack] = useState<TrackId | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
  const [leaderboardStatusText, setLeaderboardStatusText] = useState<string | null>(null);

  // Daily Challenge & Firestore Streak State
  const [todayDateKey, setTodayDateKey] = useState<string>(() => getTodayDateKey());
  const dailyChallenge = useMemo(
    () => getDailyChallengeForDate(todayDateKey),
    [todayDateKey],
  );
  const [dailyModalOpen, setDailyModalOpen] = useState<boolean>(false);
  const [localDailyProgress, setLocalDailyProgress] = useState<DailyChallengeProgress | null>(
    () => loadLocalDailyProgress(),
  );
  const [remoteDailyProgress, setRemoteDailyProgress] = useState<DailyChallengeProgress | null>(
    null,
  );
  const [dailySyncError, setDailySyncError] = useState<string | null>(null);
  const [lastDailyFinishMs, setLastDailyFinishMs] = useState<number | null>(null);
  const [dailyOutcome, setDailyOutcome] = useState<DailyRaceOutcome | null>(null);

  const dailyProgress = useMemo(
    () => mergeDailyProgress(localDailyProgress, remoteDailyProgress),
    [localDailyProgress, remoteDailyProgress],
  );

  const audioRef = useRef<RaceAudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new RaceAudioEngine();
  }

  const touchInputRef = useRef<TouchInputState>({
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
  });

  const netRef = useRef<MultiplayerClient | null>(null);
  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;

  const roomPhaseRef = useRef(roomPhase);
  roomPhaseRef.current = roomPhase;

  const selectedTrackRef = useRef(selectedTrackId);
  selectedTrackRef.current = selectedTrackId;

  const dailyChallengeRef = useRef(dailyChallenge);
  dailyChallengeRef.current = dailyChallenge;

  const dailyProgressRef = useRef(dailyProgress);
  dailyProgressRef.current = dailyProgress;

  const profileRef = useRef({
    driverName,
    driverColor,
    driverChassis,
    driverFinish,
  });
  profileRef.current = {
    driverName,
    driverColor,
    driverChassis,
    driverFinish,
  };

  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

  const latestCarTelemetryRef = useRef<{
    finishTimeMs: number | null;
    bestLapMs: number | null;
  }>({ finishTimeMs: null, bestLapMs: null });

  const localRaceClockOffsetRef = useRef<{
    countdownEndsAt: number;
    raceStartedAt: number;
  }>({ countdownEndsAt: 0, raceStartedAt: 0 });

  // Mirror game state onto document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

  // Refresh UTC date key periodically for seamless midnight daily challenge rollover
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = getTodayDateKey();
      setTodayDateKey((prev) => (prev === next ? prev : next));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to Firebase Auth & Global Leaderboard records
  useEffect(() => {
    if (!isFirebaseSupportedRuntime()) {
      setLeaderboardLoading(false);
      return;
    }

    const unsubAuth = subscribeAuthUser((user) => {
      setAuthUser(user);
    });
    const unsubRecords = subscribeLeaderboardRecords(
      (rows) => {
        setLeaderboardRecords(rows);
        setLeaderboardError(null);
        setLeaderboardLoading(false);
      },
      (errMsg) => {
        setLeaderboardError(errMsg);
        setLeaderboardLoading(false);
      },
    );

    return () => {
      unsubAuth();
      unsubRecords();
    };
  }, []);

  // Subscribe to signed-in user's Firestore Daily Challenge streak & unlocked paints
  useEffect(() => {
    if (!isFirebaseSupportedRuntime() || !authUser?.uid || !authUser.emailVerified) {
      setRemoteDailyProgress(null);
      return;
    }
    setDailySyncError(null);
    return subscribeDailyChallengeProgress(
      authUser.uid,
      (remote) => {
        setRemoteDailyProgress(remote);
        setDailySyncError(null);
      },
      (msg) => setDailySyncError(msg),
    );
  }, [authUser?.uid, authUser?.emailVerified]);

  // If user completed today's challenge locally before signing in, sync it to Firestore
  useEffect(() => {
    if (!isFirebaseSupportedRuntime() || !authUser?.emailVerified) return;
    if (localDailyProgress?.lastCompletedDate !== dailyChallenge.dateKey) return;
    if (
      remoteDailyProgress?.lastCompletedDate &&
      remoteDailyProgress.lastCompletedDate >= dailyChallenge.dateKey
    ) {
      return;
    }

    const timeToSync =
      lastDailyFinishMs !== null && lastDailyFinishMs <= dailyChallenge.targetTimeMs
        ? lastDailyFinishMs
        : dailyChallenge.targetTimeMs;

    void syncDailyChallengeToFirestore({
      challenge: dailyChallenge,
      finishTimeMs: timeToSync,
    }).catch(() => {
      setDailySyncError('Could not sync daily streak to Firestore.');
    });
  }, [
    authUser?.emailVerified,
    dailyChallenge,
    localDailyProgress?.lastCompletedDate,
    remoteDailyProgress?.lastCompletedDate,
    lastDailyFinishMs,
  ]);

  // Apply room snapshot updates from server
  const applyRoomSnapshot = useCallback((room: RoomSnapshot) => {
    setRoomId(room.roomId);
    if (screenStateRef.current !== 'replay') {
      setSelectedTrackId(room.trackId);
      if (room.weatherMode) {
        setWeatherMode(room.weatherMode);
      }
      if (typeof room.cpuCount === 'number') {
        setCpuCount(clampCpuCount(room.cpuCount));
      }
      if (typeof room.cpuDifficulty === 'number') {
        setCpuDifficulty(clampCpuDifficulty(room.cpuDifficulty));
      }
    }
    setPlayers(room.players);
    setRoomPhase(room.phase);
    setCountdownRemainingMs(room.countdownRemainingMs);
    setRaceElapsedMs(room.raceElapsedMs);

    const now = performance.now();
    if (room.phase === 'countdown') {
      localRaceClockOffsetRef.current.countdownEndsAt = now + room.countdownRemainingMs;
      localRaceClockOffsetRef.current.raceStartedAt = now + room.countdownRemainingMs;
      if (screenStateRef.current === 'title' || screenStateRef.current === 'gameover') {
        setScreenState('playing');
      }
    } else if (room.phase === 'racing') {
      localRaceClockOffsetRef.current.raceStartedAt = now - room.raceElapsedMs;
    } else if (room.phase === 'lobby') {
      if (screenStateRef.current === 'gameover' || screenStateRef.current === 'paused') {
        setScreenState('title');
      }
    }
  }, []);

  // Connect WebSocket multiplayer client
  useEffect(() => {
    const client = new MultiplayerClient({
      onWelcome: (playerId, room) => {
        setLocalPlayerId(playerId);
        applyRoomSnapshot(room);
        if (autostart && room.phase === 'lobby') {
          client.startRace();
        }
      },
      onRoomState: (room) => {
        applyRoomSnapshot(room);
      },
      onWorldSnapshot: (msg) => {
        setPlayers(msg.players);
        setRoomPhase(msg.phase);
        setCountdownRemainingMs(msg.countdownRemainingMs);
        setRaceElapsedMs(msg.raceElapsedMs);
        const now = performance.now();
        if (msg.phase === 'countdown') {
          localRaceClockOffsetRef.current.countdownEndsAt =
            now + msg.countdownRemainingMs;
          localRaceClockOffsetRef.current.raceStartedAt =
            now + msg.countdownRemainingMs;
          if (screenStateRef.current === 'title' || screenStateRef.current === 'gameover') {
            setScreenState('playing');
          }
        } else if (msg.phase === 'racing') {
          localRaceClockOffsetRef.current.raceStartedAt = now - msg.raceElapsedMs;
        }
      },
      onConnectionChange: (isConn) => {
        setConnected(isConn);
      },
    });
    netRef.current = client;
    client.connect({
      roomId: initialRoom,
      name: driverName,
      color: driverColor,
      chassisId: driverChassis,
      paintFinish: driverFinish,
      trackId: selectedTrackId,
      weatherMode,
      cpuCount,
      cpuDifficulty,
    });

    return () => {
      client.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  // Local client smooth clock interpolation when playing offline or between 50ms snapshots
  useEffect(() => {
    if (screenState !== 'playing') return;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (roomPhaseRef.current === 'countdown') {
        const rem = Math.max(0, localRaceClockOffsetRef.current.countdownEndsAt - now);
        setCountdownRemainingMs(rem);
        if (rem <= 0 && !connected) {
          setRoomPhase('racing');
          localRaceClockOffsetRef.current.raceStartedAt = now;
        }
      } else if (roomPhaseRef.current === 'racing') {
        setRaceElapsedMs(
          Math.max(0, now - localRaceClockOffsetRef.current.raceStartedAt),
        );
      }
    }, 50);
    return () => clearInterval(id);
  }, [screenState, connected]);

  const handleStartRace = useCallback(() => {
    audioRef.current?.unlock();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFinishSnapshot({ finishTimeMs: null, bestLapMs: null });
    setLeaderboardStatusText(null);
    setDailyOutcome(null);
    setRaceResetSeq((s) => s + 1);
    setScreenState('playing');

    if (connected) {
      netRef.current?.startRace();
    } else {
      const now = performance.now();
      localRaceClockOffsetRef.current.countdownEndsAt = now + 2600;
      localRaceClockOffsetRef.current.raceStartedAt = now + 2600;
      setRoomPhase('countdown');
      setCountdownRemainingMs(2600);
      setRaceElapsedMs(0);
    }
  }, [connected]);

  // Enter / Space starts race from title screen (when modals closed & not typing/adjusting)
  useEffect(() => {
    if (screenState !== 'title' || leaderboardOpen || dailyModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'BUTTON')
      ) {
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStartRace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screenState, leaderboardOpen, dailyModalOpen, handleStartRace]);

  const handleSelectTrack = useCallback(
    (trackId: TrackId) => {
      setSelectedTrackId(trackId);
      if (connected) {
        netRef.current?.selectTrack(trackId);
      }
    },
    [connected],
  );

  const handleSelectWeather = useCallback(
    (mode: WeatherMode) => {
      setWeatherMode(mode);
      if (connected) {
        netRef.current?.selectWeather(mode);
      }
    },
    [connected],
  );

  const handleProfileChange = useCallback(
    (
      name: string,
      color: string,
      chassisId: CarChassisId,
      paintFinish: PaintFinishId,
    ) => {
      setDriverName(name);
      setDriverColor(color);
      setDriverChassis(chassisId);
      setDriverFinish(paintFinish);
      if (connected) {
        netRef.current?.updateProfile(name, color, chassisId, paintFinish);
      }
    },
    [connected],
  );

  const handleCpuSettingsChange = useCallback(
    (nextCount: number, nextDifficulty: number) => {
      const c = clampCpuCount(nextCount);
      const d = clampCpuDifficulty(nextDifficulty);
      setCpuCount(c);
      setCpuDifficulty(d);
      if (connected) {
        netRef.current?.selectCpuSettings(c, d);
      }
    },
    [connected],
  );

  const handleJoinRoom = useCallback(
    (nextRoomId: string) => {
      setRoomId(nextRoomId);
      netRef.current?.joinRoom(
        nextRoomId,
        driverName,
        driverColor,
        selectedTrackId,
        weatherMode,
        driverChassis,
        driverFinish,
        cpuCount,
        cpuDifficulty,
      );
    },
    [
      driverName,
      driverColor,
      selectedTrackId,
      weatherMode,
      driverChassis,
      driverFinish,
      cpuCount,
      cpuDifficulty,
    ],
  );

  const submitLapRecord = useCallback(
    async (trackId: TrackId, lapMs: number) => {
      const prof = profileRef.current;
      setSubmittingTrack(trackId);
      setSubmitFeedback(null);
      try {
        const res = await submitBestLapToLeaderboard({
          driverName: prof.driverName,
          trackId,
          bestLapMs: lapMs,
          chassisId: prof.driverChassis,
          paintFinish: prof.driverFinish,
          color: prof.driverColor,
        });
        if (res.status === 'created' || res.status === 'updated') {
          const msg = `Saved ${formatRaceTime(lapMs)} to Global Leaderboard.`;
          setSubmitFeedback(msg);
          setLeaderboardStatusText(msg);
        } else if (res.status === 'not_faster') {
          setLeaderboardStatusText(
            `Global PB remains ${formatRaceTime(res.existingBestMs)}.`,
          );
        }
      } catch (err) {
        console.error('Failed to submit lap time:', err);
        setSubmitFeedback('Could not upload lap time right now.');
        setLeaderboardStatusText('Global leaderboard upload failed.');
      } finally {
        setSubmittingTrack(null);
      }
    },
    [],
  );

  const handleBestLapRecorded = useCallback(
    (trackId: TrackId, bestLapMs: number) => {
      setPendingBestLaps((prev) => {
        const current = prev[trackId];
        if (current !== undefined && current <= bestLapMs) return prev;
        return { ...prev, [trackId]: bestLapMs };
      });

      if (!isFirebaseSupportedRuntime()) return;

      if (authUserRef.current?.emailVerified) {
        void submitLapRecord(trackId, bestLapMs);
      } else {
        setLeaderboardStatusText(
          'Best lap ready — open Records to sign in & post globally.',
        );
      }
    },
    [submitLapRecord],
  );

  const handleSignIn = useCallback(async () => {
    setAuthBusy(true);
    setSubmitFeedback(null);
    try {
      const user = await signInWithGoogle();
      if (user && user.emailVerified) {
        const pending = pendingBestLaps[selectedTrackId];
        if (pending !== undefined && pending >= 5000) {
          await submitLapRecord(selectedTrackId, pending);
        }
      }
    } catch (err) {
      console.error('Sign in cancelled or failed:', err);
      setSubmitFeedback('Google sign-in was cancelled or blocked.');
    } finally {
      setAuthBusy(false);
    }
  }, [pendingBestLaps, selectedTrackId, submitLapRecord]);

  const handleSignOut = useCallback(async () => {
    setAuthBusy(true);
    try {
      await signOutFromLeaderboard();
      setSubmitFeedback(null);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSubmitPendingLap = useCallback(
    (trackId: TrackId) => {
      const lapMs = pendingBestLaps[trackId];
      if (lapMs !== undefined && lapMs >= 5000) {
        void submitLapRecord(trackId, lapMs);
      }
    },
    [pendingBestLaps, submitLapRecord],
  );

  const handleTogglePause = useCallback(() => {
    setScreenState((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleReturnLobby = useCallback(() => {
    setScreenState('title');
    if (connected) {
      netRef.current?.returnLobby();
    } else {
      setRoomPhase('lobby');
    }
  }, [connected]);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) =>
      prev === 'chase' ? 'hood' : prev === 'hood' ? 'overview' : 'chase',
    );
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleHudUpdate = useCallback(
    (
      nextHud: HudState,
      nextPos: { x: number; z: number; yaw: number; color: string },
    ) => {
      setHud(nextHud);
      setLocalPos(nextPos);
    },
    [],
  );

  const handleSendTelemetry = useCallback(
    (payload: {
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
    }) => {
      latestCarTelemetryRef.current = {
        finishTimeMs: payload.finishTimeMs,
        bestLapMs: payload.bestLapMs,
      };
      netRef.current?.sendCarState(payload);
    },
    [],
  );

  const handleLocalFinish = useCallback(
    (finishTimeMs: number | null, bestLapMs: number | null) => {
      const resolvedFinish =
        finishTimeMs ?? latestCarTelemetryRef.current.finishTimeMs;
      const resolvedBest =
        bestLapMs ?? latestCarTelemetryRef.current.bestLapMs;
      setFinishSnapshot({
        finishTimeMs: resolvedFinish,
        bestLapMs: resolvedBest,
      });

      const activeChallenge = dailyChallengeRef.current;
      const activeTrack = selectedTrackRef.current;
      if (activeTrack === activeChallenge.trackId) {
        const currentProgress = dailyProgressRef.current;
        const evalRes = evaluateDailyChallengeCompletion({
          challenge: activeChallenge,
          trackId: activeTrack,
          finishTimeMs: resolvedFinish,
          existing: currentProgress,
        });

        if (evalRes.achieved && evalRes.nextProgress) {
          setLastDailyFinishMs(resolvedFinish);
          if (!evalRes.alreadyCompletedToday) {
            saveLocalDailyProgress(evalRes.nextProgress);
            setLocalDailyProgress(evalRes.nextProgress);
            if (isFirebaseSupportedRuntime() && authUserRef.current?.emailVerified) {
              void syncDailyChallengeToFirestore({
                challenge: activeChallenge,
                finishTimeMs: resolvedFinish,
              })
                .then((res) => {
                  if (res.status === 'created' || res.status === 'updated') {
                    setDailySyncError(null);
                  }
                })
                .catch(() => {
                  setDailySyncError('Could not sync daily streak to Firestore.');
                });
            }
          }

          setDailyOutcome({
            achieved: true,
            alreadyCompletedToday: evalRes.alreadyCompletedToday,
            newlyUnlockedLivery: evalRes.newlyUnlockedLivery,
            streak: getDisplayStreak(evalRes.nextProgress, activeChallenge.dateKey),
            targetTimeMs: activeChallenge.targetTimeMs,
          });
        } else {
          setDailyOutcome({
            achieved: false,
            alreadyCompletedToday: false,
            newlyUnlockedLivery: null,
            streak: getDisplayStreak(currentProgress, activeChallenge.dateKey),
            targetTimeMs: activeChallenge.targetTimeMs,
          });
        }
      } else {
        setDailyOutcome(null);
      }

      window.setTimeout(() => {
        setScreenState('gameover');
      }, 650);
    },
    [],
  );

  const handleEquipLiveryColor = useCallback(
    (hexColor: string) => {
      const prof = profileRef.current;
      handleProfileChange(
        prof.driverName,
        hexColor,
        prof.driverChassis,
        prof.driverFinish,
      );
    },
    [handleProfileChange],
  );

  const handleStartDailyChallenge = useCallback(() => {
    setDailyModalOpen(false);
    handleSelectTrack(dailyChallenge.trackId);
    handleStartRace();
  }, [dailyChallenge.trackId, handleSelectTrack, handleStartRace]);

  const handleSaveReplay = useCallback((replay: SavedRaceReplay) => {
    setLastReplay(replay);
    saveLastRaceReplay(replay);
  }, []);

  const handleStartReplay = useCallback(
    (returnTarget: 'title' | 'gameover') => {
      if (!lastReplay) return;
      audioRef.current?.unlock();
      preReplayTrackRef.current = selectedTrackId;
      setReplayReturnTo(returnTarget);
      setSelectedTrackId(lastReplay.trackId);
      const preferredFocus =
        lastReplay.drivers.find((d) => d.id === (localPlayerId ?? 'local'))?.id ??
        lastReplay.drivers[0]?.id ??
        null;
      setReplayFocusId(preferredFocus);
      setReplayTimeMs(0);
      setReplayPlaying(true);
      setReplaySpeed(1);
      setCameraMode('chase');
      setScreenState('replay');
    },
    [lastReplay, selectedTrackId, localPlayerId],
  );

  const handleExitReplay = useCallback(() => {
    setReplayPlaying(false);
    setSelectedTrackId(preReplayTrackRef.current);
    setScreenState(replayReturnTo);
  }, [replayReturnTo]);

  const handleReplayTimeUpdate = useCallback(
    (
      timeMs: number,
      focusedStats: { lap: number; speedKmh: number },
      weatherCondition: WeatherCondition,
      ended: boolean,
    ) => {
      setReplayTimeMs(timeMs);
      setReplayStats(focusedStats);
      setReplayWeatherCond(weatherCondition);
      if (ended) {
        setReplayPlaying(false);
      }
    },
    [],
  );

  const handleCycleReplaySpeed = useCallback(() => {
    setReplaySpeed((s) => (s === 0.5 ? 1 : s === 1 ? 2 : s === 2 ? 4 : 0.5));
  }, []);

  const handleSeekReplay = useCallback((ms: number) => {
    setReplayTimeMs(ms);
  }, []);

  const localPlayer = players.find((p) => p.id === localPlayerId);
  const localSlotIndex = localPlayer ? localPlayer.slotIndex : 0;
  const bakedTrack = useMemo(() => getBakedTrack(selectedTrackId), [selectedTrackId]);
  const trackDef = useMemo(() => getTrackDefinition(selectedTrackId), [selectedTrackId]);

  const groupedRecords = useMemo(
    () => groupLeaderboardByTrack(leaderboardRecords),
    [leaderboardRecords],
  );
  const activeTrackRecord = groupedRecords[selectedTrackId]?.[0] ?? null;

  const remotePlayers = useMemo(
    () =>
      connected
        ? players.filter((p) => p.id !== localPlayerId)
        : offlineCpus,
    [connected, players, localPlayerId, offlineCpus],
  );

  // Merge local player into results list even if offline
  const displayPlayers: PlayerTelemetry[] = useMemo(() => {
    if (connected && players.length > 0) return players;
    const localEntry: PlayerTelemetry = {
      id: localPlayerId ?? 'local',
      name: driverName || 'Driver',
      color: driverColor,
      chassisId: driverChassis,
      paintFinish: driverFinish,
      slotIndex: 0,
      x: localPos.x,
      y: 0,
      z: localPos.z,
      yaw: localPos.yaw,
      speed: hud.speedKmh / 3.6,
      steerAngle: 0,
      lap: hud.lap,
      progress: hud.lap - 1,
      bestLapMs: hud.bestLapMs,
      finished: screenState === 'gameover',
      finishTimeMs: finishSnapshot.finishTimeMs,
      connected: true,
    };
    return [localEntry, ...offlineCpus];
  }, [
    connected,
    players,
    offlineCpus,
    localPlayerId,
    driverName,
    driverColor,
    driverChassis,
    driverFinish,
    localPos,
    hud.speedKmh,
    hud.lap,
    hud.bestLapMs,
    screenState,
    finishSnapshot.finishTimeMs,
  ]);

  const activeDisplayTrackId =
    screenState === 'replay' && lastReplay ? lastReplay.trackId : selectedTrackId;
  const replayTrackDef = useMemo(
    () => getTrackDefinition(activeDisplayTrackId),
    [activeDisplayTrackId],
  );

  return (
    <ErrorBoundary>
      <main className="relative w-full h-full overflow-hidden bg-slate-950">
        <RaceViewport
          trackId={activeDisplayTrackId}
          weatherMode={weatherMode}
          screenState={screenState}
          roomPhase={roomPhase}
          countdownRemainingMs={countdownRemainingMs}
          raceElapsedMs={raceElapsedMs}
          localPlayerId={localPlayerId}
          localName={driverName}
          localColor={driverColor}
          localChassisId={driverChassis}
          localPaintFinish={driverFinish}
          localSlotIndex={localSlotIndex}
          cpuCount={cpuCount}
          cpuDifficulty={cpuDifficulty}
          connected={connected}
          remotePlayers={remotePlayers}
          cameraMode={cameraMode}
          muted={muted}
          audio={audioRef.current}
          touchInputRef={touchInputRef}
          resetCounter={resetCounter}
          raceResetSeq={raceResetSeq}
          replayData={lastReplay}
          replayFocusId={replayFocusId}
          replayTimeMs={replayTimeMs}
          replayPlaying={replayPlaying}
          replaySpeed={replaySpeed}
          onHudUpdate={handleHudUpdate}
          onOfflineCpusUpdate={setOfflineCpus}
          onSendTelemetry={handleSendTelemetry}
          onBestLapRecorded={handleBestLapRecorded}
          onLocalFinish={handleLocalFinish}
          onSaveReplay={handleSaveReplay}
          onReplayTimeUpdate={handleReplayTimeUpdate}
          onTogglePause={handleTogglePause}
          onCycleCamera={handleCycleCamera}
          onToggleMute={handleToggleMute}
          onWebglStatus={setWebglOk}
        />

        {!webglOk && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950 p-6 text-center">
            <div className="max-w-md rounded-xl border border-white/15 bg-slate-900 p-6">
              <h2 className="font-display text-xl font-bold text-white">
                3D Graphics Unavailable
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                WebGL could not initialize in this browser context. Please enable hardware acceleration or use a WebGL2-capable browser.
              </p>
            </div>
          </div>
        )}

        {screenState === 'title' && (
          <TitleLobby
            selectedTrackId={selectedTrackId}
            weatherMode={weatherMode}
            driverName={driverName}
            driverColor={driverColor}
            driverChassis={driverChassis}
            driverFinish={driverFinish}
            cpuCount={cpuCount}
            cpuDifficulty={cpuDifficulty}
            roomId={roomId}
            connected={connected}
            players={players}
            localPlayerId={localPlayerId}
            hasSavedReplay={Boolean(lastReplay)}
            trackRecord={activeTrackRecord}
            dailyChallenge={dailyChallenge}
            dailyStreak={getDisplayStreak(dailyProgress, dailyChallenge.dateKey)}
            dailyCompletedToday={
              dailyProgress?.lastCompletedDate === dailyChallenge.dateKey
            }
            unlockedRewardIds={dailyProgress?.unlockedLiveryIds ?? []}
            onSelectTrack={handleSelectTrack}
            onSelectWeather={handleSelectWeather}
            onDriverProfileChange={handleProfileChange}
            onCpuSettingsChange={handleCpuSettingsChange}
            onJoinRoom={handleJoinRoom}
            onStartRace={handleStartRace}
            onWatchLastReplay={() => handleStartReplay('title')}
            onOpenLeaderboard={() => setLeaderboardOpen(true)}
            onOpenDailyChallenge={() => setDailyModalOpen(true)}
          />
        )}

        {screenState === 'playing' && (
          <RaceHud
            track={bakedTrack}
            hud={hud}
            localPos={localPos}
            remotes={remotePlayers}
            cameraMode={cameraMode}
            muted={muted}
            touchInputRef={touchInputRef}
            onCycleCamera={handleCycleCamera}
            onToggleMute={handleToggleMute}
            onResetCar={() => setResetCounter((c) => c + 1)}
            onPause={handleTogglePause}
          />
        )}

        {screenState === 'replay' && lastReplay && (
          <ReplayOverlay
            replay={lastReplay}
            localPlayerId={localPlayerId ?? 'local'}
            focusedDriverId={replayFocusId ?? lastReplay.drivers[0]?.id ?? 'local'}
            focusedStats={replayStats}
            currentTimeMs={replayTimeMs}
            playing={replayPlaying}
            playbackSpeed={replaySpeed}
            cameraMode={cameraMode}
            weatherCondition={replayWeatherCond}
            trackName={replayTrackDef.name}
            totalLaps={replayTrackDef.laps}
            onSelectDriver={setReplayFocusId}
            onTogglePlay={() =>
              setReplayPlaying((prev) => {
                if (!prev && replayTimeMs >= lastReplay.durationMs - 40) {
                  setReplayTimeMs(0);
                }
                return !prev;
              })
            }
            onCycleSpeed={handleCycleReplaySpeed}
            onSeek={handleSeekReplay}
            onCycleCamera={handleCycleCamera}
            onExitReplay={handleExitReplay}
          />
        )}

        <RaceModals
          screenState={screenState}
          trackId={selectedTrackId}
          trackName={trackDef.name}
          players={displayPlayers}
          localPlayerId={localPlayerId ?? 'local'}
          localFinishTimeMs={
            finishSnapshot.finishTimeMs ?? localPlayer?.finishTimeMs ?? null
          }
          localBestLapMs={
            finishSnapshot.bestLapMs ?? localPlayer?.bestLapMs ?? hud.bestLapMs
          }
          hasReplay={Boolean(lastReplay)}
          leaderboardStatusText={leaderboardStatusText}
          dailyChallenge={dailyChallenge}
          dailyOutcome={dailyOutcome}
          onResume={() => setScreenState('playing')}
          onRestartRace={handleStartRace}
          onReturnLobby={handleReturnLobby}
          onStartReplay={() => handleStartReplay('gameover')}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
          onOpenDailyChallenge={() => setDailyModalOpen(true)}
          onEquipDailyLivery={handleEquipLiveryColor}
        />

        <GlobalLeaderboard
          open={leaderboardOpen}
          initialTrackId={selectedTrackId}
          records={leaderboardRecords}
          loading={leaderboardLoading}
          error={leaderboardError}
          authUser={authUser}
          authBusy={authBusy}
          pendingBestLaps={pendingBestLaps}
          submittingTrack={submittingTrack}
          submitFeedback={submitFeedback}
          onClose={() => setLeaderboardOpen(false)}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          onSubmitPendingLap={handleSubmitPendingLap}
        />

        <DailyChallengeModal
          open={dailyModalOpen}
          challenge={dailyChallenge}
          progress={dailyProgress}
          driverColor={driverColor}
          authUser={authUser}
          authBusy={authBusy}
          dailySyncError={dailySyncError}
          onClose={() => setDailyModalOpen(false)}
          onSelectLiveryColor={handleEquipLiveryColor}
          onStartChallengeRace={handleStartDailyChallenge}
          onSignIn={() => void handleSignIn()}
        />
      </main>
    </ErrorBoundary>
  );
}
