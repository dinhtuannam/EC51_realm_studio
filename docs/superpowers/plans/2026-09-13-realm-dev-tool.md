# Realm Dev Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, share-friendly dev tool (Node.js + Express backend, plain HTML/JS frontend) that opens an encrypted `.realm` file by path + hex key, and lets a dev view/filter/create/edit/delete records — to verify `realm` npm (core ~20.x) can actually read/write files produced by realm-swift 20.0.4 / realm-core 20.1.4.

**Architecture:** Express serves a small JSON API (`/api/open`, `/api/schema`, `/api/objects/:className`) backed by a single dynamically-opened Realm instance (`src/realmService.js`, no predefined schema — reads schema embedded in the file). A static vanilla-JS page (`public/`) calls this API with `fetch`. Real Swift schema (checked directly in the target app's Realm object model source) has **1225/1225 properties of type String, no lists/links/embedded objects**, so the UI only needs plain text inputs — no nested pickers.

**Tech Stack:** Node.js ≥18, Express 5, `realm` npm package (native, N-API, core ~20.x), Node's built-in `node:test` runner (no extra test framework), vanilla HTML/CSS/JS frontend (no build step).

---

## File Structure

- `package.json` — deps + scripts (`npm start`, `npm test`)
- `.gitignore`
- `server.js` — CLI entry point: creates the app, listens, opens the browser
- `src/app.js` — builds the Express app (routes + static files), no `.listen()` — importable by tests
- `src/realmService.js` — all Realm interaction: open/close, schema, list/filter, create/update/delete
- `src/routes.js` — Express router translating HTTP <-> `realmService`, JSON error envelope
- `public/index.html`, `public/style.css`, `public/app.js` — frontend
- `test/fixtures/buildFixture.js` — builds a temp encrypted `.realm` file with a small schema for tests
- `test/realmService.test.js` — unit tests for `realmService.js`
- `test/e2e.test.js` — full HTTP round-trip test through `src/app.js`
- `README.md` — run instructions for other devs
- `docs/superpowers/specs/2026-09-13-realm-dev-tool-design.md` — approved design (already committed)

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "realm-studio",
  "version": "0.1.0",
  "private": true,
  "description": "Dev tool xem/sua du lieu file .realm cuc bo (thu nghiem tuong thich realm-core 20.1.4)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "express": "^5.2.1",
    "realm": "^20.2.0"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
*.realm
*.realm.lock
*.realm.management/
.DS_Store
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: completes without error; `node_modules/realm` contains a prebuilt native binary (no compiler invoked). If this step fails or falls back to a source build, note the exact error — that itself is a relevant finding for this experiment (Node ABI / prebuild availability).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "Scaffold Node project: express + realm deps, npm scripts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Test fixture helper

**Files:**
- Create: `test/fixtures/buildFixture.js`

- [ ] **Step 1: Write the fixture builder**

```js
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
```

- [ ] **Step 2: Sanity-check the fixture builds and opens**

Run:
```bash
node -e "
const { buildFixtureRealm } = require('./test/fixtures/buildFixture');
buildFixtureRealm().then((r) => { console.log(JSON.stringify(r)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
"
```
Expected: prints a JSON object with `filePath`, `encryptionKeyHex` (128 hex chars), `dir`, exit code 0. If this fails, it means `realm` cannot even create/write a fresh encrypted file on this machine — a blocking finding to report before going further.

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/buildFixture.js
git commit -m "Add encrypted Realm fixture builder for tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: realmService — open/close/schema (TDD)

**Files:**
- Create: `src/realmService.js`
- Create: `test/realmService.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/realmService.test.js`
Expected: FAIL — `Cannot find module '../src/realmService'`

- [ ] **Step 3: Write `src/realmService.js` (open/close/schema slice)**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/realmService.test.js`
Expected: PASS (1 test, subtests included)

- [ ] **Step 5: Commit**

```bash
git add src/realmService.js test/realmService.test.js
git commit -m "Add realmService open/close/schema with dynamic schema reading

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: realmService — listObjects + filter (TDD)

**Files:**
- Modify: `src/realmService.js`
- Modify: `test/realmService.test.js`

- [ ] **Step 1: Append the failing test** (add to the end of `test/realmService.test.js`)

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/realmService.test.js`
Expected: FAIL — `realmService.listObjects is not a function`

- [ ] **Step 3: Append to `src/realmService.js`** (insert before the `module.exports` block)

```js
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
```

Then update the `module.exports` block to:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/realmService.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/realmService.js test/realmService.test.js
git commit -m "Add realmService.listObjects with RQL filter support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: realmService — create/update/delete (TDD)

**Files:**
- Modify: `src/realmService.js`
- Modify: `test/realmService.test.js`

- [ ] **Step 1: Append the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/realmService.test.js`
Expected: FAIL — `realmService.createObject is not a function`

- [ ] **Step 3: Append to `src/realmService.js`** (insert before `module.exports`)

```js
function coerceValue(prop, rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return prop.optional ? null : rawValue;
  }
  switch (prop.type) {
    case 'int':
      return rawValue === '' ? (prop.optional ? null : 0) : parseInt(rawValue, 10);
    case 'float':
    case 'double':
      return rawValue === '' ? (prop.optional ? null : 0) : parseFloat(rawValue);
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
      const err = new Error(`Khong tim thay record voi primary key "${ref}".`);
      err.statusCode = 404;
      throw err;
    }
    return obj;
  }
  // No primaryKey: ref is an index into the SAME result set (unfiltered, or
  // filtered by the same `filter` string) that produced it in listObjects.
  // Passing a different filter than the one used to display the row would
  // resolve to the wrong record, so callers must round-trip the filter.
  const index = Number(ref);
  let results = realm.objects(objSchema.name);
  if (filter) {
    try {
      results = results.filtered(filter);
    } catch (e) {
      const err = new Error(`Filter khong hop le: ${e.message}`);
      err.statusCode = 400;
      throw err;
    }
  }
  if (!Number.isInteger(index) || index < 0 || index >= results.length) {
    const err = new Error(`Index "${ref}" khong hop le trong danh sach hien tai (${results.length} record).`);
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
```

Then update the `module.exports` block to:

```js
module.exports = {
  openRealm,
  closeRealm,
  getSchema,
  findSchema,
  toClientSchema,
  assertOpen,
  listObjects,
  serializeObject,
  createObject,
  updateObject,
  deleteObject,
};
```

**Why `updateObject`/`deleteObject` take a `filter` param:** for a class without a primaryKey, `ref` is an index into whatever result set `listObjects` returned. If the UI had a filter active when it fetched the list, the same filter must be re-applied when resolving that index later, or the index could point at a different record in the unfiltered set. Tasks 6-7 must thread the current filter through on update/delete calls for this to be safe (existing calls with no filter argument default to `undefined`, i.e. unfiltered — this is why the test below, which never applies a filter before update/delete, doesn't need to change).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/realmService.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/realmService.js test/realmService.test.js
git commit -m "Add realmService create/update/delete with primaryKey or index ref

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Express app + routes + HTTP end-to-end test (TDD)

**Files:**
- Create: `src/routes.js`
- Create: `src/app.js`
- Create: `server.js`
- Create: `test/e2e.test.js`

- [ ] **Step 1: Write `src/routes.js`**

```js
'use strict';

const express = require('express');
const realmService = require('./realmService');

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
  };
}

router.post('/open', handle(async (req) => {
  const { filePath, encryptionKeyHex } = req.body || {};
  return realmService.openRealm(filePath, encryptionKeyHex);
}));

router.post('/close', handle(async () => {
  realmService.closeRealm();
  return {};
}));

router.get('/schema', handle(async () => ({ schema: realmService.getSchema() })));

router.get('/objects/:className', handle(async (req) => {
  const filter = req.query.filter || '';
  return realmService.listObjects(req.params.className, filter);
}));

router.post('/objects/:className', handle(async (req) => {
  return realmService.createObject(req.params.className, req.body || {});
}));

router.put('/objects/:className/:ref', handle(async (req) => {
  const filter = req.query.filter || '';
  return realmService.updateObject(req.params.className, req.params.ref, req.body || {}, filter);
}));

router.delete('/objects/:className/:ref', handle(async (req) => {
  const filter = req.query.filter || '';
  realmService.deleteObject(req.params.className, req.params.ref, filter);
  return {};
}));

module.exports = router;
```

- [ ] **Step 2: Write `src/app.js`**

```js
'use strict';

const express = require('express');
const path = require('path');
const routes = require('./routes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

module.exports = { createApp };
```

- [ ] **Step 3: Write `server.js`**

```js
'use strict';

const { exec } = require('child_process');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 4848;
const app = createApp();

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Realm Studio dang chay tai ${url}`);
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
```

- [ ] **Step 4: Write the failing end-to-end test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createApp } = require('../src/app');
const realmService = require('../src/realmService');
const { buildFixtureRealm } = require('./fixtures/buildFixture');

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('HTTP API end-to-end: open, schema, CRUD qua HTTP that su', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const app = createApp();
  const server = await startServer(app);
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    realmService.closeRealm();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const openRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex }),
  });
  const openBody = await openRes.json();
  assert.equal(openRes.status, 200);
  assert.equal(openBody.ok, true);
  assert.ok(openBody.data.schema.some((s) => s.name === 'Person'));

  const listRes = await fetch(`${base}/api/objects/Person`);
  const listBody = await listRes.json();
  assert.equal(listBody.data.total, 2);

  const createRes = await fetch(`${base}/api/objects/Person`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p3', name: 'Carol', age: '40', active: true }),
  });
  const createBody = await createRes.json();
  assert.equal(createBody.ok, true);
  assert.equal(createBody.data.name, 'Carol');

  const updateRes = await fetch(`${base}/api/objects/Person/p3`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Carol Updated' }),
  });
  const updateBody = await updateRes.json();
  assert.equal(updateBody.data.name, 'Carol Updated');

  const deleteRes = await fetch(`${base}/api/objects/Person/p3`, { method: 'DELETE' });
  const deleteBody = await deleteRes.json();
  assert.equal(deleteBody.ok, true);

  const wrongOpenRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex: '00'.repeat(64) }),
  });
  const wrongOpenBody = await wrongOpenRes.json();
  assert.equal(wrongOpenRes.status, 500);
  assert.equal(wrongOpenBody.ok, false);
  assert.ok(wrongOpenBody.error.length > 0);
});
```

- [ ] **Step 5: Run test to verify it fails first (before Steps 1-3 existed this would fail; confirm current state)**

Run: `node --test test/e2e.test.js`
Expected: PASS once Steps 1-3 are in place (this task writes app+test together, so run once after all files exist and confirm PASS — if it fails, read the error message and fix `src/routes.js`/`src/app.js` before moving on).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests across `test/realmService.test.js` and `test/e2e.test.js` PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes.js src/app.js server.js test/e2e.test.js
git commit -m "Add Express app, routes, and HTTP end-to-end test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend UI

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

- [ ] **Step 1: Write `public/index.html`**

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Realm Studio (dev tool)</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header>
    <h1>Realm Studio</h1>
    <form id="open-form">
      <input type="text" id="file-path" placeholder="Duong dan file .realm" size="50" />
      <input type="text" id="encryption-key" placeholder="Encryption key (hex 128 ky tu, de trong neu khong ma hoa)" size="50" />
      <button type="submit">Open</button>
    </form>
    <div id="status"></div>
  </header>

  <main>
    <aside id="class-list"></aside>
    <section id="content">
      <div id="toolbar" hidden>
        <input type="text" id="filter-input" placeholder="Filter (RQL), vi du: age > 18" />
        <button id="apply-filter">Apply</button>
        <button id="clear-filter">Clear</button>
        <button id="new-record">+ New record</button>
        <span id="row-count"></span>
      </div>
      <div id="table-wrap"></div>
    </section>
  </main>

  <div id="edit-overlay" hidden>
    <form id="edit-form">
      <h2 id="edit-title"></h2>
      <div id="edit-fields"></div>
      <div id="edit-error"></div>
      <div class="edit-actions">
        <button type="submit">Save</button>
        <button type="button" id="edit-cancel">Cancel</button>
      </div>
    </form>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/style.css`**

```css
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #f7f7f8; color: #1a1a1a; }
header { padding: 12px 16px; background: #20232a; color: white; }
header h1 { font-size: 16px; margin: 0 0 8px; }
#open-form input { padding: 6px; margin-right: 6px; }
#open-form button { padding: 6px 12px; }
#status { margin-top: 6px; font-size: 13px; min-height: 16px; }
#status.error { color: #ff8080; }
#status.ok { color: #7CFC9A; }
main { display: flex; height: calc(100vh - 90px); }
#class-list { width: 200px; overflow-y: auto; border-right: 1px solid #ddd; background: white; }
.class-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 13px; }
.class-item:hover { background: #f0f0f0; }
.class-item.active { background: #dbe9ff; font-weight: 600; }
#content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
#toolbar { padding: 8px; background: white; border-bottom: 1px solid #ddd; display: flex; gap: 6px; align-items: center; }
#filter-input { flex: 1; padding: 6px; }
#row-count { font-size: 12px; color: #666; white-space: nowrap; }
#table-wrap { flex: 1; overflow: auto; padding: 8px; }
table { border-collapse: collapse; width: 100%; background: white; font-size: 13px; }
th, td { border: 1px solid #eee; padding: 4px 8px; text-align: left; white-space: nowrap; }
th { background: #f0f0f0; position: sticky; top: 0; }
#edit-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
#edit-form { background: white; padding: 16px; border-radius: 6px; width: 480px; max-height: 80vh; overflow-y: auto; }
.field-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; align-items: center; }
.field-row label { font-size: 12px; color: #555; flex: 1; }
.field-row input[type="text"] { flex: 2; padding: 4px; }
#edit-error { color: #c00; font-size: 12px; margin: 8px 0; min-height: 14px; }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
```

- [ ] **Step 3: Write `public/app.js`**

```js
'use strict';

const state = {
  schema: [],
  currentClass: null,
  currentSchema: null,
  filter: '',
  rows: [],
  editingRef: null,
};

const el = (id) => document.getElementById(id);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json();
  if (!payload.ok) {
    throw new Error(payload.error || 'Loi khong xac dinh');
  }
  return payload.data;
}

function setStatus(message, isError) {
  const box = el('status');
  box.textContent = message || '';
  box.className = isError ? 'error' : 'ok';
}

el('open-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const filePath = el('file-path').value.trim();
  const encryptionKeyHex = el('encryption-key').value.trim();
  try {
    const { schema } = await api('POST', '/api/open', { filePath, encryptionKeyHex });
    state.schema = schema;
    setStatus(`Da mo file. Tim thay ${schema.length} class.`, false);
    renderClassList();
  } catch (err) {
    setStatus(err.message, true);
  }
});

function renderClassList() {
  const list = el('class-list');
  list.innerHTML = '';
  for (const cls of state.schema) {
    const item = document.createElement('div');
    item.className = 'class-item';
    item.textContent = cls.name;
    item.addEventListener('click', () => selectClass(cls.name));
    list.appendChild(item);
  }
}

async function selectClass(className) {
  state.currentClass = className;
  state.filter = '';
  el('filter-input').value = '';
  el('toolbar').hidden = false;
  document.querySelectorAll('.class-item').forEach((n) => {
    n.classList.toggle('active', n.textContent === className);
  });
  await loadObjects();
}

async function loadObjects() {
  if (!state.currentClass) return;
  try {
    const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
    const data = await api('GET', `/api/objects/${encodeURIComponent(state.currentClass)}${query}`);
    state.currentSchema = data.schema;
    state.rows = data.rows;
    el('row-count').textContent = `${data.returned}/${data.total} record`;
    renderTable();
    setStatus('', false);
  } catch (err) {
    setStatus(err.message, true);
  }
}

function renderTable() {
  const wrap = el('table-wrap');
  wrap.innerHTML = '';
  if (!state.currentSchema) return;
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const prop of state.currentSchema.properties) {
    const th = document.createElement('th');
    th.textContent = `${prop.name} (${prop.type})`;
    headRow.appendChild(th);
  }
  headRow.appendChild(document.createElement('th'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of state.rows) {
    const tr = document.createElement('tr');
    for (const prop of state.currentSchema.properties) {
      const td = document.createElement('td');
      const value = row[prop.name];
      td.textContent = value && typeof value === 'object' && value.__complex
        ? `[${value.type}] ${value.preview}`
        : String(value ?? '');
      tr.appendChild(td);
    }
    const actionTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditForm(row));
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteRow(row));
    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
}

el('apply-filter').addEventListener('click', () => {
  state.filter = el('filter-input').value.trim();
  loadObjects();
});

el('clear-filter').addEventListener('click', () => {
  state.filter = '';
  el('filter-input').value = '';
  loadObjects();
});

el('new-record').addEventListener('click', () => openEditForm(null));

function openEditForm(row) {
  state.editingRef = row ? row.__ref : null;
  el('edit-title').textContent = row
    ? `Sua record (${state.currentClass})`
    : `Tao record moi (${state.currentClass})`;
  el('edit-error').textContent = '';
  const fieldsBox = el('edit-fields');
  fieldsBox.innerHTML = '';
  for (const prop of state.currentSchema.properties) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'field-row';
    const label = document.createElement('label');
    label.textContent = `${prop.name} (${prop.type}${prop.optional ? ', optional' : ''})`;
    const input = document.createElement('input');
    input.type = prop.type === 'bool' ? 'checkbox' : 'text';
    input.name = prop.name;
    input.dataset.type = prop.type;
    if (row) {
      const value = row[prop.name];
      if (prop.type === 'bool') {
        input.checked = !!value;
      } else if (value && typeof value === 'object' && value.__complex) {
        input.value = value.preview;
        input.disabled = true;
      } else {
        input.value = value ?? '';
      }
    }
    wrapDiv.appendChild(label);
    wrapDiv.appendChild(input);
    fieldsBox.appendChild(wrapDiv);
  }
  el('edit-overlay').hidden = false;
}

el('edit-cancel').addEventListener('click', () => {
  el('edit-overlay').hidden = true;
});

el('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fieldsBox = el('edit-fields');
  const fields = {};
  for (const input of fieldsBox.querySelectorAll('input')) {
    if (input.disabled) continue;
    fields[input.name] = input.type === 'checkbox' ? input.checked : input.value;
  }
  try {
    if (state.editingRef === null) {
      await api('POST', `/api/objects/${encodeURIComponent(state.currentClass)}`, fields);
    } else {
      // Must send the SAME filter that was active when this row's __ref (an
      // index, for classes without a primaryKey) was fetched, or the backend
      // could resolve a different record. See realmService.js resolveObject.
      const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
      await api(
        'PUT',
        `/api/objects/${encodeURIComponent(state.currentClass)}/${encodeURIComponent(state.editingRef)}${query}`,
        fields
      );
    }
    el('edit-overlay').hidden = true;
    await loadObjects();
  } catch (err) {
    el('edit-error').textContent = err.message;
  }
});

async function deleteRow(row) {
  if (!confirm('Xoa record nay?')) return;
  try {
    const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
    await api(
      'DELETE',
      `/api/objects/${encodeURIComponent(state.currentClass)}/${encodeURIComponent(row.__ref)}${query}`
    );
    await loadObjects();
  } catch (err) {
    setStatus(err.message, true);
  }
}
```

- [ ] **Step 4: Manual verification in a real browser**

Run: `npm start` (opens `http://localhost:4848` automatically)

Using the fixture file built in Task 2 (rebuild it if the temp dir was already cleaned up), paste its `filePath` and `encryptionKeyHex` into the form, click Open, and confirm:
- Sidebar shows `Person` and `Note`.
- Clicking `Person` shows 2 rows with correct values.
- Filter `age > 26` narrows to 1 row; Clear restores 2.
- Edit a row, change a value, Save — table reflects the new value.
- New record creates a 3rd row; Delete removes it.
- Opening with a wrong-length or wrong hex key shows the error banner instead of a blank/broken page.

Stop the server (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "Add frontend UI: connect form, record table, edit/create/delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: README for sharing with other devs

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Realm Studio (dev tool)

Tool nội bộ để xem/sửa dữ liệu file `.realm` mà không cần build app Swift.
Không dùng cho production — chỉ để dev tự kiểm tra dữ liệu trên máy mình.

## Chạy tool

1. Cài Node.js >= 18 (kiểm tra bằng `node -v`).
2. Trong thư mục này, chạy:
   ```bash
   npm install
   npm start
   ```
3. Browser sẽ tự mở `http://localhost:4848`. Nếu không tự mở, mở tay URL đó.
4. Nhập **File path** tới file `.realm` và **Encryption key** (chuỗi hex 128 ký tự,
   để trống nếu file không mã hoá), bấm **Open**.

## Giới hạn đã biết

- Chỉ hỗ trợ field kiểu đơn giản (string/int/double/bool/date/...). Field kiểu
  list/link/embedded object sẽ hiện read-only, chưa hỗ trợ sửa.
- Danh sách record giới hạn 500 record đầu tiên (không phân trang).
- Với class không có `primaryKey`, record được định danh bằng vị trí (index) trong
  kết quả hiện tại — nếu file bị tiến trình khác sửa cùng lúc, index có thể lệch.
- Chỉ mở được 1 file tại 1 thời điểm; mở file mới sẽ đóng file cũ.
- Dùng `realm@^20.2.0` (core ~20.x) — nếu file của bạn tạo bởi core khác xa version
  này, việc mở file có thể báo lỗi. Đây là điều tool này giúp bạn phát hiện sớm.

## Chạy test

```bash
npm test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with run instructions and known limitations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Final verification and handoff

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: every test in `test/realmService.test.js` and `test/e2e.test.js` PASSES. This proves the tool can open an encrypted file, read dynamic schema, filter, and do full CRUD through the same code path the UI uses — using a file built by the very same `realm` npm version that will be used against the user's real Swift-generated file.

- [ ] **Step 2: Report findings and hand off**

Summarize for the user:
- Whether `npm install` used a prebuilt binary or fell back to source compilation (from Task 1).
- Whether all automated tests passed (from Step 1 here).
- Ask the user to run `npm start` themselves and point the tool at their **real** encrypted
  `.realm` file from the Swift app (never touch that file path/key without them driving it),
  and report back what happens — this is the actual cross-SDK compatibility check
  (`realm@20.2.0`/core ~20.x reading a file written by realm-swift 20.0.4/core 20.1.4) that
  motivated building this tool.
