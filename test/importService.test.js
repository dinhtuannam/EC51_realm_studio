'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');
const { exportObjects } = require('../src/exportService');
const { importCsv, importMarkdown, parseCsv, parseMarkdownTable } = require('../src/importService');

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
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', 'id,name,age,active\np3,Carol,40,true\np4,Dave,22,false\n', 'append');
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
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', 'id,name,age,active\np3,Carol,40,true\n', 'overwrite');
  assert.equal(result.insertedCount, 1);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 1, 'overwrite must remove the original p1/p2');
  assert.equal(rows[0].id, 'p3');
  assert.ok(!rows.some((r) => r.id === 'p1'), 'original p1 must be gone after overwrite');
});

test('importCsv: cot CSV thua bi bo qua (bao cao trong skippedColumns), khong lam loi import', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Person', 'id,name,age,active,extra_col\np3,Eve,18,true,ignored\n', 'append');
  assert.deepEqual(result.skippedColumns, ['extra_col']);
  const eve = realmService.listObjects('Person', '').rows.find((r) => r.id === 'p3');
  assert.equal(eve.name, 'Eve');
});

test('importCsv: cot table thieu trong CSV duoc de gia tri mac dinh theo type', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  importCsv('Person', 'id,name\np3,Frank\n', 'append');
  const frank = realmService.listObjects('Person', '').rows.find((r) => r.id === 'p3');
  assert.equal(frank.age, 0, 'missing int column should default to 0, not crash');
  assert.equal(frank.active, false, 'missing bool column should default to false');
});

test('importCsv: CSV khong co cot primary key -> tu sinh id tang dan', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  importCsv('Person', 'name,age,active\nGrace,25,true\nHenry,30,false\n', 'append');
  const rows = realmService.listObjects('Person', '').rows;
  const grace = rows.find((r) => r.name === 'Grace');
  const henry = rows.find((r) => r.name === 'Henry');
  assert.ok(grace && henry);
  assert.notEqual(grace.id, henry.id, 'auto-generated ids must be unique from each other');
  assert.match(grace.id, /^\d+$/, 'auto-generated id should be a plain incrementing number-as-string for a String PK');
});

test('importCsv: gia tri primary key trong CSV trung voi record co san -> tu sinh id moi, KHONG ghi de record cu', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  // 'p1' already exists (Alice) - this row must NOT overwrite it.
  const result = importCsv('Person', 'id,name,age,active\np1,ShouldNotOverwrite,99,true\n', 'append');
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
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const csv = 'id,name,age,active\n'
    + 'dup,First,1,true\n'
    + 'dup,Second,2,true\n'
    + 'dup,Third,3,true\n';
  const result = importCsv('Person', csv, 'overwrite');
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
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = importCsv('Note', 'title,body\nHello,World\n', 'append');
  assert.equal(result.insertedCount, 1);
  const rows = realmService.listObjects('Note', '').rows;
  assert.equal(rows.length, 3); // 2 original + 1 imported
});

test('importCsv: che do khong hop le / thieu noi dung CSV -> bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => importCsv('Person', 'id,name\np1,X\n', 'merge'), /không hợp lệ/);
  assert.throws(() => importCsv('Person', '', 'append'), /Thiếu nội dung/);
});

test('importCsv: class khong ton tai bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => importCsv('NoSuchClass', 'a,b\n1,2\n', 'append'), /Không tìm thấy table/);
});

test('parseMarkdownTable: dung dinh dang bang cua exportService, unescape dau | trong gia tri', () => {
  const md = '| id | name |\n| --- | --- |\n| p1 | Alice \\| Bob |\n';
  const { headers, records } = parseMarkdownTable(md);
  assert.deepEqual(headers, ['id', 'name']);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'p1');
  assert.equal(records[0].name, 'Alice | Bob', 'phai unescape \\| thanh | that');
});

test('parseMarkdownTable: file rong tra ve headers/records rong, khong loi', () => {
  assert.deepEqual(parseMarkdownTable(''), { headers: [], records: [] });
});

test('parseMarkdownTable: chi co header + divider, khong co dong du lieu nao', () => {
  const md = '| id | name |\n| --- | --- |\n';
  assert.deepEqual(parseMarkdownTable(md), { headers: ['id', 'name'], records: [] });
});

test('importMarkdown: append - giu lai du lieu cu, them record moi tu Markdown', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const md = '| id | name | age | active |\n| --- | --- | --- | --- |\n'
    + '| p3 | Carol | 40 | true |\n| p4 | Dave | 22 | false |\n';
  const result = importMarkdown('Person', md, 'append');
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

test('importMarkdown: overwrite - xoa toan bo du lieu cu, chi con du lieu tu Markdown', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const md = '| id | name | age | active |\n| --- | --- | --- | --- |\n| p3 | Carol | 40 | true |\n';
  const result = importMarkdown('Person', md, 'overwrite');
  assert.equal(result.insertedCount, 1);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 1, 'overwrite must remove the original p1/p2');
  assert.equal(rows[0].id, 'p3');
});

test('importMarkdown: cot Markdown thua bi bo qua, cot table thieu duoc mac dinh - dung chung logic voi CSV', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const md = '| id | name | extra_col |\n| --- | --- | --- |\n| p3 | Eve | ignored |\n';
  const result = importMarkdown('Person', md, 'append');
  assert.deepEqual(result.skippedColumns, ['extra_col']);
  const eve = realmService.listObjects('Person', '').rows.find((r) => r.id === 'p3');
  assert.equal(eve.name, 'Eve');
  assert.equal(eve.age, 0, 'missing int column (age) should default to 0');
  assert.equal(eve.active, false, 'missing bool column (active) should default to false');
});

test('importMarkdown: gia tri primary key trung voi record co san -> tu sinh id moi, KHONG ghi de record cu', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const md = '| id | name | age | active |\n| --- | --- | --- | --- |\n| p1 | ShouldNotOverwrite | 99 | true |\n';
  const result = importMarkdown('Person', md, 'append');
  assert.equal(result.insertedCount, 1);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 3, 'a new record must be added, not merged into the colliding one');
  const originalP1 = rows.find((r) => r.id === 'p1');
  assert.equal(originalP1.name, 'Alice', 'the ORIGINAL p1 (Alice) must remain untouched');
  const newRecord = rows.find((r) => r.name === 'ShouldNotOverwrite');
  assert.ok(newRecord, 'the colliding row must still be imported, just under a different id');
  assert.notEqual(newRecord.id, 'p1');
});

test('importMarkdown: class khong co primaryKey van import binh thuong, khong co logic PK', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const md = '| title | body |\n| --- | --- |\n| Hello | World |\n';
  const result = importMarkdown('Note', md, 'append');
  assert.equal(result.insertedCount, 1);
  const rows = realmService.listObjects('Note', '').rows;
  assert.equal(rows.length, 3); // 2 original + 1 imported
});

test('importMarkdown: che do khong hop le / thieu noi dung Markdown -> bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => importMarkdown('Person', '| id |\n| --- |\n| p1 |\n', 'merge'), /không hợp lệ/);
  assert.throws(() => importMarkdown('Person', '', 'append'), /Thiếu nội dung/);
});

test('importMarkdown: class khong ton tai bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => importMarkdown('NoSuchClass', '| a |\n| --- |\n| 1 |\n', 'append'), /Không tìm thấy table/);
});

test('Round-trip: export mot table ra Markdown roi import lai (overwrite) phai ra dung du lieu ban dau', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const exported = exportObjects('Person', '', 'markdown');
  t.after(() => fs.rmSync(exported.filePath, { force: true }));
  const markdownContent = fs.readFileSync(exported.filePath, 'utf8');

  // "Overwrite" chinh table nguon bang du lieu vua export ra tu no - phai
  // giu nguyen 2 record ban dau (id/name/age/active y het truoc khi export).
  const result = importMarkdown('Person', markdownContent, 'overwrite');
  assert.equal(result.insertedCount, 2);

  const rows = realmService.listObjects('Person', '').rows;
  assert.equal(rows.length, 2);
  const alice = rows.find((r) => r.id === 'p1');
  assert.equal(alice.name, 'Alice');
  assert.equal(alice.age, 30);
  assert.equal(alice.active, true);
  const bob = rows.find((r) => r.id === 'p2');
  assert.equal(bob.name, 'Bob');
  assert.equal(bob.age, 25);
  assert.equal(bob.active, false);
});
