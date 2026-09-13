'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');

test('openRealm: sai key bao loi, dung key tra ve schema dung', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const wrongKeyHex = '00'.repeat(64);
  await assert.rejects(() => realmService.openRealm(filePath, wrongKeyHex));

  const { schema } = await realmService.openRealm(filePath, encryptionKeyHex);
  const names = schema.map((s) => s.name).sort();
  assert.deepEqual(names, ['Note', 'Person']);

  const personSchema = schema.find((s) => s.name === 'Person');
  assert.equal(personSchema.primaryKey, 'id');

  const noteSchema = schema.find((s) => s.name === 'Note');
  assert.equal(noteSchema.primaryKey, null);
});

test('openRealm: mo lai that bai khong duoc lam mat file dang mo hop le', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await realmService.openRealm(filePath, encryptionKeyHex);
  assert.equal(realmService.listObjects('Person', '').total, 2);

  const wrongKeyHex = '00'.repeat(64);
  await assert.rejects(() => realmService.openRealm(filePath, wrongKeyHex));

  // The original, still-valid realm must remain open and usable, not orphaned.
  assert.equal(realmService.listObjects('Person', '').total, 2);
});

test('openRealm: mo lai cung file (giong auto-reconnect sau khi reload trang) nhieu lan lien tiep', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Same server process, same file+key opened again while already open -
  // exactly what the frontend's localStorage auto-reconnect does on every
  // page reload. realm-js shares one native handle across every JS instance
  // opened for the same path in a process, so naively closing "the old
  // instance" after opening "the new one" closes both, breaking every
  // subsequent request until the process reopens a genuinely different path.
  await realmService.openRealm(filePath, encryptionKeyHex);
  assert.equal(realmService.listObjects('Person', '').total, 2);

  await realmService.openRealm(filePath, encryptionKeyHex);
  assert.equal(realmService.listObjects('Person', '').total, 2);

  await realmService.openRealm(filePath, encryptionKeyHex);
  assert.equal(realmService.listObjects('Person', '').total, 2);
});

test('listObjects: tra dung record, __ref, filter RQL', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const person = realmService.listObjects('Person', '');
  assert.equal(person.total, 2);
  const alice = person.rows.find((r) => r.name === 'Alice');
  assert.equal(alice.__ref, 'p1');
  assert.equal(alice.age, 30);
  assert.equal(alice.active, true);

  const note = realmService.listObjects('Note', '');
  assert.equal(note.rows[0].__ref, 0);
  assert.equal(note.rows[1].__ref, 1);

  const filtered = realmService.listObjects('Person', 'age > 26');
  assert.equal(filtered.total, 1);
  assert.equal(filtered.rows[0].name, 'Alice');

  assert.throws(() => realmService.listObjects('Person', 'age >>> 5'), /Filter không hợp lệ/);
});

test('listObjects: phan trang bang offset/limit', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const page1 = realmService.listObjects('Person', '', 0, 1);
  assert.equal(page1.total, 2);
  assert.equal(page1.returned, 1);
  assert.equal(page1.offset, 0);
  assert.equal(page1.rows.length, 1);

  const page2 = realmService.listObjects('Person', '', 1, 1);
  assert.equal(page2.total, 2);
  assert.equal(page2.returned, 1);
  assert.equal(page2.offset, 1);
  assert.notEqual(page1.rows[0].__ref, page2.rows[0].__ref);

  const page3 = realmService.listObjects('Person', '', 2, 1);
  assert.equal(page3.returned, 0);

  // Default (no offset/limit given) still returns everything up front,
  // matching every existing call site that doesn't paginate.
  const all = realmService.listObjects('Person', '');
  assert.equal(all.returned, 2);
  assert.equal(all.offset, 0);
});

test('countObjects: dem nhanh khong can fetch row, loi khi class khong ton tai', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.equal(realmService.countObjects('Person').total, 2);
  assert.equal(realmService.countObjects('Note').total, 2);
  assert.throws(() => realmService.countObjects('NoSuchClass'), /Không tìm thấy class/);

  realmService.createObject('Person', { id: 'p3', name: 'Carol', age: 40, active: true });
  assert.equal(realmService.countObjects('Person').total, 3);
});

test('createObject/updateObject/deleteObject: CRUD day du + loi khi ref khong ton tai', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const created = realmService.createObject('Person', { id: 'p3', name: 'Carol', age: '40', active: true });
  assert.equal(created.name, 'Carol');
  assert.equal(created.age, 40);
  assert.equal(realmService.listObjects('Person', '').total, 3);

  const updated = realmService.updateObject('Person', 'p1', { name: 'Alice Updated' });
  assert.equal(updated.name, 'Alice Updated');

  const updatedNote = realmService.updateObject('Note', '0', { title: 'First Updated' });
  assert.equal(updatedNote.title, 'First Updated');

  realmService.deleteObject('Person', 'p3');
  assert.equal(realmService.listObjects('Person', '').total, 2);

  assert.throws(
    () => realmService.updateObject('Person', 'no-such-id', { name: 'X' }),
    /Không tìm thấy record/
  );
});

test('updateObject/deleteObject: filter phai duoc truyen dung khi ref la index; validate ref/gia tri', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  // Unfiltered index 0 = 'First'; filtered by title == 'Second', index 0 = 'Second'.
  // Passing the same filter used to display the row must resolve the right record.
  const updated = realmService.updateObject('Note', '0', { body: 'Updated body' }, "title == 'Second'");
  assert.equal(updated.title, 'Second');
  assert.equal(updated.body, 'Updated body');

  const first = realmService.listObjects('Note', '').rows.find((n) => n.title === 'First');
  assert.equal(first.body, 'Hello');

  realmService.deleteObject('Note', '0', "title == 'Second'");
  const remaining = realmService.listObjects('Note', '');
  assert.equal(remaining.total, 1);
  assert.equal(remaining.rows[0].title, 'First');

  assert.throws(() => realmService.updateObject('Note', '', { title: 'x' }), /Index/);
  assert.throws(() => realmService.updateObject('Note', 'abc', { title: 'x' }), /Index/);
  assert.throws(
    () => realmService.updateObject('Person', 'p1', { age: 'not-a-number' }),
    /số nguyên hợp lệ/
  );
});

test('updateObject: gui kem primaryKey khong doi khong duoc gay loi "outside migration"', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  // The edit form re-submits every field, including the (unchanged) primary
  // key. Realm throws "Cannot change value of primary key outside migration
  // function" on any assignment to a primaryKey property, even a no-op one -
  // updateObject must drop it before writing.
  const updated = realmService.updateObject('Person', 'p1', {
    id: 'p1',
    name: 'Alice V2',
    age: 31,
    active: true,
  });
  assert.equal(updated.id, 'p1');
  assert.equal(updated.name, 'Alice V2');
  assert.equal(updated.age, 31);
});
