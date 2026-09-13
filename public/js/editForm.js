'use strict';

// Modal "Thêm mới"/"Sửa"/"Nhân bản" (3 chế độ dùng chung 1 form). Phụ thuộc
// core.js. Gọi loadObjects()/refreshOneClassCount() (connection.js/sidebar.js)
// bên trong handler submit - chỉ chạy sau khi mọi script đã load.

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

el('new-record').addEventListener('click', () => openEditForm(null));

el('edit-cancel').addEventListener('click', () => {
  el('edit-overlay').hidden = true;
});

el('edit-overlay').addEventListener('click', (e) => {
  if (e.target === el('edit-overlay')) el('edit-overlay').hidden = true;
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
    notifyEditFormSaved();
  } catch (err) {
    // Giữ lại text lỗi trong form (form vẫn đang mở để sửa lại), đồng thời
    // vẫn showError() theo quy ước chung của toàn hệ thống cho thao tác thất bại.
    el('edit-error').textContent = err.message;
    showError(`Lưu thất bại: ${err.message}`);
  }
});
