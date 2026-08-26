import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  __internals,
  beginRestore,
  createBackup,
  currentProfileMatchesBackup,
  inspectHome,
  latestRecord,
  restartWithConsent,
  startRecord,
  transition,
  verifyBackup,
} from './profile-adoption.js';

const { RECORDS_DIR, RECORD_LOCK, homeKey } = __internals;

function scratch(name: string): { shell: string; home: string } {
  const root = path.join(
    os.tmpdir(),
    `dsh-desktop-profile-adoption-${process.pid}-${name}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
  const shell = path.join(root, 'shell');
  const home = path.join(root, 'home');
  fs.mkdirSync(shell, { recursive: true });
  fs.mkdirSync(path.join(home, 'profiles/web/node_modules'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'profiles/web/package.json'),
    '{"dependencies":{"custom-plugin":"link:custom"}}\n',
  );
  fs.writeFileSync(path.join(home, 'profiles/web/pnpm-lock.yaml'), 'lock\n');
  fs.writeFileSync(
    path.join(home, 'profiles/web/pnpm-workspace.yaml'),
    'packages:\n  - .\n',
  );
  fs.writeFileSync(path.join(home, 'profiles/web/cordis.patch.yml'), '[]\n');
  fs.writeFileSync(path.join(home, 'profiles/web/node_modules/installed'), 'ignored\n');
  return { shell, home };
}

function cleanup(shell: string): void {
  fs.rmSync(path.dirname(shell), { recursive: true, force: true });
}

function failure(body: () => void): string {
  try {
    body();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new assert.AssertionError({ message: 'expected a failure' });
}

function jsonRecords(dir: string): string[] {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
}

test('inspection ignores platform noise in an otherwise empty home', () => {
  const root = path.join(os.tmpdir(), `dsh-desktop-profile-adoption-${process.pid}-noise`);
  fs.rmSync(root, { recursive: true, force: true });
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(home, '.DS_Store'), 'noise');
  fs.writeFileSync(path.join(home, 'Thumbs.db'), 'noise');
  const summary = inspectHome(home);
  assert.ok(!summary.hasExistingData);
  fs.rmSync(root, { recursive: true, force: true });
});

test('inspection counts plugins and agent presets', () => {
  const { shell, home } = scratch('inspect');
  fs.mkdirSync(path.join(home, '.agent-presets/one'), { recursive: true });
  fs.mkdirSync(path.join(home, '.agent-presets/two'), { recursive: true });
  const summary = inspectHome(home);
  assert.ok(summary.hasExistingData);
  assert.ok(summary.hasWebProfile);
  assert.deepEqual(summary.plugins, ['custom-plugin']);
  assert.equal(summary.agentPresetCount, 2);
  cleanup(shell);
});

test('backup is complete and excludes rebuildable node_modules', () => {
  const { shell, home } = scratch('backup');
  const canonical = fs.realpathSync.native(home);
  const backup = createBackup(shell, canonical);
  verifyBackup(shell, canonical, backup);
  assert.ok(fs.statSync(path.join(backup.profile, 'package.json')).isFile());
  assert.ok(!fs.existsSync(path.join(backup.profile, 'node_modules')));
  assert.ok(currentProfileMatchesBackup(canonical, backup));
  fs.writeFileSync(path.join(home, 'profiles/web/package.json'), '{}\n');
  assert.ok(!currentProfileMatchesBackup(canonical, backup));
  cleanup(shell);
});

test('append-only records preserve consent and transitions', () => {
  const { shell, home } = scratch('records');
  const canonical = fs.realpathSync.native(home);
  const backup = createBackup(shell, canonical);
  const adopting = startRecord(shell, canonical, 'existingHome', true, backup);
  const pending = beginRestore(shell, adopting, 'current-profile');
  assert.equal(pending.restoreSourceIdentity, 'current-profile');
  const restored = transition(shell, pending, 'restored', backup);
  assert.deepEqual(latestRecord(shell, canonical), restored);
  assert.equal(
    fs.readdirSync(path.join(shell, RECORDS_DIR, homeKey(canonical))).length,
    3,
  );
  cleanup(shell);
});

test('invalid and duplicate records recover through fresh consent', () => {
  const { shell, home } = scratch('record-recovery');
  const canonical = fs.realpathSync.native(home);
  const adopting = startRecord(shell, canonical, 'freshHome', false, null);
  const dir = path.join(shell, RECORDS_DIR, homeKey(canonical));
  fs.writeFileSync(path.join(dir, 'broken.json'), 'not-json\n');
  let recovered = latestRecord(shell, canonical);
  assert.ok(recovered !== null);
  assert.equal(recovered.status, 'consentRequired');
  assert.equal(recovered.revision, adopting.revision);
  assert.ok(!fs.existsSync(path.join(dir, 'broken.json')));
  assert.deepEqual(latestRecord(shell, canonical), adopting);

  const original = jsonRecords(dir).find((name) => name !== 'broken.json');
  assert.ok(original !== undefined);
  fs.copyFileSync(path.join(dir, original), path.join(dir, 'duplicate.json'));
  recovered = latestRecord(shell, canonical);
  assert.ok(recovered !== null);
  assert.equal(recovered.status, 'consentRequired');
  assert.equal(recovered.backup, null);
  cleanup(shell);
});

// The Rust suite proves this with three threads. Node's single-threaded test
// runner covers the same two gates separately: the cross-process append lock
// and the compare-and-swap on the latest revision.
test('a held append lock rejects a concurrent transition', () => {
  const { shell, home } = scratch('record-lock');
  const canonical = fs.realpathSync.native(home);
  const adopting = startRecord(shell, canonical, 'freshHome', false, null);
  const dir = path.join(shell, RECORDS_DIR, homeKey(canonical));
  fs.writeFileSync(path.join(dir, RECORD_LOCK), '1\n');
  assert.match(
    failure(() => transition(shell, adopting, 'active', null)),
    /another Desktop process is updating adoption state/,
  );
  fs.unlinkSync(path.join(dir, RECORD_LOCK));
  assert.equal(jsonRecords(dir).length, 1);
  cleanup(shell);
});

test('compare-and-swap rejects a second transition from the same revision', () => {
  const { shell, home } = scratch('record-cas');
  const canonical = fs.realpathSync.native(home);
  const adopting = startRecord(shell, canonical, 'freshHome', false, null);
  transition(shell, adopting, 'active', null);
  assert.match(
    failure(() => transition(shell, adopting, 'consentRequired', null)),
    /adoption state changed concurrently/,
  );
  const dir = path.join(shell, RECORDS_DIR, homeKey(canonical));
  assert.equal(jsonRecords(dir).length, 2);
  cleanup(shell);
});

test('restored adoption requires fresh consent and backup', () => {
  const { shell, home } = scratch('restart-after-restore');
  const canonical = fs.realpathSync.native(home);
  const firstBackup = createBackup(shell, canonical);
  const adopting = startRecord(shell, canonical, 'existingHome', true, firstBackup);
  assert.match(
    failure(() => restartWithConsent(shell, adopting, null)),
    /cannot request consent again/,
  );
  const restored = transition(shell, adopting, 'restored', firstBackup);
  const secondBackup = createBackup(shell, canonical);
  const restarted = restartWithConsent(shell, restored, secondBackup);
  assert.equal(restarted.status, 'adopting');
  assert.equal(restarted.origin, 'existingHome');
  assert.ok(restarted.consentedUnixMs !== null);
  assert.deepEqual(restarted.backup, secondBackup);
  cleanup(shell);
});

test('backup never copies sibling home data', () => {
  const { shell, home } = scratch('scope');
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(home, 'sessions/user.jsonl'), 'private-session\n');
  fs.mkdirSync(path.join(home, '.agent-presets/private'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agent-presets/private/cordis.yml'), '[]\n');
  const canonical = fs.realpathSync.native(home);
  const backup = createBackup(shell, canonical);
  assert.ok(!fs.existsSync(path.join(backup.root, 'sessions')));
  assert.ok(!fs.existsSync(path.join(backup.root, '.agent-presets')));
  assert.equal(
    fs.readFileSync(path.join(home, 'sessions/user.jsonl'), 'utf8'),
    'private-session\n',
  );
  cleanup(shell);
});

test('tampered backup fails verification', () => {
  const { shell, home } = scratch('tamper');
  const canonical = fs.realpathSync.native(home);
  const backup = createBackup(shell, canonical);
  fs.writeFileSync(path.join(backup.profile, 'package.json'), '{}\n');
  assert.match(failure(() => verifyBackup(shell, canonical, backup)), /contents/);
  cleanup(shell);
});
