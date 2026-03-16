import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from './GlassCard'

interface ModalProps {
  open: boolean
  onClose?: () => void
  children: ReactNode
  width?: number
  radius?: number
}

export default function Modal({ open, onClose, children, width = 560, radius = 30 }: ModalProps) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" onClick={onClose}>
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
      {/* 弹窗内容 */}
      <div
        className="relative animate-scale-fade-in"
        style={{ width }}
        onClick={e => e.stopPropagation()}
      >
        <GlassCard radius={radius} blur={50} shadow="8px 8px 16px rgba(0,0,0,0.4)">
          {children}
        </GlassCard>
      </div>
    </div>,
    document.body
  )
}
