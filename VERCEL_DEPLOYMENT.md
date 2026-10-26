# Hướng Dẫn Deploy Lên Vercel & Kiểm Thử Chi Tiết

Dự án **Hey Let's Drink** đã được cấu hình sẵn tệp [`vercel.json`](file:///projects/hey-lets-drink/vercel.json) và [`api/index.js`](file:///projects/hey-lets-drink/api/index.js) để chạy trực tiếp trên Vercel Serverless.

---

## Cách 1: Deploy Siêu Tốc Bằng Vercel CLI (Khuyên Dùng)

Máy tính của bạn **đã cài sẵn Vercel CLI**. Bạn chỉ cần mở terminal và chạy đúng các lệnh sau:

### Bước 1: Mở terminal tại thư mục dự án
```bash
cd /projects/hey-lets-drink
```

### Bước 2: Chạy lệnh deploy
```bash
vercel
```
* **Lần đầu chạy**, Vercel CLI sẽ hỏi đăng nhập (nếu chưa đăng nhập): Bạn chọn đăng nhập bằng GitHub hoặc Email.
* **CLI sẽ hỏi 4 câu xác nhận:**
  1. *Set up and deploy “/projects/hey-lets-drink”?* $\rightarrow$ Gõ **`y`** rồi Enter.
  2. *Which scope do you want to deploy to?* $\rightarrow$ Chọn tài khoản cá nhân của bạn (Enter).
  3. *Link to existing project?* $\rightarrow$ Gõ **`n`** rồi Enter.
  4. *What’s your project’s name?* $\rightarrow$ Giữ nguyên `hey-lets-drink` (Enter).
  5. *In which directory is your code located?* $\rightarrow$ Giữ nguyên `./` (Enter).
* Chờ khoảng **15 - 20 giây**, Vercel sẽ build xong và trả về đường link dạng:
  `https://hey-lets-drink-xxx.vercel.app`

### Bước 3: Đưa lên Production
Chạy lệnh sau để gắn link chính thức:
```bash
vercel --prod
```

### Bước 4: Thêm Biến Môi Trường (Environment Variables)
Để Gemini AI và bộ khóa Web Push hoạt động ổn định trên Serverless:
```bash
vercel env add GEMINI_API_KEY production
# Dán API key Gemini của bạn

vercel env add VAPID_PUBLIC_KEY production
# Dán VAPID public key

vercel env add VAPID_PRIVATE_KEY production
# Dán VAPID private key

# Deploy lại 1 lần để nhận env mới:
vercel --prod
```

---

## Cách 2: Deploy Qua Vercel Dashboard (Kết Nối GitHub)

Nếu bạn muốn quản lý trực quan trên giao diện web Vercel:

1. **Đẩy code lên GitHub:**
   ```bash
   cd /projects/hey-lets-drink
   git remote add origin https://github.com/<tai-khoan-cua-ban>/hey-lets-drink.git
   git push -u origin main
   ```
2. **Import vào Vercel:**
   * Truy cập [vercel.com/new](https://vercel.com/new).
   * Chọn repository `hey-lets-drink` $\rightarrow$ bấm **Import**.
3. **Cấu hình Environment Variables:**
   Tại mục **Environment Variables**, thêm 3 biến:
   * `GEMINI_API_KEY`: *(dán API key Gemini của bạn)*
   * `VAPID_PUBLIC_KEY`: *(dán VAPID public key)*
   * `VAPID_PRIVATE_KEY`: *(dán VAPID private key)*
4. Bấm **Deploy**. Sau 30 giây bạn sẽ có link HTTPS hoàn chỉnh.

---

## Cách Kiểm Thử (Test Flow Trên Điện Thoại)

Sau khi có link Vercel (ví dụ `https://hey-lets-drink.vercel.app`):

### 1. Kiểm tra trên iPhone của bạn gái (iOS 16.4+)
1. Mở link bằng **Safari**.
2. Nhấn nút **Chia sẻ (Share) ⎋** ở thanh dưới Safari $\rightarrow$ Chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
3. Thoát ra Màn hình chính, bấm vào biểu tượng ứng dụng **"Hey Let's Drink"**.
4. Chuyển sang tab **"Thiết Bị"** $\rightarrow$ Bấm **"Bật thông báo ngay"** $\rightarrow$ Chọn **"Cho phép"**.
5. Bấm nút **"Gửi thử thông báo"**:
   * Điện thoại sẽ rung và hiển thị banner thông báo: *"Kiểm tra thông báo: Hey Let's Drink"*.

### 2. Thử tính năng Giọng Nói AI (Voice to JSON)
1. Mở tab **"Giọng Nói AI"**.
2. Chạm vào biểu tượng **Micro**.
3. Nói câu mẫu bằng tiếng Việt:
   *"Nhắc em uống viên sắt sau ăn tối lúc 20:30 mỗi ngày"*
4. Bấm nút **"Gemini AI Phân Tích & Điền Lịch"**.
5. Xem kết quả trích xuất tự động và bấm **"Lưu Cữ Thuốc Này"**!
