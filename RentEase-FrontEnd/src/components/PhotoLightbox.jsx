import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Shared in-memory blob cache so images don't re-fetch repeatedly
const blobCache = new Map()

export async function fetchImageBlobUrl(imageId) {
  if (blobCache.has(imageId)) {
    return blobCache.get(imageId)
  }
  try {
    const blob = await api(`/api/maintenance/images/${imageId}`, { auth: true, responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    blobCache.set(imageId, url)
    return url
  } catch (err) {
    console.error(`Failed to load maintenance image ${imageId}:`, err)
    return null
  }
}

export function AuthImage({ id, imageUrl, alt = '', className = '', style = {}, onClick }) {
  const [src, setSrc] = useState(() => imageUrl || (id ? blobCache.get(id) : '') || '')
  const [loading, setLoading] = useState(!imageUrl && id && !blobCache.has(id))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (imageUrl) {
      setSrc(imageUrl)
      setLoading(false)
      return
    }
    if (!id) return
    if (blobCache.has(id)) {
      setSrc(blobCache.get(id))
      setLoading(false)
      return
    }

    let active = true
    fetchImageBlobUrl(id).then((url) => {
      if (!active) return
      if (url) {
        setSrc(url)
      } else {
        setFailed(true)
      }
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [id, imageUrl])

  if (loading) {
    return (
      <div
        className={`repair-thumb-loading ${className}`}
        style={{ width: '100%', height: '100%', minWidth: '38px', minHeight: '38px', background: 'var(--page-line)', borderRadius: '8px', ...style }}
      />
    )
  }

  if (failed || !src) {
    return (
      <div
        className={`repair-thumb-fallback ${className}`}
        style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--page-raised)', ...style }}
        title="Image unavailable"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ ...style, display: 'block' }}
      onClick={onClick}
      onError={() => setFailed(true)}
    />
  )
}

export function PhotoLightbox({ image, onClose }) {
  const allImages = Array.isArray(image?.allImages) && image.allImages.length > 0 ? image.allImages : (image ? [image] : [])
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = allImages.findIndex((i) => i.id === image?.id)
    return idx >= 0 ? idx : 0
  })

  useEffect(() => {
    if (image?.id) {
      const idx = allImages.findIndex((i) => i.id === image.id)
      if (idx >= 0) setCurrentIndex(idx)
    }
  }, [image?.id, allImages])

  const currentImg = allImages[currentIndex] || image
  const [loadedUrl, setLoadedUrl] = useState(() => currentImg?.image_url || currentImg?.url || (currentImg?.id ? blobCache.get(currentImg.id) : '') || '')
  const [loading, setLoading] = useState(!loadedUrl)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && allImages.length > 1) {
        setCurrentIndex((i) => (i + 1) % allImages.length)
      }
      if (e.key === 'ArrowLeft' && allImages.length > 1) {
        setCurrentIndex((i) => (i - 1 + allImages.length) % allImages.length)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, allImages.length])

  useEffect(() => {
    if (!currentImg) return
    const directUrl = currentImg.image_url || currentImg.url || (currentImg.id ? blobCache.get(currentImg.id) : '')
    if (directUrl) {
      setLoadedUrl(directUrl)
      setLoading(false)
      return
    }
    if (currentImg.id) {
      setLoading(true)
      fetchImageBlobUrl(currentImg.id).then((u) => {
        setLoadedUrl(u || '')
        setLoading(false)
      })
    }
  }, [currentImg])

  if (!currentImg) return null

  const isLandlordPhoto = currentImg.uploader_role === 'landlord'

  return (
    <div className="photo-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="photo-lightbox__panel" onClick={(e) => e.stopPropagation()}>
        <div className="photo-lightbox__head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{currentImg.file_name || 'Repair photo'}</span>
            {isLandlordPhoto ? (
              <span className="tag tag--ok" style={{ fontSize: '.72rem', padding: '2px 6px' }}>✓ Resolution proof</span>
            ) : (
              <span className="tag tag--warn" style={{ fontSize: '.72rem', padding: '2px 6px' }}>Reported issue</span>
            )}
            {allImages.length > 1 && (
              <span className="muted" style={{ fontSize: '.80rem', marginLeft: '6px' }}>
                ({currentIndex + 1} of {allImages.length})
              </span>
            )}
          </div>
          <div className="photo-lightbox__actions">
            {loadedUrl && (
              <a
                href={loadedUrl}
                download={currentImg.file_name || 'repair_photo.jpg'}
                className="btn btn--ghost btn--sm"
                style={{ color: '#e2e8f0' }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 19h16" /></svg>
                <span>Download</span>
              </a>
            )}
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="photo-lightbox__body" style={{ position: 'relative' }}>
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setCurrentIndex((i) => (i - 1 + allImages.length) % allImages.length)}
                aria-label="Previous photo"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '999px', width: '36px', height: '36px', padding: 0 }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setCurrentIndex((i) => (i + 1) % allImages.length)}
                aria-label="Next photo"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '999px', width: '36px', height: '36px', padding: 0 }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </>
          )}

          {loading ? (
            <p style={{ color: 'var(--page-muted)', padding: '60px 0' }}>Loading image…</p>
          ) : loadedUrl ? (
            <img src={loadedUrl} alt={currentImg.file_name || 'Repair photo preview'} className="photo-lightbox__img" />
          ) : (
            <p style={{ color: 'var(--danger)', padding: '60px 0' }}>Unable to load image.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Enhanced photo thumbnails component for repair tables and details.
 * Directly renders thumbnail previews with instant lightbox popup on click.
 */
export function RepairPhotoThumbnails({ images, onSelectImage, maxPreview = 3 }) {
  if (!images || images.length === 0) {
    return <span className="muted" style={{ fontSize: '.84rem' }}>—</span>
  }

  const previewList = images.slice(0, maxPreview)
  const remaining = images.length - maxPreview

  return (
    <div className="repair-thumbs-cell">
      {previewList.map((img) => {
        const isLandlord = img.uploader_role === 'landlord'
        return (
          <button
            key={img.id}
            type="button"
            className={`repair-thumb-btn ${isLandlord ? 'repair-thumb-btn--landlord' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              const url = img.image_url || blobCache.get(img.id) || null
              onSelectImage({ ...img, url, allImages: images })
            }}
            title={`${img.file_name || 'Photo'} (${isLandlord ? 'Resolution proof' : 'Reported issue'}) - Click to enlarge`}
          >
            <AuthImage id={img.id} imageUrl={img.image_url} alt={img.file_name || 'Repair photo'} />
            {isLandlord && (
              <span className="repair-thumb-badge" title="Resolution proof">✓</span>
            )}
          </button>
        )
      })}
      {remaining > 0 && (
        <button
          type="button"
          className="repair-photo-count-pill"
          onClick={(e) => {
            e.stopPropagation()
            const target = images[maxPreview]
            const url = target.image_url || blobCache.get(target.id) || null
            onSelectImage({ ...target, url, allImages: images })
          }}
          title={`View all ${images.length} photos`}
        >
          +{remaining}
        </button>
      )}
    </div>
  )
}

export function RepairFeaturedPhoto({ images, onSelectImage }) {
  const photo = images?.find((image) => image.uploader_role !== 'landlord')
  if (!photo) return null

  return (
    <button
      type="button"
      className="repair-featured-photo"
      onClick={() => {
        const url = photo.image_url || blobCache.get(photo.id) || null
        onSelectImage({ ...photo, url, allImages: images })
      }}
      aria-label={`View tenant-reported photo: ${photo.file_name || 'Repair photo'}`}
    >
      <AuthImage id={photo.id} imageUrl={photo.image_url} alt={photo.file_name || 'Tenant-reported repair photo'} />
      <span className="repair-featured-photo__label">Tenant-reported photo</span>
      {images.length > 1 && <span className="repair-featured-photo__count">{images.length} photos</span>}
    </button>
  )
}

/**
 * Backward-compatible alias that directly renders the thumbnails.
 */
export function RepairPhotoBadge(props) {
  return <RepairPhotoThumbnails {...props} />
}

/**
 * Compresses an image file using HTML5 Canvas to max dimension 1280px and JPEG quality 0.80.
 * Drastically shrinks 2MB-8MB camera photos down to ~90-180 KB (over 95% reduction in size),
 * keeping transfers to Aiven Cloud lightning fast on home Wi-Fi.
 */
export function compressImageFile(file, { maxWidth = 1280, maxHeight = 1280, quality = 0.80 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      return reject(new Error('Only image files (PNG, JPG, WebP) are allowed.'))
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width
        let h = img.height

        if (w > maxWidth || h > maxHeight) {
          if (w / maxWidth > h / maxHeight) {
            h = Math.round((h * maxWidth) / w)
            w = maxWidth
          } else {
            w = Math.round((w * maxHeight) / h)
            h = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)

        const compressedData = canvas.toDataURL('image/jpeg', quality)
        const baseName = (file.name || 'photo').replace(/\.[^/.]+$/, '')
        resolve({
          name: `${baseName}.jpg`,
          data: compressedData,
          size: Math.round((compressedData.length * 3) / 4),
        })
      }
      img.onerror = () => reject(new Error('Could not read image file.'))
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
