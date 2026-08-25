// Staged web-profile mutation for desktop-owned package installation.
//
// pnpm install/add can rewrite the manifest, lockfile, and node_modules. Run
// those commands against a sibling shadow DSH_HOME, then promote the complete
// profile only after validation. The sibling topology preserves relative
// file:/link: depth, and a journal recovers every interrupted rename phase.

import { execFileSync } from 'node:child_process';
import { createHash, type Hash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROFILE_NAME = 'web';
const JOURNAL_NAME = '.desktop-profile-repair.json';
const MARKER_NAME = '.dsh-desktop-profile-transaction';
const JOURNAL_SCHEMA = 1;
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_DELAY_MS = 50;
const EXPECTATION_MISMATCH = '[profile-expectation-mismatch]';

export type ProfileExpectation = 'unchecked' | 'missing' | { identity: string };

type RepairPhase =
  | 'prepared'
  | 'shadowReady'
  | 'originalMoved'
  | 'shadowPromoted'
  | 'rollingBack'
  | 'aborted';

interface RepairTarget {
  package: string;
  source: string;
}

interface RepairJournal {
  schema: number;
  ownerPid: number;
  ownerLstart: string;
  createdUnixMs: number;
  id: string;
  phase: RepairPhase;
  hadOriginal: boolean;
  realProfile: string;
  shadowProfile: string;
  backupProfile: string;
  targets: RepairTarget[];
  originalIdentity: string | null;
  homePatchIdentity: string | null;
}

interface PhaseRecord {
  schema: number;
  id: string;
  phase: RepairPhase;
}

interface RepairPaths {
  journal: string;
  profile: string;
  backup: string;
  shadowHome: string;
  shadowProfile: string;
}

type IdentityEntry =
  | { kind: 'file'; bytes: Buffer }
  | { kind: 'directory' }
  | { kind: 'symlink'; target: string };

type ProfileIdentity = Map<string, IdentityEntry>;

export type MutateProfile = (shadowHome: string, hadOriginal: boolean) => void;

export function isExpectationMismatch(error: string): boolean {
  return error.startsWith(EXPECTATION_MISMATCH);
}

export function checkWebProfileExpectation(
  dshHome: string,
  expectation: ProfileExpectation,
): void {
  if (expectation === 'unchecked') {
    return;
  }
  const actual = webProfileIdentity(dshHome);
  validateExpectation(expectation, actual);
}

export function recoverWebProfile(dshHome: string): void {
  recoverStaleRepair(dshHome);
}

export function webProfileIdentity(dshHome: string): string | null {
  const profile = path.join(dshHome, 'profiles', PROFILE_NAME);
  if (!pathExists(profile)) {
    return null;
  }
  if (!isDirectory(profile)) {
    throw new Error(`web profile path is not a directory: ${profile}`);
  }
  return identityFingerprint(captureProfileIdentity(profile));
}

function validateExpectation(
  expectation: ProfileExpectation,
  actual: string | null,
): void {
  let mismatch: boolean;
  if (expectation === 'unchecked') {
    mismatch = false;
  } else if (expectation === 'missing') {
    mismatch = actual !== null;
  } else {
    mismatch = actual !== expectation.identity;
  }
  if (mismatch) {
    throw new Error(
      `${EXPECTATION_MISMATCH} web profile changed after the approved state; review it before retrying`,
    );
  }
}

export function profileSnapshotIdentity(profile: string): string {
  const identity = captureProfileIdentity(profile);
  for (const key of [...identity.keys()]) {
    const components = splitComponents(key);
    if (key === MARKER_NAME || components[0] === 'node_modules') {
      identity.delete(key);
    }
  }
  return identityFingerprint(identity);
}

export function copyProfileSnapshot(source: string, target: string): void {
  if (!isDirectory(source)) {
    throw new Error(`profile snapshot source is not a directory: ${source}`);
  }
  if (pathExists(target)) {
    throw new Error(`profile snapshot target already exists: ${target}`);
  }
  copyProfileTree(source, target);
}

export function replaceProfileFromSnapshot(source: string, target: string): void {
  if (!isDirectory(source)) {
    throw new Error(`profile backup is not a directory: ${source}`);
  }
  try {
    removePathIfExists(target);
  } catch (error) {
    throw new Error(`remove staged profile ${target}: ${message(error)}`);
  }
  copyProfileTree(source, target);
}

/**
 * Mutate a complete shadow copy of the web profile and promote it as one
 * transaction. The closure receives the shadow DSH_HOME and whether a real
 * profile existed. All desktop-owned packages belong in this one closure.
 */
export function mutateWebProfile(
  dshHome: string,
  targets: ReadonlyArray<readonly [string, string]>,
  mutate: MutateProfile,
): void {
  mutateWebProfileExpected(dshHome, targets, 'unchecked', mutate);
}

/**
 * The checked variant binds a user-approved snapshot to the transaction.
 * A terminal-side edit after consent forces a new snapshot before mutation.
 */
export function mutateWebProfileExpected(
  dshHome: string,
  targets: ReadonlyArray<readonly [string, string]>,
  expectation: ProfileExpectation,
  mutate: MutateProfile,
): void {
  try {
    fs.mkdirSync(dshHome, { recursive: true });
  } catch (error) {
    throw new Error(`create ${dshHome}: ${message(error)}`);
  }
  recoverStaleRepair(dshHome);

  const profile = path.join(dshHome, 'profiles', PROFILE_NAME);
  if (pathExists(profile) && !isDirectory(profile)) {
    throw new Error(`web profile path is not a directory: ${profile}`);
  }
  const hadOriginal = isDirectory(profile);
  const originalIdentity = hadOriginal
    ? identityFingerprint(captureProfileIdentity(profile))
    : null;
  validateExpectation(expectation, originalIdentity);
  const homePatch = path.join(dshHome, 'cordis.patch.yml');
  const originalHomePatch = readOptionalFile(homePatch);
  const id = transactionId();
  const paths = repairPaths(dshHome, id);
  const ownerPid = process.pid;
  const ownerLstart = psLstart(ownerPid);
  if (ownerLstart === null) {
    throw new Error(`cannot identify profile repair owner pid ${ownerPid}`);
  }
  const createdUnixMs = unixMillis();
  const journalTargets: RepairTarget[] = targets.map(([packageName, source]) => {
    try {
      return { package: packageName, source: fs.realpathSync.native(source) };
    } catch (error) {
      throw new Error(
        `resolve desktop-owned package ${packageName} at ${source}: ${message(error)}`,
      );
    }
  });
  const journal: RepairJournal = {
    schema: JOURNAL_SCHEMA,
    ownerPid,
    ownerLstart,
    createdUnixMs,
    id,
    phase: 'prepared',
    hadOriginal,
    realProfile: paths.profile,
    shadowProfile: paths.shadowProfile,
    backupProfile: paths.backup,
    targets: journalTargets,
    originalIdentity,
    homePatchIdentity:
      originalHomePatch === null ? null : bytesFingerprint(originalHomePatch),
  };
  writeNewJournal(paths.journal, journal);

  const staged = capture(() => {
    if (hadOriginal) {
      copyProfileTree(paths.profile, paths.shadowProfile);
    }
    if (originalHomePatch !== null) {
      try {
        fs.mkdirSync(paths.shadowHome, { recursive: true });
      } catch (error) {
        throw new Error(`create ${paths.shadowHome}: ${message(error)}`);
      }
      try {
        fs.writeFileSync(
          path.join(paths.shadowHome, 'cordis.patch.yml'),
          originalHomePatch,
        );
      } catch (error) {
        throw new Error(`copy home cordis.patch.yml into staging: ${message(error)}`);
      }
    }
    mutate(paths.shadowHome, hadOriginal);
    validateStagedProfile(paths.shadowProfile);
    validateProfileTargets(paths.shadowProfile, journal.targets);
    const currentIdentity = isDirectory(paths.profile)
      ? identityFingerprint(captureProfileIdentity(paths.profile))
      : null;
    if (currentIdentity !== originalIdentity) {
      throw new Error('web profile changed outside the desktop repair transaction');
    }
    if (!optionalFileEquals(readOptionalFile(homePatch), originalHomePatch)) {
      throw new Error(
        'home cordis.patch.yml changed outside the desktop repair transaction',
      );
    }
    writeMarker(paths.shadowProfile, journal.id);
    journal.phase = 'shadowReady';
    updateJournal(paths.journal, journal);
  });
  if (staged !== null) {
    rollbackBeforeCommit(paths, staged);
  }

  try {
    fs.mkdirSync(path.dirname(paths.profile), { recursive: true });
  } catch (error) {
    rollbackBeforeCommit(paths, `create profile parent: ${message(error)}`);
  }
  if (hadOriginal) {
    try {
      renameWithRetry(paths.profile, paths.backup);
    } catch (error) {
      rollbackBeforeCommit(
        paths,
        `stage existing profile ${paths.profile} as ${paths.backup}: ${message(error)}`,
      );
    }
    const stagedCheck = capture(() => {
      validateOriginalIdentity(paths.backup, originalIdentity as string);
      validateOptionalFileUnchanged(homePatch, originalHomePatch);
    });
    if (stagedCheck !== null) {
      const restoreError = capture(() => renameWithRetry(paths.backup, paths.profile));
      if (restoreError !== null) {
        throw new Error(
          `${stagedCheck}; restore ${paths.profile} failed: ${restoreError}; journal retained at ${paths.journal}`,
        );
      }
      rollbackBeforeCommit(paths, stagedCheck);
    }
    journal.phase = 'originalMoved';
    const phaseResult = capture(() => {
      syncDirectory(path.dirname(paths.profile));
      updateJournal(paths.journal, journal);
    });
    if (phaseResult !== null) {
      const restoreError = capture(() => renameWithRetry(paths.backup, paths.profile));
      if (restoreError !== null) {
        throw new Error(
          `record original-moved phase failed: ${phaseResult}; restore ${paths.profile} failed: ${restoreError}; journal retained at ${paths.journal}`,
        );
      }
      rollbackBeforeCommit(
        paths,
        `record original-moved phase failed: ${phaseResult}`,
      );
    }
  }
  const promotion = capture(() => renameWithRetry(paths.shadowProfile, paths.profile));
  if (promotion !== null) {
    const promoteError = `promote staged profile ${paths.shadowProfile} to ${paths.profile}: ${promotion}`;
    if (hadOriginal) {
      const restoreError = capture(() => renameWithRetry(paths.backup, paths.profile));
      if (restoreError !== null) {
        throw new Error(
          `${promoteError}; restore ${paths.profile} failed: ${restoreError}; journal retained at ${paths.journal}`,
        );
      }
    }
    rollbackBeforeCommit(paths, promoteError);
  }
  journal.phase = 'shadowPromoted';
  const promotedPhase = capture(() => {
    syncDirectory(path.dirname(paths.profile));
    updateJournal(paths.journal, journal);
  });
  if (promotedPhase !== null) {
    rollbackAfterPromotion(
      paths,
      hadOriginal,
      `record shadow-promoted phase failed: ${promotedPhase}`,
    );
  }

  // New profile is live. Keep the journal and marker until destructive
  // cleanup finishes; the next boot can prove which profile was promoted.
  const liveCheck = capture(() => {
    validateStagedProfile(paths.profile);
    validateProfileTargets(paths.profile, journal.targets);
  });
  if (liveCheck !== null) {
    rollbackAfterPromotion(paths, hadOriginal, liveCheck);
  }
  if (hadOriginal) {
    const backupCheck = capture(() =>
      validateOriginalIdentity(paths.backup, originalIdentity as string),
    );
    if (backupCheck !== null) {
      rollbackAfterPromotion(paths, true, backupCheck);
    }
  }
  const patchCheck = capture(() =>
    validateOptionalFileUnchanged(homePatch, originalHomePatch),
  );
  if (patchCheck !== null) {
    rollbackAfterPromotion(paths, hadOriginal, patchCheck);
  }
  if (pathExists(paths.backup)) {
    try {
      removePath(paths.backup);
    } catch (error) {
      throw new Error(
        `profile committed but remove backup ${paths.backup} failed: ${message(error)}; journal retained at ${paths.journal}`,
      );
    }
  }
  try {
    removePathIfExists(paths.shadowHome);
  } catch (error) {
    throw new Error(
      `profile committed but remove shadow home ${paths.shadowHome} failed: ${message(error)}; journal retained at ${paths.journal}`,
    );
  }
  try {
    fs.unlinkSync(path.join(paths.profile, MARKER_NAME));
  } catch (error) {
    throw new Error(`remove committed profile marker: ${message(error)}`);
  }
  removeJournalRecords(paths.journal);
}

function recoverStaleRepair(dshHome: string): void {
  const journalPath = path.join(dshHome, JOURNAL_NAME);
  if (!pathExists(journalPath)) {
    const marker = path.join(dshHome, 'profiles', PROFILE_NAME, MARKER_NAME);
    if (pathExists(marker)) {
      throw new Error(
        `profile transaction marker exists without a journal: ${marker}; preserving it for manual recovery`,
      );
    }
    return;
  }
  let text: string;
  try {
    text = fs.readFileSync(journalPath, 'utf8');
  } catch (error) {
    throw new Error(`read profile repair journal ${journalPath}: ${message(error)}`);
  }
  let journal: RepairJournal;
  try {
    journal = JSON.parse(text) as RepairJournal;
  } catch (error) {
    throw new Error(`parse profile repair journal ${journalPath}: ${message(error)}`);
  }
  validateJournal(dshHome, journal);
  if (pidMatches(journal.ownerPid, journal.ownerLstart)) {
    throw new Error(
      `web profile repair already owned by live process ${journal.ownerPid}`,
    );
  }
  journal.phase = readDurablePhase(journalPath, journal);

  const paths = repairPaths(dshHome, journal.id);
  const real = pathExists(paths.profile);
  const backup = pathExists(paths.backup);
  const shadow = pathExists(paths.shadowProfile);
  const marker = readMarker(paths.profile);
  if (marker !== null && marker !== journal.id) {
    throw new Error(
      `profile marker does not match repair ${journal.id}; preserving all paths`,
    );
  }
  const promoted = marker === journal.id;
  const phase = journal.phase;
  const had = journal.hadOriginal;

  if (
    (phase === 'prepared' || phase === 'shadowReady') &&
    had &&
    real &&
    !backup &&
    !promoted
  ) {
    discardShadow(paths);
  } else if (phase === 'aborted' && had && real && !backup && !promoted) {
    validateOriginalFingerprint(paths.profile, journal);
    discardShadow(paths);
  } else if (
    (phase === 'prepared' || phase === 'shadowReady' || phase === 'aborted') &&
    !had &&
    !real &&
    !backup &&
    !promoted
  ) {
    discardShadow(paths);
  } else if (
    (phase === 'shadowReady' || phase === 'originalMoved' || phase === 'rollingBack') &&
    had &&
    !real &&
    backup &&
    !promoted
  ) {
    restoreBackup(paths, journal);
  } else if (phase === 'rollingBack' && had && real && backup && !shadow && promoted) {
    rollBackLiveCandidate(paths, journal, true);
  } else if (phase === 'rollingBack' && had && real && !backup && shadow && !promoted) {
    validateOriginalFingerprint(paths.profile, journal);
    discardShadow(paths);
  } else if (
    phase === 'rollingBack' &&
    !had &&
    real &&
    !backup &&
    !shadow &&
    promoted
  ) {
    rollBackLiveCandidate(paths, journal, false);
  } else if (
    phase === 'rollingBack' &&
    !had &&
    !real &&
    !backup &&
    shadow &&
    !promoted
  ) {
    discardShadow(paths);
  } else if (
    // New-profile promotion has no original-moved phase.
    phase === 'shadowReady' &&
    !had &&
    real &&
    !backup &&
    !shadow &&
    promoted
  ) {
    resolvePromotedRecovery(dshHome, paths, journal);
  } else if (
    // Existing-profile promotion can complete before ShadowPromoted is
    // durably recorded, but only with the matching marker and backup.
    phase === 'originalMoved' &&
    had &&
    real &&
    backup &&
    !shadow &&
    promoted
  ) {
    resolvePromotedRecovery(dshHome, paths, journal);
  } else if (
    // Cleanup can remove backup and marker after ShadowPromoted; that
    // phase is the durable commit record for those later states.
    phase === 'shadowPromoted' &&
    real &&
    !shadow &&
    (!backup || (had && promoted))
  ) {
    resolvePromotedRecovery(dshHome, paths, journal);
  } else {
    throw new Error(
      `ambiguous profile repair ${journal.id} in phase ${phaseDebug(phase)}: hadOriginal=${had}, real/backup/shadow/promoted=(${real}, ${backup}, ${shadow}, ${promoted}); preserving all paths`,
    );
  }
  removeJournalRecords(paths.journal);
}

function discardShadow(paths: RepairPaths): void {
  try {
    removePathIfExists(paths.shadowHome);
  } catch (error) {
    throw new Error(
      `remove abandoned shadow home ${paths.shadowHome}: ${message(error)}`,
    );
  }
}

function restoreBackup(paths: RepairPaths, journal: RepairJournal): void {
  validateOriginalFingerprint(paths.backup, journal);
  try {
    renameWithRetry(paths.backup, paths.profile);
  } catch (error) {
    throw new Error(
      `restore interrupted profile ${paths.profile} from ${paths.backup}: ${message(error)}`,
    );
  }
  try {
    removePathIfExists(paths.shadowHome);
  } catch (error) {
    throw new Error(
      `remove rolled-back shadow home ${paths.shadowHome}: ${message(error)}`,
    );
  }
}

function rollBackLiveCandidate(
  paths: RepairPaths,
  journal: RepairJournal,
  hadOriginal: boolean,
): void {
  try {
    renameWithRetry(paths.profile, paths.shadowProfile);
  } catch (error) {
    throw new Error(
      `move promoted profile ${paths.profile} back to ${paths.shadowProfile}: ${message(error)}`,
    );
  }
  if (hadOriginal) {
    restoreBackup(paths, journal);
  } else {
    discardShadow(paths);
  }
}

function validateOriginalFingerprint(profile: string, journal: RepairJournal): void {
  const expected = journal.originalIdentity;
  if (expected === null || expected === undefined) {
    throw new Error('repair journal lacks original profile fingerprint');
  }
  const actual = identityFingerprint(captureProfileIdentity(profile));
  if (actual !== expected) {
    throw new Error(
      `original profile fingerprint changed at ${profile}; preserving transaction paths`,
    );
  }
}

function resolvePromotedRecovery(
  dshHome: string,
  paths: RepairPaths,
  journal: RepairJournal,
): void {
  if (
    homePatchMatches(dshHome, journal) ||
    (journal.hadOriginal && !pathExists(paths.backup))
  ) {
    finishPromotedRecovery(paths, journal);
  } else {
    rollBackLiveCandidate(paths, journal, journal.hadOriginal);
  }
}

function finishPromotedRecovery(paths: RepairPaths, journal: RepairJournal): void {
  validateStagedProfile(paths.profile);
  validateProfileTargets(paths.profile, journal.targets);
  if (pathExists(paths.backup)) {
    validateOriginalFingerprint(paths.backup, journal);
    validateStagedProfile(paths.profile);
    validateProfileTargets(paths.profile, journal.targets);
    try {
      removePath(paths.backup);
    } catch (error) {
      throw new Error(
        `remove committed profile backup ${paths.backup}: ${message(error)}`,
      );
    }
  }
  try {
    removePathIfExists(paths.shadowHome);
  } catch (error) {
    throw new Error(
      `remove committed shadow home ${paths.shadowHome}: ${message(error)}`,
    );
  }
  try {
    removePathIfExists(path.join(paths.profile, MARKER_NAME));
  } catch (error) {
    throw new Error(`remove recovered profile marker: ${message(error)}`);
  }
}

function validateJournal(dshHome: string, journal: RepairJournal): void {
  if (journal.schema !== JOURNAL_SCHEMA) {
    throw new Error(`unsupported profile repair journal schema ${journal.schema}`);
  }
  validateId(journal.id);
  const paths = repairPaths(dshHome, journal.id);
  if (
    journal.realProfile !== paths.profile ||
    journal.shadowProfile !== paths.shadowProfile ||
    journal.backupProfile !== paths.backup
  ) {
    throw new Error('profile repair journal paths do not match DSH_HOME');
  }
  if (journal.hadOriginal !== (journal.originalIdentity !== null)) {
    throw new Error('profile repair journal original identity is inconsistent');
  }
  if (
    journal.targets.some(
      (target) => target.package.length === 0 || !path.isAbsolute(target.source),
    )
  ) {
    throw new Error('profile repair journal contains an invalid target');
  }
}

function validateStagedProfile(profile: string): void {
  for (const required of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    if (!isFile(path.join(profile, required))) {
      throw new Error(`staged web profile lacks ${required}: ${profile}`);
    }
  }
  if (!isDirectory(path.join(profile, 'node_modules'))) {
    throw new Error(`staged web profile lacks node_modules: ${profile}`);
  }
}

function validateProfileTargets(profile: string, targets: RepairTarget[]): void {
  if (targets.length === 0) {
    return;
  }
  const manifestPath = path.join(profile, 'package.json');
  let manifestText: string;
  try {
    manifestText = fs.readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(`read staged manifest ${manifestPath}: ${message(error)}`);
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(`parse staged manifest ${manifestPath}: ${message(error)}`);
  }
  const dependencies = asObject(asObject(manifest)?.dependencies);
  if (dependencies === null) {
    throw new Error(`staged manifest lacks dependencies: ${manifestPath}`);
  }
  for (const target of targets) {
    if (!Object.prototype.hasOwnProperty.call(dependencies, target.package)) {
      throw new Error(`staged manifest lacks dependency ${target.package}`);
    }
    let actual: string;
    try {
      actual = fs.realpathSync.native(
        path.join(profile, 'node_modules', target.package),
      );
    } catch (error) {
      throw new Error(`resolve staged ${target.package}: ${message(error)}`);
    }
    if (actual !== target.source) {
      throw new Error(
        `staged ${target.package} resolves to ${actual}, expected ${target.source}`,
      );
    }
  }
}

function writeMarker(profile: string, id: string): void {
  const marker = path.join(profile, MARKER_NAME);
  let fd: number;
  try {
    fd = fs.openSync(marker, 'wx');
  } catch (error) {
    throw new Error(`create staged profile marker ${marker}: ${message(error)}`);
  }
  try {
    fs.writeSync(fd, `${id}\n`);
    fs.fsyncSync(fd);
  } catch (error) {
    throw new Error(`write staged profile marker ${marker}: ${message(error)}`);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(profile);
}

function readMarker(profile: string): string | null {
  const marker = path.join(profile, MARKER_NAME);
  if (!pathExists(marker)) {
    return null;
  }
  try {
    return fs.readFileSync(marker, 'utf8').trim();
  } catch (error) {
    throw new Error(`read profile transaction marker ${marker}: ${message(error)}`);
  }
}

function rollbackAfterPromotion(
  paths: RepairPaths,
  hadOriginal: boolean,
  error: string,
): never {
  const phaseError = capture(() => markJournalPhase(paths.journal, 'rollingBack'));
  if (phaseError !== null) {
    throw new Error(
      `${error}; record rolling-back phase failed: ${phaseError}; promoted profile and backup retained`,
    );
  }
  const moveError = capture(() => renameWithRetry(paths.profile, paths.shadowProfile));
  if (moveError !== null) {
    throw new Error(
      `${error}; move promoted profile back to staging failed: ${moveError}; journal retained at ${paths.journal}`,
    );
  }
  if (hadOriginal) {
    const restoreError = capture(() => renameWithRetry(paths.backup, paths.profile));
    if (restoreError !== null) {
      throw new Error(
        `${error}; restore original profile failed: ${restoreError}; journal retained at ${paths.journal}`,
      );
    }
  }
  rollbackBeforeCommit(paths, error);
}

function rollbackBeforeCommit(paths: RepairPaths, error: string): never {
  const abortError = capture(() => markJournalAborted(paths.journal));
  if (abortError !== null) {
    throw new Error(
      `${error}; record aborted phase failed: ${abortError}; staging and journal retained`,
    );
  }
  const failures: string[] = [];
  const cleanupError = capture(() => removePathIfExists(paths.shadowHome));
  if (cleanupError !== null) {
    failures.push(`remove shadow home: ${cleanupError}`);
  }
  if (failures.length === 0) {
    const journalError = capture(() => removeJournalRecords(paths.journal));
    if (journalError !== null) {
      failures.push(`remove journal records: ${journalError}`);
    }
  }
  if (failures.length === 0) {
    throw new Error(error);
  }
  throw new Error(`${error}; cleanup failed: ${failures.join('; ')}`);
}

function markJournalAborted(journalPath: string): void {
  markJournalPhase(journalPath, 'aborted');
}

function markJournalPhase(journalPath: string, phase: RepairPhase): void {
  let text: string;
  try {
    text = fs.readFileSync(journalPath, 'utf8');
  } catch (error) {
    throw new Error(
      `read journal before phase update ${journalPath}: ${message(error)}`,
    );
  }
  let journal: RepairJournal;
  try {
    journal = JSON.parse(text) as RepairJournal;
  } catch (error) {
    throw new Error(
      `parse journal before phase update ${journalPath}: ${message(error)}`,
    );
  }
  journal.phase = phase;
  updateJournal(journalPath, journal);
}

function repairPaths(dshHome: string, id: string): RepairPaths {
  validateId(id);
  const parent = path.dirname(dshHome);
  const name = path.basename(dshHome);
  if (parent === dshHome) {
    throw new Error(`DSH_HOME has no parent: ${dshHome}`);
  }
  if (name.length === 0) {
    throw new Error(`DSH_HOME has no final component: ${dshHome}`);
  }
  // Sibling DSH homes keep profiles/web at identical depth and on the same
  // volume, preserving pnpm's relative file:/link: specs and renameability.
  const shadowHome = path.join(parent, `.${name}-desktop-profile-repair-${id}`);
  const profiles = path.join(dshHome, 'profiles');
  return {
    journal: path.join(dshHome, JOURNAL_NAME),
    profile: path.join(profiles, PROFILE_NAME),
    backup: path.join(profiles, `.${PROFILE_NAME}-desktop-backup-${id}`),
    shadowProfile: path.join(shadowHome, 'profiles', PROFILE_NAME),
    shadowHome,
  };
}

function transactionId(): string {
  return `${process.pid}-${unixMillis()}`;
}

function unixMillis(): number {
  return Date.now();
}

function validateId(id: string): void {
  if (id.length > 0 && /^[0-9-]+$/.test(id)) {
    return;
  }
  throw new Error(`invalid profile repair id ${JSON.stringify(id)}`);
}

function writeNewJournal(journalPath: string, journal: RepairJournal): void {
  const requestedPhase = journal.phase;
  const immutable: RepairJournal = { ...journal, phase: 'prepared' };
  const bytes = Buffer.from(`${JSON.stringify(immutable, null, 2)}\n`);
  let fd: number;
  try {
    fd = fs.openSync(journalPath, 'wx');
  } catch (error) {
    throw new Error(
      `create profile repair journal ${journalPath}: ${message(error)}`,
    );
  }
  try {
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(journalPath);
    } catch {
      // best effort
    }
    throw new Error(`write profile repair journal ${journalPath}: ${message(error)}`);
  }
  fs.closeSync(fd);
  syncDirectory(path.dirname(journalPath));
  if (requestedPhase !== 'prepared') {
    recordPhase(journalPath, journal.id, requestedPhase);
  }
}

function updateJournal(journalPath: string, journal: RepairJournal): void {
  recordPhase(journalPath, journal.id, journal.phase);
}

function recordPhase(journalPath: string, id: string, phase: RepairPhase): void {
  if (phase === 'prepared') {
    return;
  }
  const finalPath = phaseRecordPath(journalPath, id, phase);
  if (pathExists(finalPath)) {
    validatePhaseRecord(finalPath, id, phase);
    return;
  }
  const record: PhaseRecord = { schema: JOURNAL_SCHEMA, id, phase };
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const temp = withExtension(finalPath, `phase.${process.pid}.tmp`);
  try {
    removePathIfExists(temp);
  } catch (error) {
    throw new Error(`remove stale phase temp ${temp}: ${message(error)}`);
  }
  let fd: number;
  try {
    fd = fs.openSync(temp, 'wx');
  } catch (error) {
    throw new Error(`create profile repair phase ${temp}: ${message(error)}`);
  }
  try {
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(temp);
    } catch {
      // best effort
    }
    throw new Error(`write profile repair phase ${temp}: ${message(error)}`);
  }
  fs.closeSync(fd);
  try {
    fs.renameSync(temp, finalPath);
  } catch (error) {
    if (pathExists(finalPath) && capture(() => validatePhaseRecord(finalPath, id, phase)) === null) {
      try {
        fs.unlinkSync(temp);
      } catch {
        // best effort
      }
      return;
    }
    throw new Error(`publish profile repair phase ${finalPath}: ${message(error)}`);
  }
  syncDirectory(path.dirname(journalPath));
}

function phaseRecordPath(journalPath: string, id: string, phase: RepairPhase): string {
  validateId(id);
  return path.join(
    path.dirname(journalPath),
    `.desktop-profile-repair.${id}.${phaseSlug(phase)}.phase`,
  );
}

function phaseSlug(phase: RepairPhase): string {
  switch (phase) {
    case 'prepared':
      return 'prepared';
    case 'shadowReady':
      return 'shadow-ready';
    case 'originalMoved':
      return 'original-moved';
    case 'shadowPromoted':
      return 'shadow-promoted';
    case 'rollingBack':
      return 'rolling-back';
    case 'aborted':
      return 'aborted';
  }
}

function phaseDebug(phase: RepairPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function durablePhases(): RepairPhase[] {
  return ['shadowReady', 'originalMoved', 'shadowPromoted', 'rollingBack', 'aborted'];
}

function validatePhaseRecord(
  recordPath: string,
  id: string,
  phase: RepairPhase,
): void {
  let text: string;
  try {
    text = fs.readFileSync(recordPath, 'utf8');
  } catch (error) {
    throw new Error(`read profile repair phase ${recordPath}: ${message(error)}`);
  }
  let record: PhaseRecord;
  try {
    record = JSON.parse(text) as PhaseRecord;
  } catch (error) {
    throw new Error(`parse profile repair phase ${recordPath}: ${message(error)}`);
  }
  if (record.schema !== JOURNAL_SCHEMA || record.id !== id || record.phase !== phase) {
    throw new Error(`profile repair phase record mismatch: ${recordPath}`);
  }
}

function readDurablePhase(journalPath: string, journal: RepairJournal): RepairPhase {
  let phase = journal.phase;
  for (const candidate of durablePhases()) {
    const recordPath = phaseRecordPath(journalPath, journal.id, candidate);
    if (pathExists(recordPath)) {
      validatePhaseRecord(recordPath, journal.id, candidate);
      phase = candidate;
    }
  }
  return phase;
}

function removeJournalRecords(journalPath: string): void {
  let text: string;
  try {
    text = fs.readFileSync(journalPath, 'utf8');
  } catch (error) {
    throw new Error(`read journal before cleanup ${journalPath}: ${message(error)}`);
  }
  let journal: RepairJournal;
  try {
    journal = JSON.parse(text) as RepairJournal;
  } catch (error) {
    throw new Error(`parse journal before cleanup ${journalPath}: ${message(error)}`);
  }
  const active = readDurablePhase(journalPath, journal);
  for (const phase of durablePhases()) {
    if (phase === active) {
      continue;
    }
    const record = phaseRecordPath(journalPath, journal.id, phase);
    try {
      removePathIfExists(record);
    } catch (error) {
      throw new Error(`remove profile repair phase ${record}: ${message(error)}`);
    }
  }
  const parent = path.dirname(journalPath);
  syncDirectory(parent);
  try {
    fs.unlinkSync(journalPath);
  } catch (error) {
    throw new Error(
      `remove profile repair journal ${journalPath}: ${message(error)}`,
    );
  }
  syncDirectory(parent);
  if (active !== 'prepared') {
    const record = phaseRecordPath(journalPath, journal.id, active);
    const error = capture(() => removePathIfExists(record));
    if (error !== null) {
      console.error(
        `dsh-desktop: completed profile repair left harmless phase record ${record}: ${error}`,
      );
    }
    capture(() => syncDirectory(parent));
  }
}

function validateOriginalIdentity(profile: string, expected: string): void {
  const actual = identityFingerprint(captureProfileIdentity(profile));
  if (actual !== expected) {
    throw new Error('web profile changed during desktop transaction commit');
  }
}

function readOptionalFile(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw new Error(`read optional file ${filePath}: ${message(error)}`);
  }
}

function optionalFileEquals(left: Buffer | null, right: Buffer | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.equals(right);
}

function homePatchMatches(dshHome: string, journal: RepairJournal): boolean {
  const bytes = readOptionalFile(path.join(dshHome, 'cordis.patch.yml'));
  const actual = bytes === null ? null : bytesFingerprint(bytes);
  return actual === journal.homePatchIdentity;
}

function validateOptionalFileUnchanged(
  filePath: string,
  expected: Buffer | null,
): void {
  if (!optionalFileEquals(readOptionalFile(filePath), expected)) {
    throw new Error(`${filePath} changed during desktop transaction commit`);
  }
}

function captureProfileIdentity(profile: string): ProfileIdentity {
  const identity: ProfileIdentity = new Map();
  captureTree(profile, profile, identity);
  return identity;
}

function captureTree(root: string, current: string, identity: ProfileIdentity): void {
  for (const entry of readDirEntries(current)) {
    const entryPath = path.join(current, entry.name);
    const relative = path.relative(root, entryPath);
    if (entry.isDirectory()) {
      identity.set(relative, { kind: 'directory' });
      if (current === root && entry.name === 'node_modules') {
        captureNodeModulesTop(root, entryPath, identity);
      } else {
        captureTree(root, entryPath, identity);
      }
    } else if (entry.isFile()) {
      identity.set(relative, { kind: 'file', bytes: readFileBytes(entryPath) });
    } else if (entry.isSymbolicLink()) {
      identity.set(relative, { kind: 'symlink', target: readLink(entryPath) });
    } else {
      throw new Error(`unsupported profile entry type: ${entryPath}`);
    }
  }
}

function captureNodeModulesTop(
  root: string,
  nodeModules: string,
  identity: ProfileIdentity,
): void {
  for (const entry of readDirEntries(nodeModules)) {
    const entryPath = path.join(nodeModules, entry.name);
    const relative = path.relative(root, entryPath);
    let value: IdentityEntry;
    if (entry.isSymbolicLink()) {
      value = { kind: 'symlink', target: readLink(entryPath) };
    } else if (entry.isFile()) {
      value = { kind: 'file', bytes: readFileBytes(entryPath) };
    } else if (entry.isDirectory()) {
      value = { kind: 'directory' };
      if (entry.name.startsWith('@')) {
        captureNodeModulesScope(root, entryPath, identity);
      }
    } else {
      throw new Error(`unsupported node_modules entry type: ${entryPath}`);
    }
    identity.set(relative, value);
  }
}

function captureNodeModulesScope(
  root: string,
  scope: string,
  identity: ProfileIdentity,
): void {
  for (const entry of readDirEntries(scope)) {
    const entryPath = path.join(scope, entry.name);
    const relative = path.relative(root, entryPath);
    let value: IdentityEntry;
    if (entry.isSymbolicLink()) {
      value = { kind: 'symlink', target: readLink(entryPath) };
    } else if (entry.isFile()) {
      value = { kind: 'file', bytes: readFileBytes(entryPath) };
    } else if (entry.isDirectory()) {
      value = { kind: 'directory' };
    } else {
      throw new Error(`unsupported scoped package entry type: ${entryPath}`);
    }
    identity.set(relative, value);
  }
}

function bytesFingerprint(bytes: Buffer): string {
  const digest = createHash('sha256');
  hashField(digest, Buffer.from('file'), bytes);
  return digest.digest('hex');
}

function identityFingerprint(identity: ProfileIdentity): string {
  const digest = createHash('sha256');
  digest.update(Buffer.from('dsh-desktop-profile-identity-v1\0'));
  for (const key of [...identity.keys()].sort(comparePaths)) {
    const entry = identity.get(key) as IdentityEntry;
    hashOsStr(digest, key);
    if (entry.kind === 'file') {
      hashField(digest, Buffer.from('file'), entry.bytes);
    } else if (entry.kind === 'directory') {
      hashField(digest, Buffer.from('directory'), Buffer.alloc(0));
    } else {
      digest.update(Buffer.from('symlink\0'));
      hashOsStr(digest, entry.target);
    }
  }
  return digest.digest('hex');
}

function hashField(digest: Hash, kind: Buffer, bytes: Buffer): void {
  digest.update(u64le(kind.length));
  digest.update(kind);
  digest.update(u64le(bytes.length));
  digest.update(bytes);
}

function hashOsStr(digest: Hash, value: string): void {
  if (process.platform === 'win32') {
    hashField(
      digest,
      Buffer.from('os-windows-utf16le'),
      Buffer.from(value, 'utf16le'),
    );
  } else {
    hashField(digest, Buffer.from('os-unix'), Buffer.from(value, 'utf8'));
  }
}

function copyProfileTree(source: string, target: string): void {
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (error) {
    throw new Error(`create ${target}: ${message(error)}`);
  }
  for (const entry of readDirEntries(source)) {
    if (path.basename(source) === PROFILE_NAME && entry.name === 'node_modules') {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyProfileTree(from, to);
    } else if (entry.isFile()) {
      try {
        fs.copyFileSync(from, to);
      } catch (error) {
        throw new Error(`copy ${from} to ${to}: ${message(error)}`);
      }
    } else if (entry.isSymbolicLink()) {
      copySymlink(from, to);
    } else {
      throw new Error(`unsupported profile entry type: ${from}`);
    }
  }
}

function copySymlink(source: string, target: string): void {
  const link = readLink(source);
  // Windows needs the reparse point kind at creation time; `junction` covers
  // directory links without Developer Mode, and `file` covers the rest.
  let type: 'dir' | 'file' | 'junction' | undefined;
  if (process.platform === 'win32') {
    const resolved = path.resolve(path.dirname(source), link);
    type = isDirectory(resolved) ? 'junction' : 'file';
  }
  try {
    fs.symlinkSync(link, target, type);
  } catch (error) {
    throw new Error(`copy symlink ${source} to ${target}: ${message(error)}`);
  }
}

function renameWithRetry(source: string, target: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RENAME_ATTEMPTS) {
        sleepSync(RENAME_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function syncDirectory(directory: string): void {
  if (process.platform === 'win32') {
    return;
  }
  let fd: number;
  try {
    fd = fs.openSync(directory, 'r');
  } catch (error) {
    throw new Error(`sync directory ${directory}: ${message(error)}`);
  }
  try {
    fs.fsyncSync(fd);
  } catch (error) {
    throw new Error(`sync directory ${directory}: ${message(error)}`);
  } finally {
    fs.closeSync(fd);
  }
}

function removePathIfExists(target: string): void {
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (isNotFound(error)) {
      return;
    }
    throw error;
  }
  removePath(target);
}

function removePath(target: string): void {
  const metadata = fs.lstatSync(target);
  if (metadata.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: false });
  } else {
    fs.unlinkSync(target);
  }
}

/**
 * True only when `pid` is alive AND is the same process instance the journal
 * was written for (same start time). A recycled pid reads as dead.
 */
export function pidMatches(pid: number, recordedLstart: string): boolean {
  return psLstart(pid) === recordedLstart;
}

export function psLstart(pid: number): string | null {
  try {
    if (process.platform === 'win32') {
      const text = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.Ticks`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      return text.length === 0 ? null : text;
    }
    const text = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return text.length === 0 ? null : text;
  } catch {
    return null;
  }
}

function readDirEntries(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read ${directory}: ${message(error)}`);
  }
}

function readFileBytes(filePath: string): Buffer {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`read ${filePath}: ${message(error)}`);
  }
}

function readLink(filePath: string): string {
  try {
    return fs.readlinkSync(filePath);
  } catch (error) {
    throw new Error(`read symlink ${filePath}: ${message(error)}`);
  }
}

function withExtension(filePath: string, extension: string): string {
  const directory = path.dirname(filePath);
  const name = path.basename(filePath);
  const dot = name.lastIndexOf('.');
  const stem = dot <= 0 ? name : name.slice(0, dot);
  return path.join(directory, `${stem}.${extension}`);
}

function splitComponents(value: string): string[] {
  const separators = process.platform === 'win32' ? /[\\/]+/ : /\/+/;
  return value.split(separators).filter((component) => component.length > 0);
}

/**
 * Order component by component, not by the raw string, so a separator never
 * sorts against an ordinary character.
 */
function comparePaths(left: string, right: string): number {
  const leftParts = splitComponents(left);
  const rightParts = splitComponents(right);
  const shared = Math.min(leftParts.length, rightParts.length);
  for (let index = 0; index < shared; index += 1) {
    const order = Buffer.compare(
      Buffer.from(leftParts[index] as string, 'utf8'),
      Buffer.from(rightParts[index] as string, 'utf8'),
    );
    if (order !== 0) {
      return order;
    }
  }
  return leftParts.length - rightParts.length;
}

function u64le(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function pathExists(target: string): boolean {
  return fs.existsSync(target);
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run `body` and return its failure message instead of throwing, so the
 * multi-step rollback ladders can inspect a failure without unwinding.
 */
function capture(body: () => void): string | null {
  try {
    body();
    return null;
  } catch (error) {
    return message(error);
  }
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export const __internals = {
  JOURNAL_NAME,
  JOURNAL_SCHEMA,
  MARKER_NAME,
  PROFILE_NAME,
  bytesFingerprint,
  captureProfileIdentity,
  identityFingerprint,
  phaseRecordPath,
  readDurablePhase,
  removeJournalRecords,
  repairPaths,
  updateJournal,
  withExtension,
  writeNewJournal,
};

export type { RepairJournal, RepairPhase, RepairPaths, RepairTarget };
