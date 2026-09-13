'use strict';

// Icon markup is fixed, hand-written SVG (never derived from row/user data),
// so setting it via innerHTML is safe - the same "never trust row data in
// innerHTML" rule that keeps renderTable()/openEditForm() on textContent
// for actual record values still applies there unchanged.
const ICONS = {
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
  database: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
  search: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
};

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
  total: 0,
  offset: 0,
  editingRef: null,
  // __ref of the record most recently created/updated/duplicated, so the
  // next renderTable() can highlight it. Cleared right after use, so an
  // unrelated later reload (Reload button, filter change...) doesn't
  // re-highlight stale data.
  lastMutatedRef: null,
};

const el = (id) => document.getElementById(id);

// Bumped by loadObjects()/loadMoreObjects() and on a fresh /api/open, so a
// slow/stale response (e.g. Apply then Clear before the first request
// lands) can be dropped instead of overwriting state.rows/state.filter with
// mismatched data - that mismatch is exactly what would break the __ref
// filter round-trip below.
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
    // Trình duyệt ở chế độ ẩn danh hoặc chặn localStorage - không quan
    // trọng, chỉ là sẽ không nhớ được lần mở tiếp theo.
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
    throw new Error(payload.error || 'Lỗi không xác định');
  }
  return payload.data;
}

// Toast cho mọi thao tác THÀNH CÔNG, alert() (chặn cho tới khi người dùng
// bấm OK) cho mọi thao tác THẤT BẠI - áp dụng thống nhất cho toàn bộ app
// thay vì 1 thanh trạng thái dễ bị lướt qua như trước.
function showToast(message) {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.addEventListener('animationend', () => toast.remove());
  container.appendChild(toast);
}

function showError(message) {
  alert(message);
}

// Dialog xác nhận tự vẽ (thay cho confirm() mặc định của browser, vốn nhìn
// lạc quẻ với theme tối) - trả về 1 Promise<boolean> giống hệt confirm(),
// nên chỉ cần đổi 1 chỗ gọi ở deleteRow() sang `await showConfirm(...)`.
function showConfirm(message) {
  return new Promise((resolve) => {
    el('confirm-message').textContent = message;
    el('confirm-overlay').hidden = false;

    const okBtn = el('confirm-ok');
    const cancelBtn = el('confirm-cancel');
    const overlay = el('confirm-overlay');

    function cleanup(result) {
      overlay.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlayClick(e) { if (e.target === overlay) cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  });
}

// Phản ánh class/filter đang xem lên query string bằng replaceState (không
// tạo history entry cho mỗi lần bấm, không reload trang) - để F5 lại trang
// vẫn giữ nguyên URL đó và tự mở lại đúng bảng đang xem.
function updateUrlParams() {
  const params = new URLSearchParams(location.search);
  if (state.currentClass) {
    params.set('class', state.currentClass);
  } else {
    params.delete('class');
  }
  if (state.filter) {
    params.set('filter', state.filter);
  } else {
    params.delete('filter');
  }
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

async function openConnection(filePath, encryptionKeyHex, { restoreFromUrl = false } = {}) {
  try {
    const { schema } = await api('POST', '/api/open', { filePath, encryptionKeyHex });
    saveConnection(filePath, encryptionKeyHex);
    loadRequestId += 1; // huỷ mọi loadObjects() đang chạy dở từ file mở trước đó
    state.schema = schema;
    state.classCounts = {};
    state.currentClass = null;
    state.currentSchema = null;
    state.filter = '';
    state.rows = [];
    state.total = 0;
    state.offset = 0;
    state.editingRef = null;
    state.lastMutatedRef = null;
    el('filter-input').value = '';
    el('toolbar').hidden = true;
    el('table-wrap').innerHTML = '';
    el('row-count').textContent = '';
    el('load-more').hidden = true;
    // Chuyển #connect-panel từ welcome card to giữa màn hình sang thanh gọn
    // phía trên (xem quy tắc html.connected trong style.css) - chỉ 1 class,
    // không có logic show/hide nào khác cần thêm.
    document.documentElement.classList.add('connected');
    showToast(`Đã mở file thành công. Tìm thấy ${schema.length} table.`);
    renderClassList();
    loadClassCounts(schema);

    // Chỉ khôi phục class/filter từ URL khi tự động mở lại lúc load trang
    // (F5) - mở file mới thủ công qua form luôn bắt đầu từ đầu, tránh việc
    // 1 URL cũ (từ file khác) vô tình chọn nhầm class trùng tên ở file mới.
    const params = new URLSearchParams(location.search);
    const classFromUrl = restoreFromUrl ? params.get('class') : null;
    if (classFromUrl && schema.some((cls) => cls.name === classFromUrl)) {
      await selectClass(classFromUrl, params.get('filter') || '');
    } else {
      updateUrlParams();
    }
  } catch (err) {
    showError(err.message);
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
      // Bỏ qua class này, không để 1 lỗi làm hỏng cả sidebar.
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
    // Không quan trọng - bảng dữ liệu chính đã phản ánh đúng thay đổi rồi.
  }
}

el('class-search').addEventListener('input', () => {
  state.classSearchText = el('class-search').value;
  renderClassList();
});

el('toggle-sidebar').addEventListener('click', () => {
  el('sidebar').classList.toggle('collapsed');
});

async function selectClass(className, initialFilter = '') {
  state.currentClass = className;
  state.filter = initialFilter;
  el('filter-input').value = initialFilter;
  el('toolbar').hidden = false;
  document.querySelectorAll('.class-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.className === className);
  });
  await loadObjects();
  updateUrlParams();
}

function buildObjectsQuery(offset) {
  const params = new URLSearchParams();
  if (state.filter) params.set('filter', state.filter);
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function updateRowCountUi() {
  el('row-count').textContent = `${state.rows.length}/${state.total} record`;
  el('load-more').hidden = state.rows.length >= state.total;
}

async function loadObjects() {
  if (!state.currentClass) return;
  const requestId = ++loadRequestId;
  el('loading-bar').classList.add('active');
  try {
    const data = await api('GET', `/api/objects/${encodeURIComponent(state.currentClass)}${buildObjectsQuery(0)}`);
    if (requestId !== loadRequestId) return; // đã có request mới hơn chạy sau; bỏ response cũ này
    state.currentSchema = data.schema;
    state.rows = data.rows;
    state.total = data.total;
    state.offset = data.rows.length;
    updateRowCountUi();
    renderTable();
  } catch (err) {
    if (requestId !== loadRequestId) return;
    showError(err.message);
  } finally {
    if (requestId === loadRequestId) el('loading-bar').classList.remove('active');
  }
}

async function loadMoreObjects() {
  if (!state.currentClass) return;
  const requestId = ++loadRequestId;
  el('loading-bar').classList.add('active');
  try {
    const data = await api('GET', `/api/objects/${encodeURIComponent(state.currentClass)}${buildObjectsQuery(state.offset)}`);
    if (requestId !== loadRequestId) return;
    state.rows = state.rows.concat(data.rows);
    state.total = data.total;
    state.offset += data.rows.length;
    updateRowCountUi();
    renderTable();
  } catch (err) {
    if (requestId !== loadRequestId) return;
    showError(err.message);
  } finally {
    if (requestId === loadRequestId) el('loading-bar').classList.remove('active');
  }
}

el('load-more').addEventListener('click', () => {
  loadMoreObjects();
});

function emptyState(iconSvg, message) {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = iconSvg; // icon SVG là markup cố định, không phải dữ liệu record
  const p = document.createElement('p');
  p.textContent = message; // message luôn là chuỗi tĩnh do ta viết, không phải dữ liệu record
  box.appendChild(p);
  return box;
}

function renderTable() {
  const wrap = el('table-wrap');
  wrap.innerHTML = '';
  if (!state.currentSchema) {
    wrap.appendChild(emptyState(ICONS.database, 'Chọn 1 table ở sidebar để xem dữ liệu'));
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const prop of state.currentSchema.properties) {
    const th = document.createElement('th');
    th.textContent = prop.name;
    headRow.appendChild(th);
  }
  headRow.appendChild(document.createElement('th'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (state.rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty-cell';
    td.colSpan = state.currentSchema.properties.length + 1;
    td.textContent = state.filter
      ? 'Không có record nào phù hợp với filter hiện tại.'
      : 'Class này chưa có record nào.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  for (const row of state.rows) {
    const tr = document.createElement('tr');
    tr.dataset.ref = String(row.__ref);
    for (const prop of state.currentSchema.properties) {
      const td = document.createElement('td');
      const value = row[prop.name];
      td.textContent = value && typeof value === 'object' && value.__complex
        ? `[${value.type}] ${value.preview}`
        : String(value ?? '');
      tr.appendChild(td);
    }
    const actionTd = document.createElement('td');
    actionTd.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Sửa';
    editBtn.innerHTML = ICONS.edit;
    editBtn.addEventListener('click', () => openEditForm(row));
    const dupBtn = document.createElement('button');
    dupBtn.className = 'icon-btn';
    dupBtn.title = 'Nhân bản';
    dupBtn.innerHTML = ICONS.copy;
    dupBtn.addEventListener('click', () => openEditForm(row, { duplicate: true }));
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn icon-btn-danger';
    delBtn.title = 'Xóa';
    delBtn.innerHTML = ICONS.trash;
    delBtn.addEventListener('click', () => deleteRow(row));
    actionTd.appendChild(editBtn);
    actionTd.appendChild(dupBtn);
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  if (state.lastMutatedRef !== null) {
    const target = tbody.querySelector(`[data-ref="${CSS.escape(String(state.lastMutatedRef))}"]`);
    if (target) target.classList.add('row-highlight');
    state.lastMutatedRef = null;
  }
}

el('apply-filter').addEventListener('click', () => {
  state.filter = el('filter-input').value.trim();
  loadObjects();
  updateUrlParams();
});

el('clear-filter').addEventListener('click', () => {
  state.filter = '';
  el('filter-input').value = '';
  loadObjects();
  updateUrlParams();
});

el('reload-table').addEventListener('click', async () => {
  // Dữ liệu có thể bị thay đổi bởi tiến trình khác (VD: app Swift đang ghi
  // vào cùng file trong lúc dùng tool này để kiểm tra), nên cho phép người
  // dùng chủ động tải lại thay vì chỉ tự động cập nhật sau khi tự sửa.
  await loadObjects();
  refreshOneClassCount(state.currentClass);
});

el('new-record').addEventListener('click', () => openEditForm(null));

const EXPORT_SCOPE_IDS = { current: 'export-scope-current', all: 'export-scope-all' };
const EXPORT_FORMAT_IDS = { csv: 'export-format-csv', excel: 'export-format-excel', markdown: 'export-format-markdown' };

function getCheckedRadioValue(idsByValue, fallback) {
  for (const [value, id] of Object.entries(idsByValue)) {
    if (el(id).checked) return value;
  }
  return fallback;
}

el('export-data').addEventListener('click', () => {
  if (!state.currentClass) return;
  const hasFilter = !!state.filter;
  const currentRadio = el(EXPORT_SCOPE_IDS.current);
  const allRadio = el(EXPORT_SCOPE_IDS.all);
  currentRadio.disabled = !hasFilter;
  // Không có filter thì "Dữ liệu hiện tại" vô nghĩa (giống hệt "toàn bộ") -
  // khoá lại và tự chọn "Toàn bộ dữ liệu"; có filter thì mặc định chọn
  // "Dữ liệu hiện tại" vì đó là thứ người dùng đang thực sự nhìn thấy.
  currentRadio.checked = hasFilter;
  allRadio.checked = !hasFilter;
  el('export-overlay').hidden = false;
});

el('export-cancel').addEventListener('click', () => {
  el('export-overlay').hidden = true;
});

el('export-overlay').addEventListener('click', (e) => {
  if (e.target === el('export-overlay')) el('export-overlay').hidden = true;
});

el('export-confirm').addEventListener('click', async () => {
  const scope = getCheckedRadioValue(EXPORT_SCOPE_IDS, 'all');
  const format = getCheckedRadioValue(EXPORT_FORMAT_IDS, 'csv');
  const filter = scope === 'current' ? state.filter : '';
  const btn = el('export-confirm');
  btn.disabled = true;
  try {
    const result = await api('POST', `/api/objects/${encodeURIComponent(state.currentClass)}/export`, { filter, format });
    el('export-overlay').hidden = true;
    showToast(`Đã export thành công: ${result.fileName} (${result.rowCount} record).`);
  } catch (err) {
    showError(`Export thất bại: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

function openEditForm(sourceRow, { duplicate = false } = {}) {
  const isEditingExisting = !!sourceRow && !duplicate;
  state.editingRef = isEditingExisting ? sourceRow.__ref : null;
  el('edit-title').textContent = isEditingExisting
    ? `Sửa record trong table "${state.currentClass}"`
    : duplicate
      ? `Nhân bản record trong table "${state.currentClass}"`
      : `Thêm record mới trong table "${state.currentClass}"`;
  el('edit-error').textContent = '';
  const fieldsBox = el('edit-fields');
  fieldsBox.innerHTML = '';
  const primaryKey = state.currentSchema.primaryKey;
  for (const prop of state.currentSchema.properties) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'field-row';
    // Realm không cho sửa giá trị primaryKey ngoài migration, nên khi đang
    // sửa 1 record có sẵn thì khoá field này lại (server cũng tự bỏ qua nó).
    // Khi nhân bản, đây thực chất là tạo record MỚI nên field này vẫn phải
    // sửa được (và bắt buộc phải đổi để tránh trùng primary key).
    const isLockedPrimaryKey = isEditingExisting && primaryKey && prop.name === primaryKey;
    const label = document.createElement('label');
    label.append(prop.name);
    if (isLockedPrimaryKey) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-key';
      badge.textContent = 'khóa chính';
      badge.title = 'Realm không cho sửa giá trị primary key ngoài migration';
      label.appendChild(badge);
    }
    if (prop.optional) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-optional';
      badge.textContent = 'không bắt buộc';
      label.appendChild(badge);
    }
    const input = document.createElement('input');
    input.type = prop.type === 'bool' ? 'checkbox' : 'text';
    input.name = prop.name;
    input.dataset.type = prop.type;
    if (sourceRow) {
      const value = sourceRow[prop.name];
      if (prop.type === 'bool') {
        input.checked = !!value;
      } else if (value && typeof value === 'object' && value.__complex) {
        input.value = value.preview;
        input.disabled = true;
      } else {
        input.value = value ?? '';
      }
      if (isLockedPrimaryKey) {
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
    let result;
    if (wasCreate) {
      result = await api('POST', `/api/objects/${encodeURIComponent(state.currentClass)}`, fields);
    } else {
      // Phải gửi kèm ĐÚNG filter đang áp dụng lúc lấy __ref (là index, với
      // class không có primaryKey), nếu không backend có thể sửa nhầm record
      // khác. Xem thêm comment resolveObject trong realmService.js.
      const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
      result = await api(
        'PUT',
        `/api/objects/${encodeURIComponent(state.currentClass)}/${encodeURIComponent(state.editingRef)}${query}`,
        fields
      );
    }
    state.lastMutatedRef = result.__ref;
    el('edit-overlay').hidden = true;
    await loadObjects();
    if (wasCreate) {
      refreshOneClassCount(state.currentClass);
    }
    showToast(wasCreate ? 'Đã tạo record mới thành công.' : 'Đã lưu thay đổi thành công.');
  } catch (err) {
    // Giữ lại text lỗi trong form (form vẫn đang mở để sửa lại), đồng thời
    // vẫn alert() theo quy ước chung của toàn hệ thống cho thao tác thất bại.
    el('edit-error').textContent = err.message;
    showError(`Lưu thất bại: ${err.message}`);
  }
});

async function deleteRow(row) {
  const confirmed = await showConfirm('Bạn có chắc muốn xóa record này không?');
  if (!confirmed) return;
  try {
    const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
    await api(
      'DELETE',
      `/api/objects/${encodeURIComponent(state.currentClass)}/${encodeURIComponent(row.__ref)}${query}`
    );
    await loadObjects();
    refreshOneClassCount(state.currentClass);
    showToast('Đã xóa record thành công.');
  } catch (err) {
    showError(`Xóa thất bại: ${err.message}`);
  }
}

// Tự động mở lại file/key đã lưu (nếu có), để quay lại tool không cần
// copy-paste lại đường dẫn và key.
(function initFromStorage() {
  const saved = loadSavedConnection();
  el('file-path').value = saved.filePath;
  el('encryption-key').value = saved.encryptionKeyHex;
  if (saved.filePath) {
    openConnection(saved.filePath, saved.encryptionKeyHex, { restoreFromUrl: true });
  }
})();
