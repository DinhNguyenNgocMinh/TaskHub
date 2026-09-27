# LIFE TERMINAL

Project được tách thành ba phần độc lập:

```text
C:\TaskHub\
├── web\                 # Bản web deploy lên Render
│   ├── public\           # HTML, CSS, JS, command và dữ liệu seed dùng chung
│   ├── server.js          # Node server, cấp cấu hình Supabase lúc chạy
│   ├── package.json
│   └── .env.example
├── app\                 # Android WebView
│   └── app\src\main\bridge-assets\chat-config.js
│                           # Cầu nối Android-only để nhận key lúc build
└── supabase\schema.sql   # Schema, RLS, seed và Realtime
```

`web/public` là nguồn giao diện duy nhất. Android Gradle đóng gói trực tiếp thư mục này, do đó web và app có cùng giao diện, command, lưu note localStorage và chat Supabase. Không sửa các file trong `app/app/src/main/assets`; chúng là bản cũ đã bị Gradle bỏ qua.

## Chạy web local

```powershell
cd C:\TaskHub\web
Copy-Item .env.example .env
# điền SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY vào .env
npm start
```

Mở `http://localhost:3000`.

## Deploy Render

Tạo **Web Service**, kết nối repository rồi đặt:

| Thiết lập | Giá trị |
| --- | --- |
| Runtime | Node |
| Root Directory | `web` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Trong **Environment Variables** của Render, thêm:

| Key | Value lấy từ đâu |
| --- | --- |
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → Data API → Project URL; dạng `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Project Settings → API Keys → **Publishable key** (bắt đầu bằng `sb_publishable_`) |

Không thêm `SUPABASE_SERVICE_ROLE_KEY` vào Render, web, APK hoặc GitHub. Anon/Publishable key là key được phép xuất hiện ở client; schema RLS trong `supabase/schema.sql` mới là lớp giới hạn quyền.

Sau deploy, tại Supabase Dashboard → Authentication → URL Configuration, thêm URL Render (`https://<ten-service>.onrender.com`) vào **Site URL** và **Redirect URLs** nếu sau này dùng xác thực. Chat hiện tại không yêu cầu đăng nhập.

## Android

Trong `C:\TaskHub\app\local.properties`, giữ đường dẫn SDK và thêm:

```properties
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Build APK:

```powershell
cd C:\TaskHub\app
.\gradlew.bat assembleRelease
```

APK ở `app\build\outputs\apk\release\app-release.apk`.

## Upload GitHub thủ công

Upload các mục: `web`, `app`, `supabase`, `.gitignore`, `README.md`. Không upload `web/.env`, `app/local.properties`, các thư mục `build`, `.gradle`, hay thư mục `android_webview` cũ. File `.gitignore` đã chặn các mục này khi repository được GitHub xử lý.

Trước khi deploy lần đầu, chạy một lần `supabase/schema.sql` trong Supabase SQL Editor nếu database hiện tại chưa có bảng `rooms` và `messages`.
