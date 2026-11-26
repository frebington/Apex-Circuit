# Security Specification — Apex Circuit Global Leaderboard

## 1. Data Invariants
- Every document in `/lapRecords/{recordId}` represents one verified player's fastest lap for one track, keyed deterministically by `{uid}_{trackId}`.
- Only authenticated users with `request.auth.token.email_verified == true` can create, update, or delete their own `/lapRecords/{recordId}` document.
- Zero PII (`email`, `phone`, `address`) is stored in `/lapRecords/{recordId}`.
- `bestLapMs` must be an integer between `5000` (5s) and `600000` (10m).
- On `update`, a user can only overwrite their own record when `incoming().bestLapMs < existing().bestLapMs` (strict improvement), while `uid` and `trackId` remain immutable and `updatedAt == request.time`.

## 2. Dirty Dozen Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Create**: `auth = null` writing to `/lapRecords/user1_alpine_gorge`.
2. **Unverified Email Create**: `auth = { uid: 'u1', token: { email_verified: false } }` writing valid record.
3. **UID Spoofing on Create**: `auth = { uid: 'u1', token: { email_verified: true } }` with `data.uid = 'u2'`.
4. **Cross-User Record Key Hijack**: `auth = { uid: 'u1' }` writing to `/lapRecords/u2_alpine_gorge` even with `data.uid = 'u1'`.
5. **Ghost Field Injection (Shadow Update)**: Valid payload plus `isVerified: true` or `adminOverride: true`.
6. **Impossible Speed / Sub-5s Cheat Lap**: Valid payload with `bestLapMs: 120`.
7. **Float / String Lap Time Injection**: `bestLapMs: "12345"` or `bestLapMs: 42150.5`.
8. **Invalid Track Enum**: `trackId: "hacked_track"`.
9. **Oversized Driver Name (Resource Poisoning)**: `driverName: "A".repeat(200)`.
10. **Forged Client Timestamp**: `updatedAt` set to a client date instead of server `request.time`.
11. **Slower Lap Overwrite on Update**: Updating own record with `bestLapMs >= existing().bestLapMs`.
12. **Track / Owner Mutation on Update**: Updating own record while changing `trackId` or `uid`.

---

# Daily Challenge Streaks (`/dailyChallenges/{userId}`)

## 1. Data Invariants
- Strictly owner-only `get`, `create`, `update`, and `delete` (`request.auth.token.email_verified == true && userId == request.auth.uid`); `list` is explicitly denied (`allow list: if false;`).
- On `create`, a user starts at `currentStreak == 1`, `bestStreak == 1`, `totalCompleted == 1`, and `unlockedLiveryIds.size() == 1` with `updatedAt == request.time`.
- On `update`, `lastCompletedDate` must advance strictly forward (`incoming().lastCompletedDate > existing().lastCompletedDate`), `currentStreak <= existing().currentStreak + 1`, `totalCompleted == existing().totalCompleted + 1`, `bestStreak >= existing().bestStreak && bestStreak >= currentStreak`, existing unlocked liveries are retained (`hasAll`), at most 1 new valid livery ID is added, and `uid` remains immutable.

## 2. Adversarial Payloads (Must Return PERMISSION_DENIED)
- Reading or listing another user's `/dailyChallenges/{otherUid}` document.
- Creating a new document with pre-inflated `currentStreak: 30` or `unlockedLiveryIds` containing all 8 liveries.
- Updating an existing document without advancing `lastCompletedDate` (replaying same-day streak increments) or jumping `currentStreak` by more than `+1`.
- Injecting an unrecognized livery ID (e.g. `"hacked_gold"`) or exceeding `unlockedLiveryIds.size() > 8`.

