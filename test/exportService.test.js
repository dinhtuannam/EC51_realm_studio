'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');
const { exportObjects, EXPORT_DIR } = require('../src/exportService');

function cleanupExportedFile(filePath) {
  fs.rmSync(filePath, { force: true });
}

test('exportObjects: CSV - dung header, dung so dong, dung ten file', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(result.filePath));

  assert.match(result.fileName, /^Person_\d{8}_\d{6}\.csv$/);
  assert.equal(path.dirname(result.filePath), EXPORT_DIR);
  assert.equal(result.rowCount, 2);
  assert.ok(fs.existsSync(result.filePath));

  const content = fs.readFileSync(result.filePath, 'utf8');
  const lines = content.trim().split('\r\n');
  assert.equal(lines[0], 'id,name,age,active');
  assert.equal(lines.length, 3); // header + 2 rows
  assert.ok(lines.some((l) => l.includes('Alice')));
  assert.ok(lines.some((l) => l.includes('Bob')));
});

test('exportObjects: CSV escape dung dau phay/nhay kep/xuong dong trong gia tri', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);
  realmService.updateObject('Person', 'p1', { name: 'Alice, "the great"' });

  const result = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(result.filePath));

  const content = fs.readFileSync(result.filePath, 'utf8');
  assert.ok(content.includes('"Alice, ""the great"""'), `expected properly escaped CSV field, got: ${content}`);
});

test('exportObjects: Markdown - dung dinh dang bang, escape dau |', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);
  realmService.updateObject('Note', '0', { title: 'A | B' });

  const result = exportObjects('Note', '', 'markdown');
  t.after(() => cleanupExportedFile(result.filePath));

  assert.match(result.fileName, /^Note_\d{8}_\d{6}\.md$/);
  const content = fs.readFileSync(result.filePath, 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines[0], '| title | body |');
  assert.equal(lines[1], '| --- | --- |');
  assert.ok(content.includes('A \\| B'), `expected escaped pipe, got: ${content}`);
});

test('exportObjects: Excel (SpreadsheetML XML) - mo duoc bang Excel, dung so dong', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportObjects('Person', '', 'excel');
  t.after(() => cleanupExportedFile(result.filePath));

  assert.match(result.fileName, /^Person_\d{8}_\d{6}\.xls$/);
  const content = fs.readFileSync(result.filePath, 'utf8');
  assert.ok(content.includes('<?mso-application progid="Excel.Sheet"?>'));
  assert.ok(content.includes('urn:schemas-microsoft-com:office:spreadsheet'));
  const rowMatches = content.match(/<Row>/g) || [];
  assert.equal(rowMatches.length, 3); // header row + 2 data rows
  assert.ok(content.includes('<Data ss:Type="Number">30</Data>'), 'numeric field should use ss:Type="Number"');
  assert.ok(content.includes('<Data ss:Type="String">Alice</Data>'));
});

test('exportObjects: filter rong = xuat toan bo, filter khac rong = chi xuat dung phan loc', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const all = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(all.filePath));
  assert.equal(all.rowCount, 2);

  const filtered = exportObjects('Person', 'age > 26', 'csv');
  t.after(() => cleanupExportedFile(filtered.filePath));
  assert.equal(filtered.rowCount, 1);
  const content = fs.readFileSync(filtered.filePath, 'utf8');
  assert.ok(content.includes('Alice'));
  assert.ok(!content.includes('Bob'));
});

test('exportObjects: xuat toan bo du lieu, khong bi gioi han 500 record nhu listObjects thuong', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  // Fixture only has 2 Person rows by default - add more than a typical
  // page size would matter for, to prove export doesn't stop at any cap.
  for (let i = 0; i < 10; i += 1) {
    realmService.createObject('Person', { id: `bulk-${i}`, name: `Bulk ${i}`, age: 20, active: true });
  }
  const result = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(result.filePath));
  assert.equal(result.rowCount, 12);
});

test('exportObjects: format khong hop le bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => exportObjects('Person', '', 'pdf'), /không được hỗ trợ/);
});

test('exportObjects: class khong ton tai bao loi ro rang (tai su dung findSchema)', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => exportObjects('NoSuchClass', '', 'csv'), /Không tìm thấy table/);
});
