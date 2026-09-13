# Realm Dev Tool — Design

## Mục tiêu

Tool nội bộ, chạy local, giúp dev xem/sửa dữ liệu trong file `.realm` của project Swift
(realm-swift 20.0.4 / realm-core 20.1.4) mà không cần build app. Đây là bản thử nghiệm
để kiểm chứng: npm package `realm` (native, core ~20.x) có mở/ghi được file do
realm-swift 20.0.4 tạo ra không, và lỗi gì sẽ xảy ra nếu không tương thích.

Không phải tool production — không cần cân nhắc bảo mật, concurrency, multi-user.
Ưu tiên: dễ chạy, dễ chia sẻ cho dev khác, ít cấu hình nhất có thể.

## Kiến trúc

- **Backend**: Node.js + Express, dùng `realm@^20.2.0` (bản mới nhất hiện có, core ~20.x,
  gần nhất với core 20.1.4 của project). Build theo N-API (napi_versions: 6) nên một bản
  prebuilt binary chạy được trên mọi Node ≥18, không cần compiler khi `npm install`.
- **Frontend**: 1 trang HTML/CSS/JS thuần, không framework, không build step. Gọi backend
  qua REST API (JSON) bằng `fetch`.
- Backend giữ **một Realm instance duy nhất** trong memory tại một thời điểm (mở file mới
  sẽ đóng file cũ). Không cần multi-session vì tool chạy local, 1 người dùng tại 1 thời điểm.
- Chạy bằng `npm start`: khởi động server, tự mở browser tới `http://localhost:4848`.
- Để share cho dev khác: chỉ cần Node ≥18 → `npm install` → `npm start`. Không config file,
  không env var — file path và encryption key nhập trực tiếp trên UI.

## Mở file

- Mở **dynamic** (không truyền `schema` khi gọi `Realm.open`) — Realm tự đọc schema nhúng
  sẵn trong file, nên không cần định nghĩa lại model Swift bằng JS.
- Encryption key nhập dạng **hex string** (128 ký tự = 64 byte), decode bằng
  `Buffer.from(hexString, 'hex')` truyền vào option `encryptionKey`. Key rỗng = mở không
  mã hoá.
- Mọi lỗi khi mở file (sai path, sai key, core không tương thích, file corrupt...) được
  bắt và trả nguyên message từ realm-core về UI — đây chính là phần cần quan sát để biết
  core JS có tương thích với core Swift hay không.

## API (REST, JSON)

- `POST /api/open` — `{ filePath, encryptionKeyHex }` → mở file, trả về danh sách schema
  (tên class, properties + kiểu, primaryKey, embedded).
- `GET /api/schema` — trả lại danh sách schema của file đang mở.
- `GET /api/objects/:className?filter=...` — trả danh sách record (tối đa N record đầu,
  ví dụ 500, để tránh load file lớn quá nặng). `filter` là chuỗi RQL truyền thẳng vào
  `.filtered()`.
- `POST /api/objects/:className` — tạo record mới, body = object literal các field.
- `PUT /api/objects/:className/:ref` — sửa record. `ref` là primaryKey (nếu class có) hoặc
  index trong kết quả `objects()/filtered()` hiện tại (nếu class không có primaryKey).
- `DELETE /api/objects/:className/:ref` — xoá record.
- Tất cả thao tác ghi bọc trong `realm.write(() => {...})`, lỗi (VD sai kiểu field, vi phạm
  required property...) trả về nguyên message cho UI hiển thị.

## Định danh record khi không có primaryKey

Dùng index trong kết quả `objects()`/`filtered()` tại thời điểm thao tác (không giữ
Results sống giữa các request). Giới hạn đã biết: nếu dữ liệu bị sửa bởi tiến trình khác
giữa lúc load bảng và lúc bấm Save, index có thể lệch sang record khác. Chấp nhận được vì
tool single-user, không dùng cho production.

## UI

1. Panel kết nối: input File path + Encryption key (hex, optional) + nút Open. Hiện banner
   lỗi nếu mở thất bại.
2. Sidebar: danh sách class trong file.
3. Bảng record của class đang chọn: cột = property. Property kiểu list/link/embedded hiện
   dạng tóm tắt (VD "→ 3 items") kèm nút mở form chi tiết.
4. Ô filter (RQL) phía trên bảng — Apply/Clear. Lỗi cú pháp filter hiện ngay trên UI.
5. Form chi tiết record (mở khi bấm 1 row hoặc "New record"):
   - Field thường: input theo kiểu (text/number/checkbox/datetime-local).
   - Link (to-one): dropdown chọn record đích trong class liên quan, có tuỳ chọn "None".
   - List field kiểu thường: danh sách input có thể add/remove từng phần tử.
   - List field kiểu object (to-many): danh sách record liên kết, add-existing/remove.
   - Embedded object: form con lồng bên trong (đệ quy nếu embedded lồng embedded).
   - Save ghi qua `realm.write`, lỗi hiện ngay trong form, không đóng form khi lỗi.
   - Delete có xác nhận trước khi xoá.

## Known limitations (chấp nhận cho v1)

- Không giới hạn quyền, không mã hoá traffic (chạy localhost only).
- Không xử lý nhiều người mở cùng file cùng lúc.
- Danh sách record giới hạn ở N record đầu (không phân trang) — đủ dùng để test, sẽ mở
  rộng sau nếu cần.
- Định danh record không-primaryKey dựa trên index, có thể lệch nếu dữ liệu đổi giữa các
  request (xem mục "Định danh record").
