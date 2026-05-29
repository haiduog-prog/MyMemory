import { useState, useCallback, useEffect, type FC } from 'react'
import { useRouter } from './presentation/hooks/useRouter'
import { useAlbums } from './presentation/hooks/useAlbums'
import { usePageTracking } from './presentation/hooks/usePageTracking'
import { Header } from './presentation/components/Header'
import { Footer } from './presentation/components/Footer'
import { UploadModal } from './presentation/components/UploadModal'
import { CreateAlbumModal } from './presentation/components/CreateAlbumModal'
import { TimelinePage } from './presentation/pages/TimelinePage'
import { AlbumsPage } from './presentation/pages/AlbumsPage'
import { AlbumDetailPage } from './presentation/pages/AlbumDetailPage'
import { AnalyticsPage } from './presentation/pages/AnalyticsPage'

const App: FC = () => {
  const { route, navigate } = useRouter()
  const { albums, refresh: refreshAlbums } = useAlbums()
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pastedFiles, setPastedFiles] = useState<File[]>([])

  // Track page views automatically
  usePageTracking(route.page)

  // Listen for global paste events to auto-open UploadModal
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Chống dán nhầm khi đang gõ chữ ở input, textarea hoặc contenteditable
      const activeEl = document.activeElement
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )
      if (isInput) return

      if (!e.clipboardData) return
      const items = e.clipboardData.items
      const validFiles: File[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
          const file = item.getAsFile()
          if (file) {
            // Chuẩn hóa tên file cho ảnh chụp màn hình (screenshot thường có tên mặc định "image.png")
            const extension = file.type.split('/')[1] || 'png'
            const formattedFile = new File([file], `clipboard-${Date.now()}-${i}.${extension}`, {
              type: file.type,
              lastModified: file.lastModified
            })
            validFiles.push(formattedFile)
          }
        }
      }

      if (validFiles.length > 0) {
        e.preventDefault()
        setPastedFiles(validFiles)
        setIsUploadOpen(true)
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [])

  const handleNavigate = (page: 'timeline' | 'albums' | 'analytics') => {
    navigate({ page })
  }

  const handleUploadSuccess = useCallback(() => {
    setIsUploadOpen(false)
    setRefreshKey(k => k + 1)
  }, [])

  const handleCreateAlbumSuccess = useCallback(() => {
    setIsCreateAlbumOpen(false)
    refreshAlbums()
    setRefreshKey(k => k + 1)
  }, [refreshAlbums])

  const renderPage = () => {
    switch (route.page) {
      case 'timeline':
        return <TimelinePage key={refreshKey} />
      case 'albums':
        return (
          <AlbumsPage
            key={refreshKey}
            onAlbumClick={(albumId) => navigate({ page: 'album-detail', albumId })}
          />
        )
      case 'album-detail':
        return (
          <AlbumDetailPage
            key={refreshKey}
            albumId={route.albumId}
            onBack={() => navigate({ page: 'albums' })}
          />
        )
      case 'analytics':
        return <AnalyticsPage key={refreshKey} />
    }
  }

  const handleFabClick = () => {
    if (route.page === 'albums') {
      setIsCreateAlbumOpen(true)
    } else {
      setIsUploadOpen(true)
    }
  }

  // Hide FAB on analytics page
  const showFab = route.page !== 'analytics'

  return (
    <>
      <Header currentPage={route.page} onNavigate={handleNavigate} />
      <main className="main-content">
        {renderPage()}
      </main>
      <Footer />

      {/* Floating action button */}
      {showFab && (
        <button
          className="fab"
          onClick={handleFabClick}
          aria-label={route.page === 'albums' ? 'Tạo album mới' : 'Tải ảnh lên'}
        >
          {route.page === 'albums' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
      )}

      {/* Upload modal */}
      <UploadModal
        isOpen={isUploadOpen}
        albums={albums}
        initialAlbumId={route.page === 'album-detail' ? route.albumId : undefined}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        pastedFiles={pastedFiles}
        onClearPastedFiles={() => setPastedFiles([])}
      />

      {/* Create Album modal */}
      <CreateAlbumModal
        isOpen={isCreateAlbumOpen}
        onClose={() => setIsCreateAlbumOpen(false)}
        onSuccess={handleCreateAlbumSuccess}
      />
    </>
  )
}

export default App

