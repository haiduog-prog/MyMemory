# Clipboard Paste Upload

> Tổng hợp kiến thức về tính năng dán trực tiếp tệp hình ảnh/video từ clipboard vào luồng upload trong dự án MyMemory.
> Cập nhật lần cuối: 2026-05-29

---

## Architecture

### Quản lý sự kiện dán toàn cục qua React State một chiều
- **Ngày**: 2026-05-29
- **Chi tiết**: Lựa chọn bắt sự kiện `paste` toàn cục tại component cha (`App.tsx`), quản lý tệp dán qua một state trung gian và truyền xuống cho component con (`UploadModal.tsx`) thay vì quản lý ẩn/hiện modal bằng CSS. Thiết kế này bảo toàn cấu trúc React chuẩn, giúp giữ nguyên cơ chế render có điều kiện, các hiệu ứng đóng/mở mượt mà và logic khóa scroll body của modal mà không làm phân mảnh logic hiển thị.
- **Files liên quan**: `src/App.tsx`, `src/presentation/components/UploadModal.tsx`

---

## Bugs & Solutions

### Chống dán nhầm khi đang nhập liệu văn bản
- **Ngày**: 2026-05-29
- **Vấn đề**: Người dùng nhấn `Ctrl + V` để dán văn bản (text) vào ô nhập liệu caption nhưng vô tình kích hoạt sự kiện dán tệp tin toàn cục, khiến ảnh cũ hoặc ảnh trong clipboard bị nạp thêm vào hàng đợi upload.
- **Root cause**: Sự kiện `paste` đăng ký trên `window` sẽ bắt được mọi hành động dán trên trang, kể cả khi người dùng đang thao tác trong các phần tử nhập liệu.
- **Fix**: Sử dụng cơ chế phòng thủ bằng cách kiểm tra `document.activeElement`. Nếu tiêu điểm đang nằm ở các thẻ `INPUT`, `TEXTAREA` hoặc thẻ có thuộc tính `contenteditable="true"`, ta lập tức thoát khỏi listener và cho phép hành vi dán mặc định hoạt động.
- **Files liên quan**: `src/App.tsx`

### Tránh trùng lặp tên file cho ảnh chụp màn hình (Screenshot)
- **Ngày**: 2026-05-29
- **Vấn đề**: Mọi ảnh chụp màn hình được copy trực tiếp từ clipboard (bằng phím PrintScreen hoặc Windows+Shift+S) đều có tên tệp mặc định giống hệt nhau (thường là `image.png`), gây ra xung đột hoặc lỗi đè file trên server/storage.
- **Root cause**: Hệ điều hành tự động đặt tên tĩnh `image.png` cho các tệp nhị phân tạm thời lưu trong clipboard.
- **Fix**: Chuẩn hóa lại tên file khi trích xuất dữ liệu bằng cách clone sang một object `File` mới có tên duy nhất dựa trên timestamp và index: `clipboard-[timestamp]-[index].[extension]`.
- **Files liên quan**: `src/App.tsx`

---

## How-To

### Cách tích hợp tính năng Paste ảnh từ clipboard ở mọi nơi
- **Ngày**: 2026-05-29
- **Bước thực hiện**:
  1. **Đăng ký lắng nghe toàn cục**: Dùng `useEffect` trong root component (`App.tsx`) để lắng nghe sự kiện `paste` trên `window`.
  2. **Trích xuất File nhị phân**: Kiểm tra `e.clipboardData.items`, lọc các item có kiểu bắt đầu bằng `image/` hoặc `video/`, trích xuất file bằng `item.getAsFile()`.
  3. **Truyền Props và Kích hoạt**: Lưu file vào state cha `pastedFiles` và set `isUploadOpen(true)`. Truyền prop `pastedFiles` và callback dọn dẹp `onClearPastedFiles` xuống modal.
  4. **Nạp và Dọn dẹp ở Modal**: Trong modal, viết `useEffect` phản hồi sự thay đổi của prop `pastedFiles`. Gọi hàm xử lý file để nạp và sinh previews, sau đó kích hoạt callback dọn dẹp ở cha để tránh nạp lặp lại ở lần mở modal sau.
- **Files liên quan**: `src/App.tsx`, `src/presentation/components/UploadModal.tsx`

---

## Patterns

### Tái sử dụng logic nạp file có sẵn bằng trigger Props
- **Ngày**: 2026-05-29
- **Chi tiết**: Thay vì viết lại logic xử lý FileList, lọc type và tạo object URL xem trước phức tạp, chúng ta tái sử dụng hàm helper `handleFileSelect` có sẵn của modal. Đồng thời sử dụng `useEffect` có điều kiện chặn `isOpen && pastedFiles && pastedFiles.length > 0` như một trigger phản hồi để biến đổi dữ liệu một cách đồng bộ.
- **Ví dụ code**:
  ```typescript
  useEffect(() => {
    if (isOpen && pastedFiles && pastedFiles.length > 0) {
      handleFileSelect(pastedFiles)
      onClearPastedFiles?.()
    }
  }, [isOpen, pastedFiles, onClearPastedFiles])
  ```
- **Files liên quan**: `src/presentation/components/UploadModal.tsx`
