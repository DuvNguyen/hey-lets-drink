# Design System & UI/UX Specification: Hey Let's Drink

> **Dựa trên:** Saigon Digital Design System (`SDv26`) & phong cách tối giản từ `bvis`.
> **Mục tiêu:** Trải nghiệm tốc độ cao (Fast & Minimal), tinh tế, dứt khoát; **tuyệt đối không sến súa, không spam icon/emoji**.

---

## 1. Nguyên tắc thiết kế (Core Design Principles)

1. **Chức năng là ưu tiên hàng đầu (Utility First):**
   Mỗi thành phần trên màn hình đều phải có mục đích rõ ràng. Không trang trí vô nghĩa, không nhồi nhét icon cảm xúc hay văn phong sến súa.
2. **Phản hồi xúc giác tức thì (Tactile & Responsive):**
   Khi người dùng chạm (tap) trên điện thoại, giao diện phải phản hồi ngay lập tức qua hiệu ứng chuyển đổi vi mô (micro-interaction) đã được chuẩn hóa.
3. **Thân thiện với thiết bị di động (Mobile Ergonomics):**
   Tuân thủ tiêu chuẩn iOS HIG & Material: Tất cả vùng tương tác chạm (Touch Target) tối thiểu `44px x 44px`, an toàn với rãnh tai thỏ / thanh điều hướng (`env(safe-area-inset-*)`).

---

## 2. Hệ thống Tokens (Design Tokens)

### 2.1. Bảng màu (Color Palette)
Học hỏi từ bảng màu của Saigon Digital Design System và BVIS:

```css
:root {
  /* Brand Primary */
  --sd-blue: #3165F5;             /* Core Blue - Nút hành động chính */
  --sd-blue-hover: #2450D8;       /* Hover state */
  --sd-indigo: #1E0F48;           /* Tiêu đề chính, Text đậm nét */

  /* Neutral Surfaces & Borders */
  --surface-page: #F8FAFC;        /* Nền tổng thể sạch sẽ (Slate 50) */
  --surface-card: #FFFFFF;        /* Thẻ trắng nổi bật */
  --surface-subtle: #F1F5F9;      /* Nền khu vực phụ, input nền xám */
  
  --border-subtle: #E2E8F0;       /* Viền thẻ mảnh 1px */
  --border-strong: #CBD5E1;       /* Viền input active/focus */

  /* Typography Colors */
  --text-heading: #0F172A;        /* Slate 900 - Tiêu đề cấp cao */
  --text-body: #334155;           /* Slate 700 - Chữ nội dung */
  --text-muted: #64748B;          /* Slate 500 - Ghi chú phụ, thời gian */
  --text-on-brand: #FFFFFF;

  /* Semantic Status Colors (Tối giản, tinh tế) */
  --status-pending-bg: #FEF3C7;   /* Amber 100 - Cữ thuốc sắp tới */
  --status-pending-text: #92400E;
  --status-taken-bg: #ECFDF5;     /* Emerald 100 - Đã uống */
  --status-taken-text: #065F46;
  --status-missed-bg: #FEE2E2;    /* Rose 100 - Quá giờ */
  --status-missed-text: #991B1B;

  /* Shadows (Chuẩn từ Saigon Digital DS) */
  --shadow-xs: 0 1px 2px rgba(30, 15, 72, 0.04);
  --shadow-sm: 0 2px 8px rgba(30, 15, 72, 0.06);
  --shadow-md: 0 8px 24px rgba(30, 15, 72, 0.08);
  --shadow-brand: 0 8px 20px rgba(49, 101, 245, 0.22);

  /* Radius (Border-radius chuẩn) */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-pill: 9999px;
}
```

### 2.2. Typography (Hệ thống chữ)
* **Font Family:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
* **Hierarchy:**
  * Title 1 (App Header): `20px` / Line-height `28px` / Font-weight `700`
  * Heading 2 (Tên cữ thuốc / Giờ uống): `18px` / Line-height `24px` / Font-weight `600`
  * Body (Mô tả, liều lượng): `14px` / Line-height `20px` / Font-weight `400`
  * Caption / Badge (Trạng thái, nhãn thời gian): `12px` / Line-height `16px` / Font-weight `500`

---

## 3. Quy chuẩn Chuyển động & Animation (Motion Guidelines)

Học hỏi trực tiếp từ **Saigon Digital Design System**:

```css
:root {
  /* Motion Duration Tokens */
  --dur-fast: 140ms;   /* Micro-interactions: tap, hover, nút bấm */
  --dur-base: 220ms;   /* Chuyển trạng thái thẻ, mở form, trượt modal */
  --dur-slow: 400ms;   /* Toàn cảnh layout chuyển đổi, load dữ liệu */

  /* Motion Easing Curves */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);  /* Chuyển động tự nhiên 2 chiều */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);       /* Xuất hiện nhanh và dừng êm (Deceleration) */
}
```

### 3.1. Quy tắc áp dụng Animation:
1. **Nút bấm (Interactive Buttons):**
   * Hiệu ứng chuyển trạng thái màu sắc và bóng:
     ```css
     transition: background var(--dur-fast) var(--ease-standard),
                 transform var(--dur-fast) var(--ease-standard),
                 box-shadow var(--dur-fast) var(--ease-standard);
     ```
   * **Hiệu ứng khi chạm ngón tay (Active/Press Feedback):**
     ```css
     button:active {
       transform: scale(0.97); /* Tạo cảm giác bấm nút thật, dứt khoát */
     }
     ```
2. **Thẻ cữ thuốc (Medication Cards):**
   * Khi đổi trạng thái từ *Pending* sang *Taken*:
     * Thẻ chuyển màu viền và màu nền mượt mà trong `220ms`.
     * Nút "Đã uống" biến đổi thành nhãn "Hoàn thành" với chuyển động mờ dần (fade) nhẹ nhàng `140ms`.
3. **Modal & Bottom Sheet (Hướng dẫn PWA cho iOS):**
   * Trượt từ dưới lên (Slide up) dùng curve `--ease-out` trong `220ms`.
4. **Quy tắc Trợ năng (Reduced Motion):**
   * Nếu người dùng bật chế độ giảm hiệu ứng trên iPhone/Android:
     ```css
     @media (prefers-reduced-motion: reduce) {
       *, *::before, *::after {
         animation-duration: 0.01ms !important;
         transition-duration: 0.01ms !important;
       }
     }
     ```

---

## 4. Cấu trúc Component & Giao diện (Component Specifications)

### 4.1. Header Bar
* Thiết kế phẳng, tối giản:
  * Bên trái: Logo text `"Hey Let's Drink"` (Font Inter, Weight 700, sắc xanh Indigo).
  * Bên phải: Dot chỉ báo trạng thái thông báo (`Xanh lá`: Đã kích hoạt Push, `Xám nhạt`: Chưa kích hoạt kèm nút bấm `Bật`).

### 4.2. Thẻ cữ thuốc (Medication Card)
* Bố cục 2 cột gọn gàng:
  * Cột trái: Giờ uống (To, đậm, ví dụ `14:00`), bên dưới là tên thuốc và liều lượng (`Panadol Extra · 500mg - 1 viên`).
  * Cột phải: Badge trạng thái và nút hành động nhanh:
    * Khi chưa đến giờ: Nút bấm `[Đánh dấu đã uống]` (Nền xanh nhạt, viền thanh lịch).
    * Khi đã uống: Badge `✓ Đã uống lúc 14:02` (Màu xanh Emerald nhẹ, trang nhã).

### 4.3. Form thêm cữ thuốc mới (Minimalist Form)
* Gồm 3 trường input cơ bản, không rườm rà:
  1. `Tên thuốc` (Text input với placeholder ví dụ: *"Viên sắt"*, *"Panadol"*).
  2. `Liều lượng` (Text input: *"1 viên sau ăn"*).
  3. `Giờ nhắc` (Time picker: `HH:mm`).
* Nút bấm: `[Lưu lịch nhắc]` (Primary button với `--sd-blue`).

### 4.4. Quy chuẩn Nội dung Thông báo (Notification Copy)
Tuyệt đối không dùng icon spam hay từ ngữ sến súa. Nội dung chuẩn mực:
* **Tiêu đề:** `Lịch uống thuốc: {Tên thuốc}`
* **Nội dung:** `Đến giờ cữ {Giờ} ({Liều lượng}). Vui lòng uống thuốc.`
* **Actions:**
  * `[Xác nhận đã uống]` -> Gọi API lưu vào hệ thống.
  * `[Nhắc lại 15p]` -> Hoãn lại thông báo.
