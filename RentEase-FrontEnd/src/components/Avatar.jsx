import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { initials } from '../lib/brand'
import { useAuth } from '../context/AuthContext'

// Cache and deduplicate concurrent avatar fetches across multiple Avatar instances
let sharedBlobUrl = ''
let sharedBlobPromise = null
let lastAvatarV = 0

function fetchSharedPhotoBlob(avatarV) {
  if (avatarV !== lastAvatarV) {
    if (sharedBlobUrl) URL.revokeObjectURL(sharedBlobUrl)
    sharedBlobUrl = ''
    sharedBlobPromise = null
    lastAvatarV = avatarV
  }
  if (sharedBlobUrl) return Promise.resolve(sharedBlobUrl)
  if (!sharedBlobPromise) {
    sharedBlobPromise = api('/api/profile/photo', { auth: true, responseType: 'blob' })
      .then((blob) => {
        sharedBlobUrl = URL.createObjectURL(blob)
        return sharedBlobUrl
      })
      .catch(() => '')
      .finally(() => {
        sharedBlobPromise = null
      })
  }
  return sharedBlobPromise
}

/**
 * Round profile picture, or the person's initials when they have not uploaded one.
 * If a Cloudinary CDN URL (avatar_url) is present, it is rendered directly with zero backend calls.
 * Otherwise, only the currently logged-in user fetches their private local photo blob (deduplicated).
 */
export default function Avatar({ user, large = false }) {
  const auth = useAuth()
  const currentUserId = auth?.user?.id
  const [src, setSrc] = useState('')
  const wants = !!user?.has_avatar

  useEffect(() => {
    if (!wants) { setSrc(''); return undefined }
    if (user?.avatar_url) {
      setSrc(user.avatar_url)
      return undefined
    }
    // Only the logged-in user can fetch their private local photo blob
    if (!currentUserId || (user?.id && user.id !== currentUserId)) {
      setSrc('')
      return undefined
    }
    let dead = false
    fetchSharedPhotoBlob(user?.avatar_v || 0).then((url) => {
      if (!dead) setSrc(url || '')
    })
    return () => { dead = true }
  }, [wants, user?.avatar_url, user?.avatar_v, user?.id, currentUserId])

  return (
    <span className={`avatar${large ? ' lg' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials(user?.full_name || user?.username || '')}
    </span>
  )
}
