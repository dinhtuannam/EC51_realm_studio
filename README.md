# EC51 Realm Studio (dev tool)

Tool nội bộ để xem/sửa dữ liệu file `.realm` mà không cần build app Swift.
Không dùng cho production — chỉ để dev tự kiểm tra dữ liệu trên máy mình.

## Chạy tool

1. Cài Node.js >= 18 (kiểm tra bằng `node -v`).
2. Trong thư mục này, chạy:
   ```bash
   npm install
   npm start
   ```
3. Browser sẽ tự mở `http://localhost:4848`. Nếu không tự mở, mở tay URL đó.
4. Nhập **File path** tới file `.realm` và **Encryption key** (chuỗi hex 128 ký tự,
   để trống nếu file không mã hoá), bấm **Open**.

## Giới hạn đã biết

- Chỉ hỗ trợ field kiểu đơn giản (string/int/double/bool/date/...). Field kiểu
  list/link/embedded object sẽ hiện read-only, chưa hỗ trợ sửa.
- Danh sách record giới hạn 500 record đầu tiên (không phân trang).
- Với class không có `primaryKey`, record được định danh bằng vị trí (index) trong
  kết quả hiện tại — nếu file bị tiến trình khác sửa cùng lúc, index có thể lệch.
- Chỉ mở được 1 file tại 1 thời điểm; mở file mới sẽ đóng file cũ.
- Dùng `realm@^20.2.0` (core ~20.x) — nếu file của bạn tạo bởi core khác xa version
  này, việc mở file có thể báo lỗi. Đây là điều tool này giúp bạn phát hiện sớm.

## Chạy test

```bash
npm test
```
