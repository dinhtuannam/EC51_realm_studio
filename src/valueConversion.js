'use strict';

// Pure schema-shape và value conversion helpers - không phụ thuộc currentRealm
// hay bất kỳ state nào của realmService.js, nên có thể dùng ở bất cứ đâu cần
// chuyển đổi qua lại giữa giá trị Realm và giá trị JSON/CSV (realmService.js
// dùng cho CRUD, importService.js dùng để convert 1 dòng CSV thành giá trị
// ghi vào Realm) mà không phải kéo theo toàn bộ máy mở/đóng file.

const SIMPLE_TYPES = new Set([
  'string', 'int', 'float', 'double', 'bool', 'date', 'objectId', 'uuid', 'decimal128', 'data', 'mixed',
]);

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

module.exports = {
  SIMPLE_TYPES,
  toClientSchema,
  serializeValue,
  serializeObject,
  coerceValue,
  buildWriteValues,
};
