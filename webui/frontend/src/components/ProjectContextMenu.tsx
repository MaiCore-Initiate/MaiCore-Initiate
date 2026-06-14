import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ProjectContextAction = 'delete' | 'edit' | 'auto' | 'folder' | 'card'

export interface ContextMenuProject {
  sequence: string
  mod_name: string
  force_folder?: boolean | null
}

export default function ProjectContextMenu({
  x,
  y,
  project,
  onClose,
  onAction,
}: {
  x: number
  y: number
  project: ContextMenuProject
  onClose: () => void
  onAction: (action: ProjectContextAction) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const items: { key: ProjectContextAction; label: string; danger?: boolean }[] = [
    { key: 'delete', label: '删除项目', danger: true },
    { key: 'edit', label: '编辑信息' },
  ]

  // 文件夹开关项
  if (project.force_folder === true) {
    items.push({ key: 'auto', label: '取消文件夹（自动）' })
  } else {
    items.push({ key: 'folder', label: '设为文件夹' })
  }

  // 卡片快捷（仅当当前不是强制卡片时显示）
  if (project.force_folder !== false) {
    items.push({ key: 'card', label: '设为卡片' })
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[1100] min-w-[180px] rounded-xl border border-white/15 py-1 shadow-2xl backdrop-blur-md"
      style={{
        left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 200),
        top: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 768) - items.length * 36 - 16),
        background: 'rgba(20, 20, 28, 0.92)',
      }}
      onClick={event => event.stopPropagation()}
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={() => onAction(item.key)}
          className="block w-full whitespace-nowrap px-4 py-2 text-left text-sm transition-colors hover:bg-white/10"
          style={{
            color: item.danger ? '#f87171' : 'var(--dfw-text)',
            fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
