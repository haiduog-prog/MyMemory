/**
 * scripts/migrate-supabase-to-r2.ts
 * 
 * Script di chuyển toàn bộ ảnh/video từ Supabase Storage sang Cloudflare R2:
 * 1. Quét bảng `media_items` tìm các file đang lưu trên Supabase Storage.
 * 2. Tải từng file từ Supabase Storage.
 * 3. Upload sang Cloudflare R2 Bucket.
 * 4. Cập nhật URL mới trong bảng `media_items`.
 * 5. (Tùy chọn) Xóa file cũ trên Supabase Storage để giải phóng dung lượng.
 * 
 * Cách chạy:
 *   npx tsx scripts/migrate-supabase-to-r2.ts [--dry-run] [--delete-old]
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Load .env.local first, then fallback to .env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}
if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

// Load configurations from environment or fallback prompts
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');

const isDryRun = process.argv.includes('--dry-run');
const deleteOld = process.argv.includes('--delete-old');

async function main() {
  console.log('=====================================================');
  console.log('🚀 BẮT ĐẦU QUÁ TRÌNH DI CHUYỂN SUPABASE STORAGE -> CLOUDFLARE R2');
  console.log('=====================================================');

  if (isDryRun) {
    console.log('⚠️  CHẾ ĐỘ DRY-RUN: Chỉ kiểm tra, KHÔNG sửa đổi dữ liệu thực tế.\n');
  }

  // Validate credentials
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_DOMAIN) {
    console.error('❌ Thiếu biến môi trường Cloudflare R2:');
    console.error('   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_DOMAIN');
    console.error('\nHãy đặt các biến này trong file .env.local');
    process.exit(1);
  }

  // Initialize clients
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // 1. Fetch all items from Supabase DB (with pagination)
  console.log('🔍 Đang quét danh sách media trong bảng media_items...');
  
  const allMediaItems: any[] = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('media_items')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('❌ Lỗi khi lấy danh sách media:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allMediaItems.push(...data);
      from += data.length;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  // Check if RLS blocked the query
  if (allMediaItems.length === 0) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('\n⚠️  CẢNH BÁO: Bảng media_items trả về 0 bản ghi.');
      console.warn('👉 Nguyên nhân: Bảng media_items đang bật RLS (Row Level Security), nên anon key không được phép đọc.');
      console.warn('💡 Hướng dẫn sửa:');
      console.warn('   1. Mở Supabase Dashboard > Project Settings (⚙️) > API');
      console.warn('   2. Sao chép khóa "service_role" (secret)');
      console.warn('   3. Thêm vào .env.local: SUPABASE_SERVICE_ROLE_KEY=ey...\n');
      return;
    }
  }

  // Filter items hosted on Supabase Storage
  const supabaseItems = allMediaItems.filter(item => 
    item.url && item.url.includes('supabase.co')
  );

  console.log(`📊 Tổng số media trong DB: ${allMediaItems.length}`);
  console.log(`📦 Số lượng media đang nằm trên Supabase Storage cần chuyển: ${supabaseItems.length}\n`);

  if (supabaseItems.length === 0) {
    console.log('✅ Không có file nào cần di chuyển!');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < supabaseItems.length; i++) {
    const item = supabaseItems[i];
    const indexStr = `[${i + 1}/${supabaseItems.length}]`;
    console.log(`${indexStr} Đang xử lý: ID ${item.id}`);

    try {
      // 1. Extract storage path
      // Example Supabase URL: https://xyz.supabase.co/storage/v1/object/public/media/uploads/123_abc.jpg
      const urlObj = new URL(item.url);
      const publicPathPrefix = '/storage/v1/object/public/media/';
      let storagePath = '';
      if (urlObj.pathname.includes(publicPathPrefix)) {
        storagePath = urlObj.pathname.split(publicPathPrefix)[1];
      } else {
        const segments = urlObj.pathname.split('/');
        storagePath = `uploads/${segments[segments.length - 1]}`;
      }

      const r2Key = storagePath;
      const newPublicUrl = `${R2_PUBLIC_DOMAIN}/${r2Key}`;

      if (isDryRun) {
        console.log(`   👉 [Dry-run] Sẽ tải từ: ${item.url}`);
        console.log(`   👉 [Dry-run] Upload lên R2 Key: ${r2Key} -> URL mới: ${newPublicUrl}\n`);
        successCount++;
        continue;
      }

      // 2. Download file buffer from Supabase Storage
      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} khi tải từ Supabase: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || (item.media_type === 'video' ? 'video/mp4' : 'image/jpeg');
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 3. Upload to Cloudflare R2
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
      }));

      // 4. Update Database record
      const updatePayload: any = {
        url: newPublicUrl,
        thumbnail_url: newPublicUrl,
      };

      if (item.placeholder_url && item.placeholder_url.includes('supabase.co')) {
        updatePayload.placeholder_url = newPublicUrl;
      }

      const { error: updateError } = await supabase
        .from('media_items')
        .update(updatePayload)
        .eq('id', item.id);

      if (updateError) {
        throw new Error(`Lỗi cập nhật DB: ${updateError.message}`);
      }

      // 5. (Optional) Delete old file from Supabase Storage
      if (deleteOld) {
        const { error: deleteStorageError } = await supabase
          .storage
          .from('media')
          .remove([storagePath]);

        if (deleteStorageError) {
          console.warn(`   ⚠️ Không thể xóa file cũ trên Supabase: ${deleteStorageError.message}`);
        } else {
          console.log(`   🗑️ Đã xóa file cũ trên Supabase: ${storagePath}`);
        }
      }

      console.log(`   ✅ Đã chuyển thành công -> ${newPublicUrl}`);
      successCount++;
    } catch (err: any) {
      console.error(`   ❌ Thất bại (ID: ${item.id}): ${err.message}`);
      failCount++;
    }
  }

  console.log('\n=====================================================');
  console.log('🎉 KẾT QUẢ DI CHUYỂN:');
  console.log(`   - Thành công: ${successCount}`);
  console.log(`   - Thất bại:   ${failCount}`);
  console.log('=====================================================');
  if (!deleteOld && !isDryRun) {
    console.log('💡 Lưu ý: Các file cũ trên Supabase Storage vẫn được giữ nguyên.');
    console.log('   Khi đã kiểm tra web hoạt động tốt, bạn có thể chạy:');
    console.log('   npm run migrate:r2 -- --delete-old');
    console.log('   để xóa file cũ trên Supabase và đưa dung lượng Storage về 0 MB!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
