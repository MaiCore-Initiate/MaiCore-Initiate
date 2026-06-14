import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { WORKBENCH_FILE_EXTENSIONS, type WorkbenchFileLanguage } from '../pages/workbench-canvas/types'

export interface NewFileDialogProps {
  open: boolean
  defaultName?: string
  submitting?: boolean
  errorMessage?: string | null
  conflictState?: {
    name: string
    suggestedName: string
  } | null
  onClose: () => void
  onCreate: (payload: { name: string; content: string; conflictResolution: 'rename' | 'overwrite' | null }) => void
  onConflictResolve: (resolution: 'rename' | 'overwrite' | 'cancel') => void
}

function inferLanguage(name: string): WorkbenchFileLanguage {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.') + 1)
  const table: Record<string, string> = {
    py: 'python',
    ps1: 'powershell', cmd: 'powershell', bat: 'powershell',
    sh: 'shell', bash: 'shell',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', jsonl: 'json',
    java: 'java',
    toml: 'ini',
    xml: 'xml',
    yaml: 'yaml', yml: 'yaml',
    txt: 'plaintext', log: 'plaintext',
  }
  return (table[ext] ?? 'plaintext') as WorkbenchFileLanguage
}

function defaultContentFor(name: string): string {
  const lang = inferLanguage(name)
  switch (lang) {
    case 'python':
      return '# -*- coding: utf-8 -*-\n'
    case 'shell':
      return '#!/usr/bin/env bash\nset -euo pipefail\n'
    case 'javascript':
      return '// 新建 JS 文件\n'
    case 'typescript':
      return '// 新建 TS 文件\n'
    case 'json':
      return '{}\n'
    case 'ini':
      return '# 新建 TOML 文件\n'
    case 'xml':
      return '<?xml version="1.0" encoding="utf-8"?>\n<root>\n</root>\n'
    default:
      return ''
  }
}

function validateName(name: string): { ok: boolean; reason?: string } {
  if (!name || !name.trim()) return { ok: false, reason: '文件名不能为空' }
  if (name.length > 128) return { ok: false, reason: '文件名不能超过 128 字符' }
  const ext = name.toLowerCase().slice(name.lastIndexOf('.') + 1)
  if (!ext) return { ok: false, reason: '文件必须有扩展名' }
  if (!WORKBENCH_FILE_EXTENSIONS.includes(`.${ext}` as (typeof WORKBENCH_FILE_EXTENSIONS)[number])) {
    return { ok: false, reason: `不支持的后缀 .${ext}` }
  }
  if (ext === 'exe' || ext === 'jar') {
    return { ok: false, reason: `.${ext} 只能导入现有文件，不允许在工作台中直接新建` }
  }
  return { ok: true }
}

export default function NewFileDialog({
  open,
  defaultName = '',
  submitting = false,
  errorMessage = null,
  conflictState,
  onClose,
  onCreate,
  onConflictResolve,
}: NewFileDialogProps) {
  const [name, setName] = useState(defaultName)
  const [content, setContent] = useState('')

  // 用 ref 持最新 onCreate/onClose/onConflictResolve，避免键盘 handler stale closure
  const onCreateRef = useRef(onCreate)
  const onCloseRef = useRef(onClose)
  const onConflictResolveRef = useRef(onConflictResolve)
  const nameRef = useRef(name)
  const contentRef = useRef(content)
  useEffect(() => { onCreateRef.current = onCreate }, [onCreate])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { onConflictResolveRef.current = onConflictResolve }, [onConflictResolve])
  useEffect(() => { nameRef.current = name }, [name])
  useEffect(() => { contentRef.current = content }, [content])

  // open 切换：进入时重置，离开时不重置（让 animation 顺利退出）
  useEffect(() => {
    if (open) {
      setName(defaultName)
      setContent(defaultContentFor(defaultName))
    }
  }, [open, defaultName])

  // Esc 关闭 + Ctrl/Cmd+Enter 提交
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        const v = validateName(nameRef.current)
        if (v.ok) handleCreate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const validation = validateName(name)
  const canCreate = validation.ok && !submitting

  const handleCreate = () => {
    if (!canCreate) return
    onCreateRef.current({ name: nameRef.current, content: contentRef.current, conflictResolution: null })
  }

  const dialog = (
    <div
      data-workbench-ui
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-file-title"
      onPointerDown={event => event.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[6px]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-[92%] max-w-2xl flex-col rounded-2xl border border-white/20 bg-[var(--dfw-bg)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 id="new-file-title" className="text-lg font-semibold text-[var(--dfw-text)]">
            新建文件
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

        <div className="flex-1 overflow-auto px-6 py-4">
          <label className="block text-sm font-medium text-[var(--dfw-text)]">
            文件名
          </label>
          <input
            autoFocus
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                handleCreate()
              }
            }}
            placeholder="例如 test.py"
            className="mt-2 w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 font-mono text-sm text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
          />
          {!validation.ok && name.length > 0 && (
            <div className="mt-2 text-xs text-amber-200">⚠ {validation.reason}</div>
          )}
          {errorMessage && (
            <div className="mt-2 text-xs text-red-300">⚠ {errorMessage}</div>
          )}
          <div className="mt-1 text-xs text-[var(--dfw-text)] opacity-60">
            支持的后缀：{WORKBENCH_FILE_EXTENSIONS.map(e => e.replace('.', '')).join(' / ')}
          </div>
          <div className="mt-1 text-xs text-[var(--dfw-text)] opacity-50">
            其中 exe / jar 仅支持导入，不支持直接新建。
          </div>

          <label className="mt-4 block text-sm font-medium text-[var(--dfw-text)]">
            初始内容（可选）
          </label>
          <textarea
            value={content}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setContent(event.target.value)}
            placeholder="留空则创建空文件"
            rows={10}
            className="mt-2 w-full resize-y rounded-lg border border-white/20 bg-transparent px-3 py-2 font-mono text-xs text-[var(--dfw-text)] outline-none focus:border-[var(--dfw-blue)]"
          />
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
            onClick={handleCreate}
            disabled={!canCreate}
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </footer>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(dialog, document.body)}
      {conflictState && createPortal(
        <div
          data-workbench-ui
          className="fixed inset-0 z-[1100] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-file-conflict-title"
          onPointerDown={event => event.stopPropagation()}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[6px]"
            onClick={() => onConflictResolveRef.current('cancel')}
          />
          <div className="relative w-[92%] max-w-md rounded-2xl border border-white/20 bg-[var(--dfw-bg)] p-6 shadow-2xl">
            <h3 id="new-file-conflict-title" className="text-base font-semibold text-[var(--dfw-text)]">
              文件名冲突
            </h3>
            <p className="mt-2 text-sm text-[var(--dfw-text)] opacity-80">
              已存在同名文件 <span className="font-mono">{conflictState.name}</span>，请选择处理方式：
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-lg bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                onClick={() => onConflictResolveRef.current('rename')}
              >
                重命名为 <span className="font-mono">{conflictState.suggestedName}</span>
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-[var(--dfw-text)]/20 bg-transparent px-4 py-2 text-sm font-medium text-[var(--dfw-text)] transition hover:bg-white/5"
                onClick={() => onConflictResolveRef.current('overwrite')}
              >
                覆盖现有文件
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-[var(--dfw-text)] opacity-70 transition hover:opacity-100"
                onClick={() => onConflictResolveRef.current('cancel')}
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
