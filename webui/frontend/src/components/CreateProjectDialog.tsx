import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { pinyin } from 'pinyin-pro'
import { Folder, X } from 'lucide-react'
import FileConflictDialog, { type FileConflictResolution } from './FileConflictDialog'

// 附加文件白名单后缀（与后端 _validate_extra_relpath 保持一致）
const EXTRA_ALLOWED_EXT = [
  '.py', '.cmd', '.bat', '.ps1', '.sh', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.txt', '.jsonl', '.log', '.java', '.jar', '.toml', '.exe',
  '.yaml', '.xml',
]
const MAX_EXTRA_DEPTH = 5

// 预解析一个 File 列表：按 webkitRelativePath 分组，过滤非法层级与后缀，返回 (entries, warnings)
function partitionExtraFiles(
  files: File[],
): { entries: Array<{ file: File; relpath: string }>; warnings: string[] } {
  const warnings: string[] = []
  const entries: Array<{ file: File; relpath: string }> = []
  for (const file of files) {
    const relRaw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    // 形如 "MyDir/sub/inner/file.py"，去掉第一段目录名（用户选择的根目录名），保留相对结构
    const parts = relRaw.split(/[\\/]/).filter(Boolean)
    if (parts.length <= 1) {
      // 没有目录信息，直接落根
      const relpath = parts[0] ?? file.name
      const ext = '.' + (relpath.split('.').pop() ?? '').toLowerCase()
      if (!EXTRA_ALLOWED_EXT.includes(ext)) {
        warnings.push(`已跳过不支持的格式：${relpath}`)
        continue
      }
      entries.push({ file, relpath })
      continue
    }
    const subParts = parts.slice(1)
    if (subParts.length > MAX_EXTRA_DEPTH + 1) {
      warnings.push(`嵌套过深（>${MAX_EXTRA_DEPTH} 层），已跳过：${relRaw}`)
      continue
    }
    const relpath = subParts.join('/')
    const ext = '.' + (relpath.split('.').pop() ?? '').toLowerCase()
    if (!EXTRA_ALLOWED_EXT.includes(ext)) {
      warnings.push(`已跳过不支持的格式：${relpath}`)
      continue
    }
    entries.push({ file, relpath })
  }
  return { entries, warnings }
}

export interface CreatedProjectInfo {
  sequence: string
  mod_name: string
  path: string
  mod_id: string
  description: string
  author: string
  cover: string | null
}

const MOD_ID_PATTERN = /^[A-Za-z0-9_\-]{1,64}$/
const COVER_MAX_BYTES = 5 * 1024 * 1024
const COVER_MIME_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

interface AccountUserSummary {
  joined_via?: string
  github?: { login?: string; url?: string; avatar?: string }
  name?: string
  email?: string
}

interface AccountStateResponse {
  success?: boolean
  logged_in?: boolean
  current_user?: AccountUserSummary
  users?: AccountUserSummary[]
}

interface CheckProjectPathResponse {
  available: boolean
  suggestion: string
  reason?: string
}

function camelCaseSegment(text: string): string {
  if (!text) return ''
  // 按空白/连字符/下划线/点分段
  const words = text.split(/[\s\-_.\/\\]+/).map(w => w.trim()).filter(w => w.length > 0)
  if (words.length === 0) return ''
  return words
    .map(word => {
      // 含中文 → 走 pinyin-pro 转拼音
      if (/[一-鿿]/.test(word)) {
        try {
          const segments = pinyin(word, { toneType: 'none', type: 'array' }) as string[]
          return segments
            .filter(s => s && s.length > 0)
            .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
            .join('')
        } catch {
          return ''
        }
      }
      // 纯英文/数字 → 首字母大写其余小写
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .filter(s => s.length > 0)
    .join('')
}

function deriveModIdFromName(modName: string, githubLogin: string): string {
  const login = (githubLogin ?? '').trim()
  if (!login) return ''
  if (!modName || !modName.trim()) return `${login}.`
  return `${login}.${camelCaseSegment(modName)}`
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

export default function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  initialBasePath = '',
}: {
  open: boolean
  onClose: () => void
  onCreated: (project: CreatedProjectInfo) => void
  initialBasePath?: string
}) {
  const [basePath, setBasePath] = useState('')
  const [modName, setModName] = useState('')
  const [modId, setModId] = useState('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ name: string; suggestedName: string } | null>(null)
  const [githubStatus, setGithubStatus] = useState<{
    loaded: boolean
    loggedIn: boolean
    bound: boolean
    login: string
    message: string
  }>({ loaded: false, loggedIn: false, bound: false, login: '', message: '' })
  // 附加目录/文件（用户从 picker 中选择的 File 列表）
  const [extraEntries, setExtraEntries] = useState<Array<{ file: File; relpath: string }>>([])
  const [extraWarnings, setExtraWarnings] = useState<string[]>([])
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const extraDirInputRef = useRef<HTMLInputElement | null>(null)

  // 加载 GitHub 状态
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setGithubStatus(prev => ({ ...prev, loaded: false }))
    fetch('/api/account/state', { credentials: 'include' })
      .then(res => res.json() as Promise<AccountStateResponse>)
      .then(data => {
        if (cancelled) return
        const user = data?.current_user
        if (!data?.logged_in || !user) {
          setGithubStatus({
            loaded: true,
            loggedIn: false,
            bound: false,
            login: '',
            message: '请先登录账户。',
          })
          return
        }
        const login = user.github?.login ?? ''
        const bound = Boolean(user.github && login)
        if (!bound) {
          setGithubStatus({
            loaded: true,
            loggedIn: true,
            bound: false,
            login: '',
            message: '当前账户未绑定 GitHub。请先在"账户设置"中完成 GitHub OAuth 绑定。',
          })
          return
        }
        setGithubStatus({
          loaded: true,
          loggedIn: true,
          bound: true,
          login,
          message: '',
        })
        setAuthor(login)
      })
      .catch(err => {
        if (cancelled) return
        setGithubStatus({
          loaded: true,
          loggedIn: false,
          bound: false,
          login: '',
          message: `读取账户状态失败：${(err as Error).message ?? String(err)}`,
        })
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      // 重置
      setBasePath(initialBasePath)
      setModName('')
      setModId('')
      setDescription('')
      setCoverDataUrl(null)
      setSubmitting(false)
      setError(null)
      setConflict(null)
      setExtraEntries([])
      setExtraWarnings([])
      return
    }
    setBasePath(initialBasePath)
  }, [open, initialBasePath])

  useEffect(() => {
    setModId(deriveModIdFromName(modName, githubStatus.login))
  }, [modName, githubStatus.login])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void handleCreate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, basePath, modName, modId, description, coverDataUrl, githubStatus, extraEntries])

  if (!open) return null

  const basePathValid = basePath.trim().length > 0
  const modNameValid = modName.trim().length > 0 && modName.length <= 128
  const modIdValid = MOD_ID_PATTERN.test(modId)
  const descValid = description.length <= 2000
  const githubReady = githubStatus.loaded && githubStatus.loggedIn && githubStatus.bound
  const canCreate = githubReady && basePathValid && modNameValid && modIdValid && descValid && !submitting

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

  const handleExtraDirChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length === 0) return
    const { entries, warnings } = partitionExtraFiles(files)
    // 同 relpath 保留最后一份（避免选择多个目录时路径冲突）
    const byPath = new Map<string, { file: File; relpath: string }>()
    for (const e of entries) {
      byPath.set(e.relpath, e)
    }
    setExtraEntries(prev => {
      const merged = new Map<string, { file: File; relpath: string }>()
      for (const e of prev) merged.set(e.relpath, e)
      for (const e of byPath.values()) merged.set(e.relpath, e)
      return Array.from(merged.values())
    })
    setExtraWarnings(prev => [...prev, ...warnings])
  }

  const removeExtraEntry = (relpath: string) => {
    setExtraEntries(prev => prev.filter(e => e.relpath !== relpath))
  }

  const callCheckPath = async (modIdToCheck: string): Promise<CheckProjectPathResponse> => {
    const res = await fetch('/api/template-workbench/projects/check-path', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_path: basePath, mod_id: modIdToCheck }),
    })
    if (!res.ok) throw new Error(`路径检查失败 (${res.status})`)
    return await res.json() as CheckProjectPathResponse
  }

  const callCreate = async (
    finalModId: string,
    conflictResolution: FileConflictResolution | null,
  ): Promise<CreatedProjectInfo> => {
    // 没有任何附加文件 → 走 JSON 简单接口（与旧行为一致）
    if (extraEntries.length === 0) {
      const payload: Record<string, unknown> = {
        base_path: basePath,
        mod_name: modName.trim(),
        mod_id: finalModId,
        description: description.trim(),
        author: author.trim(),
        conflict_resolution: conflictResolution,
      }
      if (coverDataUrl) payload.cover_data_url = coverDataUrl
      const res = await fetch('/api/template-workbench/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 409) {
        const detail = await res.json().catch(() => null)
        const err: Error & { conflict?: { suggested: string } } = new Error(
          detail?.detail?.message ?? '目录已存在冲突',
        )
        err.conflict = {
          suggested: detail?.detail?.suggestion ?? `${finalModId} (1)`,
        }
        throw err
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`创建失败 (${res.status}): ${text || '未知错误'}`)
      }
      return await res.json() as CreatedProjectInfo
    }

    // 有附加文件 → 走 multipart 接口
    const form = new FormData()
    form.append('base_path', basePath)
    form.append('mod_name', modName.trim())
    form.append('mod_id', finalModId)
    form.append('description', description.trim())
    form.append('author', author.trim())
    if (conflictResolution) form.append('conflict_resolution', conflictResolution)
    if (coverDataUrl) form.append('cover_data_url', coverDataUrl)
    for (const entry of extraEntries) {
      form.append('extra_files', entry.file, entry.file.name)
      form.append('extra_relpaths', entry.relpath)
    }
    const res = await fetch('/api/template-workbench/projects/with-files', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (res.status === 409) {
      const detail = await res.json().catch(() => null)
      const err: Error & { conflict?: { suggested: string } } = new Error(
        detail?.detail?.message ?? '目录已存在冲突',
      )
      err.conflict = {
        suggested: detail?.detail?.suggestion ?? `${finalModId} (1)`,
      }
      throw err
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`创建失败 (${res.status}): ${text || '未知错误'}`)
    }
    return await res.json() as CreatedProjectInfo
  }

  const handleCreate = async () => {
    if (!canCreate) return
    setError(null)
    setSubmitting(true)
    try {
      const check = await callCheckPath(modId)
      let finalModId = modId
      let resolution: FileConflictResolution | null = null
      if (!check.available) {
        setConflict({ name: modId, suggestedName: check.suggestion })
        setSubmitting(false)
        return
      }
      const project = await callCreate(finalModId, resolution)
      onCreated(project)
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      if ((err as Error & { conflict?: { suggested: string } }).conflict) {
        setConflict({
          name: modId,
          suggestedName: (err as Error & { conflict?: { suggested: string } }).conflict!.suggested,
        })
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleConflictResolve = async (resolution: FileConflictResolution) => {
    if (!conflict) return
    setConflict(null)
    if (resolution === 'cancel') return
    setSubmitting(true)
    setError(null)
    try {
      let finalModId = modId
      if (resolution === 'rename') {
        finalModId = conflict.suggestedName
        setModId(finalModId)
      }
      const project = await callCreate(finalModId, resolution)
      onCreated(project)
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
      aria-labelledby="create-project-title"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-[94%] max-w-3xl flex-col rounded-2xl border border-[var(--mc-border-muted)] bg-[var(--mc-panel-solid)] text-[var(--mc-text-primary)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--mc-border-soft)] px-6 py-4">
          <h2 id="create-project-title" className="text-lg font-semibold text-[var(--dfw-text)]">
            新建工作台项目
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

        {error && (
          <div className="workbench-alert workbench-alert-error border-x-0 border-t-0 px-6 py-2 text-sm">
            {error}
            <button
              type="button"
              className="ml-3 underline opacity-80 hover:opacity-100"
              onClick={() => setError(null)}
            >
              关闭
            </button>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
          {/* GitHub 状态 */}
          <div
            className={
              githubReady
                ? 'workbench-alert workbench-alert-success rounded-lg px-4 py-2 text-sm'
                : 'workbench-alert workbench-alert-warning rounded-lg px-4 py-3 text-sm'
            }
          >
            {!githubStatus.loaded ? (
              <div>正在读取账户信息…</div>
            ) : githubReady ? (
              <div>
                ✅ 已绑定 GitHub，作者将填入 <span className="font-mono">{githubStatus.login}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div>⚠ {githubStatus.message}</div>
                <a
                  href="#/settings"
                  className="inline-block rounded-md border border-current px-3 py-1 text-xs hover:bg-[var(--mc-control-hover)]"
                >
                  前往账户设置
                </a>
              </div>
            )}
          </div>

          {/* 基础路径 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">基础路径</label>
            <input
              value={basePath}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setBasePath(event.target.value)}
              placeholder="例如 C:/Users/Me/Projects 或 /home/me/projects"
              className="mt-2 w-full rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)] px-3 py-2 font-mono text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)] disabled:opacity-50"
              disabled={!githubReady}
            />
            <p className="mt-1 text-xs text-[var(--dfw-text)] opacity-60">
              项目会被建为 <code className="font-mono">{basePath || '<base_path>'}/{modId || '<mod_id>'}/</code>。
              必须是绝对路径，目录需存在或可创建。
            </p>
          </div>

          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目名称</label>
            <input
              value={modName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setModName(event.target.value)}
              placeholder="例如 我的部署模版"
              maxLength={128}
              className="mt-2 w-full rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)] px-3 py-2 text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)] disabled:opacity-50"
              disabled={!githubReady}
            />
          </div>

          {/* 项目 ID */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目 ID（自动从 GitHub 用户名 + 项目名派生，驼峰命名）</label>
            <input
              value={modId}
              readOnly
              placeholder="格式：GitHubUsername.MODName"
              className="mt-2 w-full rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)] px-3 py-2 font-mono text-sm text-[var(--dfw-text)] opacity-80"
            />
            {!modIdValid && modId.length > 0 && (
              <p className="workbench-alert workbench-alert-warning mt-2 rounded-md px-3 py-2 text-xs">
                ⚠ 不符合 <code className="font-mono">^[A-Za-z0-9_-]{'{1,64}'}$</code>
              </p>
            )}
          </div>

          {/* 项目简介 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目简介（写入 [MODINFO].description）</label>
            <textarea
              value={description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
              placeholder="可选，最多 2000 字符"
              rows={3}
              maxLength={2000}
              className="mt-2 w-full resize-y rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)] px-3 py-2 text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)] disabled:opacity-50"
              disabled={!githubReady}
            />
          </div>

          {/* 作者（只读） */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目作者（来自 GitHub，不可改）</label>
            <input
              value={author}
              readOnly
              className="mt-2 w-full rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)] px-3 py-2 font-mono text-sm text-[var(--dfw-text)] opacity-80"
            />
          </div>

          {/* 封面 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">项目封面（可选，png/jpg/gif/webp，≤ 5MB）</label>
            <div className="mt-2 flex items-start gap-4">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-[var(--mc-border-muted)] bg-[var(--mc-control-bg-soft)]">
                {coverDataUrl ? (
                  <img src={coverDataUrl} alt="封面预览" className="h-full w-full object-cover" />
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
                  className="rounded-md border border-[var(--mc-border-muted)] bg-transparent px-3 py-1.5 text-sm text-[var(--dfw-text)] transition hover:bg-[var(--mc-control-hover)] disabled:opacity-50"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={!githubReady}
                >
                  选择图片…
                </button>
                {coverDataUrl && (
                  <button
                    type="button"
                    className="rounded-md border border-transparent bg-transparent px-3 py-1.5 text-xs text-[var(--dfw-text)] opacity-70 transition hover:opacity-100"
                    onClick={() => setCoverDataUrl(null)}
                  >
                    移除
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 附加文件/目录 */}
          <div>
            <label className="block text-sm font-medium text-[var(--dfw-text)]">
              附加文件 / 目录（可选，与项目目录结构一致，最深 5 层）
            </label>
            <p className="mt-1 text-xs text-[var(--dfw-text)] opacity-60">
              选择本地目录后，目录内的白名单文件会按原始层级落到项目根目录（最多 5 层嵌套）。
              进入工作台后这些文件会出现在画布上，可连接到初始化块加入 <code className="font-mono">file_import_list</code>。
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={extraDirInputRef}
                type="file"
                hidden
                // @ts-expect-error webkitdirectory 是非标准但广泛支持的属性
                webkitdirectory="true"
                multiple
                onChange={handleExtraDirChange}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--mc-border-muted)] bg-transparent px-3 py-1.5 text-sm text-[var(--dfw-text)] transition hover:bg-[var(--mc-control-hover)] disabled:opacity-50"
                onClick={() => extraDirInputRef.current?.click()}
                disabled={!githubReady}
              >
                <Folder size={16} />
                选择目录…
              </button>
              {extraEntries.length > 0 && (
                <span className="text-xs text-[var(--dfw-text)] opacity-70">
                  已选 {extraEntries.length} 个文件
                </span>
              )}
            </div>
            {extraWarnings.length > 0 && (
              <div className="workbench-alert workbench-alert-warning mt-2 max-h-24 overflow-y-auto rounded-md px-3 py-2 text-xs">
                {extraWarnings.map((w, idx) => (
                  <div key={`${w}-${idx}`}>⚠ {w}</div>
                ))}
              </div>
            )}
            {extraEntries.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-[var(--mc-border-soft)] bg-[var(--mc-control-bg-soft)] p-2 font-mono text-xs">
                {extraEntries
                  .slice()
                  .sort((a, b) => a.relpath.localeCompare(b.relpath))
                  .map(entry => (
                    <div
                      key={entry.relpath}
                      className="flex items-center justify-between gap-2 px-1 py-0.5 hover:bg-[var(--mc-control-hover)]"
                    >
                      <span className="truncate text-[var(--dfw-text)]" title={entry.relpath}>{entry.relpath}</span>
                      <button
                        type="button"
                        className="rounded p-0.5 text-[var(--dfw-text)] opacity-50 hover:bg-[var(--mc-control-hover)] hover:opacity-100"
                        onClick={() => removeExtraEntry(entry.relpath)}
                        aria-label={`移除 ${entry.relpath}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--mc-border-soft)] px-6 py-4">
          <button
            type="button"
            className="rounded-lg border border-[var(--mc-border-muted)] bg-transparent px-4 py-2 text-sm text-[var(--dfw-text)] transition hover:bg-[var(--mc-control-hover)]"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            onClick={() => void handleCreate()}
            disabled={!canCreate}
          >
            {submitting ? '创建中…' : '创建并进入画布'}
          </button>
        </footer>
      </div>

      <FileConflictDialog
        open={conflict !== null}
        conflictingName={conflict?.name ?? ''}
        suggestedName={conflict?.suggestedName ?? ''}
        onResolve={handleConflictResolve}
      />
    </div>,
    document.body,
  )
}
