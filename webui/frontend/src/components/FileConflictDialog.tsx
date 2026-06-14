import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type FileConflictResolution = 'rename' | 'overwrite' | 'cancel'

export interface FileConflictDialogProps {
  open: boolean
  conflictingName: string
  suggestedName: string
  onResolve: (resolution: FileConflictResolution) => void
  onClose?: () => void
}

export default function FileConflictDialog({
  open,
  conflictingName,
  suggestedName,
  onResolve,
  onClose,
}: FileConflictDialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onResolve('cancel')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onResolve])

  if (!open) return null

  return createPortal(
    <div
      data-workbench-ui
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-conflict-title"
      onPointerDown={event => event.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[6px]"
        onClick={() => onResolve('cancel')}
      />
      <div className="relative max-w-md w-[90%] rounded-2xl border border-white/20 bg-[var(--dfw-bg)] p-6 shadow-2xl">
        <h2
          id="file-conflict-title"
          className="text-lg font-semibold text-[var(--dfw-text)]"
        >
          文件名冲突
        </h2>
        <p className="mt-3 text-sm text-[var(--dfw-text)] opacity-80">
          已存在同名文件 <span className="font-mono">{conflictingName}</span>，请选择处理方式：
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            onClick={() => onResolve('rename')}
          >
            重命名为 <span className="font-mono">{suggestedName}</span>
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-[var(--dfw-text)]/20 bg-transparent px-4 py-2 text-sm font-medium text-[var(--dfw-text)] transition hover:bg-white/5"
            onClick={() => onResolve('overwrite')}
          >
            覆盖现有文件
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-[var(--dfw-text)] opacity-70 transition hover:opacity-100"
            onClick={() => {
              onResolve('cancel')
              onClose?.()
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
