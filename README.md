# EC51 Realm Studio (dev tool)

Tool nội bộ để xem/sửa dữ liệu file `.realm` mà không cần build app Swift.
Không dùng cho production — chỉ để dev tự kiểm tra dữ liệu trên máy mình.

**Phát triển bởi ALLEXCEED Namdt**

## Chạy tool
**Lưu ý: Nếu đã chạy qua `npm install` hoặc `install.command` rồi thì ở các lần sau chỉ cần chạy `npm start` hoặc `start.command` là được**
1. Cài Node.js >= 18 (kiểm tra bằng `node -v`).
2. Cài dependency và khởi động server, chọn 1 trong 2 cách sau:
   - **Cách 1: Dùng terminal**: trong thư mục này, chạy:
     ```bash
     npm install
     npm start
     ```
   - **Cách 2: Không cần mở terminal** (macOS): double-click file
     [`install.command`](install.command) (chỉ cần chạy lại khi mới clone
     hoặc khi `package.json` có thay đổi), sau đó double-click file
     [`start.command`](start.command) mỗi khi muốn chạy tool.
     Lần đầu double-click, nếu macOS chặn với cảnh báo "không xác định được
     nhà phát triển", chuột phải vào file → **Open** → xác nhận **Open** lại
     (chỉ cần làm 1 lần cho mỗi file).
3. Browser sẽ tự mở `http://localhost:4848`. Nếu không tự mở, mở tay URL đó.
4. Nhập **File path** tới file `.realm` và **Encryption key** (chuỗi hex 128 ký tự,
   để trống nếu file không mã hoá), bấm **Mở**.
5. Lần sau mở lại trang, tool tự nhớ và tự mở lại file/key đã dùng gần nhất
   (lưu trong localStorage của trình duyệt) — không cần nhập lại.
6. Để tắt server: đóng cửa sổ Terminal đang chạy (hoặc bấm Ctrl+C trong đó).

## Chạy test

```bash
npm test
```
