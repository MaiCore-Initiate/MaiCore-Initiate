import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBgContext } from '../background/DynamicBackground'

type ToastLevel = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: number
  message: string
  level: ToastLevel
  exiting?: boolean
}

interface NotificationContextValue {
  notify: (message: string, level?: ToastLevel) => void
}

const NotificationContext = createContext<NotificationContextValue>({ notify: () => {} })

export const useNotification = () => useContext(NotificationContext)

let _id = 0

const LEVEL_COLORS: Record<ToastLevel, string> = {
  success: '#08e300',
  error: '#ff4444',
  warning: '#ffaa00',
  info: '#60a5fa',
}

/** 单个 Toast：用内嵌模糊背景图代替 backdrop-filter */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
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

  // 获取 toast 在视口中的位置，用于偏移内部背景图
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.top })
    }
    update()
    // 动画期间持续更新位置
    const raf = setInterval(update, 16)
    const timer = setTimeout(() => clearInterval(raf), 400)
    return () => { clearInterval(raf); clearTimeout(timer) }
  }, [])

  const color = LEVEL_COLORS[toast.level]

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
          filter: 'blur(50px)',
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
    <div
      ref={ref}
      onClick={() => onRemove(toast.id)}
      className={`relative cursor-pointer overflow-hidden rounded-[20px] ${toast.exiting ? 'animate-notification-out' : 'animate-notification-in'}`}
      style={{ minWidth: 300, maxWidth: 422 }}
    >
      {/* 模糊背景层：克隆页面背景图 + blur - 使用双层实现渐变过渡 */}
      <div className="absolute inset-0 overflow-hidden rounded-[20px]" style={{ zIndex: 0 }}>
        {renderBgLayer(bgA, showA, 'bg-a')}
        {renderBgLayer(bgB, !showA, 'bg-b')}
        {/* 白色叠加层 */}
        <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.45)' }} />
      </div>

      {/* 边框层 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          borderRadius: 20,
          borderTop: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          borderBottom: `2px solid ${color}`,
          borderLeft: `5px solid ${color}`,
          filter: 'drop-shadow(8px 8px 12px rgba(0,0,0,0.57))',
        }}
      />

      {/* 文字内容层 */}
      <div className="relative" style={{ zIndex: 1, padding: '24px 32px' }}>
        <span style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
          {toast.message}
        </span>
      </div>
    </div>
  )
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const el = document.getElementById('notification-root')
    if (el) setPortalTarget(el)
  }, [])

  const remove = useCallback((id: number) => {
    setToasts(p => p.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 300)
  }, [])

  const notify = useCallback((message: string, level: ToastLevel = 'info') => {
    const id = ++_id
    setToasts(p => [...p, { id, message, level }])
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      remove(id)
    }, 3500)
    timersRef.current.set(id, timer)
  }, [remove])

  const handleRemove = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    remove(id)
  }, [remove])

  const toastElements = toasts.length > 0 && (
    <div className="absolute bottom-[24px] right-[24px] flex flex-col gap-[12px] pointer-events-auto">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={handleRemove} />
      ))}
    </div>
  )

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      {toastElements && portalTarget && createPortal(toastElements, portalTarget)}
    </NotificationContext.Provider>
  )
}
