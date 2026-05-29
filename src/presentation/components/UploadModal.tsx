import { useState, useRef, useCallback, useEffect, type FC, type DragEvent } from 'react'
import type { Album } from '@domain/entities/Album'
import { useUploadMedia } from '../hooks/useUploadMedia'

interface UploadModalProps {
  isOpen: boolean
  albums: Album[]
  initialAlbumId?: string
  onClose: () => void
  onSuccess: () => void
  pastedFiles?: File[]
  onClearPastedFiles?: () => void
}

/**
 * UploadModal — Drag-and-drop mediaItem upload dialog.
 *
 * Features:
 * - Drag & drop or click-to-select file picker
 * - Live image preview
 * - Caption, date, and album selector fields
 * - Upload progress with success/error feedback
 */
export const UploadModal: FC<UploadModalProps> = ({ 
  isOpen, 
  albums, 
  initialAlbumId, 
  onClose, 
  onSuccess,
  pastedFiles,
  onClearPastedFiles
}) => {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [dateTaken, setDateTaken] = useState(new Date().toISOString().slice(0, 10))
  const [albumId, setAlbumId] = useState(initialAlbumId || '')
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Update albumId if initialAlbumId changes while modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAlbumId(initialAlbumId || '')
    }
  }, [initialAlbumId, isOpen])

  const handleUploadSuccess = useCallback(() => {
    // Short delay so user sees success state
    setTimeout(() => {
      onSuccess()
      resetForm()
    }, 800)
  }, [onSuccess])

  const { isUploading, progress, loadedBytes, totalBytes, error, success, upload, reset: resetUpload } = useUploadMedia(handleUploadSuccess)

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Keyboard: Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isUploading, onClose])

  const resetForm = () => {
    setFiles([])
    previews.forEach(p => URL.revokeObjectURL(p))
    setPreviews([])
    setCaption('')
    setDateTaken(new Date().toISOString().slice(0, 10))
    setAlbumId(initialAlbumId || '')
    resetUpload()
  }

  const handleClose = () => {
    if (isUploading) return
    resetForm()
    onClose()
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) handleClose()
  }

  const handleFileSelect = (selectedFiles: FileList | File[]) => {
    const validFiles = Array.from(selectedFiles).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    if (validFiles.length === 0) return
    
    setFiles(prev => [...prev, ...validFiles])
    
    const newPreviews = validFiles.map(f => URL.createObjectURL(f))
    setPreviews(prev => [...prev, ...newPreviews])
  }

  // Handle pasted files from clipboard
  useEffect(() => {
    if (isOpen && pastedFiles && pastedFiles.length > 0) {
      handleFileSelect(pastedFiles)
      onClearPastedFiles?.()
    }
  }, [isOpen, pastedFiles, onClearPastedFiles])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files)
    }
    // Cho phép chọn lại cùng 1 file (hoặc file khác) ở lần tiếp theo
    e.target.value = ''
  }
  // Drag & drop
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  const handleSubmit = async () => {
    if (files.length === 0) return
    await upload(files, caption, new Date(dateTaken), albumId || undefined)
  }

  const isFormValid = files.length > 0

  if (!isOpen) return null

  return (
    <div
      className="upload-modal"
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Thêm kỷ niệm"
    >
      <div className="upload-modal__panel">
        {/* Header */}
        <div className="upload-modal__header">
          <h2 className="upload-modal__title">Thêm kỷ niệm mới</h2>
          <button
            className="upload-modal__close"
            onClick={handleClose}
            disabled={isUploading}
            aria-label="Đóng"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="upload-modal__body">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            multiple
            onChange={handleInputChange}
            className="upload-modal__file-input"
            aria-label="Chọn file"
            style={{ display: 'none' }}
          />

          {/* Drop zone / Preview */}
          {previews.length === 0 ? (
            <div
              className={`upload-modal__dropzone ${isDragging ? 'upload-modal__dropzone--active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
            >
              <div className="upload-modal__dropzone-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="upload-modal__dropzone-text">
                Kéo thả ảnh hoặc video vào đây
              </p>
              <p className="upload-modal__dropzone-hint">
                hoặc nhấn để chọn • Tối đa 200MB
              </p>
            </div>
          ) : (
            <div className="upload-modal__preview-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: 'var(--space-2)',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: 'var(--space-2)'
            }}>
              {files.map((file, idx) => {
                const isVideo = file.type.startsWith('video/');
                return (
                  <div key={idx} style={{ position: 'relative', aspectRatio: '1/1', background: '#000', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    {isVideo ? (
                      <video
                        src={previews[idx]}
                        className="upload-modal__preview-video"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <img
                        src={previews[idx]}
                        alt={`Xem trước ${idx + 1}`}
                        className="upload-modal__preview-image"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                    <button
                      className="upload-modal__preview-remove"
                      onClick={() => {
                        setFiles(prev => prev.filter((_, i) => i !== idx))
                        URL.revokeObjectURL(previews[idx])
                        setPreviews(prev => prev.filter((_, i) => i !== idx))
                      }}
                      aria-label="Xóa file này"
                      disabled={isUploading}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )
              })}
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                style={{
                  aspectRatio: '1/1',
                  border: '2px dashed var(--color-sand-200)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--color-sand-400)'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          )}

          {/* Fields */}
          <div className="upload-modal__fields">
            {/* Caption */}
            <div className="upload-modal__field">
              <label htmlFor="uploadCaption" className="upload-modal__label">
                Caption
                <span className="upload-modal__optional" style={{ fontWeight: 'normal', color: 'var(--color-text-muted)', fontSize: '0.75rem', marginLeft: 'var(--space-2)' }}>(không bắt buộc)</span>
              </label>
              <textarea
                id="uploadCaption"
                className="upload-modal__textarea"
                placeholder="Khoảnh khắc này có gì đặc biệt?"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={isUploading}
              />
              <span className="upload-modal__char-count">
                {caption.length}/500
              </span>
            </div>

            {/* Date & Album row */}
            <div className="upload-modal__row">
              <div className="upload-modal__field upload-modal__field--half">
                <label htmlFor="uploadDate" className="upload-modal__label">
                  Ngày
                </label>
                <input
                  id="uploadDate"
                  type="date"
                  className="upload-modal__input"
                  value={dateTaken}
                  onChange={(e) => setDateTaken(e.target.value)}
                  disabled={isUploading}
                />
              </div>

              <div className="upload-modal__field upload-modal__field--half">
                <label htmlFor="uploadAlbum" className="upload-modal__label">
                  Album
                </label>
                <select
                  id="uploadAlbum"
                  className="upload-modal__select"
                  value={albumId}
                  onChange={(e) => setAlbumId(e.target.value)}
                  disabled={isUploading}
                >
                  <option value="">Không chọn album</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="upload-modal__progress-container" style={{ marginTop: 'var(--space-2)' }}>
                <div 
                  className="upload-modal__progress-bar" 
                  style={{ 
                    height: '4px', 
                    background: 'var(--color-sand-200)', 
                    borderRadius: '2px', 
                    overflow: 'hidden' 
                  }}
                >
                  <div 
                    style={{ 
                      height: '100%', 
                      background: 'var(--color-accent)', 
                      width: `${progress}%`,
                      transition: 'width 0.2s ease-out'
                    }} 
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{(progress || 0).toFixed(0)}%</span>
                  <span>
                    {((loadedBytes || 0) / (1024 * 1024)).toFixed(1)} / {((totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="upload-modal__error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="upload-modal__footer">
          <button
            className="upload-modal__btn upload-modal__btn--cancel"
            onClick={handleClose}
            disabled={isUploading}
          >
            Hủy
          </button>
          <button
            className="upload-modal__btn upload-modal__btn--submit"
            onClick={handleSubmit}
            disabled={!isFormValid || isUploading}
          >
            {isUploading ? (
              <>
                <div className="upload-modal__btn-spinner" />
                Đang tải lên...
              </>
            ) : success ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Thành công!
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Tải lên
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
