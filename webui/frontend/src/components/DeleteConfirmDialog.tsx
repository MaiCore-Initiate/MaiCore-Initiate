import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function DeleteConfirmDialog({
  open,
  projectName,
  projectPath,
  onConfirm,
  onCancel,
}: {
  open: boolean
  projectName: string
  projectPath: string
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
      <div className="relative w-[92%] max-w-md rounded-2xl border border-white/20 bg-[var(--dfw-bg)] p-6 shadow-2xl">
        <h2
          id="delete-project-title"
          className="text-lg font-semibold text-red-300"
        >
          ⚠ 删除项目
        </h2>
        <p className="mt-3 text-sm text-[var(--dfw-text)] opacity-90">
          确定要删除 <span className="font-semibold">{projectName || '该项目'}</span> 吗？<br />
          <span className="text-red-300">将同时从磁盘删除整个项目目录及全部内容（含 .toml、cover、导入的文件），此操作不可撤销。</span>
        </p>
        {projectPath && (
          <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[var(--dfw-text)] opacity-70 break-all">
            {projectPath}
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--dfw-text)]/20 bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-white/5"
            onClick={onCancel}
            disabled={deleting}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
            onClick={() => void handleConfirm()}
            disabled={deleting}
          >
            {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
