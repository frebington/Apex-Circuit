import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  CAR_CHASSIS_OPTIONS,
  DAILY_REWARD_LIVERIES,
  PAINT_FINISH_OPTIONS,
  type CarChassisId,
  type DailyChallengeProgress,
  type DailyChallengeSpec,
  type DailyRewardLivery,
  type DailyRewardLiveryId,
  type LeaderboardRecord,
  type PaintFinishId,
  type TrackId,
} from '../shared/types';
import { evaluateDailyChallengeCompletion } from '../game/dailyChallenge';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

const VALID_TRACK_IDS = new Set<TrackId>([
  'alpine_gorge',
  'redrock_crossing',
  'frostpeak_pass',
  'coastal_causeway',
  'sunset_valley',
]);
const VALID_CHASSIS_IDS = new Set<CarChassisId>(CAR_CHASSIS_OPTIONS.map((c) => c.id));
const VALID_FINISH_IDS = new Set<PaintFinishId>(PAINT_FINISH_OPTIONS.map((f) => f.id));
const VALID_REWARD_LIVERY_IDS = new Set<DailyRewardLiveryId>(
  DAILY_REWARD_LIVERIES.map((l) => l.id),
);

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let connectionTested = false;

export function isFirebaseSupportedRuntime(): boolean {
  return typeof window !== 'undefined' && window.location.protocol !== 'file:';
}

function ensureFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!isFirebaseSupportedRuntime()) return null;
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    cachedAuth = getAuth(cachedApp);
    cachedDb = getFirestore(cachedApp, firebaseConfig.firestoreDatabaseId);
  }
  return {
    app: cachedApp,
    auth: cachedAuth!,
    db: cachedDb!,
  };
}

export async function testConnection(): Promise<void> {
  const ctx = ensureFirebase();
  if (!ctx || connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(ctx.db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (isFirebaseSupportedRuntime()) {
  void testConnection();
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const auth = cachedAuth;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface NormalizedLapPayload {
  uid: string;
  driverName: string;
  trackId: TrackId;
  bestLapMs: number;
  chassisId: CarChassisId;
  paintFinish: PaintFinishId;
  color: string;
}

export function validateAndNormalizeLapPayload(input: {
  uid: string;
  driverName: string;
  trackId: TrackId;
  bestLapMs: number;
  chassisId?: CarChassisId;
  paintFinish?: PaintFinishId;
  color: string;
}): NormalizedLapPayload | null {
  const uid = typeof input.uid === 'string' ? input.uid.trim() : '';
  if (!uid || uid.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
    return null;
  }
  if (!VALID_TRACK_IDS.has(input.trackId)) {
    return null;
  }
  if (!Number.isFinite(input.bestLapMs)) {
    return null;
  }
  const bestLapMs = Math.round(input.bestLapMs);
  if (bestLapMs < 5000 || bestLapMs > 600000) {
    return null;
  }

  const cleanedName = (input.driverName || 'Driver')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
  const driverName = cleanedName || 'Driver';

  const chassisId: CarChassisId =
    input.chassisId && VALID_CHASSIS_IDS.has(input.chassisId)
      ? input.chassisId
      : 'gt_coupe';
  const paintFinish: PaintFinishId =
    input.paintFinish && VALID_FINISH_IDS.has(input.paintFinish)
      ? input.paintFinish
      : 'gloss';

  const color = /^#[0-9a-fA-F]{6}$/.test((input.color || '').trim())
    ? input.color.trim()
    : '#dc2626';

  return {
    uid,
    driverName,
    trackId: input.trackId,
    bestLapMs,
    chassisId,
    paintFinish,
    color,
  };
}

export function groupLeaderboardByTrack(
  records: LeaderboardRecord[],
): Record<TrackId, LeaderboardRecord[]> {
  const grouped: Record<TrackId, LeaderboardRecord[]> = {
    alpine_gorge: [],
    redrock_crossing: [],
    frostpeak_pass: [],
    coastal_causeway: [],
    sunset_valley: [],
  };
  for (const r of records) {
    if (VALID_TRACK_IDS.has(r.trackId)) {
      grouped[r.trackId].push(r);
    }
  }
  for (const trackId of Object.keys(grouped) as TrackId[]) {
    grouped[trackId].sort((a, b) => a.bestLapMs - b.bestLapMs);
  }
  return grouped;
}

export function subscribeAuthUser(onChange: (user: User | null) => void): () => void {
  const ctx = ensureFirebase();
  if (!ctx) {
    onChange(null);
    return () => {};
  }
  return onAuthStateChanged(ctx.auth, onChange);
}

export async function signInWithGoogle(): Promise<User | null> {
  const ctx = ensureFirebase();
  if (!ctx) return null;
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(ctx.auth, provider);
  return result.user;
}

export async function signOutFromLeaderboard(): Promise<void> {
  const ctx = ensureFirebase();
  if (!ctx) return;
  await signOut(ctx.auth);
}

export function subscribeLeaderboardRecords(
  onUpdate: (records: LeaderboardRecord[]) => void,
  onError: (message: string) => void,
): () => void {
  const ctx = ensureFirebase();
  if (!ctx) {
    onUpdate([]);
    return () => {};
  }

  const colPath = 'lapRecords';
  const q = query(
    collection(ctx.db, colPath),
    where('bestLapMs', '>=', 5000),
    where('bestLapMs', '<=', 600000),
    orderBy('bestLapMs', 'asc'),
    limit(200),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: LeaderboardRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (
          typeof d.uid !== 'string' ||
          typeof d.driverName !== 'string' ||
          !VALID_TRACK_IDS.has(d.trackId as TrackId) ||
          typeof d.bestLapMs !== 'number'
        ) {
          return;
        }
        const updatedAtMs =
          d.updatedAt && typeof d.updatedAt.toMillis === 'function'
            ? d.updatedAt.toMillis()
            : Date.now();
        rows.push({
          id: docSnap.id,
          uid: d.uid,
          driverName: d.driverName,
          trackId: d.trackId as TrackId,
          bestLapMs: d.bestLapMs,
          chassisId: VALID_CHASSIS_IDS.has(d.chassisId as CarChassisId)
            ? (d.chassisId as CarChassisId)
            : 'gt_coupe',
          paintFinish: VALID_FINISH_IDS.has(d.paintFinish as PaintFinishId)
            ? (d.paintFinish as PaintFinishId)
            : 'gloss',
          color: typeof d.color === 'string' ? d.color : '#dc2626',
          updatedAtMs,
        });
      });
      onUpdate(rows);
    },
    (error) => {
      onError('Unable to load global leaderboard.');
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch {
        // Structured error already logged via handleFirestoreError; keep UI alive
      }
    },
  );
}

export type LapSubmitResult =
  | { status: 'created'; recordId: string }
  | { status: 'updated'; recordId: string }
  | { status: 'not_faster'; existingBestMs: number }
  | { status: 'skipped'; reason: string };

export async function submitBestLapToLeaderboard(params: {
  driverName: string;
  trackId: TrackId;
  bestLapMs: number;
  chassisId: CarChassisId;
  paintFinish: PaintFinishId;
  color: string;
}): Promise<LapSubmitResult> {
  const ctx = ensureFirebase();
  if (!ctx) {
    return { status: 'skipped', reason: 'offline_portable' };
  }
  const user = ctx.auth.currentUser;
  if (!user) {
    return { status: 'skipped', reason: 'not_signed_in' };
  }
  if (!user.emailVerified) {
    return { status: 'skipped', reason: 'email_not_verified' };
  }

  const normalized = validateAndNormalizeLapPayload({
    uid: user.uid,
    driverName: params.driverName || user.displayName || 'Driver',
    trackId: params.trackId,
    bestLapMs: params.bestLapMs,
    chassisId: params.chassisId,
    paintFinish: params.paintFinish,
    color: params.color,
  });
  if (!normalized) {
    return { status: 'skipped', reason: 'invalid_lap' };
  }

  const recordId = `${normalized.uid}_${normalized.trackId}`;
  const path = `lapRecords/${recordId}`;
  const ref = doc(ctx.db, 'lapRecords', recordId);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(ref, {
        uid: normalized.uid,
        driverName: normalized.driverName,
        trackId: normalized.trackId,
        bestLapMs: normalized.bestLapMs,
        chassisId: normalized.chassisId,
        paintFinish: normalized.paintFinish,
        color: normalized.color,
        updatedAt: serverTimestamp(),
      });
      return { status: 'created', recordId };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  const existingData = existingSnap.data();
  const existingBest =
    typeof existingData.bestLapMs === 'number' ? existingData.bestLapMs : Infinity;

  if (normalized.bestLapMs >= existingBest) {
    return { status: 'not_faster', existingBestMs: existingBest };
  }

  try {
    await updateDoc(ref, {
      driverName: normalized.driverName,
      bestLapMs: normalized.bestLapMs,
      chassisId: normalized.chassisId,
      paintFinish: normalized.paintFinish,
      color: normalized.color,
      updatedAt: serverTimestamp(),
    });
    return { status: 'updated', recordId };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function parseDailyChallengeDoc(d: Record<string, unknown>): DailyChallengeProgress | null {
  if (
    typeof d.currentStreak !== 'number' ||
    typeof d.bestStreak !== 'number' ||
    typeof d.totalCompleted !== 'number' ||
    typeof d.lastCompletedDate !== 'string' ||
    !Array.isArray(d.unlockedLiveryIds)
  ) {
    return null;
  }

  const unlockedLiveryIds = d.unlockedLiveryIds.filter(
    (id): id is DailyRewardLiveryId =>
      typeof id === 'string' && VALID_REWARD_LIVERY_IDS.has(id as DailyRewardLiveryId),
  );
  const updatedAtObj = d.updatedAt as { toMillis?: () => number } | undefined;
  const updatedAtMs =
    updatedAtObj && typeof updatedAtObj.toMillis === 'function'
      ? updatedAtObj.toMillis()
      : Date.now();

  return {
    currentStreak: Math.max(0, Math.floor(d.currentStreak)),
    bestStreak: Math.max(0, Math.floor(d.bestStreak)),
    totalCompleted: Math.max(0, Math.floor(d.totalCompleted)),
    lastCompletedDate: d.lastCompletedDate,
    unlockedLiveryIds,
    updatedAtMs,
  };
}

export function subscribeDailyChallengeProgress(
  uid: string,
  onUpdate: (progress: DailyChallengeProgress | null) => void,
  onError?: (message: string) => void,
): () => void {
  const ctx = ensureFirebase();
  if (!ctx || !uid) {
    onUpdate(null);
    return () => {};
  }

  const path = `dailyChallenges/${uid}`;
  const ref = doc(ctx.db, 'dailyChallenges', uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(parseDailyChallengeDoc(snap.data() as Record<string, unknown>));
    },
    (error) => {
      onError?.('Unable to load daily challenge streak.');
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Structured error already logged; keep UI alive
      }
    },
  );
}

export type DailySyncResult =
  | {
      status: 'created' | 'updated';
      progress: DailyChallengeProgress;
      newlyUnlockedLivery: DailyRewardLivery | null;
    }
  | {
      status: 'already_completed';
      progress: DailyChallengeProgress | null;
      newlyUnlockedLivery: null;
    }
  | {
      status: 'skipped';
      reason: string;
    };

export async function syncDailyChallengeToFirestore(params: {
  challenge: DailyChallengeSpec;
  finishTimeMs: number | null;
}): Promise<DailySyncResult> {
  const ctx = ensureFirebase();
  if (!ctx) {
    return { status: 'skipped', reason: 'offline_portable' };
  }
  const user = ctx.auth.currentUser;
  if (!user) {
    return { status: 'skipped', reason: 'not_signed_in' };
  }
  if (!user.emailVerified) {
    return { status: 'skipped', reason: 'email_not_verified' };
  }
  if (
    params.finishTimeMs === null ||
    !Number.isFinite(params.finishTimeMs) ||
    params.finishTimeMs <= 0 ||
    params.finishTimeMs > params.challenge.targetTimeMs
  ) {
    return { status: 'skipped', reason: 'target_not_met' };
  }

  const path = `dailyChallenges/${user.uid}`;
  const ref = doc(ctx.db, 'dailyChallenges', user.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const existingRemote = existingSnap.exists()
    ? parseDailyChallengeDoc(existingSnap.data() as Record<string, unknown>)
    : null;

  if (
    existingRemote &&
    existingRemote.lastCompletedDate &&
    existingRemote.lastCompletedDate >= params.challenge.dateKey
  ) {
    return {
      status: 'already_completed',
      progress: existingRemote,
      newlyUnlockedLivery: null,
    };
  }

  const evalRes = evaluateDailyChallengeCompletion({
    challenge: params.challenge,
    trackId: params.challenge.trackId,
    finishTimeMs: params.finishTimeMs,
    existing: existingRemote,
  });

  if (!evalRes.achieved || !evalRes.nextProgress) {
    return { status: 'skipped', reason: 'target_not_met' };
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(ref, {
        uid: user.uid,
        currentStreak: 1,
        bestStreak: 1,
        totalCompleted: 1,
        lastCompletedDate: params.challenge.dateKey,
        unlockedLiveryIds: [evalRes.nextProgress.unlockedLiveryIds[0]],
        updatedAt: serverTimestamp(),
      });
      return {
        status: 'created',
        progress: evalRes.nextProgress,
        newlyUnlockedLivery: evalRes.newlyUnlockedLivery,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  try {
    await updateDoc(ref, {
      currentStreak: evalRes.nextProgress.currentStreak,
      bestStreak: evalRes.nextProgress.bestStreak,
      totalCompleted: evalRes.nextProgress.totalCompleted,
      lastCompletedDate: evalRes.nextProgress.lastCompletedDate,
      unlockedLiveryIds: evalRes.nextProgress.unlockedLiveryIds,
      updatedAt: serverTimestamp(),
    });
    return {
      status: 'updated',
      progress: evalRes.nextProgress,
      newlyUnlockedLivery: evalRes.newlyUnlockedLivery,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
