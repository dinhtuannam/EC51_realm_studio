'use strict';

// Sidebar bên trái: danh sách table + ô tìm kiếm + số record mỗi table.
// Phụ thuộc core.js (state, el, api). selectClass() (được gọi khi click 1
// item) nằm ở connection.js - tham chiếu tới nó qua closure nên không cần
// connection.js load trước file này (xem giải thích thứ tự script trong
// index.html).

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
