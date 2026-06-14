import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'

const COVER_MAX_BYTES = 5 * 1024 * 1024
const COVER_MIME_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export interface EditableProject {
  sequence: string
  mod_name: string
  mod_id: string
  description: string
  author: string
  path: string
  cover: string | null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('文件读取结果不是字符串'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export default function EditProjectDialog({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean
  project: EditableProject | null
  onClose: () => void
  onSaved: (project: EditableProject) => void
}) {
  const [modName, setModName] = useState('')
  const [description, setDescription] = useState('')
  const [coverDataUrl, setCoverDataUrl] = useState<string | null | 'KEEP' | 'CLEAR'>('KEEP')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open || !project) return
    setModName(project.mod_name)
    setDescription(project.description)
    setCoverDataUrl('KEEP')
    setError(null)
  }, [open, project])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modName, description, coverDataUrl])

  if (!open || !project) return null

  const coverUrl = coverDataUrl === 'CLEAR'
    ? null
    : coverDataUrl === 'KEEP' && project.cover
      ? `/api/template-workbench/projects/${encodeURIComponent(project.sequence)}/cover`
      : typeof coverDataUrl === 'string'
        ? coverDataUrl
        : null

  const modNameValid = modName.trim().length > 0 && modName.length <= 128
  const descValid = description.length <= 2000
  const canSave = modNameValid && descValid && !submitting

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > COVER_MAX_BYTES) {
      setError('封面文件超过 5MB')
      return
    }
    if (!COVER_MIME_MAP[file.type]) {
      setError(`不支持的封面格式：${file.type}`)
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCoverDataUrl(dataUrl)
      setError(null)
    } catch (err) {
      setError(`读取封面失败：${(err as Error).message ?? String(err)}`)
    }
  }

  const handleSave = async () => {
    if (!canSave) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        mod_name: modName.trim(),
        description,
      }
      if (coverDataUrl === 'CLEAR') {
        body.cover_clear = true
      } else if (typeof coverDataUrl === 'string') {
        body.cover_data_url = coverDataUrl
      }
      const res = await fetch(`/api/template-workbench/projects/${encodeURIComponent(project.sequence)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`保存失败 (${res.status}): ${text || '未知错误'}`)
      }
      const updated = await res.json() as EditableProject
      onSaved({
        ...project,
        mod_name: updated.mod_name,
        description: updated.description,
        cover: updated.cover,
      })
    } catch (err) {
      setError((err as Error).message ?? String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-project-title"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-[94%] max-w-2xl flex-col rounded-2xl border border-white/20 bg-[var(--dfw-bg)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 id="edit-project-title" className="text-lg font-semibold text-[var(--dfw-text)]">
            编辑项目信息
          </h2>
          <button
            type="button"
            aria-label="关闭"
            className="rounded-md p-1 text-[var(--dfw-text)] opacity-70 transition hover:bg-white/10"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6L18 18M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {error && (
          <div className="border-b border-red-400/30 bg-red-500/15 px-6 py-2 text-sm text-red-100">
            {error}
            <button type="button" className="ml-3 underline opacity-80 hover:opacity-100" onClick={() => setError(null)}>
              关闭
            </button>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
          {/* 项目 ID（锁死） */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目 ID（不可改）</label>
            <input
              value={project.mod_id}
              readOnly
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-sm text-[var(--dfw-text)] opacity-80"
            />
          </div>

          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目名称</label>
            <input
              value={modName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setModName(event.target.value)}
              maxLength={128}
              className="mt-2 w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
            />
            {!modNameValid && (
              <p className="mt-1 text-xs text-amber-300">⚠ 项目名称不能为空且不超过 128 字符</p>
            )}
          </div>

          {/* 项目简介 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目简介</label>
            <textarea
              value={description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
              placeholder="最多 2000 字符"
              rows={3}
              maxLength={2000}
              className="mt-2 w-full resize-y rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
            />
          </div>

          {/* 作者（锁死） */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">作者（来自 GitHub，不可改）</label>
            <input
              value={project.author}
              readOnly
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-sm text-[var(--dfw-text)] opacity-80"
            />
          </div>

          {/* 基础路径（锁死） */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">基础路径（不可改）</label>
            <input
              value={project.path}
              readOnly
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-xs text-[var(--dfw-text)] opacity-80"
            />
          </div>

          {/* 封面 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目封面（png/jpg/gif/webp，≤ 5MB）</label>
            <div className="mt-2 flex items-start gap-4">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-white/5">
                {coverUrl ? (
                  <img src={coverUrl} alt="封面预览" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[var(--dfw-text)] opacity-50">
                    暂无封面
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  hidden
                  onChange={event => void handleCoverChange(event)}
                />
                <button
                  type="button"
                  className="rounded-md border border-[var(--dfw-text)]/20 bg-transparent px-3 py-1.5 text-sm text-[var(--dfw-text)] transition hover:bg-white/5"
                  onClick={() => coverInputRef.current?.click()}
                >
                  替换…
                </button>
                {coverUrl && (
                  <button
                    type="button"
                    className="rounded-md border border-transparent bg-transparent px-3 py-1.5 text-xs text-[var(--dfw-text)] opacity-70 transition hover:opacity-100"
                    onClick={() => setCoverDataUrl('CLEAR')}
                  >
                    移除封面
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            className="rounded-lg border border-[var(--dfw-text)]/20 bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-white/5"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            {submitting ? '保存中…' : '保存'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
