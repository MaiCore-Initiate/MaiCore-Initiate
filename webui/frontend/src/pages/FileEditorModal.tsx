import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../components/theme/ThemeProvider'
import type { WorkbenchFileMeta } from './workbench-canvas/types'
import FileConflictDialog, { type FileConflictResolution } from '../components/FileConflictDialog'

const Editor = lazy(() => import('@monaco-editor/react'))

export default function FileEditorModal({
  file,
  projectSequence,
  onClose,
  onRenamed,
  onDeleted,
}: {
  file: WorkbenchFileMeta | null
  projectSequence: string | null
  onClose: () => void
  onRenamed?: (newMeta: WorkbenchFileMeta) => void
  onDeleted?: () => void
}) {
  const { isDark } = useTheme()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [conflictState, setConflictState] = useState<{
    name: string
    suggestedName: string
    payload: { content: string; conflictResolution: FileConflictResolution | null }
    mode: 'save' | 'rename'
  } | null>(null)
  const saveRef = useRef<() => Promise<void>>(async () => {})

  const dirty = content !== originalContent

  useEffect(() => {
    if (!file) return
    setError(null)
    setContent('')
    setOriginalContent('')
    if (file.binary) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(
      `/api/template-workbench/projects/${encodeURIComponent(projectSequence ?? '')}/files/${encodeURIComponent(file.name)}/raw`,
      { credentials: 'include' },
    )
      .then(async res => {
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
        const text = await res.text()
        setContent(text)
        setOriginalContent(text)
      })
      .catch(err => {
        const message = (err as Error).message ?? String(err)
        setError(`读取失败: ${message}`)
        if ((err as Error & { status?: number }).status === 404) {
          onDeleted?.()
        }
      })
      .finally(() => setLoading(false))
  }, [file, projectSequence, onDeleted])

  const handleClose = useCallback(() => {
    if (dirty) {
      const ok = window.confirm('有未保存的修改，确定关闭吗？')
      if (!ok) return
    }
    onClose()
  }, [dirty, onClose])

  useEffect(() => {
    if (!file) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        void saveRef.current()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, handleClose])

  const performSave = useCallback(
    async (
      name: string,
      payload: { content: string; conflictResolution: FileConflictResolution | null },
      mode: 'save' | 'rename',
    ) => {
      if (!file) return
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/template-workbench/projects/${encodeURIComponent(projectSequence ?? '')}/files/${encodeURIComponent(name)}`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
        if (res.status === 409) {
          const detail = await res.json().catch(() => null)
          setConflictState({
            name,
            suggestedName: detail?.detail?.suggestion ?? '',
            payload,
            mode,
          })
          return
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          setError(`保存失败 (${res.status}): ${text || '未知错误'}`)
          return
        }
        const updated: WorkbenchFileMeta = await res.json()
        setOriginalContent(payload.content)
        setContent(payload.content)
        if (mode === 'rename') {
          onRenamed?.(updated)
        }
      } catch (err) {
        setError(`保存异常: ${(err as Error).message ?? String(err)}`)
      } finally {
        setSaving(false)
      }
    },
    [file, projectSequence, onRenamed],
  )

  const handleSave = useCallback(async () => {
    if (!file) return
    await performSave(file.name, { content, conflictResolution: null }, 'save')
  }, [file, content, performSave])

  saveRef.current = handleSave

  const handleDownload = () => {
    if (!file || !projectSequence) return
    const url = `/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/files/${encodeURIComponent(file.name)}/download`
    window.open(url, '_blank', 'noopener')
  }

  const startRename = () => {
    if (!file) return
    setRenamingName(file.name)
    setRenameInput(file.name)
  }

  const confirmRename = async () => {
    if (!file) return
    if (!renameInput || renameInput === file.name) {
      setRenamingName(null)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(projectSequence ?? '')}/files/${encodeURIComponent(file.name)}/rename`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: renameInput }),
        },
      )
      if (res.status === 409) {
        const detail = await res.json().catch(() => null)
        setConflictState({
          name: file.name,
          suggestedName: detail?.detail?.suggestion ?? '',
          payload: { content, conflictResolution: null },
          mode: 'rename',
        })
        return
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setError(`重命名失败 (${res.status}): ${text || '未知错误'}`)
        return
      }
      const updated: WorkbenchFileMeta = await res.json()
      onRenamed?.(updated)
      setRenamingName(null)
    } catch (err) {
      setError(`重命名异常: ${(err as Error).message ?? String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!file) return
    const ok = window.confirm(`确定删除文件 "${file.name}" 吗？此操作不可撤销。`)
    if (!ok) return
    setSaving(true)
    try {
      await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(projectSequence ?? '')}/files/${encodeURIComponent(file.name)}`,
        { method: 'DELETE', credentials: 'include' },
      )
    } catch (err) {
      setError(`删除异常: ${(err as Error).message ?? String(err)}`)
    } finally {
      setSaving(false)
    }
    onDeleted?.()
  }

  const handleConflictResolve = (resolution: FileConflictResolution) => {
    if (!conflictState) return
    const { payload, mode } = conflictState
    setConflictState(null)
    if (resolution === 'cancel') return
    if (mode === 'save') {
      void performSave(conflictState.name, { ...payload, conflictResolution: resolution }, 'save')
    } else {
      void performSave(conflictState.suggestedName, { content: payload.content, conflictResolution: 'rename' }, 'rename')
    }
  }

  if (!file) return null

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex flex-col bg-[var(--dfw-bg)]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={handleClose}
      />
      <div className="relative flex h-full w-full flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 bg-[var(--dfw-bg)]/95 px-4 py-3">
          {renamingName === null ? (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm font-medium text-[var(--dfw-text)] hover:bg-white/10"
              onClick={startRename}
              title="点击重命名"
            >
              {file.name}
              {dirty ? ' •' : ''}
            </button>
          ) : (
            <input
              autoFocus
              value={renameInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRenameInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void confirmRename()
                else if (event.key === 'Escape') setRenamingName(null)
              }}
              className="rounded-md border border-white/20 bg-transparent px-2 py-1 text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
            />
          )}
          <span className="text-xs text-[var(--dfw-text)] opacity-60">
            {(file.size / 1024).toFixed(1)} KB · {file.language}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!file.binary && (
              <button
                type="button"
                className="rounded-md border border-[var(--dfw-text)]/20 bg-transparent px-3 py-1 text-sm text-[var(--dfw-text)] transition hover:bg-white/5 disabled:opacity-40"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? '保存中…' : '保存'}
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-[var(--dfw-text)]/20 bg-transparent px-3 py-1 text-sm text-[var(--dfw-text)] transition hover:bg-white/5"
              onClick={handleDownload}
            >
              下载
            </button>
            {!file.binary && (
              <button
                type="button"
                className="rounded-md border border-red-400/30 bg-transparent px-3 py-1 text-sm text-red-200 transition hover:bg-red-500/10"
                onClick={handleDelete}
              >
                删除
              </button>
            )}
            <button
              type="button"
              aria-label="关闭"
              className="rounded-md p-1 text-[var(--dfw-text)] opacity-70 transition hover:bg-white/10"
              onClick={handleClose}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6L18 18M6 18L18 6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {error && (
          <div className="border-b border-red-400/30 bg-red-500/15 px-4 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="relative flex-1 overflow-hidden">
          {file.binary ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-[var(--dfw-text)] opacity-70">
              <div className="text-5xl">📦</div>
              <div className="text-lg">二进制文件，不可编辑</div>
              <div className="text-sm opacity-70">
                文件类型 <code className="rounded bg-white/10 px-2 py-0.5 font-mono">{file.name.split('.').pop()}</code> 被识别为二进制。
              </div>
              <button
                type="button"
                className="rounded-md bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                onClick={handleDownload}
              >
                下载文件
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--dfw-text)] opacity-60">
              正在加载…
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-[var(--dfw-text)] opacity-60">
                  正在加载编辑器…
                </div>
              }
            >
              <Editor
                height="100%"
                language={file.language}
                value={content}
                onChange={value => setContent(value ?? '')}
                theme={isDark ? 'vs-dark' : 'vs'}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                }}
              />
            </Suspense>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-white/10 bg-[var(--dfw-bg)]/95 px-4 py-2 text-xs text-[var(--dfw-text)] opacity-70">
          <div>{dirty ? '有未保存的修改' : '已保存'}</div>
          <div>Ctrl/Cmd + S 保存 · Esc 关闭</div>
        </footer>
      </div>

      <FileConflictDialog
        open={conflictState !== null}
        conflictingName={conflictState?.name ?? ''}
        suggestedName={conflictState?.suggestedName ?? ''}
        onResolve={handleConflictResolve}
      />
    </div>,
    document.body,
  )
}
