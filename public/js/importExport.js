'use strict';

// Modal Export (CSV/Excel/Markdown) và Import (CSV, chế độ Ghi đè/Thêm mới).
// Phụ thuộc core.js (state, el, api, showToast, showError, showConfirm,
// getCheckedRadioValue). Gọi loadObjects()/refreshOneClassCount() sau khi
// import xong (connection.js/sidebar.js) - chỉ chạy lúc người dùng thao tác,
// không cần các file đó load trước.

const EXPORT_SCOPE_IDS = { current: 'export-scope-current', all: 'export-scope-all' };
const EXPORT_FORMAT_IDS = { csv: 'export-format-csv', excel: 'export-format-excel', markdown: 'export-format-markdown' };

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

const IMPORT_MODE_IDS = { append: 'import-mode-append', overwrite: 'import-mode-overwrite' };

// Browser (trình duyệt) không cho JS lấy đường dẫn tuyệt đối thật của file
// chọn qua <input type="file"> (lý do bảo mật) - chỉ có tên file. Nên thay
// vì "path", ta đọc thẳng NỘI DUNG file trong trình duyệt (file.text()) và
// gửi content đó lên server để import, không cần biết path thật ở đâu.
let importCsvContent = null;
let importFileName = '';

// Kiểm tra tên file có "khớp" với table đang chọn không, để cảnh báo trước
// khi import nhầm file. Chấp nhận khớp chính xác (Person.csv) hoặc đúng quy
// ước tên file mà chính tool này tạo ra khi Export (Person_20260913_...csv)
// - bất kỳ tên nào khác đều coi là không khớp và cần cảnh báo.
function fileNameMatchesTable(fileName, tableName) {
  if (!fileName || !tableName) return true;
  const base = fileName.replace(/\.[^./\\]+$/, '');
  const lowerBase = base.toLowerCase();
  const lowerTable = tableName.toLowerCase();
  return lowerBase === lowerTable || lowerBase.startsWith(`${lowerTable}_`);
}

el('import-browse').addEventListener('click', () => {
  el('import-file-input').click();
});

el('import-file-input').addEventListener('change', async () => {
  const file = el('import-file-input').files[0];
  if (!file) return;
  el('import-file-name').textContent = file.name;
  importFileName = file.name;
  try {
    importCsvContent = await file.text();
  } catch (err) {
    importCsvContent = null;
    importFileName = '';
    el('import-file-name').textContent = 'Chưa chọn file';
    showError(`Không đọc được file: ${err.message}`);
  }
});

el('import-data').addEventListener('click', () => {
  if (!state.currentClass) return;
  importCsvContent = null;
  importFileName = '';
  el('import-file-name').textContent = 'Chưa chọn file';
  el('import-file-input').value = ''; // để chọn lại đúng file cũ vẫn bắn 'change'
  el(IMPORT_MODE_IDS.append).checked = true;
  el(IMPORT_MODE_IDS.overwrite).checked = false;
  el('import-overlay').hidden = false;
});

el('import-cancel').addEventListener('click', () => {
  el('import-overlay').hidden = true;
});

el('import-overlay').addEventListener('click', (e) => {
  if (e.target === el('import-overlay')) el('import-overlay').hidden = true;
});

el('import-confirm').addEventListener('click', async () => {
  if (!importCsvContent) {
    showError('Vui lòng chọn file CSV cần import.');
    return;
  }
  const mode = getCheckedRadioValue(IMPORT_MODE_IDS, 'append');
  const nameMismatch = !fileNameMatchesTable(importFileName, state.currentClass);
  const mismatchWarning = nameMismatch
    ? `Tên file "${importFileName}" có vẻ KHÔNG khớp với table "${state.currentClass}" đang chọn. Vui lòng kiểm tra lại đúng file trước khi tiếp tục.`
    : '';
  // "Ghi đè" xoá toàn bộ dữ liệu hiện có trước khi import - đây là thao tác
  // phá huỷ dữ liệu không thể hoàn tác trong tool này, nên bắt xác nhận
  // thêm 1 lần nữa (giống Delete), thay vì chỉ dựa vào việc chọn đúng radio.
  // Khi tên file không khớp table, nối thêm cảnh báo vào chính dialog này
  // thay vì hiện thêm 1 dialog riêng.
  if (mode === 'overwrite') {
    let message = `"Ghi đè" sẽ XÓA TOÀN BỘ dữ liệu hiện có trong table "${state.currentClass}" trước khi import từ file CSV. Bạn có chắc chắn muốn tiếp tục?`;
    if (mismatchWarning) message += `\n\n${mismatchWarning}`;
    const confirmed = await showConfirm(message);
    if (!confirmed) return;
  } else if (mismatchWarning) {
    // "Thêm mới" bình thường không cần xác nhận gì thêm - chỉ hiện dialog
    // xác nhận riêng khi phát hiện tên file không khớp table.
    const confirmed = await showConfirm(`${mismatchWarning}\n\nBạn có chắc chắn muốn tiếp tục import không?`);
    if (!confirmed) return;
  }
  const btn = el('import-confirm');
  btn.disabled = true;
  try {
    const result = await api('POST', `/api/objects/${encodeURIComponent(state.currentClass)}/import`, { csvContent: importCsvContent, mode });
    el('import-overlay').hidden = true;
    await loadObjects();
    refreshOneClassCount(state.currentClass);
    const modeLabel = mode === 'overwrite' ? 'Ghi đè' : 'Thêm mới';
    const skippedNote = result.skippedColumns.length
      ? ` Đã bỏ qua ${result.skippedColumns.length} cột không có trong table: ${result.skippedColumns.join(', ')}.`
      : '';
    showToast(`Đã import ${result.insertedCount} record vào table "${state.currentClass}" (chế độ: ${modeLabel}).${skippedNote}`);
  } catch (err) {
    showError(`Import thất bại: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});
