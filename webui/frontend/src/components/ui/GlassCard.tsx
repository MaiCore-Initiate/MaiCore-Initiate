import { type ReactNode, type CSSProperties, useRef, useState, useEffect } from 'react'
import { useBgContext } from '../background/DynamicBackground'

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
  const { currentBgUrl, settings } = useBgContext()
  const [bgA, setBgA] = useState<string | null>(currentBgUrl)
  const [bgB, setBgB] = useState<string | null>(null)
  const [showA, setShowA] = useState(true)
  const prevUrlRef = useRef(currentBgUrl)

  // Handle background transition
  useEffect(() => {
    if (currentBgUrl !== prevUrlRef.current) {
      prevUrlRef.current = currentBgUrl
      if (showA) {
        setBgB(currentBgUrl)
        setShowA(false)
      } else {
        setBgA(currentBgUrl)
        setShowA(true)
      }
    }
  }, [currentBgUrl, showA])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let rafId = 0
    const update = () => {
      const rect = el.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.top })
    }
    const onScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }
    update()
    const raf = setInterval(update, 16)
    const timer = setTimeout(() => clearInterval(raf), 400)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', onScroll, true)
    return () => { clearInterval(raf); clearTimeout(timer); cancelAnimationFrame(rafId); window.removeEventListener('resize', update); window.removeEventListener('scroll', onScroll, true) }
  }, [])

  const renderBgLayer = (url: string | null, visible: boolean, key: string) => {
    if (!url) return null
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          left: -pos.x,
          top: -pos.y,
          width: '100vw',
          height: '100vh',
          backgroundImage: `url('${url}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: `blur(${blur}px)`,
          opacity: visible ? 1 : 0,
          transition: 'opacity 3s ease-in-out',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `rgba(${settings.overlay_color},${settings.overlay_opacity})`,
            backdropFilter: settings.overlay_blur > 0 ? `blur(${settings.overlay_blur}px)` : undefined,
          }}
        />
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative h-full ${className}`} style={style} onClick={onClick}>
      {/* 模糊背景层 - 使用双层实现渐变过渡 */}
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius, zIndex: 0 }}>
        {renderBgLayer(bgA, showA, 'bg-a')}
        {renderBgLayer(bgB, !showA, 'bg-b')}
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
