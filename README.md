# EC51 Realm Studio (dev tool)

Tool nội bộ để xem/sửa dữ liệu file `.realm` mà không cần build app Swift.
Không dùng cho production — chỉ để dev tự kiểm tra dữ liệu trên máy mình.

## Chạy tool

1. Cài Node.js >= 18 (kiểm tra bằng `node -v`).
2. Cài dependency và khởi động server, chọn 1 trong 2 cách:
   - **Dùng terminal**: trong thư mục này, chạy:
     ```bash
     npm install
     npm start
     ```
   - **Không cần mở terminal** (macOS): double-click file
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

## Log

Mỗi lần chạy `npm start` sẽ tạo 1 file log riêng trong thư mục `logs/`
(`logs/app-<thoi-diem-chay>.log`), ghi lại mọi request tới API (path, body
đã ẩn encryption key, status code, thời gian xử lý) và message lỗi thật từ
realm-core khi có. Nếu gặp lỗi, gửi kèm nội dung file log gần nhất để tra
cứu nhanh hơn thay vì phải tái hiện lại lỗi.

## Export

Nút **Export** cạnh **Thêm mới** mở hộp thoại chọn:
- **Phạm vi dữ liệu**: "Dữ liệu hiện tại" (đúng phần đang lọc trên màn hình —
  chỉ chọn được khi đang có filter) hoặc "Toàn bộ dữ liệu" (mọi record của
  table, không giới hạn 500 như khi xem trên UI).
- **Format**: CSV, Excel (`.xls`, dạng SpreadsheetML XML — mở trực tiếp bằng
  Excel/Numbers/Google Sheets, không cần thư viện ngoài), hoặc Markdown.

File được lưu vào thư mục `exports/` (không commit vào git) với tên
`{tên table}_yyyymmdd_hhmmss.<đuôi file>`, ví dụ `Person_20260913_143000.csv`.

## Import

Nút **Import** cạnh **Export** mở hộp thoại nhập:
- **File CSV**: bấm **Chọn file...** để mở hộp thoại chọn file chuẩn của hệ
  điều hành (hiện chỉ hỗ trợ CSV). Trình duyệt không cho lấy đường dẫn tuyệt
  đối thật của file đã chọn, nên tool đọc thẳng nội dung file ngay trong
  trình duyệt rồi gửi lên server — không cần biết file nằm ở đâu trên máy.
- **Chế độ**: "Thêm mới" (giữ dữ liệu hiện có, thêm dữ liệu từ file) hoặc
  "Ghi đè" (xoá toàn bộ dữ liệu hiện có của table trước khi import — sẽ hỏi
  xác nhận thêm 1 lần vì đây là thao tác không thể hoàn tác).

Quy tắc map cột:
- Cột có trong CSV nhưng table không có: bỏ qua cột đó.
- Cột table có nhưng CSV không có: để giá trị mặc định theo type (chuỗi rỗng,
  số 0, false...).
- Cột `primaryKey`: nếu CSV có cột trùng tên primary key của table thì dùng
  giá trị đó; nếu CSV không có cột này hoặc giá trị đó bị trùng với record đã
  có sẵn (hoặc trùng với record khác vừa import trong cùng file), tool tự
  sinh 1 id tăng dần mới thay vào — record gốc trùng id không bao giờ bị ghi
  đè bởi import.

Nếu tên file được chọn có vẻ không khớp với table đang chọn (không trùng tên
và không theo đúng quy ước tên file Export ở trên), tool sẽ cảnh báo trước khi
import: với "Ghi đè", cảnh báo được thêm vào ngay dialog xác nhận xoá dữ liệu
sẵn có; với "Thêm mới" (vốn không cần xác nhận gì), tool sẽ hiện thêm 1 dialog
xác nhận riêng chỉ trong trường hợp này.

## Xóa hàng loạt

Mỗi dòng trong bảng dữ liệu có 1 checkbox ở đầu dòng; ô checkbox ở đầu cột
(header) để chọn/bỏ chọn tất cả record đang hiển thị. Chọn xong, nút **Xóa đã
chọn** hiện ra ở toolbar kèm số lượng đã chọn — bấm vào sẽ hỏi xác nhận rồi xóa
toàn bộ record đã chọn. Lựa chọn tự động bị xóa mỗi khi bảng được tải lại từ
đầu (đổi table, đổi filter, bấm Reload).

## Giới hạn đã biết

- Chỉ hỗ trợ field kiểu đơn giản (string/int/double/bool/date/...). Field kiểu
  list/link/embedded object sẽ hiện read-only, chưa hỗ trợ sửa.
- Danh sách record tải 500 record/lần; bấm nút **Xem thêm** cạnh số record
  trong toolbar để tải tiếp — không phải phân trang theo số trang, chỉ tải nối
  tiếp cho tới hết.
- Với class không có `primaryKey`, record được định danh bằng vị trí (index) trong
  kết quả hiện tại — nếu file bị tiến trình khác sửa cùng lúc, index có thể lệch.
- Nhân bản (Duplicate) một record sẽ mở form tạo mới với dữ liệu điền sẵn từ
  record gốc, kể cả primary key — với class có `primaryKey`, bạn phải tự đổi
  giá trị đó trước khi Lưu, nếu không Realm sẽ báo lỗi trùng khoá.
- Chỉ mở được 1 file tại 1 thời điểm; mở file mới sẽ đóng file cũ.
- Dùng `realm@^20.2.0` (core ~20.x) — nếu file của bạn tạo bởi core khác xa version
  này, việc mở file có thể báo lỗi. Đây là điều tool này giúp bạn phát hiện sớm.

## Chạy test

```bash
npm test
```
