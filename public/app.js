'use strict';

const STORAGE_KEYS = {
  filePath: 'ec51RealmStudio.filePath',
  encryptionKeyHex: 'ec51RealmStudio.encryptionKeyHex',
};

const state = {
  schema: [],
  classCounts: {},
  classSearchText: '',
  currentClass: null,
  currentSchema: null,
  filter: '',
  rows: [],
  editingRef: null,
};

const el = (id) => document.getElementById(id);

// Bumped by loadObjects() and on a fresh /api/open, so a slow/stale response
// (e.g. Apply then Clear before the first request lands) can be dropped
// instead of overwriting state.rows/state.filter with mismatched data - that
// mismatch is exactly what would break the __ref filter round-trip below.
let loadRequestId = 0;

function loadSavedConnection() {
  try {
    return {
      filePath: localStorage.getItem(STORAGE_KEYS.filePath) || '',
      encryptionKeyHex: localStorage.getItem(STORAGE_KEYS.encryptionKeyHex) || '',
    };
  } catch {
    return { filePath: '', encryptionKeyHex: '' };
  }
}

function saveConnection(filePath, encryptionKeyHex) {
  try {
    localStorage.setItem(STORAGE_KEYS.filePath, filePath);
    localStorage.setItem(STORAGE_KEYS.encryptionKeyHex, encryptionKeyHex);
  } catch {
    // Private browsing / storage disabled - not critical, just skip remembering.
  }
}

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

async function openConnection(filePath, encryptionKeyHex) {
  try {
    const { schema } = await api('POST', '/api/open', { filePath, encryptionKeyHex });
    saveConnection(filePath, encryptionKeyHex);
    loadRequestId += 1; // invalidate any in-flight loadObjects() from a previously opened file
    state.schema = schema;
    state.classCounts = {};
    state.currentClass = null;
    state.currentSchema = null;
    state.filter = '';
    state.rows = [];
    state.editingRef = null;
    el('filter-input').value = '';
    el('toolbar').hidden = true;
    el('table-wrap').innerHTML = '';
    el('row-count').textContent = '';
    setStatus(`Da mo file. Tim thay ${schema.length} class.`, false);
    renderClassList();
    loadClassCounts(schema);
  } catch (err) {
    setStatus(err.message, true);
  }
}

el('open-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const filePath = el('file-path').value.trim();
  const encryptionKeyHex = el('encryption-key').value.trim();
  await openConnection(filePath, encryptionKeyHex);
});

function formatClassLabel(className) {
  const count = state.classCounts[className];
  return count === undefined ? className : `${className} (${count})`;
}

function renderClassList() {
  const list = el('class-list');
  list.innerHTML = '';
  const q = state.classSearchText.trim().toLowerCase();
  const visible = q ? state.schema.filter((cls) => cls.name.toLowerCase().includes(q)) : state.schema;
  for (const cls of visible) {
    const item = document.createElement('div');
    item.className = 'class-item';
    item.dataset.className = cls.name;
    item.classList.toggle('active', cls.name === state.currentClass);
    item.textContent = formatClassLabel(cls.name);
    item.addEventListener('click', () => selectClass(cls.name));
    list.appendChild(item);
  }
}

async function loadClassCounts(schema) {
  await Promise.all(schema.map(async (cls) => {
    try {
      const { total } = await api('GET', `/api/objects/${encodeURIComponent(cls.name)}/count`);
      updateClassCount(cls.name, total);
    } catch {
      // Leave this one without a count rather than failing the whole sidebar.
    }
  }));
}

function updateClassCount(className, total) {
  state.classCounts[className] = total;
  const item = el('class-list').querySelector(`[data-class-name="${CSS.escape(className)}"]`);
  if (item) {
    item.textContent = formatClassLabel(className);
  }
}

async function refreshOneClassCount(className) {
  try {
    const { total } = await api('GET', `/api/objects/${encodeURIComponent(className)}/count`);
    updateClassCount(className, total);
  } catch {
    // Not critical - the table itself already reflects the change.
  }
}

el('class-search').addEventListener('input', () => {
  state.classSearchText = el('class-search').value;
  renderClassList();
});

el('toggle-sidebar').addEventListener('click', () => {
  el('sidebar').classList.toggle('collapsed');
});

async function selectClass(className) {
  state.currentClass = className;
  state.filter = '';
  el('filter-input').value = '';
  el('toolbar').hidden = false;
  document.querySelectorAll('.class-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.className === className);
  });
  await loadObjects();
}

async function loadObjects() {
  if (!state.currentClass) return;
  const requestId = ++loadRequestId;
  try {
    const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
    const data = await api('GET', `/api/objects/${encodeURIComponent(state.currentClass)}${query}`);
    if (requestId !== loadRequestId) return; // a newer load started meanwhile; drop this stale response
    state.currentSchema = data.schema;
    state.rows = data.rows;
    el('row-count').textContent = `${data.returned}/${data.total} record`;
    renderTable();
    setStatus('', false);
  } catch (err) {
    if (requestId !== loadRequestId) return;
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
  const primaryKey = state.currentSchema.primaryKey;
  for (const prop of state.currentSchema.properties) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'field-row';
    // Realm forbids changing a primaryKey value outside a migration, so when
    // editing an existing row that field is locked (server also drops it).
    const isPrimaryKey = row && primaryKey && prop.name === primaryKey;
    const label = document.createElement('label');
    label.textContent = `${prop.name} (${prop.type}${prop.optional ? ', optional' : ''}${isPrimaryKey ? ', primary key - khong sua duoc' : ''})`;
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
      if (isPrimaryKey) {
        input.disabled = true;
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
  const wasCreate = state.editingRef === null;
  try {
    if (wasCreate) {
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
    if (wasCreate) {
      refreshOneClassCount(state.currentClass);
    }
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
    refreshOneClassCount(state.currentClass);
  } catch (err) {
    setStatus(err.message, true);
  }
}

// Auto-load a previously opened file/key, if any, so returning to the tool
// doesn't require copy-pasting the path and key again.
(function initFromStorage() {
  const saved = loadSavedConnection();
  el('file-path').value = saved.filePath;
  el('encryption-key').value = saved.encryptionKeyHex;
  if (saved.filePath) {
    openConnection(saved.filePath, saved.encryptionKeyHex);
  }
})();
