# LIFE TERMINAL — V1

**Bản chốt ngày 26/09/2026.** Đây là ứng dụng terminal nhỏ cho note cá nhân và chat room không yêu cầu tài khoản.

## Trạng thái V1

| Hạng mục | Trạng thái |
| --- | --- |
| Giao diện terminal responsive | Hoàn thành |
| Note lưu local trong `notes.json` | Hoàn thành |
| Lọc note bằng `/noteshow` | Hoàn thành |
| Xóa lịch sử terminal bằng `/clear` | Hoàn thành |
| Chat room với Supabase Postgres | Hoàn thành |
| Tin mới theo Supabase Realtime | Hoàn thành |
| RLS: không cho client sửa/xóa chat | Hoàn thành |
| Android WebView build Debug | Hoàn thành |
| Call, mail, reply, list, search, help | Chưa làm — các command này đang inactive |

## Chạy bản web

Yêu cầu: Node.js đã cài trên máy.

```powershell
cd C:\TaskHub
node server.js
```

Mở [http://localhost:3000](http://localhost:3000). Dừng server bằng `Ctrl+C` tại cửa sổ terminal đang chạy.

File `.env` đã được cấu hình local và bị Git bỏ qua. Không commit hoặc gửi file này cho người khác.

## Command V1

| Command | Cách dùng | Kết quả |
| --- | --- | --- |
| `/note` | `/note mua dầu ăn` | Lưu note. Có thể thêm deadline sau dấu `_`. |
| `/noteshow` | `/noteshow all` | Hiển thị note. Filter: `all`, `incomplete`, `complete`, `nodeadline`, `overdue`. |
| `/clear` | `/clear` | Xóa phần lịch sử đang hiển thị trên terminal. |
| `/msg` | `/msg dungdongvaianh hello` | Gửi tin nhắn tối đa 100 ký tự Unicode. |
| `/room` | `/room dungdongvaianh` | Hiện tối đa 10 tin gần nhất, từ cũ đến mới, và nhận tin mới. |

### Chat room

- Có hai room trong database: `dungdongvaianh` và `laviepeppapig`.
- UI không liệt kê hoặc gợi ý tên room. Gõ sai sẽ nhận `! Room not found.`
- Không có tài khoản, nickname hay avatar. Tin luôn hiện dưới dạng `Anonymous: nội dung`.
- Không hiện thời gian gửi trên UI, dù database có lưu `created_at`.
- Khi đang mở `/room`, tin mới được nhận qua Realtime. Đóng terminal, dùng `/clear`, hoặc mở room khác sẽ hủy kết nối room cũ.

## Cấu hình Supabase hiện có

Supabase đã kết nối và kiểm tra thành công:

- Có đúng 2 room được trả về.
- Gửi tin vào `dungdongvaianh` thành công.
- Lấy history thành công, giới hạn 10 tin.
- Room không tồn tại không trả về dữ liệu.
- Message 101 ký tự bị database từ chối.

Schema được lưu ở [supabase/schema.sql](C:\TaskHub\supabase\schema.sql). Giữ file này làm tài liệu/cách dựng lại database, **không cần chạy lại** trên project Supabase hiện tại trừ khi cần dựng môi trường mới.

### Bảo mật chat

- Mọi bảng dùng Row Level Security (RLS).
- Client chỉ đọc room enabled, đọc message của room enabled, và gửi message mới vào room enabled.
- Không có quyền/policy client để tạo/sửa/xóa room hoặc sửa/xóa message.
- Frontend render nội dung chat qua `textContent`, không dùng `innerHTML`.
- Chỉ Project URL và anon/Publishable key có mặt ở app. Không dùng service_role key.

## Cấu trúc file quan trọng

```text
C:\TaskHub\
├── index.html              # Giao diện web
├── style.css               # Giao diện terminal
├── script.js               # Command, note và chat Realtime
├── server.js               # Server local + API note + runtime chat config
├── commands.json           # Command active/inactive
├── notes.json              # Dữ liệu note web hiện có
├── .env                    # Cấu hình local, không commit
├── .env.example            # Mẫu biến môi trường
├── supabase\schema.sql     # Schema, seed, RLS và Realtime
└── android_webview\        # Ứng dụng Android WebView
```

## Android

APK Debug hiện có tại [app-debug.apk](C:\TaskHub\android_webview\app\build\outputs\apk\debug\app-debug.apk).

Để build lại:

```powershell
cd C:\TaskHub\android_webview
.\gradlew.bat assembleDebug
```

Android dùng `local.properties` (đã bị Git bỏ qua) để nhận cấu hình Supabase. Note Android lưu bằng WebView localStorage, nên khác với `notes.json` của bản web.

## Deploy web

Để app chạy khi máy local tắt, deploy toàn bộ thư mục `C:\TaskHub` lên một host Node.js như Render, Railway hoặc Fly.io.

| Thiết lập | Giá trị |
| --- | --- |
| Start command | `node server.js` |
| Biến môi trường | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Không đưa lên Git | `.env` |

Sau khi deploy, dùng URL do host cấp. Supabase lưu và đồng bộ chat độc lập với máy local.

## Sẵn sàng đưa lên GitHub

Project đã sẵn sàng để push. Các file code, schema Supabase, cấu hình mẫu và Android wrapper đều có thể đưa lên repository; `.gitignore` đã chặn file key và file build local.

| Nơi cấu hình | File / nơi đặt | Có push GitHub không? |
| --- | --- | --- |
| Web local | `.env`, `notes.json` | Không |
| Android local | `android_webview/local.properties` | Không |
| Deploy Render/Railway/Fly | Environment Variables của host | Không |
| Mẫu để người khác cấu hình | `.env.example`, `android_webview/local.properties.example` | Có |

Hai giá trị cấu hình là `SUPABASE_URL` và `SUPABASE_ANON_KEY`. Key đang dùng là anon/Publishable key công khai, được giới hạn bằng RLS; **không bao giờ dùng hoặc đưa service_role key vào project**.

Nếu đây là lần đầu tạo repository tại thư mục này, chạy:

```powershell
cd C:\TaskHub
git init
git add .
git status
git commit -m "Release LIFE TERMINAL V1"
git branch -M main
git remote add origin <URL_REPOSITORY_GITHUB_CUA_BAN>
git push -u origin main
```

Trước lệnh `git commit`, kiểm tra `git status`: không được thấy `.env`, `notes.json`, `android_webview/local.properties`, `android_webview/app/build/`, hoặc file `.apk` trong danh sách staged. Một deployment mới sẽ tự bắt đầu với danh sách note web trống.

## Nếu bắt đầu làm tiếp sau V1

1. Đọc README này để biết trạng thái.
2. Chạy web bằng `node server.js` và thử `/room dungdongvaianh`.
3. Mọi thay đổi schema chat phải cập nhật cả [supabase/schema.sql](C:\TaskHub\supabase\schema.sql) và phần RLS tương ứng.
4. Không đưa service_role key vào frontend, `.env`, Git hoặc APK.
