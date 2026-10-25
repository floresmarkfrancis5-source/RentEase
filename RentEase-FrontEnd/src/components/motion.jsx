import { createElement, useEffect, useRef } from 'react'

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Fades an element in when it scrolls into view. <Reveal as="h2" delay=".1s">…</Reveal> */
export function Reveal({ as = 'div', delay, className = '', children, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (reducedMotion() || !('IntersectionObserver' in window)) { el.classList.add('in'); return undefined }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }), { threshold: 0.14, rootMargin: '0px 0px -6% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return createElement(as, { ref, 'data-reveal': '', className, style: delay ? { '--rd': delay } : undefined, ...rest }, children)
}

/** Slow floating glow particles on the hero canvas. */
export function useDust(canvasRef, heroRef, enabled = true) {
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !enabled || reducedMotion()) return undefined
    const ctx = c.getContext('2d')
    let w = 0, h = 0, dpr = 1, parts = [], visible = true, t = 0, raf = 0
    const rnd = (a, b) => a + Math.random() * (b - a)
    const spawn = (anywhere) => ({
      x: rnd(0, w), y: anywhere ? rnd(0, h) : h + 20, r: rnd(0.6, 2.2) * dpr,
      vx: rnd(-0.12, 0.12) * dpr, vy: -rnd(0.08, 0.3) * dpr, a: rnd(0.18, 0.6), ph: rnd(0, 6.28), sp: rnd(0.4, 1.2),
    })
    const resize = () => {
      const r = c.getBoundingClientRect()
      if (!r.width) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = c.width = Math.round(r.width * dpr)
      h = c.height = Math.round(r.height * dpr)
      parts = Array.from({ length: w < 700 * dpr ? 26 : 48 }, () => spawn(true))
    }
    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden || !w) return
      t += 0.016
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.x += p.vx + Math.sin(t * p.sp + p.ph) * 0.18 * dpr
        p.y += p.vy
        if (p.y < -20) Object.assign(p, spawn(false))
        const a = p.a * (0.6 + 0.4 * Math.sin(t * p.sp * 2 + p.ph))
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        g.addColorStop(0, `rgba(255,214,150,${a})`)
        g.addColorStop(1, 'rgba(255,214,150,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 4, 0, 6.283)
        ctx.fill()
      }
    }
    resize()
    window.addEventListener('resize', resize)
    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null
    ro?.observe(c)
    const io = 'IntersectionObserver' in window && heroRef.current ? new IntersectionObserver((es) => { visible = es[0].isIntersecting }) : null
    io?.observe(heroRef.current)
    frame()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); ro?.disconnect(); io?.disconnect() }
  }, [canvasRef, heroRef, enabled])
}

/** Scroll progress bar + the soft circle that follows the mouse (desktop only). */
export function PageMotion() {
  const bar = useRef(null)
  const cur = useRef(null)

  useEffect(() => {
    let tick = false
    const on = () => {
      if (tick) return
      tick = true
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`
        tick = false
      })
    }
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    on()
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])

  useEffect(() => {
    const c = cur.current
    if (!c || reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0
    const move = (e) => { tx = e.clientX; ty = e.clientY; c.classList.add('on') }
    const leave = () => c.classList.remove('on')
    const over = (e) => c.classList.toggle('big', !!e.target.closest?.('a, button, select, label, summary'))
    window.addEventListener('mousemove', move, { passive: true })
    document.addEventListener('mouseleave', leave)
    document.addEventListener('mouseover', over)
    const loop = () => { x += (tx - x) * 0.18; y += (ty - y) * 0.18; c.style.transform = `translate3d(${x}px, ${y}px, 0)`; raf = requestAnimationFrame(loop) }
    loop()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', leave); document.removeEventListener('mouseover', over) }
  }, [])

  return (
    <>
      <div className="progress" ref={bar} aria-hidden="true" />
      <div className="cursor" ref={cur} aria-hidden="true" />
    </>
  )
}
