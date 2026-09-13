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

test('HTTP API end-to-end: open, schema, CRUD qua HTTP that su', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const app = createApp();
  const server = await startServer(app);
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    realmService.closeRealm();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const openRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex }),
  });
  const openBody = await openRes.json();
  assert.equal(openRes.status, 200);
  assert.equal(openBody.ok, true);
  assert.ok(openBody.data.schema.some((s) => s.name === 'Person'));

  const listRes = await fetch(`${base}/api/objects/Person`);
  const listBody = await listRes.json();
  assert.equal(listBody.data.total, 2);

  const countRes = await fetch(`${base}/api/objects/Person/count`);
  const countBody = await countRes.json();
  assert.equal(countRes.status, 200);
  assert.equal(countBody.data.total, 2);

  const createRes = await fetch(`${base}/api/objects/Person`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p3', name: 'Carol', age: '40', active: true }),
  });
  const createBody = await createRes.json();
  assert.equal(createBody.ok, true);
  assert.equal(createBody.data.name, 'Carol');

  const updateRes = await fetch(`${base}/api/objects/Person/p3`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Carol Updated' }),
  });
  const updateBody = await updateRes.json();
  assert.equal(updateBody.data.name, 'Carol Updated');

  const deleteRes = await fetch(`${base}/api/objects/Person/p3`, { method: 'DELETE' });
  const deleteBody = await deleteRes.json();
  assert.equal(deleteBody.ok, true);

  const wrongOpenRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex: '00'.repeat(64) }),
  });
  const wrongOpenBody = await wrongOpenRes.json();
  assert.equal(wrongOpenRes.status, 500);
  assert.equal(wrongOpenBody.ok, false);
  assert.ok(wrongOpenBody.error.length > 0);
});
