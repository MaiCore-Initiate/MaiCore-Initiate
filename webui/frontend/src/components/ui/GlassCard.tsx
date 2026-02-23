import { type ReactNode, type CSSProperties, useRef, useState, useEffect } from 'react'

interface GlassCardProps {
  children: ReactNode
  radius?: number
  blur?: number
  shadow?: string
  borderColor?: string
  borderWidth?: number
  bgOpacity?: number
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export default function GlassCard({
  children,
  radius = 30,
  blur = 50,
  shadow = '6px 6px 4px rgba(0,0,0,0.35)',
  borderColor = 'rgba(0,0,0,0.5)',
  borderWidth = 2,
  bgOpacity = 0.45,
  className = '',
  style,
  onClick,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.top })
    }
    update()
    const raf = setInterval(update, 16)
    const timer = setTimeout(() => clearInterval(raf), 400)
    window.addEventListener('resize', update)
    return () => { clearInterval(raf); clearTimeout(timer); window.removeEventListener('resize', update) }
  }, [])

  return (
    <div ref={ref} className={`relative h-full ${className}`} style={style} onClick={onClick}>
      {/* 模糊背景层 */}
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius, zIndex: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: -pos.x,
            top: -pos.y,
            width: '100vw',
            height: '100vh',
            backgroundImage: "url('/bg-temp.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: `blur(${blur}px)`,
          }}
        />
        <div className="absolute inset-0" style={{ background: `rgba(255,255,255,${bgOpacity})` }} />
      </div>
      {/* 边框层 */}
      <div
        className="absolute w-full h-full pointer-events-none"
        style={{ borderRadius: radius, border: `${borderWidth}px solid ${borderColor}`, filter: `drop-shadow(${shadow})`, zIndex: 2 }}
      />
      {/* 内容层 */}
      <div
        className="relative h-full flex flex-col"
        style={{ borderRadius: radius, zIndex: 1 }}
      >
        {children}
      </div>
    </div>
  )
}
