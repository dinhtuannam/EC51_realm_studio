'use strict';

// Entry point - PHẢI là script cuối cùng trong index.html, vì nó gọi ngay
// openConnection() (định nghĩa ở connection.js) lúc trang vừa tải xong.

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
