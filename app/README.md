# TaskHub Android

Android là WebView wrapper cho nguồn giao diện chung tại `../web/public`. Khi build, Gradle đóng gói trực tiếp các file này cùng `app/src/main/bridge-assets/chat-config.js`; không có bản HTML/CSS/JS Android riêng để duy trì.

## Cấu hình local

Sao chép `local.properties.example` thành `local.properties`, giữ dòng `sdk.dir`, rồi thêm:

```properties
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key-cua-ban>
```

`SUPABASE_ANON_KEY` cũ vẫn được hỗ trợ tạm thời để tương thích cấu hình trước đó. Không dùng secret/service-role key trong APK.

## Build

```powershell
cd C:\TaskHub\app
.\gradlew.bat assembleRelease
```

APK release được tạo ở `app\build\outputs\apk\release\app-release.apk`.
