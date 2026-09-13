# UI Redesign — Design

## Mục tiêu

Viết lại toàn bộ giao diện (index.html/style.css, phần render DOM trong
app.js) theo hướng dark-mode dev tool hiện đại (kiểu Linear/Vercel/Supabase
Studio), không đổi bất kỳ hành vi/tính năng nào đã có (auto-reconnect,
sidebar counts/search/collapse, pagination/load-more, duplicate, highlight,
toast/alert, URL state).

## Design system

- **Màu** (CSS custom properties trong `:root`):
  - `--bg`: `#0a0a0f`, `--bg-panel`: `#131318`, `--bg-hover`: `#1c1c24`
  - `--border`: `#2a2a35`
  - `--text`: `#e8e8ec`, `--text-muted`: `#8b8b96`
  - `--accent`: `#6366f1`, `--accent-hover`: `#7476f5`
  - `--success`: `#22c55e`, `--danger`: `#ef4444`, `--danger-hover`: `#dc2626`
- **Typography**: system font stack (không load font ngoài), thang cỡ chữ
  12/13/14/16/20/24px, heading `font-weight:600`, số liệu bảng dùng
  `font-variant-numeric: tabular-nums`.
- **Spacing/bo góc/shadow**: thang 4/8/12/16/24px; bo góc 8px (input/button),
  10-12px (card/modal); shadow rất nhẹ (`0 4px 16px rgba(0,0,0,.3)`) cho
  modal/toast, không dùng shadow đậm.
- **Icon**: SVG inline vẽ tay (menu, search, refresh, plus, edit, copy,
  trash, close, chevron) thay toàn bộ ký tự unicode hiện tại.

## Thay đổi cấu trúc

1. **Chưa mở file**: welcome card căn giữa màn hình (thay vì 2 input nhét
   trong header nhỏ).
2. **Đã mở file**: header thu gọn (tên file/nút đổi file), sidebar là card
   riêng với active-item có thanh accent trái, search box có icon kính lúp.
3. **Toolbar + bảng**: nút phân nhóm rõ theo mức độ quan trọng
   (primary/secondary/destructive), thêm progress bar mỏng khi đang tải,
   thêm empty-state khi bảng rỗng/chưa chọn class.
4. **Modal sửa/thêm/nhân bản**: card nổi trên overlay mờ, input focus có
   viền accent, primary key hiện dạng badge.

## Ràng buộc

- Không thêm dependency ngoài (không Tailwind, không Google Fonts) — thuần
  CSS/SVG tự viết, chạy offline hoàn toàn.
- Giữ nguyên toàn bộ id element mà app.js đang query (`el('...')`) hoặc cập
  nhật đồng bộ cả 2 phía nếu đổi cấu trúc DOM (VD tách `#status` thành
  welcome-card thì phải sửa cả các hàm liên quan trong app.js).
- Verify bằng: chạy lại toàn bộ test suite backend (không đổi backend nên
  phải vẫn pass 14/14), và mock-browser simulation (như đã làm cho URL
  state) để xác nhận các luồng chính (mở file, chọn class, filter, edit,
  duplicate, delete, load more) vẫn hoạt động đúng sau khi đổi cấu trúc DOM.
