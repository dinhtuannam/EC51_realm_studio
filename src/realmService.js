'use strict';

const Realm = require('realm');

let currentRealm = null;

function assertOpen() {
  if (!currentRealm || currentRealm.isClosed) {
    const err = new Error('Chua mo file Realm nao. Hay mo file truoc.');
    err.statusCode = 400;
    throw err;
  }
  return currentRealm;
}

function parseEncryptionKey(hex) {
  if (!hex) return undefined;
  const trimmed = String(hex).trim();
  if (!/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    const err = new Error(
      `Encryption key phai la chuoi hex 128 ky tu (64 byte). Nhan duoc ${trimmed.length} ky tu.`
    );
    err.statusCode = 400;
    throw err;
  }
  return Buffer.from(trimmed, 'hex');
}

function toClientSchema(objSchema) {
  return {
    name: objSchema.name,
    primaryKey: objSchema.primaryKey || null,
    embedded: !!objSchema.embedded,
    properties: Object.values(objSchema.properties).map((prop) => ({
      name: prop.name,
      type: prop.type,
      optional: !!prop.optional,
      objectType: prop.objectType || null,
    })),
  };
}

async function openRealm(filePath, encryptionKeyHex) {
  if (!filePath) {
    const err = new Error('Thieu file path.');
    err.statusCode = 400;
    throw err;
  }
  const encryptionKey = parseEncryptionKey(encryptionKeyHex);
  if (currentRealm && !currentRealm.isClosed) {
    currentRealm.close();
  }
  currentRealm = await Realm.open({ path: filePath, encryptionKey });
  return { schema: getSchema() };
}

function closeRealm() {
  if (currentRealm && !currentRealm.isClosed) {
    currentRealm.close();
  }
  currentRealm = null;
}

function getSchema() {
  const realm = assertOpen();
  return realm.schema.map(toClientSchema);
}

function findSchema(className) {
  const realm = assertOpen();
  const found = realm.schema.find((s) => s.name === className);
  if (!found) {
    const err = new Error(`Khong tim thay class "${className}" trong schema.`);
    err.statusCode = 404;
    throw err;
  }
  return found;
}

module.exports = {
  openRealm,
  closeRealm,
  getSchema,
  findSchema,
  toClientSchema,
  assertOpen,
};
