import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function DeleteConfirmDialog({
  open,
  projectName,
  projectPath,
  title = '删除项目',
  description,
  targetLabel,
  confirmLabel = '移入回收站',
  onConfirm,
  onCancel,
}: {
  open: boolean
  projectName: string
  projectPath: string
  title?: string
  description?: string
  targetLabel?: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) setDeleting(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      } else if (event.key === 'Enter' && !deleting) {
        event.preventDefault()
        void handleConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deleting])

  if (!open) return null

  const handleConfirm = async () => {
    setDeleting(true)
    try {
      await onConfirm()
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onCancel} />
      <div className="relative w-[92%] max-w-md rounded-2xl border border-[var(--mc-border-muted)] bg-[var(--mc-panel-solid)] p-6 text-[var(--mc-text-primary)] shadow-2xl">
        <h2
          id="delete-project-title"
          className="text-lg font-semibold text-[var(--workbench-alert-error-text)]"
        >
          ⚠ {title}
        </h2>
        <p className="mt-3 text-sm text-[var(--dfw-text)] opacity-90">
          确定要删除 <span className="font-semibold">{targetLabel || projectName || '该项目'}</span> 吗？<br />
          <span className="text-[var(--workbench-alert-error-text)]">{description || '将移入回收站，30 天内可以恢复。'}</span>
        </p>
        {projectPath && (
          <div className="mt-3 break-all rounded-md border border-[var(--mc-border-soft)] bg-[var(--mc-control-bg-soft)] px-3 py-2 font-mono text-xs text-[var(--dfw-text)] opacity-70">
            {projectPath}
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--mc-border-muted)] bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-[var(--mc-control-hover)]"
            onClick={onCancel}
            disabled={deleting}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            style={{ background: 'color-mix(in srgb, var(--workbench-alert-error-text) 86%, #ef4444)' }}
            onClick={() => void handleConfirm()}
            disabled={deleting}
          >
            {deleting ? '删除中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
