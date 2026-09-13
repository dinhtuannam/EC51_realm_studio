'use strict';

const fs = require('fs');
const realmService = require('./realmService');

// RFC4180-ish CSV parser: handles quoted fields (commas/newlines inside
// quotes), escaped "" for a literal quote, and CRLF or LF line endings.
// A naive .split(',') would break on any quoted field containing a comma,
// which real-world CSVs (including our own exportService output) do have.
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = rows[0];
  const records = rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === '')) // skip a fully-blank trailing line
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] !== undefined ? r[idx] : '';
      });
      return obj;
    });
  return { headers, records };
}

const NUMERIC_PK_TYPES = new Set(['int', 'float', 'double']);

// Yields "1", "2", "3", ... (or numeric 1, 2, 3... for a numeric primary
// key), skipping any value already in `usedPkValues` - so it stays unique
// against both pre-existing table data and rows already inserted earlier
// in the same import.
function createAutoIncrementIdGenerator(primaryKeyType, usedPkValues) {
  let counter = 1;
  function candidateFor(n) {
    return NUMERIC_PK_TYPES.has(primaryKeyType) ? n : String(n);
  }
  return function next() {
    let candidate = candidateFor(counter);
    while (usedPkValues.has(String(candidate))) {
      counter += 1;
      candidate = candidateFor(counter);
    }
    usedPkValues.add(String(candidate));
    counter += 1;
    return candidate;
  };
}

const VALID_MODES = new Set(['overwrite', 'append']);

function importCsv(className, filePath, mode) {
  if (!VALID_MODES.has(mode)) {
    const err = new Error(`Chế độ import "${mode}" không hợp lệ. Chỉ hỗ trợ: overwrite, append.`);
    err.statusCode = 400;
    throw err;
  }
  if (!filePath) {
    const err = new Error('Thiếu đường dẫn file CSV.');
    err.statusCode = 400;
    throw err;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    const err = new Error(`Không đọc được file "${filePath}": ${e.message}`);
    err.statusCode = 400;
    throw err;
  }

  const realm = realmService.assertOpen();
  const objSchema = realmService.findSchema(className);
  const clientSchema = realmService.toClientSchema(objSchema);
  const schemaColumnNames = new Set(clientSchema.properties.map((p) => p.name));
  const { headers, records } = parseCsv(content);
  // Cột CSV không có trong table -> bỏ qua. Cột table không có trong CSV ->
  // để trống (buildWriteValues/coerceValue áp giá trị mặc định theo type).
  const skippedColumns = headers.filter((h) => !schemaColumnNames.has(h));

  const primaryKey = objSchema.primaryKey || null;
  const primaryKeyType = primaryKey
    ? clientSchema.properties.find((p) => p.name === primaryKey).type
    : null;

  let insertedCount = 0;

  realm.write(() => {
    if (mode === 'overwrite') {
      realm.delete(realm.objects(className));
    }

    const usedPkValues = new Set();
    if (primaryKey) {
      for (const obj of realm.objects(className)) {
        usedPkValues.add(String(obj[primaryKey]));
      }
    }
    const nextAutoId = createAutoIncrementIdGenerator(primaryKeyType, usedPkValues);

    for (const record of records) {
      const fields = {};
      for (const propName of schemaColumnNames) {
        fields[propName] = Object.prototype.hasOwnProperty.call(record, propName) ? record[propName] : '';
      }
      const values = realmService.buildWriteValues(objSchema, fields);

      if (primaryKey) {
        const csvProvidedPk = headers.includes(primaryKey) && record[primaryKey] !== '';
        // CSV gives a primary key value: use it, UNLESS it collides with a
        // value already in the table (pre-existing, or from an earlier row
        // in this same import) - then generate a fresh one instead of
        // letting Realm reject the whole import on a duplicate-key error.
        if (!csvProvidedPk || usedPkValues.has(String(values[primaryKey]))) {
          values[primaryKey] = nextAutoId();
        } else {
          usedPkValues.add(String(values[primaryKey]));
        }
      }

      realm.create(className, values);
      insertedCount += 1;
    }
  });

  return { insertedCount, totalRows: records.length, skippedColumns, mode, className };
}

module.exports = { importCsv, parseCsv };
