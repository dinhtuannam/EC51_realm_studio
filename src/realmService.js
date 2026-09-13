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

const SIMPLE_TYPES = new Set([
  'string', 'int', 'float', 'double', 'bool', 'date', 'objectId', 'uuid', 'decimal128', 'data', 'mixed',
]);

const MAX_RESULTS = 500;

function serializeValue(prop, value) {
  if (value === null || value === undefined) return null;
  if (SIMPLE_TYPES.has(prop.type)) {
    if (prop.type === 'date') return value.toISOString();
    if (prop.type === 'data') return Buffer.from(value).toString('base64');
    return value;
  }
  return { __complex: true, type: prop.type, preview: String(value) };
}

function serializeObject(obj, clientSchema) {
  const result = {};
  for (const prop of clientSchema.properties) {
    result[prop.name] = serializeValue(prop, obj[prop.name]);
  }
  return result;
}

function listObjects(className, filter) {
  const realm = assertOpen();
  const objSchema = findSchema(className);
  const clientSchema = toClientSchema(objSchema);
  let results = realm.objects(className);
  if (filter) {
    try {
      results = results.filtered(filter);
    } catch (e) {
      const err = new Error(`Filter khong hop le: ${e.message}`);
      err.statusCode = 400;
      throw err;
    }
  }
  const total = results.length;
  const rows = [];
  for (let i = 0; i < Math.min(total, MAX_RESULTS); i += 1) {
    const obj = results[i];
    const row = serializeObject(obj, clientSchema);
    row.__ref = objSchema.primaryKey ? obj[objSchema.primaryKey] : i;
    rows.push(row);
  }
  return { total, returned: rows.length, rows, schema: clientSchema };
}

module.exports = {
  openRealm,
  closeRealm,
  getSchema,
  findSchema,
  toClientSchema,
  assertOpen,
  listObjects,
  serializeObject,
};
