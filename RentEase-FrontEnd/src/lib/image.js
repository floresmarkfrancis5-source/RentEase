

const loadBitmap = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image the browser can read.')) }
    img.src = url
  })

const dataUrlBytes = (u) => Math.floor(((u.length - u.indexOf(',') - 1) * 3) / 4)

export async function compressImage(file, { maxSide, maxBytes, keepAlpha = false, square = false }) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('Choose a PNG, JPG or WebP picture.')
  const img = await loadBitmap(file)
  let side = maxSide
  for (let attempt = 0; attempt < 7; attempt++) {
    const sw = square ? Math.min(img.naturalWidth, img.naturalHeight) : img.naturalWidth
    const sh = square ? sw : img.naturalHeight
    const sx = (img.naturalWidth - sw) / 2
    const sy = (img.naturalHeight - sh) / 2
    const scale = Math.min(1, side / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * scale))
    const h = Math.max(1, Math.round(sh * scale))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!keepAlpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)

    const tries = keepAlpha
      ? [['image/png', undefined], ['image/webp', 0.9], ['image/webp', 0.75]]
      : [['image/webp', 0.86], ['image/webp', 0.74], ['image/jpeg', 0.8], ['image/jpeg', 0.66]]
    for (const [type, q] of tries) {
      const url = c.toDataURL(type, q)
      if (url.startsWith(`data:${type}`) && dataUrlBytes(url) <= maxBytes) return url
    }
    side = Math.round(side * 0.78)
  }
  throw new Error('This picture is too detailed to shrink enough. Try a smaller one.')
}
