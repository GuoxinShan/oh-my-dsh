// Consent and persistent configuration snapshots for a shared DSH_HOME.

import { createHash, type Hash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  copyProfileSnapshot,
  profileSnapshotIdentity,
  webProfileIdentity,
} from './profile-repair.js';

const RECORD_SCHEMA = 1;
const BACKUP_SCHEMA = 1;
const CONSENT_SCOPE = 'desktop-owned-web-profile-v1';
const RECORDS_DIR = 'profile-adoptions';
const BACKUPS_DIR = 'profile-backups';
const RECORD_LOCK = '.append.lock';
const RECORD_LOCK_WAIT_MS = 2_000;
const RECORD_LOCK_STALE_MS = 30_000;

let fileNonce = 0;

function nextNonce(): number {
  const nonce = fileNonce;
  fileNonce += 1;
  return nonce;
}

export type AdoptionOrigin = 'freshHome' | 'existingHome';

export type AdoptionStatus =
  | 'adopting'
  | 'active'
  | 'consentRequired'
  | 'restorePending'
  | 'restored'
  | 'restoreAbandoned';

export interface BackupRef {
  id: string;
  root: string;
  profile: string;
  sourceIdentity: string;
  snapshotIdentity: string;
  createdUnixMs: number;
}

export interface AdoptionRecord {
  schema: number;
  scope: string;
  revision: number;
  dshHome: string;
  origin: AdoptionOrigin;
  status: AdoptionStatus;
  consentedUnixMs: number | null;
  updatedUnixMs: number;
  backup: BackupRef | null;
  restoreSourceIdentity: string | null;
}

interface BackupManifest {
  schema: number;
  scope: string;
  id: string;
  dshHome: string;
  sourceIdentity: string;
  snapshotIdentity: string;
  createdUnixMs: number;
}

export interface ExistingHomeSummary {
  canonicalHome: string;
  hasExistingData: boolean;
  hasWebProfile: boolean;
  plugins: string[];
  agentPresetCount: number;
}

export function inspectHome(dshHome: string): ExistingHomeSummary {
  const home = canonicalHome(dshHome);
  if (!pathExists(dshHome)) {
    return {
      canonicalHome: home,
      hasExistingData: false,
      hasWebProfile: false,
      plugins: [],
      agentPresetCount: 0,
    };
  }
  if (!isDirectory(dshHome)) {
    throw new Error(`DSH_HOME is not a directory: ${dshHome}`);
  }

  const profile = path.join(dshHome, 'profiles', 'web');
  const hasWebProfile = isDirectory(profile);
  const plugins = readProfilePlugins(profile);
  const agentPresetCount = countAgentPresets(path.join(dshHome, '.agent-presets'));
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dshHome, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read DSH_HOME ${dshHome}: ${message(error)}`);
  }
  const hasExistingData =
    hasWebProfile ||
    agentPresetCount > 0 ||
    entries.some((entry) => isMeaningfulHomeEntry(entry.name));

  return {
    canonicalHome: home,
    hasExistingData,
    hasWebProfile,
    plugins,
    agentPresetCount,
  };
}

export function latestRecord(
  shellRoot: string,
  canonical: string,
): AdoptionRecord | null {
  const key = homeKey(canonical);
  const dir = path.join(shellRoot, RECORDS_DIR, key);
  if (!pathExists(dir)) {
    return null;
  }
  const records: Array<[string, AdoptionRecord]> = [];
  let invalidSeen = false;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read ${dir}: ${message(error)}`);
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (extensionOf(entry.name) !== 'json') {
      continue;
    }
    let record: AdoptionRecord | null = null;
    try {
      let bytes: Buffer;
      try {
        bytes = fs.readFileSync(entryPath);
      } catch (error) {
        throw new Error(`read adoption record: ${message(error)}`);
      }
      let parsed: AdoptionRecord;
      try {
        parsed = JSON.parse(bytes.toString('utf8')) as AdoptionRecord;
      } catch (error) {
        throw new Error(`parse adoption record: ${message(error)}`);
      }
      validateRecord(parsed, canonical);
      record = parsed;
    } catch (error) {
      invalidSeen = true;
      const quarantineError = capture(() => quarantineInvalidRecord(entryPath));
      console.error(
        `dsh-desktop: preserving and quarantining invalid adoption record ${entryPath}: ${message(error)}${
          quarantineError === null ? '' : `; quarantine failed: ${quarantineError}`
        }`,
      );
    }
    if (record !== null) {
      records.push([entry.name, record]);
    }
  }
  if (records.length === 0) {
    return null;
  }
  const maxRevision = Math.max(...records.map(([, record]) => record.revision));
  const latest = records
    .filter(([, record]) => record.revision === maxRevision)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const popped = latest.pop();
  if (popped === undefined) {
    throw new Error('adoption record selection unexpectedly became empty');
  }
  const selected = popped[1];
  if (invalidSeen || latest.length > 0) {
    console.error(
      `dsh-desktop: ambiguous adoption history at revision ${maxRevision} for ${canonical}; requiring fresh consent`,
    );
    selected.status = 'consentRequired';
    selected.backup = null;
    selected.restoreSourceIdentity = null;
  }
  return selected;
}

function quarantineInvalidRecord(recordPath: string): void {
  const nonce = nextNonce();
  const fileName = path.basename(recordPath) || 'adoption-record.json';
  const quarantine = path.join(
    path.dirname(recordPath),
    `${fileName}.invalid-${process.pid}-${nonce}`,
  );
  try {
    fs.renameSync(recordPath, quarantine);
  } catch (error) {
    if (isNotFound(error)) {
      return;
    }
    throw new Error(`rename ${recordPath} to ${quarantine}: ${message(error)}`);
  }
}

export function startRecord(
  shellRoot: string,
  canonical: string,
  origin: AdoptionOrigin,
  consented: boolean,
  backup: BackupRef | null,
): AdoptionRecord {
  if (latestRecord(shellRoot, canonical) !== null) {
    throw new Error(`adoption state already exists for ${canonical}`);
  }
  const now = unixMillis();
  const record: AdoptionRecord = {
    schema: RECORD_SCHEMA,
    scope: CONSENT_SCOPE,
    revision: 1,
    dshHome: canonical,
    origin,
    status: 'adopting',
    consentedUnixMs: consented ? now : null,
    updatedUnixMs: now,
    backup,
    restoreSourceIdentity: null,
  };
  appendRecord(shellRoot, null, record);
  return record;
}

export function restartWithConsent(
  shellRoot: string,
  previous: AdoptionRecord,
  backup: BackupRef | null,
): AdoptionRecord {
  if (
    previous.status !== 'consentRequired' &&
    previous.status !== 'restored' &&
    previous.status !== 'restoreAbandoned'
  ) {
    throw new Error('current adoption state cannot request consent again');
  }
  const now = unixMillis();
  const record: AdoptionRecord = {
    ...previous,
    revision: nextRevision(previous),
    origin: 'existingHome',
    status: 'adopting',
    consentedUnixMs: now,
    updatedUnixMs: now,
    backup,
    restoreSourceIdentity: null,
  };
  appendRecord(shellRoot, previous, record);
  return record;
}

export function beginRestore(
  shellRoot: string,
  previous: AdoptionRecord,
  sourceIdentity: string,
): AdoptionRecord {
  if (previous.backup === null) {
    throw new Error('cannot restore without a verified profile backup');
  }
  const record: AdoptionRecord = {
    ...previous,
    revision: nextRevision(previous),
    status: 'restorePending',
    updatedUnixMs: unixMillis(),
    restoreSourceIdentity: sourceIdentity,
  };
  appendRecord(shellRoot, previous, record);
  return record;
}

export function transition(
  shellRoot: string,
  previous: AdoptionRecord,
  status: AdoptionStatus,
  backup: BackupRef | null,
): AdoptionRecord {
  const record: AdoptionRecord = {
    ...previous,
    revision: nextRevision(previous),
    status,
    updatedUnixMs: unixMillis(),
    backup,
  };
  if (status !== 'restored') {
    record.restoreSourceIdentity = null;
  }
  appendRecord(shellRoot, previous, record);
  return record;
}

export function createBackup(shellRoot: string, canonical: string): BackupRef {
  const source = path.join(canonical, 'profiles', 'web');
  if (!isDirectory(source)) {
    throw new Error(`cannot back up missing web profile: ${source}`);
  }
  const sourceBefore = webProfileIdentity(canonical);
  if (sourceBefore === null) {
    throw new Error('web profile disappeared before backup');
  }
  const createdUnixMs = unixMillis();
  const id = `${process.pid}-${createdUnixMs}-${nextNonce()}`;
  validateBackupId(id);
  const parent = backupParent(shellRoot, canonical);
  try {
    fs.mkdirSync(parent, { recursive: true });
  } catch (error) {
    throw new Error(`create backup directory ${parent}: ${message(error)}`);
  }
  const root = path.join(parent, id);
  const temp = path.join(parent, `.${id}.tmp`);
  if (pathExists(root) || pathExists(temp)) {
    throw new Error(`profile backup id already exists: ${id}`);
  }
  const tempProfile = path.join(temp, 'web');

  try {
    try {
      fs.mkdirSync(temp, { recursive: true });
    } catch (error) {
      throw new Error(`create backup staging ${temp}: ${message(error)}`);
    }
    copyProfileSnapshot(source, tempProfile);
    const snapshotIdentity = profileSnapshotIdentity(tempProfile);
    const sourceAfter = webProfileIdentity(canonical);
    if (sourceAfter === null) {
      throw new Error('web profile disappeared while backing it up');
    }
    if (sourceAfter !== sourceBefore) {
      throw new Error('web profile changed while creating the approved backup');
    }
    const manifest: BackupManifest = {
      schema: BACKUP_SCHEMA,
      scope: CONSENT_SCOPE,
      id,
      dshHome: canonical,
      sourceIdentity: sourceBefore,
      snapshotIdentity,
      createdUnixMs,
    };
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
    writeSynced(path.join(temp, 'manifest.json'), bytes);
    const checksum = bytesFingerprint(bytes);
    writeSynced(path.join(temp, '.ok'), Buffer.from(`${checksum}\n`));
    syncTree(temp);
    try {
      fs.renameSync(temp, root);
    } catch (error) {
      throw new Error(`publish profile backup ${temp} as ${root}: ${message(error)}`);
    }
    syncDirectory(parent);
    return {
      id,
      root,
      profile: path.join(root, 'web'),
      sourceIdentity: sourceBefore,
      snapshotIdentity,
      createdUnixMs,
    };
  } catch (error) {
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {
      // best effort
    }
    throw error;
  }
}

export function verifyBackup(
  shellRoot: string,
  canonical: string,
  backup: BackupRef,
): void {
  validateBackupId(backup.id);
  const expectedRoot = path.join(backupParent(shellRoot, canonical), backup.id);
  if (
    backup.root !== expectedRoot ||
    backup.profile !== path.join(expectedRoot, 'web')
  ) {
    throw new Error('profile backup path escapes the shell backup root');
  }
  const manifestPath = path.join(backup.root, 'manifest.json');
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(manifestPath);
  } catch (error) {
    throw new Error(`read profile backup manifest ${manifestPath}: ${message(error)}`);
  }
  let ok: string;
  try {
    ok = fs.readFileSync(path.join(backup.root, '.ok'), 'utf8');
  } catch (error) {
    throw new Error(`read profile backup completion marker: ${message(error)}`);
  }
  if (ok.trim() !== bytesFingerprint(bytes)) {
    throw new Error('profile backup completion checksum does not match its manifest');
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8')) as BackupManifest;
  } catch (error) {
    throw new Error(`parse profile backup manifest: ${message(error)}`);
  }
  if (
    manifest.schema !== BACKUP_SCHEMA ||
    manifest.scope !== CONSENT_SCOPE ||
    manifest.id !== backup.id ||
    manifest.dshHome !== canonical ||
    manifest.sourceIdentity !== backup.sourceIdentity ||
    manifest.snapshotIdentity !== backup.snapshotIdentity ||
    manifest.createdUnixMs !== backup.createdUnixMs
  ) {
    throw new Error('profile backup manifest does not match its adoption record');
  }
  const actual = profileSnapshotIdentity(backup.profile);
  if (actual !== backup.snapshotIdentity) {
    throw new Error('profile backup contents no longer match their manifest');
  }
}

export function currentProfileMatchesBackup(
  canonical: string,
  backup: BackupRef,
): boolean {
  const profile = path.join(canonical, 'profiles', 'web');
  if (!isDirectory(profile)) {
    return false;
  }
  return profileSnapshotIdentity(profile) === backup.snapshotIdentity;
}

export function cleanupStaleBackupStaging(
  shellRoot: string,
  canonical: string,
): void {
  const parent = backupParent(shellRoot, canonical);
  if (!isDirectory(parent)) {
    return;
  }
  const now = Date.now();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read ${parent}: ${message(error)}`);
  }
  for (const entry of entries) {
    const entryPath = path.join(parent, entry.name);
    if (
      !isDirectory(entryPath) ||
      !entry.name.startsWith('.') ||
      !entry.name.endsWith('.tmp')
    ) {
      continue;
    }
    let modified: number;
    try {
      modified = fs.lstatSync(entryPath).mtimeMs;
    } catch (error) {
      throw new Error(`inspect backup staging ${entryPath}: ${message(error)}`);
    }
    const stale = now - modified >= 24 * 60 * 60 * 1000;
    if (stale) {
      try {
        fs.rmSync(entryPath, { recursive: true, force: false });
      } catch (error) {
        throw new Error(
          `remove stale backup staging ${entryPath}: ${message(error)}`,
        );
      }
    }
  }
  syncDirectory(parent);
}

export function pruneOtherBackups(
  shellRoot: string,
  canonical: string,
  keep: BackupRef,
): void {
  const parent = backupParent(shellRoot, canonical);
  if (!isDirectory(parent)) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read ${parent}: ${message(error)}`);
  }
  for (const entry of entries) {
    if (entry.name === keep.id) {
      continue;
    }
    const entryPath = path.join(parent, entry.name);
    if (isDirectory(entryPath) && capture(() => validateBackupId(entry.name)) === null) {
      if (backupRootIsFullyValid(shellRoot, canonical, entryPath)) {
        try {
          fs.rmSync(entryPath, { recursive: true, force: false });
        } catch (error) {
          throw new Error(`remove superseded backup ${entryPath}: ${message(error)}`);
        }
      } else {
        console.error(
          `dsh-desktop: preserving unverifiable superseded backup ${entryPath}`,
        );
      }
    }
  }
  syncDirectory(parent);
}

function backupRootIsFullyValid(
  shellRoot: string,
  canonical: string,
  root: string,
): boolean {
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'),
    ) as BackupManifest;
  } catch {
    return false;
  }
  const backup: BackupRef = {
    id: manifest.id,
    root,
    profile: path.join(root, 'web'),
    sourceIdentity: manifest.sourceIdentity,
    snapshotIdentity: manifest.snapshotIdentity,
    createdUnixMs: manifest.createdUnixMs,
  };
  return capture(() => verifyBackup(shellRoot, canonical, backup)) === null;
}

export function backupDetails(backup: BackupRef): string {
  return backup.root;
}

interface RecordLock {
  release: () => void;
}

function acquireRecordLock(dir: string): RecordLock {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new Error(`create adoption record directory ${dir}: ${message(error)}`);
  }
  const lockPath = path.join(dir, RECORD_LOCK);
  const started = Date.now();
  for (;;) {
    let fd: number;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new Error(`create adoption append lock ${lockPath}: ${message(error)}`);
      }
      let stale = false;
      try {
        stale = Date.now() - fs.statSync(lockPath).mtimeMs >= RECORD_LOCK_STALE_MS;
      } catch {
        stale = false;
      }
      if (stale) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch (removeError) {
          if (isNotFound(removeError)) {
            continue;
          }
        }
      }
      if (Date.now() - started >= RECORD_LOCK_WAIT_MS) {
        throw new Error(
          `another Desktop process is updating adoption state for ${dir}`,
        );
      }
      sleepSync(20);
      continue;
    }
    try {
      fs.writeSync(fd, `${process.pid}\n`);
      fs.fsyncSync(fd);
    } catch (error) {
      fs.closeSync(fd);
      throw new Error(
        `initialize adoption append lock ${lockPath}: ${message(error)}`,
      );
    }
    return {
      release: () => {
        fs.closeSync(fd);
        try {
          fs.unlinkSync(lockPath);
        } catch (error) {
          console.error(
            `dsh-desktop: remove adoption append lock ${lockPath}: ${message(error)}`,
          );
        }
      },
    };
  }
}

function appendRecord(
  shellRoot: string,
  previous: AdoptionRecord | null,
  record: AdoptionRecord,
): void {
  validateRecord(record, record.dshHome);
  const dir = path.join(shellRoot, RECORDS_DIR, homeKey(record.dshHome));
  const lock = acquireRecordLock(dir);
  try {
    const latest = latestRecord(shellRoot, record.dshHome);
    const consistent =
      (previous === null && latest === null) ||
      (previous !== null && latest !== null && previous.revision === latest.revision);
    if (!consistent) {
      throw new Error(`adoption state changed concurrently for ${record.dshHome}`);
    }
    const status = statusSlug(record.status);
    const nonce = nextNonce();
    const stem = `${String(record.revision).padStart(20, '0')}-${status}-${process.pid}-${nonce}`;
    const finalPath = path.join(dir, `${stem}.json`);
    const temp = path.join(dir, `.${stem}.tmp`);
    const bytes = Buffer.from(JSON.stringify(record, null, 2));
    writeNewSynced(temp, bytes);
    try {
      fs.renameSync(temp, finalPath);
    } catch (error) {
      throw new Error(`publish adoption record ${finalPath}: ${message(error)}`);
    }
    syncDirectory(dir);
  } finally {
    lock.release();
  }
}

function statusSlug(status: AdoptionStatus): string {
  switch (status) {
    case 'adopting':
      return 'adopting';
    case 'active':
      return 'active';
    case 'consentRequired':
      return 'consent-required';
    case 'restorePending':
      return 'restore-pending';
    case 'restored':
      return 'restored';
    case 'restoreAbandoned':
      return 'restore-abandoned';
  }
}

function nextRevision(previous: AdoptionRecord): number {
  const revision = previous.revision + 1;
  if (!Number.isSafeInteger(revision)) {
    throw new Error('adoption revision overflow');
  }
  return revision;
}

function validateRecord(record: AdoptionRecord, canonical: string): void {
  if (
    record.schema !== RECORD_SCHEMA ||
    record.scope !== CONSENT_SCOPE ||
    record.dshHome !== canonical ||
    record.revision === 0
  ) {
    throw new Error('adoption record does not match this DSH_HOME or schema');
  }
  if (record.origin === 'existingHome' && record.consentedUnixMs === null) {
    throw new Error('existing-home adoption lacks user consent timestamp');
  }
  if (record.status === 'restorePending' && record.restoreSourceIdentity === null) {
    throw new Error('pending profile restore lacks its source identity');
  }
}

function isMeaningfulHomeEntry(name: string): boolean {
  return !['logs', '.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(name);
}

function readProfilePlugins(profile: string): string[] {
  const manifest = path.join(profile, 'package.json');
  if (!isFile(manifest)) {
    return [];
  }
  let text: string;
  try {
    text = fs.readFileSync(manifest, 'utf8');
  } catch (error) {
    throw new Error(`read web profile manifest ${manifest}: ${message(error)}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`parse web profile manifest ${manifest}: ${message(error)}`);
  }
  const dependencies = asObject(asObject(value)?.dependencies);
  if (dependencies === null) {
    return [];
  }
  return [...new Set(Object.keys(dependencies))].sort();
}

function countAgentPresets(root: string): number {
  if (!pathExists(root)) {
    return 0;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read agent presets ${root}: ${message(error)}`);
  }
  return entries.filter((entry) => isDirectory(path.join(root, entry.name))).length;
}

function canonicalHome(target: string): string {
  const absolute = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
  if (pathExists(absolute)) {
    try {
      return fs.realpathSync.native(absolute);
    } catch (error) {
      throw new Error(`resolve DSH_HOME ${absolute}: ${message(error)}`);
    }
  }

  let ancestor = absolute;
  const suffix: string[] = [];
  while (!pathExists(ancestor)) {
    const name = path.basename(ancestor);
    const parent = path.dirname(ancestor);
    if (name.length === 0 || parent === ancestor) {
      throw new Error(`DSH_HOME has no existing ancestor: ${absolute}`);
    }
    suffix.push(name);
    ancestor = parent;
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(ancestor);
  } catch (error) {
    throw new Error(`resolve DSH_HOME ancestor ${ancestor}: ${message(error)}`);
  }
  for (const component of suffix.reverse()) {
    resolved = path.join(resolved, component);
  }
  return resolved;
}

function backupParent(shellRoot: string, canonical: string): string {
  return path.join(shellRoot, BACKUPS_DIR, homeKey(canonical));
}

function homeKey(target: string): string {
  const digest = createHash('sha256');
  digest.update(Buffer.from('dsh-desktop-adoption-home-v1\0'));
  hashOsStr(digest, target);
  return digest.digest('hex');
}

function bytesFingerprint(bytes: Buffer): string {
  const digest = createHash('sha256');
  digest.update(Buffer.from('dsh-desktop-profile-backup-manifest-v1\0'));
  digest.update(u64le(bytes.length));
  digest.update(bytes);
  return digest.digest('hex');
}

function hashOsStr(digest: Hash, value: string): void {
  const bytes =
    process.platform === 'win32'
      ? Buffer.from(value, 'utf16le')
      : Buffer.from(value, 'utf8');
  digest.update(u64le(bytes.length));
  digest.update(bytes);
}

function validateBackupId(id: string): void {
  if (id.length > 0 && /^[0-9-]+$/.test(id)) {
    return;
  }
  throw new Error(`invalid profile backup id ${JSON.stringify(id)}`);
}

function unixMillis(): number {
  return Date.now();
}

function writeSynced(target: string, bytes: Buffer): void {
  let fd: number;
  try {
    fd = fs.openSync(target, 'w');
  } catch (error) {
    throw new Error(`create ${target}: ${message(error)}`);
  }
  try {
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    throw new Error(`write ${target}: ${message(error)}`);
  } finally {
    fs.closeSync(fd);
  }
}

function writeNewSynced(target: string, bytes: Buffer): void {
  let fd: number;
  try {
    fd = fs.openSync(target, 'wx');
  } catch (error) {
    throw new Error(`create ${target}: ${message(error)}`);
  }
  try {
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    throw new Error(`write ${target}: ${message(error)}`);
  } finally {
    fs.closeSync(fd);
  }
}

function syncTree(root: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new Error(`read ${root}: ${message(error)}`);
  }
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      syncTree(entryPath);
    } else if (entry.isFile()) {
      syncBackupFile(entryPath);
    }
  }
  syncDirectory(root);
}

function syncBackupFile(target: string): void {
  if (process.platform === 'win32') {
    // FlushFileBuffers needs write access; a read-only backup file is already
    // durable, so treat the permission failure as success.
    let fd: number;
    try {
      fd = fs.openSync(target, 'r+');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        return;
      }
      throw new Error(`open backup file ${target} for sync: ${message(error)}`);
    }
    try {
      fs.fsyncSync(fd);
    } catch (error) {
      throw new Error(`sync backup file ${target}: ${message(error)}`);
    } finally {
      fs.closeSync(fd);
    }
    return;
  }
  let fd: number;
  try {
    fd = fs.openSync(target, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    throw new Error(`sync backup file ${target}: ${message(error)}`);
  }
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

/** Dotfiles with a single leading dot have no extension. */
function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }
  return name.slice(dot + 1);
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
  BACKUPS_DIR,
  CONSENT_SCOPE,
  RECORDS_DIR,
  RECORD_LOCK,
  backupParent,
  homeKey,
};
