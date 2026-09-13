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

  assert.throws(() => realmService.listObjects('Person', 'age >>> 5'), /Filter khong hop le/);
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
    /Khong tim thay record/
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
    /so nguyen hop le/
  );
});
