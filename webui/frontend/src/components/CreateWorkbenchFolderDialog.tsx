import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export interface CreateWorkbenchFolderDialogProps {
  open: boolean
  currentDir?: string
  submitting?: boolean
  errorMessage?: string | null
  onClose: () => void
  onCreate: (relativePath: string) => void
}

function joinFolderPath(currentDir: string, inputPath: string) {
  const normalizedCurrent = currentDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const normalizedInput = inputPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!normalizedCurrent) return normalizedInput
  if (!normalizedInput) return normalizedCurrent
  return `${normalizedCurrent}/${normalizedInput}`
}

export default function CreateWorkbenchFolderDialog({
  open,
  currentDir = '',
  submitting = false,
  errorMessage = null,
  onClose,
  onCreate,
}: CreateWorkbenchFolderDialogProps) {
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    if (!open) {
      setInputValue('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        const value = inputValue.trim()
        if (value) onCreate(value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, inputValue, onClose, onCreate])

  const previewPath = useMemo(() => joinFolderPath(currentDir, inputValue.trim()), [currentDir, inputValue])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workbench-folder-title"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative flex w-[92%] max-w-xl flex-col rounded-2xl border border-[var(--mc-border-muted)] bg-[var(--mc-panel-solid)] text-[var(--mc-text-primary)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--mc-border-soft)] px-6 py-4">
          <h2 id="create-workbench-folder-title" className="text-lg font-semibold text-[var(--dfw-text)]">
            新建文件夹
          </h2>
          <button
            type="button"
            aria-label="关闭"
            className="rounded-md p-1 text-[var(--dfw-text)] opacity-70 transition hover:bg-[var(--mc-control-hover)]"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6L18 18M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {errorMessage && (
          <div className="workbench-alert workbench-alert-error border-x-0 border-t-0 px-6 py-2 text-sm">
            {errorMessage}
          </div>
        )}

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">文件夹名称或相对路径</label>
            <input
              value={inputValue}
              onChange={event => setInputValue(event.target.value)}
              placeholder={currentDir ? '例如 assets/icons' : '例如 test/assets'}
              className="mt-2 w-full rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)] px-3 py-2 font-mono text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
              autoFocus
            />
            <p className="mt-2 text-xs text-[var(--dfw-text)] opacity-60">
              最多 5 层目录，当前基准目录：<code className="font-mono">{currentDir || '(项目根目录)'}</code>
            </p>
          </div>
          <div className="rounded-lg border border-[var(--mc-border-soft)] bg-[var(--mc-control-bg-soft)] px-4 py-3 text-sm text-[var(--dfw-text)]">
            创建位置：<code className="font-mono">{previewPath || '(待输入)'}</code>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--mc-border-soft)] px-6 py-4">
          <button
            type="button"
            className="rounded-lg border border-[var(--mc-border-muted)] bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-[var(--mc-control-hover)]"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            onClick={() => {
              const value = inputValue.trim()
              if (!value) return
              onCreate(value)
            }}
            disabled={submitting || !inputValue.trim()}
          >
            {submitting ? '创建中…' : '创建文件夹'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
