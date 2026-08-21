import type {
  AlbumMediaStats,
  MediaItemPage,
  MediaItemPageOptions,
  MediaItemRepository,
} from '@domain/repositories/MediaItemRepository'
import type { MediaItem } from '@domain/entities/MediaItem'
import {
  buildImagePlaceholderUrl,
  buildTimelineThumbnailUrl,
} from '@/shared/mediaUrls'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../remote/supabaseClient'

export class SupabaseMediaItemRepository implements MediaItemRepository {
  async getAll(): Promise<MediaItem[]> {
    if (!supabase) throw new Error("Supabase client is not initialized.");
    
    const { data, error } = await supabase
      .from('media_items')
      .select('*')
      .order('date_taken', { ascending: false });

    if (error) throw new Error(error.message);

    return data.map(this.mapToEntity);
  }

  async getPage({ limit, offset, albumId }: MediaItemPageOptions): Promise<MediaItemPage> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    let query = supabase
      .from('media_items')
      .select('*', { count: 'exact' })
      .order('date_taken', { ascending: false })
      .range(offset, offset + limit - 1);

    if (albumId) {
      query = query.eq('album_id', albumId);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const items = (data ?? []).map(this.mapToEntity);
    const total = count ?? offset + items.length;
    const nextOffset = offset + items.length;

    return {
      items,
      total,
      hasMore: nextOffset < total,
      nextOffset,
    };
  }

  async getAlbumStats(): Promise<AlbumMediaStats[]> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    const { data, error } = await supabase.rpc('get_album_media_stats');
    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      albumId: row.album_id,
      mediaCount: Number(row.media_count ?? 0),
      coverImageUrl: row.cover_image_url ?? null,
    }));
  }

  async getById(id: string): Promise<MediaItem | null> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    const { data, error } = await supabase
      .from('media_items')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return this.mapToEntity(data);
  }

  async getByAlbumId(albumId: string): Promise<MediaItem[]> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    const { data, error } = await supabase
      .from('media_items')
      .select('*')
      .eq('album_id', albumId)
      .order('date_taken', { ascending: false });

    if (error) throw new Error(error.message);

    return data.map(this.mapToEntity);
  }

  async upload(
    file: File, 
    caption: string, 
    dateTaken: Date, 
    albumId?: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<MediaItem> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    let publicUrl = '';

    // 1. Try uploading to Cloudflare R2 via Supabase Edge Function
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        'get-r2-upload-url',
        {
          body: {
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
          },
        }
      );

      if (edgeError || !edgeData?.uploadUrl) {
        throw new Error(edgeError?.message || edgeData?.error || 'Could not retrieve R2 Presigned URL');
      }

      const { uploadUrl, publicUrl: r2PublicUrl } = edgeData;

      // Upload file directly to Cloudflare R2 using PUT
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(e.loaded, e.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload to Cloudflare R2 failed with HTTP status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload to Cloudflare R2'));
        xhr.send(file);
      });

      publicUrl = r2PublicUrl;
    } catch (r2Error: any) {
      console.warn('Cloudflare R2 upload not available, falling back to Supabase Storage:', r2Error?.message || r2Error);

      // Fallback: Upload to Supabase Storage ('media' bucket)
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/media/${filePath}`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
        xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(e.loaded, e.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.responseText);
          } else {
            try {
              const errorObj = JSON.parse(xhr.responseText);
              reject(new Error(`Upload failed: ${errorObj.message || xhr.responseText}`));
            } catch {
              reject(new Error(`Upload failed: ${xhr.responseText}`));
            }
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      const { data: publicUrlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      publicUrl = publicUrlData.publicUrl;
    }

    // Determine media type based on file type
    const isVideo = file.type.startsWith('video/');
    const mediaType = isVideo ? 'video' : 'image';
    const thumbnailUrl = publicUrl;
    const placeholderUrl = isVideo ? '' : publicUrl;

    // 2. Save record to 'media_items' table
    const { data: recordData, error: dbError } = await supabase
      .from('media_items')
      .insert([
        {
          album_id: albumId || null,
          media_type: mediaType,
          url: publicUrl,
          thumbnail_url: thumbnailUrl,
          placeholder_url: placeholderUrl,
          caption,
          date_taken: dateTaken.toISOString(),
        }
      ])
      .select()
      .single();

    if (dbError) throw new Error(dbError.message);

    return this.mapToEntity(recordData);
  }

  async assignToAlbum(id: string, albumId: string): Promise<void> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    const { error } = await supabase
      .from('media_items')
      .update({ album_id: albumId })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase client is not initialized.");

    // Note: To fully delete, we should also delete from storage if needed.
    // For now we just delete from DB.
    const { error } = await supabase
      .from('media_items')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  private mapToEntity(record: any): MediaItem {
    const isImage = record.media_type === 'image';
    const thumbnailSource = record.thumbnail_url || record.url;

    return {
      id: record.id,
      albumId: record.album_id,
      mediaType: record.media_type,
      url: record.url,
      thumbnailUrl: isImage ? buildTimelineThumbnailUrl(thumbnailSource) : thumbnailSource,
      placeholderUrl: isImage ? (record.placeholder_url || buildImagePlaceholderUrl(thumbnailSource)) : '',
      caption: record.caption,
      dateTaken: new Date(record.date_taken),
      createdAt: new Date(record.created_at),
    };
  }
}
