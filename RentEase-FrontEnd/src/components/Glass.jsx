import { useCallback } from 'react'

/** Liquid-glass surface with a specular highlight that follows the pointer. */
export default function Glass({ as: Tag = 'div', className = '', children, ...rest }) {
  const onMove = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])
  return (
    <Tag className={`glass ${className}`} onPointerMove={onMove} {...rest}>
      {children}
    </Tag>
  )
}
