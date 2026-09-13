'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const realmService = require('../src/realmService');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const { EXPORT_DIR } = require('../src/exportService');

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

  const page1Res = await fetch(`${base}/api/objects/Person?limit=1&offset=0`);
  const page1Body = await page1Res.json();
  assert.equal(page1Body.data.returned, 1);
  assert.equal(page1Body.data.offset, 0);

  const page2Res = await fetch(`${base}/api/objects/Person?limit=1&offset=1`);
  const page2Body = await page2Res.json();
  assert.equal(page2Body.data.returned, 1);
  assert.equal(page2Body.data.offset, 1);
  assert.notEqual(page1Body.data.rows[0].__ref, page2Body.data.rows[0].__ref);

  const countRes = await fetch(`${base}/api/objects/Person/count`);
  const countBody = await countRes.json();
  assert.equal(countRes.status, 200);
  assert.equal(countBody.data.total, 2);

  const exportRes = await fetch(`${base}/api/objects/Person/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: '', format: 'csv' }),
  });
  const exportBody = await exportRes.json();
  assert.equal(exportRes.status, 200);
  assert.equal(exportBody.ok, true);
  assert.equal(exportBody.data.rowCount, 2);
  const exportedPath = require('path').join(EXPORT_DIR, exportBody.data.fileName);
  assert.ok(fs.existsSync(exportedPath), 'exported file should actually exist on disk');
  fs.rmSync(exportedPath, { force: true });

  const badFormatRes = await fetch(`${base}/api/objects/Person/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: '', format: 'pdf' }),
  });
  const badFormatBody = await badFormatRes.json();
  assert.equal(badFormatRes.status, 400);
  assert.equal(badFormatBody.ok, false);

  const csvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-e2e-import-'));
  const csvPath = path.join(csvDir, 'import.csv');
  fs.writeFileSync(csvPath, 'id,name,age,active\np9,Zed,50,true\n', 'utf8');
  const importRes = await fetch(`${base}/api/objects/Person/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath: csvPath, mode: 'append' }),
  });
  const importBody = await importRes.json();
  assert.equal(importRes.status, 200);
  assert.equal(importBody.ok, true);
  assert.equal(importBody.data.insertedCount, 1);
  const afterImportRes = await fetch(`${base}/api/objects/Person`);
  const afterImportBody = await afterImportRes.json();
  assert.equal(afterImportBody.data.total, 3, 'the imported row must be visible alongside the original 2');

  // Mode is validated before the file is even read, so this still returns a
  // clean 400 rather than a file-not-found error.
  const badModeRes = await fetch(`${base}/api/objects/Person/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath: csvPath, mode: 'merge' }),
  });
  const badModeBody = await badModeRes.json();
  assert.equal(badModeRes.status, 400);
  assert.equal(badModeBody.ok, false);
  fs.rmSync(csvDir, { recursive: true, force: true });

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
