'use strict';

// Mở file .realm, chọn table, tải/phân trang dữ liệu, và đồng bộ URL query
// string. Phụ thuộc core.js. Gọi sang sidebar.js (renderClassList,
// loadClassCounts, refreshOneClassCount) và table.js (renderTable) - tất cả
// đều qua lời gọi bên trong thân hàm (chạy muộn hơn, sau khi toàn bộ script
// đã load) nên thứ tự file không quan trọng, xem index.html.

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
    state.selectedRefs.clear();
    el('filter-input').value = '';
    el('toolbar').hidden = true;
    el('table-wrap').innerHTML = '';
    el('row-count').textContent = '';
    el('load-more').hidden = true;
    // Chuyển #connect-panel từ welcome card to giữa màn hình sang thanh gọn
    // phía trên (xem quy tắc html.connected trong style.css) - chỉ 1 class,
    // không có logic show/hide nào khác cần thêm.
    document.documentElement.classList.add('connected');
    el('snapshot-btn').hidden = false;
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
    // Tải lại từ đầu (offset 0) nghĩa là tập record/index có thể đã khác so
    // với lúc người dùng tick chọn - xóa lựa chọn cũ để tránh xóa nhầm record.
    state.selectedRefs.clear();
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

el('snapshot-btn').addEventListener('click', async () => {
  const confirmed = await showConfirm(
    'Lưu 1 bản snapshot (.realm) của TOÀN BỘ dữ liệu hiện tại vào thư mục snapshots/? File snapshot dùng chung encryption key với file đang mở (nếu có) - Realm Swift có thể mở lại trực tiếp bằng đúng key hiện có.'
  );
  if (!confirmed) return;
  const btn = el('snapshot-btn');
  btn.disabled = true;
  try {
    const result = await api('POST', '/api/snapshot');
    showToast(`Đã lưu snapshot: ${result.fileName}.`);
  } catch (err) {
    showError(`Lưu snapshot thất bại: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});
