'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Realm = require('realm');

const PersonSchema = {
  name: 'Person',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: 'string',
    age: 'int',
    active: 'bool',
  },
};

const NoteSchema = {
  name: 'Note',
  properties: {
    title: 'string',
    body: 'string',
  },
};

async function buildFixtureRealm() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-test-'));
  const filePath = path.join(dir, 'fixture.realm');
  const encryptionKey = crypto.randomBytes(64);

  const realm = await Realm.open({
    path: filePath,
    encryptionKey,
    schema: [PersonSchema, NoteSchema],
  });

  realm.write(() => {
    realm.create('Person', { id: 'p1', name: 'Alice', age: 30, active: true });
    realm.create('Person', { id: 'p2', name: 'Bob', age: 25, active: false });
    realm.create('Note', { title: 'First', body: 'Hello' });
    realm.create('Note', { title: 'Second', body: 'World' });
  });
  realm.close();

  return { filePath, encryptionKeyHex: encryptionKey.toString('hex'), dir };
}

module.exports = { buildFixtureRealm };
