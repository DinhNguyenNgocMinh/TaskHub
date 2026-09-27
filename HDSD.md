# HƯỚNG DẪN SỬ DỤNG

## Bắt đầu

Nhấn nút `/` để mở terminal.

Gõ lệnh rồi nhấn nút `›` để chạy.

Nhấn `⇥` để nhận gợi ý lệnh.

Nhấn `_` để chèn dấu phân cách.

## Ghi chú

Tạo ghi chú:

```text
/note <nội dung> _ <ngày-tháng-năm>
```

Deadline là tùy chọn.

Sau khi tạo, nhập mã task gồm đúng hai chữ cái.

Xem ghi chú:

```text
/noteshow [all|incomplete|complete|nodeadline|overdue]
```

Đánh dấu hoàn thành:

```text
/notedone <mã-task>
```

Xóa một ghi chú:

```text
/notedrop <mã-task>
```

Nhập `toichacxoa<mã-task>` để xác nhận xóa.

Xóa tất cả ghi chú:

```text
/noteclear
```

Nhập `xoahetghichu` để xác nhận.

## Chat room

Mở phòng chat:

```text
/room <tên-phòng>
```

Gửi tin nhắn:

```text
/msg <tên-phòng> <nội-dung>
```

Tin nhắn tối đa 100 ký tự.

## Terminal

Xem các lệnh đang hoạt động:

```text
/help
```

Xóa lịch sử đang hiển thị:

```text
/clear
```

Lệnh này không xóa ghi chú.

Nhấn `Esc` để đóng terminal.

## Lưu ý

Ghi chú chỉ lưu trên thiết bị hiện tại.

Ghi chú không đồng bộ giữa web và app.

Chat room đồng bộ qua Supabase.
