import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { initials } from '../lib/brand'

/**
 * Round profile picture, or the person's initials when they have not uploaded one.
 * The picture is private, so it is fetched with the login token and shown from a blob URL.
 * `user.avatar_v` changes after every upload/remove, which makes this reload.
 */
export default function Avatar({ user, large = false }) {
  const [src, setSrc] = useState('')
  const wants = !!user?.has_avatar

  useEffect(() => {
    if (!wants) { setSrc(''); return undefined }
    let url = ''
    let dead = false
    api('/api/profile/photo', { auth: true, responseType: 'blob' })
      .then((blob) => { if (!dead) { url = URL.createObjectURL(blob); setSrc(url) } })
      .catch(() => { if (!dead) setSrc('') })
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [wants, user?.avatar_v, user?.id])

  return (
    <span className={`avatar${large ? ' lg' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials(user?.full_name || user?.username || '')}
    </span>
  )
}
