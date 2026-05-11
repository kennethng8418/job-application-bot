import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logSubmission, SubmissionLogEntry } from '../submission-logger';

function makeEntry(overrides: Partial<SubmissionLogEntry> = {}): SubmissionLogEntry {
  return {
    timestamp: '2026-05-11T14:30:00.000Z',
    company: 'TestCo',
    status: 'success',
    message: 'Application submitted successfully',
    jobUrl: 'https://jobs.ashbyhq.com/testco/abc',
    screenshotPath: './screenshots/success-TestCo.png',
    durationMs: 1234,
    errorDetails: null,
    ...overrides,
  };
}

function withTempCwd(fn: (tmpDir: string) => Promise<void> | void): () => Promise<void> {
  return async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sublog-'));
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await fn(tmpDir);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

test('creates logs/submissions.json when missing', withTempCwd(async (tmpDir) => {
  await logSubmission(makeEntry());
  const logPath = path.join(tmpDir, 'logs', 'submissions.json');
  assert.ok(fs.existsSync(logPath), 'log file should exist');
  const contents = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  assert.strictEqual(contents.length, 1);
  assert.strictEqual(contents[0].company, 'TestCo');
}));

test('appends to existing log array', withTempCwd(async (tmpDir) => {
  await logSubmission(makeEntry({ company: 'First' }));
  await logSubmission(makeEntry({ company: 'Second', status: 'error', errorDetails: 'oops' }));
  const logPath = path.join(tmpDir, 'logs', 'submissions.json');
  const contents = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  assert.strictEqual(contents.length, 2);
  assert.strictEqual(contents[0].company, 'First');
  assert.strictEqual(contents[1].company, 'Second');
  assert.strictEqual(contents[1].status, 'error');
}));

test('recovers from corrupt JSON file by starting fresh', withTempCwd(async (tmpDir) => {
  const logDir = path.join(tmpDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'submissions.json'), '{not json', 'utf-8');

  await logSubmission(makeEntry({ company: 'AfterCorruption' }));

  const contents = JSON.parse(fs.readFileSync(path.join(logDir, 'submissions.json'), 'utf-8'));
  assert.strictEqual(contents.length, 1);
  assert.strictEqual(contents[0].company, 'AfterCorruption');
}));

test('recovers when existing file is not an array', withTempCwd(async (tmpDir) => {
  const logDir = path.join(tmpDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'submissions.json'), '{"foo": "bar"}', 'utf-8');

  await logSubmission(makeEntry({ company: 'AfterNonArray' }));

  const contents = JSON.parse(fs.readFileSync(path.join(logDir, 'submissions.json'), 'utf-8'));
  assert.ok(Array.isArray(contents));
  assert.strictEqual(contents.length, 1);
  assert.strictEqual(contents[0].company, 'AfterNonArray');
}));

test('does not throw when write fails (read-only logs dir)', withTempCwd(async (tmpDir) => {
  const logDir = path.join(tmpDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.chmodSync(logDir, 0o555);
  try {
    await logSubmission(makeEntry());
    assert.ok(true);
  } finally {
    fs.chmodSync(logDir, 0o755);
  }
}));
