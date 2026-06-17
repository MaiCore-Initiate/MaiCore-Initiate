import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { createPortal } from 'react-dom'

type WorkbenchImportItemKind = 'plain-file' | 'template-toml' | 'archive'

export interface WorkbenchImportTargetContext {
  projectSequence: string | null
  currentDir: string
  inProjectFolder: boolean
}

export interface WorkbenchImportResult {
  mode: 'project-created' | 'files-imported'
  project?: {
    sequence: string
    mod_name: string
    path: string
    mod_id: string
    description: string
    author: string
    cover: string | null
    directories?: string[]
  }
  directories?: string[]
  files?: Array<{
    id: string
    name: string
    path: string
    size: number
    modifiedAt: string
    binary: boolean
    language: string
  }>
}

export interface WorkbenchImportDialogProps {
  open: boolean
  title?: string
  context: WorkbenchImportTargetContext
  onClose: () => void
  onImported: (result: WorkbenchImportResult) => void
}

const PLAIN_ALLOWED_EXTENSIONS = new Set([
  '.py', '.cmd', '.bat', '.ps1', '.sh', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.txt', '.jsonl', '.log', '.java', '.jar', '.toml', '.exe', '.yaml', '.xml',
])

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function joinTargetDir(baseDir: string, suffix: string) {
  const base = normalizePath(baseDir)
  const tail = normalizePath(suffix)
  if (!base) return tail
  if (!tail) return base
  return `${base}/${tail}`
}

function getExtension(name: string) {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx).toLowerCase() : ''
}

function detectItemKind(file: File): WorkbenchImportItemKind | null {
  const ext = getExtension(file.name)
  const lowerName = file.name.toLowerCase()
  if (
    ext === '.zip' || ext === '.iso' || ext === '.mcsmod' || ext === '.7z' || ext === '.rar'
    || ext === '.tgz' || ext === '.gz' || ext === '.gzip' || ext === '.bz2' || ext === '.xz'
    || ext === '.tar'
    || lowerName.endsWith('.tar.gz')
    || lowerName.endsWith('.tar.bz2')
    || lowerName.endsWith('.tbz2')
    || lowerName.endsWith('.tar.xz')
    || lowerName.endsWith('.txz')
  ) return 'archive'
  if (ext === '.toml') return 'template-toml'
  if (PLAIN_ALLOWED_EXTENSIONS.has(ext)) return 'plain-file'
  return null
}

async function isTemplateToml(file: File) {
  try {
    const text = await file.text()
    return /\[MCStart\]/.test(text) && /\bMCStart\s*=\s*true\b/.test(text)
  } catch {
    return false
  }
}

function summarizeSelection(files: File[]) {
  return files.map(file => file.name).join('、')
}

export default function WorkbenchImportDialog({
  open,
  title = '导入项目',
  context,
  onClose,
  onImported,
}: WorkbenchImportDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')
  const [targetDirInput, setTargetDirInput] = useState(context.currentDir)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedFiles([])
      setErrorMessage(null)
      setSubmitting(false)
      setPasswordPromptOpen(false)
      setPasswordValue('')
      setDragOver(false)
      setTargetDirInput(context.currentDir)
      return
    }
    setTargetDirInput(context.currentDir)
  }, [open, context.currentDir])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (passwordPromptOpen) {
          setPasswordPromptOpen(false)
          setPasswordValue('')
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, passwordPromptOpen])

  const targetDir = useMemo(() => normalizePath(targetDirInput), [targetDirInput])
  const selectionSummary = useMemo(() => summarizeSelection(selectedFiles), [selectedFiles])

  const resolveErrorMessage = async (response: Response, fallbackPrefix: string) => {
    const detail = await response.json().catch(() => null) as { detail?: { message?: string } | string } | null
    if (typeof detail?.detail === 'string' && detail.detail.trim()) {
      return `${fallbackPrefix} (${response.status}): ${detail.detail}`
    }
    if (typeof detail?.detail === 'object' && detail.detail?.message?.trim()) {
      return `${fallbackPrefix} (${response.status}): ${detail.detail.message}`
    }
    const text = await response.text().catch(() => '')
    return `${fallbackPrefix} (${response.status}): ${text || '未知错误'}`
  }

  const validateSelection = async (files: File[]) => {
    if (files.length === 0) {
      throw new Error('请先选择要导入的文件。')
    }

    const plainFiles: File[] = []
    const archives: File[] = []
    const templateTomls: File[] = []

    for (const file of files) {
      const detected = detectItemKind(file)
      if (!detected) {
        throw new Error(`不支持的导入文件：${file.name}`)
      }
      if (detected === 'archive') {
        archives.push(file)
        continue
      }
      if (detected === 'plain-file') {
        plainFiles.push(file)
        continue
      }
      if (await isTemplateToml(file)) {
        templateTomls.push(file)
      } else {
        plainFiles.push(file)
      }
    }

    if (!context.inProjectFolder && archives.length + templateTomls.length > 1) {
      throw new Error('首页导入时，归档文件或模板文件一次只能导入一个。')
    }

    if (!context.inProjectFolder && archives.length > 0 && plainFiles.length > 0) {
      throw new Error('首页导入归档文件时，不能和普通文件混合导入。')
    }

    if (!context.inProjectFolder && templateTomls.length > 0 && plainFiles.length > 0) {
      throw new Error('首页导入模板文件时，不能和普通文件混合导入。')
    }

    return { plainFiles, archives, templateTomls }
  }

  const refreshPasswordAndClose = () => {
    setPasswordPromptOpen(false)
    setPasswordValue('')
  }

  const handleSubmit = async (overridePassword?: string) => {
    setErrorMessage(null)
    const { plainFiles, archives, templateTomls } = await validateSelection(selectedFiles)

    setSubmitting(true)
    try {
      const importedFiles: NonNullable<WorkbenchImportResult['files']> = []

      if (plainFiles.length > 0) {
        if (!context.projectSequence) {
          throw new Error('当前不在项目目录中，普通文件无法直接导入。')
        }
        const relativePaths = plainFiles.map(file => joinTargetDir(targetDir, file.name))
        const form = new FormData()
        plainFiles.forEach(file => form.append('files', file, file.name))
        relativePaths.forEach(path => form.append('relative_paths', path))
        const response = await fetch(
          `/api/template-workbench/projects/${encodeURIComponent(context.projectSequence)}/import/files`,
          { method: 'POST', credentials: 'include', body: form },
        )
        if (!response.ok) {
          throw new Error(await resolveErrorMessage(response, '导入失败'))
        }
        const result = await response.json() as WorkbenchImportResult
        importedFiles.push(...(result.files ?? []))
      }

      if (templateTomls.length > 0) {
        for (const templateFile of templateTomls) {
          const form = new FormData()
          form.append('file', templateFile, templateFile.name)
          form.append('target_dir', targetDir)
          form.append('in_project_folder', context.inProjectFolder ? 'true' : 'false')
          if (context.projectSequence) form.append('project_sequence', context.projectSequence)
          const response = await fetch('/api/template-workbench/import/template-toml', {
            method: 'POST',
            credentials: 'include',
            body: form,
          })
          if (!response.ok) {
            throw new Error(await resolveErrorMessage(response, '导入失败'))
          }
          const result = await response.json() as WorkbenchImportResult
          if (result.mode === 'project-created') {
            onImported(result)
            onClose()
            return
          }
          importedFiles.push(...(result.files ?? []))
        }
      }

      for (const archive of archives) {
        const form = new FormData()
        form.append('file', archive, archive.name)
        form.append('target_dir', targetDir)
        form.append('in_project_folder', context.inProjectFolder ? 'true' : 'false')
        if (context.projectSequence) form.append('project_sequence', context.projectSequence)
        if (overridePassword) form.append('password', overridePassword)
        const response = await fetch('/api/template-workbench/import/archive', {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
        if (response.status === 409) {
          const detail = await response.json().catch(() => null) as { detail?: { code?: string; message?: string } } | null
          if (detail?.detail?.code === 'password_required') {
            setSelectedFiles([archive])
            setPasswordPromptOpen(true)
            setSubmitting(false)
            return
          }
        }
        if (!response.ok) {
          throw new Error(await resolveErrorMessage(response, '导入失败'))
        }
        const result = await response.json() as WorkbenchImportResult
        if (result.mode === 'project-created') {
          onImported(result)
        } else {
          importedFiles.push(...(result.files ?? []))
        }
      }
      if (importedFiles.length > 0) {
        onImported({ mode: 'files-imported', files: importedFiles })
      }
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileSelection = async (files: File[]) => {
    setErrorMessage(null)
    try {
      await validateSelection(files)
      setSelectedFiles(files)
    } catch (error) {
      setSelectedFiles([])
      setErrorMessage((error as Error).message ?? String(error))
    }
  }

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    await handleFileSelection(files)
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    await handleFileSelection(files)
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="workbench-import-title">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative flex w-[94%] max-w-3xl flex-col rounded-2xl border border-white/20 bg-[var(--dfw-bg)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 id="workbench-import-title" className="text-lg font-semibold text-[var(--dfw-text)]">
            {title}
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

        {errorMessage && (
          <div className="border-b border-red-400/30 bg-red-500/15 px-6 py-2 text-sm text-red-100">
            {errorMessage}
          </div>
        )}

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--dfw-text)]">
            当前导入基准：<code className="font-mono">{context.inProjectFolder ? (context.currentDir || '(项目根目录)') : '(工作台首页)'}</code>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">导入目标</label>
            <input
              value={targetDirInput}
              onChange={event => setTargetDirInput(event.target.value)}
              placeholder={context.inProjectFolder ? '留空表示当前目录' : '首页导入时填写目标目录'}
              className="mt-2 w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 font-mono text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
            />
            <p className="mt-2 text-xs text-[var(--dfw-text)] opacity-60">
              压缩包会按这个目标目录解包导入；位于项目文件夹中时默认自动填充当前目录。
            </p>
          </div>

          <div
            className={`rounded-2xl border border-dashed px-6 py-10 text-center transition ${dragOver ? 'border-[var(--dfw-blue)] bg-white/8' : 'border-white/20 bg-white/4'}`}
            onDragOver={event => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={event => {
              event.preventDefault()
              setDragOver(false)
            }}
            onDrop={event => void onDrop(event)}
          >
            <div className="text-base font-medium text-[var(--dfw-text)]">拖拽文件到这里</div>
            <div className="mt-2 text-sm text-[var(--dfw-text)] opacity-65">
              支持白名单文件、多文件、`.zip`、`.iso`、`.mcsmod`、`.tar`、`.tar.gz`、`.gzip`、`.rar`、`.7z`、模板 `.toml`
            </div>
            <input ref={fileInputRef} type="file" hidden multiple onChange={event => void onInputChange(event)} />
            <button
              type="button"
              className="mt-5 rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              onClick={() => fileInputRef.current?.click()}
            >
              选择导入文件
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--dfw-text)]">
            已选内容：{selectionSummary || '暂无'}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            className="rounded-lg border border-[var(--dfw-text)]/20 bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-white/5"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            onClick={() => void handleSubmit()}
            disabled={submitting || selectedFiles.length === 0}
          >
            {submitting ? '导入中…' : '开始导入'}
          </button>
        </footer>
      </div>

      {passwordPromptOpen && createPortal(
        <div className="fixed inset-0 z-[1010] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={refreshPasswordAndClose} />
          <div className="relative w-[92%] max-w-md rounded-2xl border border-white/20 bg-[var(--dfw-bg)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--dfw-text)]">请输入解压密码</h3>
            <p className="mt-2 text-sm text-[var(--dfw-text)] opacity-70">
              该归档文件需要密码后才能导入。
            </p>
            <input
              type="password"
              value={passwordValue}
              onChange={event => setPasswordValue(event.target.value)}
              className="mt-4 w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 font-mono text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
              autoFocus
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--dfw-text)]/20 bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-white/5"
                onClick={refreshPasswordAndClose}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                disabled={!passwordValue.trim()}
                onClick={() => {
                  refreshPasswordAndClose()
                  void handleSubmit(passwordValue.trim())
                }}
              >
                重试导入
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  )
}
