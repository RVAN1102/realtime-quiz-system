# Realtime Quiz System - Public Deploy Version

Website làm bài trắc nghiệm realtime được chuyển hướng từ kiến trúc đồ án IoT cũ: **Express + JWT + Socket.IO + TailwindCSS/DaisyUI + database mã hóa AES-256-CBC**.

## 1. Công nghệ sử dụng

- Node.js + Express: backend API
- JWT: đăng nhập trang quản trị
- Socket.IO: cập nhật bài nộp realtime về dashboard admin
- HTML/CSS/JavaScript thuần: frontend
- TailwindCSS + DaisyUI + Lucide Icons: giao diện
- AES-256-CBC: mã hóa file `database.enc`

## 2. Chạy local để test trước khi deploy

```bash
npm install
npm start
```

Mở:

```text
http://localhost:3000
```

Mật khẩu admin mặc định:

```text
123456
```

Có thể đổi bằng biến môi trường:

```bash
ADMIN_PASS=matkhaucuaban npm start
```

## 3. Hai đường link sau khi deploy

Sau khi deploy lên cloud, giả sử domain là:

```text
https://quiz-demo.onrender.com
```

Bạn sẽ có 2 nhóm link khác nhau:

```text
https://quiz-demo.onrender.com/admin
https://quiz-demo.onrender.com/tao-de
```

Dùng cho admin đăng nhập, tạo đề, xem bài nộp realtime.

```text
https://quiz-demo.onrender.com/thi/<ma-de-thi>
```

Dùng cho người làm bài. Ví dụ đề demo:

```text
https://quiz-demo.onrender.com/thi/exam_demo_csdl
```

## 4. Các route chính

```text
/                 Trang đăng nhập admin
/admin            Dashboard quản lý đề thi và bài nộp realtime
/tao-de           Trang tạo đề thi
/thi/:examId      Trang làm bài public của thí sinh
/health           Kiểm tra server sống hay không
```

Vẫn giữ tương thích với đường cũ:

```text
/admin.html
/create-exam.html
/exam.html?id=...
```

## 5. API chính

### Admin

```text
POST   /api/login
GET    /api/admin/overview
GET    /api/exams
POST   /api/exams
GET    /api/exams/:examId
DELETE /api/exams/:examId
GET    /api/submissions
GET    /api/submissions/:submissionId
```

### Public

```text
GET  /api/exams/:examId/public
POST /api/exams/:examId/submit
```

API public lấy đề thi không trả `correctAnswer`. Đáp án đúng chỉ nằm ở server và chỉ được trả về sau khi đã nộp bài.

## 6. Deploy nhanh lên Render

1. Tạo GitHub repo và push toàn bộ project này lên.
2. Vào Render → New → Web Service.
3. Connect repo GitHub.
4. Build Command:

```bash
npm install
```

5. Start Command:

```bash
npm start
```

6. Thêm Environment Variables:

```text
ADMIN_PASS=mat-khau-admin-cua-ban
JWT_SECRET=chuoi-bi-mat-that-dai
DB_SECRET=chuoi-ma-hoa-database-that-dai
PUBLIC_BASE_URL=https://ten-service-cua-ban.onrender.com
NODE_ENV=production
```

Nếu dùng persistent disk trên Render, có thể set thêm:

```text
DB_PATH=/var/data/database.enc
```

## 7. Deploy nhanh lên Railway

1. Tạo GitHub repo và push project này lên.
2. Railway → New Project → Deploy from GitHub repo.
3. Railway tự cấp biến `PORT`; code đã đọc `process.env.PORT`.
4. Thêm các biến môi trường:

```text
ADMIN_PASS=mat-khau-admin-cua-ban
JWT_SECRET=chuoi-bi-mat-that-dai
DB_SECRET=chuoi-ma-hoa-database-that-dai
PUBLIC_BASE_URL=https://domain-railway-cua-ban.up.railway.app
NODE_ENV=production
```

## 8. Ghi chú quan trọng về database

Bản này vẫn dùng file mã hóa `database.enc` giống đồ án IoT. Cách này phù hợp demo và đồ án nhỏ. Nếu deploy thật cho nhiều người dùng, nên nâng cấp sang MongoDB/PostgreSQL vì filesystem của một số nền tảng cloud có thể không bền nếu không cấu hình persistent storage.

## 9. Luồng hoạt động

```text
Admin tạo đề thi
    ↓
Người làm bài mở link /thi/<ma-de>
    ↓
Frontend lấy câu hỏi nhưng không nhận đáp án đúng
    ↓
Người làm bài chọn đáp án và nộp bài
    ↓
Server chấm bài
    ↓
Server lưu kết quả vào database.enc
    ↓
Server emit Socket.IO event new_submission
    ↓
Admin dashboard cập nhật realtime
```
