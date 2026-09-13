'use strict';

const fs = require('fs');
const path = require('path');
const realmService = require('./realmService');

const SNAPSHOT_DIR = path.join(__dirname, '..', 'snapshots');

function pad(n) {
  return String(n).padStart(2, '0');
}

// {tên file .realm đang mở}_yyyymmdd_hhmmss.realm - cùng quy ước timestamp
// với exportService, nhưng lấy tên gốc từ chính file .realm đang mở thay vì
// tên table (snapshot là bản copy TOÀN BỘ realm, không tách theo từng table).
function timestampForFilename(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function sanitizeForFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function createSnapshot() {
  // assertOpen() ở đây chỉ để lấy realm.path (đặt tên file) và validate có
  // file đang mở trước khi tạo thư mục đích - writeSnapshot() bên dưới tự
  // gọi lại assertOpen() một lần nữa khi thực sự ghi, không sao vì rẻ.
  const realm = realmService.assertOpen();
  const sourceName = sanitizeForFilename(path.basename(realm.path, '.realm'));

  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const fileName = `${sourceName}_${timestampForFilename(new Date())}.realm`;
  const filePath = path.join(SNAPSHOT_DIR, fileName);

  realmService.writeSnapshot(filePath);

  return { fileName, filePath };
}

module.exports = { createSnapshot, SNAPSHOT_DIR };
