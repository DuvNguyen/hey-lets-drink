# Hướng Dẫn Triển Khai & Cài Đặt Cho Bạn Gái (100% Miễn Phí)

> Tài liệu hướng dẫn đưa ứng dụng **Hey Let's Drink** lên internet với HTTPS miễn phí và các bước thao tác trên điện thoại của bạn gái.

---

## Phần 1: Chạy thử trên máy tính của bạn (Local)

1. Mở terminal và di chuyển vào thư mục dự án:
   ```bash
   cd /projects/hey-lets-drink
   ```
2. Khởi động máy chủ:
   ```bash
   npm start
   ```
3. Mở trình duyệt truy cập:
   ```
   http://localhost:3000
   ```
   * Bạn sẽ thấy giao diện tối giản chuẩn Saigon Digital Design System.
   * Danh sách các cữ thuốc mặc định trong ngày (08:00, 14:00, 20:00).

---

## Phần 2: Đưa lên Render.com (Miễn phí 100% + Tự động có HTTPS)

Web Push bắt buộc phải có domain chạy HTTPS. Render.com cung cấp dịch vụ Web Service miễn phí có sẵn tên miền `.onrender.com` và chứng chỉ SSL chuẩn.

### Bước 1: Đẩy mã nguồn lên GitHub
1. Tạo một repository mới trên GitHub (ví dụ: `hey-lets-drink`), chọn chế độ **Private** (Riêng tư).
2. Chạy lệnh tại thư mục dự án:
   ```bash
   cd /projects/hey-lets-drink
   git init
   git add .
   git commit -m "feat: initial commit for hey-lets-drink"
   git branch -M main
   git remote add origin https://github.com/<tai-khoan-cua-ban>/hey-lets-drink.git
   git push -u origin main
   ```

### Bước 2: Tạo Web Service trên Render
1. Truy cập [render.com](https://render.com) và đăng ký tài khoản miễn phí (đăng nhập bằng GitHub).
2. Nhấn nút **New +** $\rightarrow$ chọn **Web Service**.
3. Chọn repository `hey-lets-drink` bạn vừa tạo.
4. Điền cấu hình cơ bản:
   * **Name:** `hey-lets-drink` (hoặc tên bất kỳ bạn thích)
   * **Region:** Singapore (để tốc độ tải từ Việt Nam nhanh nhất)
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `node server.js`
   * **Instance Type:** `Free` ($0/month)
5. Bấm **Create Web Service**. Chờ khoảng 1-2 phút, Render sẽ cấp cho bạn một đường link HTTPS có dạng:
   `https://hey-lets-drink.onrender.com`

---

## Phần 3: Cấu hình Cron ngoài (cron-job.org) để chống ngủ đông

Máy chủ miễn phí của Render sẽ ngủ sau 15 phút nếu không có ai truy cập. Ta dùng dịch vụ miễn phí **cron-job.org** để định kỳ gọi vào máy chủ:

1. Truy cập [cron-job.org](https://cron-job.org) và tạo tài khoản miễn phí.
2. Vào **Cronjobs** $\rightarrow$ bấm **Create Cronjob**.
3. Điền thông tin:
   * **Title:** `Hey Lets Drink Keepalive & Trigger`
   * **URL:** `https://hey-lets-drink.onrender.com/api/cron-trigger`
   * **Execution schedule:** Chọn `Every 1 minute` (Mỗi 1 phút) hoặc chọn các mốc giờ uống thuốc cố định trong ngày (ví dụ 08:00, 14:00, 20:00).
4. Bấm **Create**.
* **Kết quả:** Server luôn thức và quét lịch thuốc đúng từng phút mà không lo bị trễ giờ.

---

## Phần 4: Các bước thao tác trên điện thoại của bạn gái

### Nếu bạn gái dùng iPhone (iOS 16.4 trở lên):
1. Gửi đường link `https://hey-lets-drink.onrender.com` cho bạn gái.
2. Bạn gái mở link bằng **Safari** (Lưu ý: Không mở qua trình duyệt nhúng của Messenger/Zalo).
3. Nhấn vào biểu tượng **Chia sẻ (Share)** ở thanh menu dưới cùng (hình vuông có mũi tên chỉ lên).
4. Cuộn xuống và chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
5. Thoát ra ngoài màn hình chính của iPhone, bạn gái sẽ thấy icon ứng dụng **"Hey Let's Drink"**.
6. Bạn gái chạm vào icon để mở app $\rightarrow$ Nhấn nút **"Bật thông báo ngay"** $\rightarrow$ Bấm **"Cho phép"** khi iOS hỏi.
7. Xong! Bạn có thể bấm nút **"Gửi thử thông báo"** từ máy bạn để kiểm tra iPhone bạn gái có reo chuông và nảy banner không.

### Nếu bạn gái dùng Android:
1. Mở link `https://hey-lets-drink.onrender.com` bằng trình duyệt **Google Chrome**.
2. Nhấn nút **"Bật thông báo ngay"** $\rightarrow$ Bấm **"Cho phép"**.
3. (Tùy chọn) Nhấn vào dấu 3 chấm góc phải trên Chrome $\rightarrow$ Chọn **"Cài đặt ứng dụng"** để đưa ra màn hình chính.
