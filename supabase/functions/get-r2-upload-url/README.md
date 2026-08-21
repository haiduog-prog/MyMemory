# Hướng dẫn cấu hình Cloudflare R2 & Supabase Edge Function

## 1. Cấu hình trên Cloudflare Dashboard

### Bước 1.1: Tạo R2 Bucket
1. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com) > Chọn mục **R2**.
2. Bấm **Create bucket** > Đặt tên bucket (Ví dụ: `mymemory-media`) > Chọn Location (tự động hoặc gần Việt Nam như APAC).
3. Bấm **Create Bucket**.

### Bước 1.2: Bật Public Access cho Bucket
1. Trong bucket vừa tạo > chuyển sang tab **Settings**.
2. Cuộn xuống phần **Public Access**:
   - **Cách 1 (Nhanh nhất - Miễn phí):** Chọn **R2.dev subdomain** > Bấm **Connect**. Bạn sẽ nhận được một đường link dạng `https://pub-xxxxxx.r2.dev`.
   - **Cách 2 (Chuyên nghiệp):** Chọn **Custom Domain** > Nhập tên miền phụ (ví dụ: `media.yourdomain.com`) nếu bạn đã trỏ domain về Cloudflare.

### Bước 1.3: Cấu hình CORS cho R2 Bucket
1. Trong tab **Settings** của Bucket > Cuộn xuống **CORS Policy** > Bấm **Add CORS policy**.
2. Dán cấu hình JSON sau:
```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://*.vercel.app",
      "https://your-production-domain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
*(Bạn có thể thay `AllowedOrigins` thành `["*"]` trong giai đoạn thử nghiệm nếu muốn)*.

### Bước 1.4: Tạo R2 API Token
1. Quay lại trang chủ **R2** > Ở cột bên phải chọn **Manage R2 API Tokens**.
2. Bấm **Create API Token**:
   - Token Name: `mymemory-r2-token`
   - Permissions: **Object Read & Write**
   - Apply to specific bucket: Chọn bucket `mymemory-media` (hoặc All buckets).
3. Bấm **Create API Token**.
4. **LƯU LẠI CÁC THÔNG TIN QUAN TRỌNG:**
   - **Account ID** (hiển thị ở trang tổng quan R2)
   - **Access Key ID**
   - **Secret Access Key**

---

## 2. Cấu hình Secrets trên Supabase Dashboard

1. Mở [Supabase Dashboard](https://supabase.com/dashboard) > Chọn Project của bạn.
2. Vào mục **Project Settings** (biểu tượng bánh răng) > **Edge Functions** (hoặc tab **Secrets**).
3. Thêm các Environment Variables (Secrets) sau:
   - `R2_ACCOUNT_ID`: *<Account ID từ Cloudflare>*
   - `R2_ACCESS_KEY_ID`: *<Access Key ID từ Cloudflare>*
   - `R2_SECRET_ACCESS_KEY`: *<Secret Access Key từ Cloudflare>*
   - `R2_BUCKET_NAME`: `mymemory-media`
   - `R2_PUBLIC_DOMAIN`: `https://pub-xxxxxx.r2.dev` *(hoặc https://media.yourdomain.com)*

---

## 3. Triển khai (Deploy) Edge Function lên Supabase

Sử dụng Supabase CLI từ máy tính của bạn:
```bash
# Đăng nhập Supabase CLI nếu chưa đăng nhập
npx supabase login

# Link tới project của bạn (lấy Project Ref trong Supabase Dashboard)
npx supabase link --project-ref <your-project-ref>

# Deploy function
npx supabase functions deploy get-r2-upload-url --no-verify-jwt
```
*Lưu ý: Flag `--no-verify-jwt` cho phép client ẩn danh hoặc client đã xác thực gọi lấy URL upload theo chính sách của app.*
