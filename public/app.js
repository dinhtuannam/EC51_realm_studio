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
