'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createApp } = require('../src/app');
const realmService = require('../src/realmService');
const { buildFixtureRealm } = require('./fixtures/buildFixture');

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function fakeLogger() {
  const lines = [];
  return {
    lines,
    info: (msg) => lines.push({ level: 'info', msg }),
    error: (msg) => lines.push({ level: 'error', msg }),
  };
}

test('createApp: log moi request/response, khong bao gio ghi encryptionKeyHex ra log', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const logger = fakeLogger();
  const app = createApp({ logger });
  const server = await startServer(app);
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    realmService.closeRealm();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex }),
  });

  const openLog = logger.lines.find((l) => l.msg.includes('/api/open') && l.msg.includes('-> 200'));
  assert.ok(openLog, 'expected an info log line for the successful open');
  assert.equal(openLog.level, 'info');
  assert.ok(!openLog.msg.includes(encryptionKeyHex), 'the real key must never reach the log');
  assert.ok(openLog.msg.includes('[REDACTED]'), 'encryptionKeyHex should be redacted, not just missing');

  await fetch(`${base}/api/objects/Person`);
  const listLog = logger.lines.find((l) => l.msg.includes('GET /api/objects/Person'));
  assert.ok(listLog, 'expected a log line for the list request');
  assert.equal(listLog.level, 'info');

  // Wrong key for the same already-open path still goes through a real
  // open attempt (see realmService.openRealm) and should log at error level
  // with the actual realm-core message - the whole point of this feature.
  const wrongRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex: '00'.repeat(64) }),
  });
  const wrongBody = await wrongRes.json();
  const errorLog = logger.lines.find((l) => l.level === 'error' && l.msg.includes('/api/open'));
  assert.ok(errorLog, 'expected an error log line for the failed open');
  assert.ok(errorLog.msg.includes(wrongBody.error), 'error log should include the real error message');
  assert.ok(!errorLog.msg.includes('00'.repeat(64)), 'the wrong key itself must never reach the log either');
});

test('createApp: khong truyen logger van hoat dong binh thuong (no-op logger)', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const app = createApp();
  const server = await startServer(app);
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    realmService.closeRealm();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const res = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex }),
  });
  const body = await res.json();
  assert.equal(body.ok, true);
});
