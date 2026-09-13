'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');
const { importCsv, parseCsv } = require('../src/importService');

function writeTempCsv(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-import-test-'));
  const filePath = path.join(dir, 'import.csv');
  fs.writeFileSync(filePath, content, 'utf8');
  return { filePath, dir };
}

test('parseCsv: quoted field co dau phay, xuong dong, va escape dau nhay kep', () => {
  const csv = 'id,name\n' + 'p1,"Alice, ""the great"""\n' + 'p2,"multi\nline"\n';
  const { headers, records } = parseCsv(csv);
  assert.deepEqual(headers, ['id', 'name']);
  assert.equal(records.length, 2);
  assert.equal(records[0].name, 'Alice, "the great"');
  assert.equal(records[1].name, 'multi\nline');
});

test('parseCsv: file rong tra ve headers/records rong, khong loi', () => {
  assert.deepEqual(parseCsv(''), { headers: [], records: [] });
});

test('importCsv: append - giu lai du lieu cu, them record moi tu CSV', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('id,name,age,active\np3,Carol,40,true\np4,Dave,22,false\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', csvPath, 'append');
  assert.equal(result.insertedCount, 2);
  assert.equal(result.mode, 'append');
  assert.deepEqual(result.skippedColumns, []);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 4, 'original p1/p2 must still be present alongside the 2 new rows');
  const carol = rows.find((r) => r.id === 'p3');
  assert.equal(carol.name, 'Carol');
  assert.equal(carol.age, 40);
  assert.equal(carol.active, true);
  assert.ok(rows.some((r) => r.id === 'p1'), 'pre-existing p1 must be untouched');
});

test('importCsv: overwrite - xoa toan bo du lieu cu, chi con du lieu tu CSV', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('id,name,age,active\np3,Carol,40,true\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', csvPath, 'overwrite');
  assert.equal(result.insertedCount, 1);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 1, 'overwrite must remove the original p1/p2');
  assert.equal(rows[0].id, 'p3');
  assert.ok(!rows.some((r) => r.id === 'p1'), 'original p1 must be gone after overwrite');
});

test('importCsv: cot CSV thua bi bo qua (bao cao trong skippedColumns), khong lam loi import', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('id,name,age,active,extra_col\np3,Eve,18,true,ignored\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', csvPath, 'append');
  assert.deepEqual(result.skippedColumns, ['extra_col']);
  const eve = realmService.listObjects('Person', '').rows.find((r) => r.id === 'p3');
  assert.equal(eve.name, 'Eve');
});

test('importCsv: cot table thieu trong CSV duoc de gia tri mac dinh theo type', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('id,name\np3,Frank\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  importCsv('Person', csvPath, 'append');
  const frank = realmService.listObjects('Person', '').rows.find((r) => r.id === 'p3');
  assert.equal(frank.age, 0, 'missing int column should default to 0, not crash');
  assert.equal(frank.active, false, 'missing bool column should default to false');
});

test('importCsv: CSV khong co cot primary key -> tu sinh id tang dan', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('name,age,active\nGrace,25,true\nHenry,30,false\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  importCsv('Person', csvPath, 'append');
  const rows = realmService.listObjects('Person', '').rows;
  const grace = rows.find((r) => r.name === 'Grace');
  const henry = rows.find((r) => r.name === 'Henry');
  assert.ok(grace && henry);
  assert.notEqual(grace.id, henry.id, 'auto-generated ids must be unique from each other');
  assert.match(grace.id, /^\d+$/, 'auto-generated id should be a plain incrementing number-as-string for a String PK');
});

test('importCsv: gia tri primary key trong CSV trung voi record co san -> tu sinh id moi, KHONG ghi de record cu', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  // 'p1' already exists (Alice) - this row must NOT overwrite it.
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('id,name,age,active\np1,ShouldNotOverwrite,99,true\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', csvPath, 'append');
  assert.equal(result.insertedCount, 1);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 3, 'a new record must be added, not merged into the colliding one');
  const originalP1 = rows.find((r) => r.id === 'p1');
  assert.equal(originalP1.name, 'Alice', 'the ORIGINAL p1 (Alice) must remain untouched');
  const newRecord = rows.find((r) => r.name === 'ShouldNotOverwrite');
  assert.ok(newRecord, 'the colliding row must still be imported, just under a different id');
  assert.notEqual(newRecord.id, 'p1');
});

test('importCsv: 3 dong CSV cung 1 gia tri id -> chi dong dau giu id do, 2 dong sau tu sinh id rieng', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv(
    'id,name,age,active\n'
    + 'dup,First,1,true\n'
    + 'dup,Second,2,true\n'
    + 'dup,Third,3,true\n'
  );
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', csvPath, 'overwrite');
  assert.equal(result.insertedCount, 3);
  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 3);
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, 3, 'all 3 imported rows must end up with distinct ids');
  assert.ok(ids.includes('dup'), 'the first row should keep the CSV-provided id');
  const first = rows.find((r) => r.id === 'dup');
  assert.equal(first.name, 'First');
});

test('importCsv: class khong co primaryKey van import binh thuong, khong co logic PK', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('title,body\nHello,World\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Note', csvPath, 'append');
  assert.equal(result.insertedCount, 1);
  const rows = realmService.listObjects('Note', '').rows;
  assert.equal(rows.length, 3); // 2 original + 1 imported
});

test('importCsv: che do khong hop le / thieu file path / doc file loi -> bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => importCsv('Person', '/tmp/x.csv', 'merge'), /không hợp lệ/);
  assert.throws(() => importCsv('Person', '', 'append'), /Thiếu đường dẫn/);
  assert.throws(() => importCsv('Person', '/no/such/file/x.csv', 'append'), /Không đọc được file/);
});

test('importCsv: class khong ton tai bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const { filePath: csvPath, dir: csvDir } = writeTempCsv('a,b\n1,2\n');
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => importCsv('NoSuchClass', csvPath, 'append'), /Không tìm thấy table/);
});
