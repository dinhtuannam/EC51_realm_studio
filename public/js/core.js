'use strict';

// Nền tảng dùng chung cho mọi file khác: state trung tâm, helper DOM/API,
// và 3 dialog tự vẽ (toast/error/confirm) thay cho alert()/confirm() mặc
// định của browser. File này PHẢI load đầu tiên (xem thứ tự script trong
// index.html) vì mọi file khác dùng `el`, `state`, `api`, `showToast`,
// `showError`, `showConfirm` ngay từ các dòng addEventListener() ở top-level.

// Icon markup là chuỗi cố định, tự viết tay (không bao giờ lấy từ dữ liệu
// record), nên gán qua innerHTML là an toàn - quy tắc "không đưa dữ liệu
// record vào innerHTML" vẫn áp dụng ở table.js/editForm.js cho giá trị thật.
const ICONS = {
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
  database: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
  search: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
};

const STORAGE_KEYS = {
  filePath: 'realmStudio.filePath',
  encryptionKeyHex: 'realmStudio.encryptionKeyHex',
};

// State trung tâm, dùng chung bởi mọi file - xem từng file (sidebar.js,
// connection.js, table.js, editForm.js, importExport.js) để biết phần nào
// đọc/ghi field nào.
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
  // __ref của record vừa được tạo/sửa/nhân bản gần nhất, để lần renderTable()
  // kế tiếp highlight nó. Bị xoá ngay sau khi dùng, để 1 lần tải lại không
  // liên quan (nút Reload, đổi filter...) không highlight nhầm dữ liệu cũ.
  lastMutatedRef: null,
  // __ref (dạng string) của các record đang được tick chọn để xóa hàng loạt.
  // Luôn bị xóa sạch mỗi khi loadObjects() tải lại từ đầu (đổi class, đổi
  // filter, reload...) vì tập record/index lúc đó đã khác - xem comment ở
  // loadObjects() trong connection.js. Không bị xóa khi loadMoreObjects()
  // nối thêm record, vì index của các record đã tải không đổi khi chỉ thêm
  // record phía sau.
  selectedRefs: new Set(),
};

const el = (id) => document.getElementById(id);

// Bumped bởi loadObjects()/loadMoreObjects() và khi mở lại file (/api/open),
// để 1 response chậm/cũ (VD: bấm Áp dụng rồi Bỏ lọc trước khi request đầu
// kịp trả lời) có thể bị bỏ qua thay vì ghi đè state.rows/state.filter bằng
// dữ liệu không khớp - sự không khớp đó chính là thứ phá vỡ việc round-trip
// filter cho __ref.
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

// Đọc radio đang được chọn trong 1 nhóm {value: elementId} - dùng chung cho
// export scope/format và import mode (importExport.js).
function getCheckedRadioValue(idsByValue, fallback) {
  for (const [value, id] of Object.entries(idsByValue)) {
    if (el(id).checked) return value;
  }
  return fallback;
}

// Toast cho mọi thao tác THÀNH CÔNG, dialog lỗi tự vẽ (chặn cho tới khi
// người dùng bấm OK) cho mọi thao tác THẤT BẠI - áp dụng thống nhất cho
// toàn bộ app thay vì 1 thanh trạng thái dễ bị lướt qua như trước.
function showToast(message) {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.addEventListener('animationend', () => toast.remove());
  container.appendChild(toast);
}

// Dialog lỗi tự vẽ (thay cho alert() mặc định của browser, vốn nhìn lạc quẻ
// với theme tối) - cùng kiểu dáng với showConfirm(). Giữ nguyên chữ ký
// showError(message) nên mọi nơi đang gọi hàm này không cần đổi gì.
function showError(message) {
  el('error-message').textContent = message;
  el('error-overlay').hidden = false;

  const okBtn = el('error-ok');
  const overlay = el('error-overlay');

  function cleanup() {
    overlay.hidden = true;
    okBtn.removeEventListener('click', onOk);
    overlay.removeEventListener('click', onOverlayClick);
  }
  function onOk() { cleanup(); }
  function onOverlayClick(e) { if (e.target === overlay) cleanup(); }

  okBtn.addEventListener('click', onOk);
  overlay.addEventListener('click', onOverlayClick);
}

// Dialog xác nhận tự vẽ (thay cho confirm() mặc định của browser, vốn nhìn
// lạc quẻ với theme tối) - trả về 1 Promise<boolean> giống hệt confirm().
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
