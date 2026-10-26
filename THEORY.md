# Lý Thuyết Toàn Diện: Cơ Chế Web Push Notification Cho Ứng Dụng Nhắc Uống Thuốc

> **Tài liệu giải thích bản chất kỹ thuật:** Chúng ta cần những gì, tại sao lại cần, cơ chế gửi thông báo từ website về điện thoại diễn ra như thế nào ở tầng hệ điều hành, và cách vượt qua các rào cản của iPhone lẫn Server Free Tier.

---

## 1. Bản chất vấn đề: Tại sao Website bình thường không thể tự ý gửi thông báo về điện thoại?

Trước đây, chỉ có các ứng dụng cài từ App Store hoặc Google Play (Native Apps) mới có thể gửi thông báo khi tắt app. Website truyền thống chạy bên trong một tab của trình duyệt: **khi người dùng đóng tab hoặc khóa màn hình, mã JavaScript của website sẽ bị hệ điều hành tiêu diệt ngay lập tức** để tiết kiệm RAM và pin.

Để website có thể gửi thông báo về điện thoại ngay cả khi đã tắt trình duyệt, tổ chức W3C đã chuẩn hóa công nghệ **Web Push API** dựa trên 3 trụ cột:
1. **Service Worker:** Một tiến trình chạy ngầm độc lập với giao diện web.
2. **Push Service trung gian của Hệ điều hành:** Apple Push Notification service (APNs) của Apple hoặc Firebase Cloud Messaging (FCM) của Google.
3. **Giao thức VAPID:** Chuẩn định danh máy chủ gửi tin mà không cần mua tài khoản Apple Developer đắt đỏ ($99/năm).

---

## 2. Luồng hoạt động chi tiết (Behind the Scenes)

Quy trình gửi một thông báo từ server của bạn tới màn hình khóa điện thoại của bạn gái diễn ra qua **4 giai đoạn chính**:

```
[ Điện Thoại Bạn Gái ]                 [ Server Của Bạn ]             [ Push Service của Apple / Google ]
        │                                      │                                      │
        │─── 1. Bấm "Bật thông báo" ───────────│                                      │
        │    (Xin quyền Notification)          │                                      │
        │                                      │                                      │
        │─── 2. Yêu cầu tạo Token ────────────────────────────────────────────────────>│
        │<── 3. Trả về PushSubscription Object ───────────────────────────────────────│
        │    (endpoint, p256dh, auth)          │                                      │
        │                                      │                                      │
        │─── 4. Gửi Subscription lên Server ──>│                                      │
        │                                      │ (Lưu vào database)                   │
        │                                      │                                      │
        │                                  [ĐẾN GIỜ HẸN]                              │
        │                                      │                                      │
        │                                      │─── 5. Ký VAPID & Bắn Payload mã hóa ─>│
        │                                      │                                      │
        │<── 6. Đánh thức máy & Đẩy thông báo ────────────────────────────────────────│
        │                                                                             │
 [Service Worker (sw.js) thức dậy]                                                     │
 [Rung chuông & Hiện Banner màn hình khóa]                                             │
```

### Bước 1: Xin quyền người dùng (`Notification.requestPermission`)
* **Mục đích:** Trình duyệt bảo vệ người dùng, chỉ khi bạn gái bấm "Cho phép" thì trình duyệt mới kích hoạt bộ thu sóng push.

### Bước 2 & 3: Sinh `PushSubscription` qua Push Service
* Trình duyệt của bạn gái không kết nối trực tiếp với server của bạn suốt 24/7 (vì làm vậy sẽ cực kỳ tốn pin).
* Thay vào đó, trình duyệt kết nối với server ngầm của hệ điều hành (**Apple APNs** nếu là iPhone, **Google FCM** nếu là Android).
* Apple/Google sẽ cấp cho thiết bị của bạn gái một địa chỉ nhận thư duy nhất gọi là `PushSubscription`:
  ```json
  {
    "endpoint": "https://web.push.apple.com/QKb9...",
    "keys": {
      "p256dh": "BNcR...",
      "auth": "tBH8..."
    }
  }
  ```
  * `endpoint`: URL đặc biệt của Apple/Google dành riêng cho chiếc điện thoại đó.
  * `p256dh` & `auth`: Cặp khóa mật mã để server của bạn mã hóa nội dung thông báo (đảm bảo cả Apple và Google cũng không thể đọc trộm nội dung thuốc bạn gái uống).

### Bước 4: Lưu Subscription về Server của bạn
* Thiết bị gửi gói `PushSubscription` trên về server Node.js của bạn qua API `POST /api/subscribe`. Server lưu nó vào file dữ liệu.

### Bước 5 & 6: Kích hoạt thông báo khi đến giờ
* Khi đến đúng giờ uống thuốc (ví dụ 14:00), Server của bạn lấy chuỗi `PushSubscription` ra.
* Server dùng thư viện `web-push`, dùng khóa bí mật **VAPID Private Key** để ký tên số xác thực danh tính, rồi bắn gói tin đã mã hóa lên `endpoint` của Apple/Google.
* Apple/Google nhận được gói tin, kiểm tra chữ ký hợp lệ -> lập tức gửi tín hiệu mạng đánh thức hệ điều hành của bạn gái -> chuyển tới **Service Worker (`sw.js`)** -> hiện thông báo lên màn hình khóa.

---

## 3. Các thành phần bắt buộc và lý do phải có

| Thành phần | Nó là gì? | Tại sao bắt buộc phải có? | Mục đích cụ thể trong App này |
| :--- | :--- | :--- | :--- |
| **`manifest.json`** | File cấu hình nhận diện ứng dụng Web App Manifest. | Bắt buộc đối với chuẩn PWA (Progressive Web App). Nếu không có file này, iOS sẽ không cho phép cài app ra màn hình chính. | Khai báo tên app *"Hey Let's Drink"*, icon ứng dụng, màu thanh tiêu đề, và chế độ `display: standalone` (mở lên không có thanh URL Safari). |
| **`sw.js` (Service Worker)** | File JavaScript chạy ngầm ở tầng hệ điều hành. | Trình duyệt chỉ có thể nhận thông báo khi đóng tab nếu có Service Worker làm nhiệm vụ trực gác. | Đón sự kiện `self.addEventListener('push')`, kích hoạt chuông/rung và hiển thị 2 nút: `[Đã uống]` và `[Nhắc lại 15p]`. |
| **HTTPS (SSL)** | Giao thức mã hóa an toàn web (`https://`). | **Bắt buộc 100%:** Các trình duyệt (Apple Safari, Google Chrome) chặn toàn bộ Service Worker và Push API nếu chạy trên HTTP thường vì lý do bảo mật. | Nền tảng hosting miễn phí (Render / Cloudflare) sẽ cấp sẵn HTTPS miễn phí cho bạn. |
| **VAPID Keys** | Cặp khóa mã hóa bất đối xứng (Public Key & Private Key). | Chuẩn RFC 8292 giúp Apple và Google nhận diện server của bạn mà **không cần mua tài khoản Apple Developer $99/năm**. | Public Key đưa cho bạn gái khi đăng ký; Private Key giữ kín tại server để ký gói tin push. |
| **External Cron Trigger** (`cron-job.org`) | Dịch vụ hẹn giờ bắn HTTP request từ bên ngoài vào server. | **Giải quyết nhược điểm Free Tier:** Các server miễn phí (Render, Koyeb) sẽ tự động "ngủ đông" (sleep) nếu không có khách vào sau 15 phút. Nếu server ngủ, cron nội bộ sẽ chết. | Cứ đúng giờ uống thuốc, cron-job.org sẽ gọi vào server đánh thức dậy và kích hoạt gửi thông báo chuẩn xác từng giây. |

---

## 4. Tại sao iPhone (iOS) lại có quy định khắt khe riêng?

Đối với Android, bạn mở Chrome lên bấm "Cho phép" là xong. Nhưng với iPhone:
1. **Lịch sử:** Apple vốn rất bảo thủ, suốt nhiều năm họ chặn Web Push để ép lập trình viên phải lên App Store và trả phí $99/năm.
2. **Từ iOS 16.4 (Tháng 3/2023):** Apple mới chính thức mở Web Push cho toàn cầu, nhưng kèm theo 2 điều kiện bảo mật chống spam:
   * **Không hỗ trợ trong tab Safari thông thường:** Để ngăn các trang web rác spam quảng cáo tràn màn hình người dùng.
   * **Bắt buộc phải là Web App cài trên Màn hình chính (Home Screen):** Người dùng phải chủ động bấm *Share -> Add to Home Screen*. Khi biểu tượng xuất hiện trên màn hình chính như một ứng dụng độc lập, người dùng mở lên từ đó thì quyền Push mới được kích hoạt.

---

## 5. Tóm tắt giải pháp kiến trúc cho dự án

1. **Giao diện & Trải nghiệm (UI/UX):** Xây dựng theo [design.md](file:///projects/hey-lets-drink/design.md), lấy cảm hứng từ Saigon Digital DS và BVIS: siêu nhanh (< 50ms), font Inter, màu Slate/Ocean Blue, phản hồi chạm `140ms`, không sến súa, không emoji spam.
2. **Backend:** Node.js Express nhẹ, sinh VAPID Keys, lưu trữ cữ thuốc và token thiết bị vào file JSON.
3. **Độ ổn định Free Tier:** Kết hợp `node-cron` nội bộ + Webhook từ `cron-job.org` bên ngoài để 100% không bao giờ bị miss thông báo do server ngủ đông.
