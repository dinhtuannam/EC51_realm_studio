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
