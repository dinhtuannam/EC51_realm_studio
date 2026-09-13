'use strict';

const Realm = require('realm');

let currentRealm = null;
let currentEncryptionKeyHex = '';

function assertOpen() {
  if (!currentRealm || currentRealm.isClosed) {
    const err = new Error('Chưa mở file Realm nào. Hãy mở file trước.');
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
      `Encryption key phải là chuỗi hex 128 ký tự (64 byte). Đã nhận ${trimmed.length} ký tự.`
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
    const err = new Error('Thiếu đường dẫn file.');
    err.statusCode = 400;
    throw err;
  }
  const normalizedKeyHex = encryptionKeyHex || '';
  // Reopening the SAME file with the SAME key while it's already open in
  // this process (e.g. the browser's auto-reconnect firing right after a
  // page reload, with the server itself never restarting) must not go
  // through Realm.open() again. realm-js shares one underlying native
  // handle across every JS instance opened for the same path in a process:
  // calling .close() on any one of them closes that shared handle, so *all*
  // of them (old and newly-opened alike) report isClosed === true
  // afterwards - even though they are distinct JS objects. Opening-then-
  // closing-the-old-one therefore closes the realm we were about to keep.
  // Reusing the already-open instance sidesteps the problem entirely.
  // Only short-circuit when the key also matches: a genuinely different key
  // for the same path must still go through Realm.open() so a wrong key is
  // still rejected instead of silently reusing stale data.
  if (
    currentRealm
    && !currentRealm.isClosed
    && currentRealm.path === filePath
    && currentEncryptionKeyHex === normalizedKeyHex
  ) {
    return { schema: getSchema() };
  }
  const encryptionKey = parseEncryptionKey(encryptionKeyHex);
  // Don't touch currentRealm until the new open succeeds - if Realm.open
  // rejects (wrong key/path/incompatible file), the previously-open realm
  // must stay usable instead of being orphaned as closed-but-still-referenced.
  const previousRealm = currentRealm;
  const nextRealm = await Realm.open({ path: filePath, encryptionKey });
  if (previousRealm && !previousRealm.isClosed) {
    previousRealm.close();
  }
  currentRealm = nextRealm;
  currentEncryptionKeyHex = normalizedKeyHex;
  return { schema: getSchema() };
}

function closeRealm() {
  if (currentRealm && !currentRealm.isClosed) {
    currentRealm.close();
  }
  currentRealm = null;
  currentEncryptionKeyHex = '';
}

function getSchema() {
  const realm = assertOpen();
  return realm.schema.map(toClientSchema);
}

function findSchema(className) {
  const realm = assertOpen();
  const found = realm.schema.find((s) => s.name === className);
  if (!found) {
    const err = new Error(`Không tìm thấy table "${className}" trong schema.`);
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

function listObjects(className, filter, offset = 0, limit = MAX_RESULTS) {
  const realm = assertOpen();
  const objSchema = findSchema(className);
  const clientSchema = toClientSchema(objSchema);
  let results = realm.objects(className);
  if (filter) {
    try {
      results = results.filtered(filter);
    } catch (e) {
      const err = new Error(`Filter không hợp lệ: ${e.message}`);
      err.statusCode = 400;
      throw err;
    }
  }
  const total = results.length;
  const start = Math.max(0, offset);
  const end = Math.min(total, start + Math.max(0, limit));
  const rows = [];
  for (let i = start; i < end; i += 1) {
    const obj = results[i];
    const row = serializeObject(obj, clientSchema);
    // No primaryKey: __ref is the ABSOLUTE index into THIS (possibly
    // filtered) result set - stable across pages, since offset only
    // changes which slice of the same Results is iterated, not the
    // indices themselves. Callers must pass the same filter back on
    // update/delete or the ref can resolve to a different record.
    row.__ref = objSchema.primaryKey ? obj[objSchema.primaryKey] : i;
    rows.push(row);
  }
  return { total, returned: rows.length, offset: start, rows, schema: clientSchema };
}

function countObjects(className) {
  const realm = assertOpen();
  findSchema(className); // validates the class exists, consistent 404 handling
  // .length on an unfiltered Results is O(1) in realm-core - no rows are
  // materialized, so this is safe to call for every class in the sidebar.
  return { total: realm.objects(className).length };
}

function coerceValue(prop, rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return prop.optional ? null : rawValue;
  }
  switch (prop.type) {
    case 'int': {
      if (rawValue === '') return prop.optional ? null : 0;
      const parsed = parseInt(rawValue, 10);
      if (Number.isNaN(parsed)) {
        const err = new Error(`Giá trị "${rawValue}" không phải số nguyên hợp lệ cho field "${prop.name}".`);
        err.statusCode = 400;
        throw err;
      }
      return parsed;
    }
    case 'float':
    case 'double': {
      if (rawValue === '') return prop.optional ? null : 0;
      const parsed = parseFloat(rawValue);
      if (Number.isNaN(parsed)) {
        const err = new Error(`Giá trị "${rawValue}" không phải số hợp lệ cho field "${prop.name}".`);
        err.statusCode = 400;
        throw err;
      }
      return parsed;
    }
    case 'bool':
      return rawValue === true || rawValue === 'true';
    case 'date':
      return rawValue === '' ? (prop.optional ? null : new Date(0)) : new Date(rawValue);
    case 'data':
      return rawValue === '' ? Buffer.alloc(0) : Buffer.from(rawValue, 'base64');
    default:
      return rawValue;
  }
}

function buildWriteValues(objSchema, fields) {
  const values = {};
  for (const prop of Object.values(objSchema.properties)) {
    if (!(prop.name in fields)) continue;
    if (!SIMPLE_TYPES.has(prop.type)) continue;
    values[prop.name] = coerceValue(prop, fields[prop.name]);
  }
  return values;
}

function resolveObject(realm, objSchema, ref, filter) {
  if (objSchema.primaryKey) {
    const obj = realm.objectForPrimaryKey(objSchema.name, ref);
    if (!obj) {
      const err = new Error(`Không tìm thấy record với primary key "${ref}".`);
      err.statusCode = 404;
      throw err;
    }
    return obj;
  }
  // No primaryKey: ref is an index into the SAME result set (unfiltered, or
  // filtered by the same `filter` string) that produced it in listObjects.
  // Passing a different filter than the one used to display the row would
  // resolve to the wrong record, so callers must round-trip the filter.
  if (typeof ref !== 'string' || !/^\d+$/.test(ref)) {
    const err = new Error(`Index "${ref}" không hợp lệ.`);
    err.statusCode = 404;
    throw err;
  }
  const index = Number(ref);
  let results = realm.objects(objSchema.name);
  if (filter) {
    try {
      results = results.filtered(filter);
    } catch (e) {
      const err = new Error(`Filter không hợp lệ: ${e.message}`);
      err.statusCode = 400;
      throw err;
    }
  }
  if (index >= results.length) {
    const err = new Error(`Index "${ref}" không hợp lệ trong danh sách hiện tại (${results.length} record).`);
    err.statusCode = 404;
    throw err;
  }
  return results[index];
}

function createObject(className, fields) {
  const realm = assertOpen();
  const objSchema = findSchema(className);
  const values = buildWriteValues(objSchema, fields);
  let created;
  realm.write(() => {
    created = realm.create(className, values);
  });
  const clientSchema = toClientSchema(objSchema);
  const row = serializeObject(created, clientSchema);
  row.__ref = objSchema.primaryKey ? created[objSchema.primaryKey] : null;
  return row;
}

function updateObject(className, ref, fields, filter) {
  const realm = assertOpen();
  const objSchema = findSchema(className);
  const values = buildWriteValues(objSchema, fields);
  // Realm forbids assigning to a primaryKey property outside a migration,
  // even when the value is unchanged. The edit form re-submits every field
  // including the primary key, so it must be dropped here before write.
  if (objSchema.primaryKey) {
    delete values[objSchema.primaryKey];
  }
  let updated;
  realm.write(() => {
    const obj = resolveObject(realm, objSchema, ref, filter);
    for (const [key, value] of Object.entries(values)) {
      obj[key] = value;
    }
    updated = obj;
  });
  const clientSchema = toClientSchema(objSchema);
  const row = serializeObject(updated, clientSchema);
  row.__ref = objSchema.primaryKey ? updated[objSchema.primaryKey] : Number(ref);
  return row;
}

function deleteObject(className, ref, filter) {
  const realm = assertOpen();
  const objSchema = findSchema(className);
  realm.write(() => {
    const obj = resolveObject(realm, objSchema, ref, filter);
    realm.delete(obj);
  });
}

module.exports = {
  openRealm,
  closeRealm,
  getSchema,
  findSchema,
  toClientSchema,
  assertOpen,
  listObjects,
  countObjects,
  serializeObject,
  createObject,
  updateObject,
  deleteObject,
  buildWriteValues,
};
