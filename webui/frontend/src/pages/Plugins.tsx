import { useState, useEffect, useRef } from 'react'
import GlassCard from '../components/ui/GlassCard'
import Modal from '../components/ui/Modal'
import { useNotification } from '../components/ui/Notification'

interface Instance {
  name: string
  serial: string
  nickname: string
  absoluteSerial: number
  botType: string
  version: string
}

interface PluginSummary {
  id: string
  name: string
  author: string
  version: string
  description: string
  license: string
  keywords: string[]
  compat_min: string
  compat_max: string
  manifest_version: string
  default_locale: string
  installed_in: string[]
  repo_url: string
}

interface PluginDetail {
  id: string
  manifest: {
    name: string
    version: string
    description: string
    license: string
    keywords: string[]
    manifest_version: string
    default_locale: string
    author: { name: string }
    host_application: { min_version?: string; max_version?: string }
  }
}

// ─── 新增：本地插件类型 ───
interface LocalPlugin {
  folder_name: string
  has_manifest: boolean
  has_plugin_py: boolean
  registered: boolean
  installed_at: string
  id: string
  name: string
  version?: string
  description?: string
  author?: string
  license?: string
  keywords?: string[]
  homepage_url?: string
  repository_url?: string
  host_application?: { min_version?: string; max_version?: string }
}

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const btnFont = { fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const, top: 2 }
const pillShadow = "absolute inset-0 rounded-[27px] pointer-events-none"
const pillShadowStyle = { border: '2px solid rgba(0,0,0,0.5)', boxShadow: '2px 3px 6px rgba(0,0,0,0.15)' }

/* ─── 原有：插件详情弹窗 (略有折叠保留) ─── */
function PluginDetailModal({ plugin, instanceName, instanceSerial, open, onClose, onChanged }: any) {
  // ... 与你原本的代码一致 ...
  const { notify } = useNotification()
  const [detail, setDetail] = useState<PluginDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [operating, setOperating] = useState(false)

  useEffect(() => {
    if (!open || !plugin) { setDetail(null); return }
    setLoading(true)
    fetch(`/api/plugins/detail/${plugin.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setDetail(d.plugin) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, plugin?.id])

  if (!plugin) return null

  const isInstalled = plugin.installed_in?.includes(instanceSerial)

  const handleInstall = async () => {
    setOperating(true)
    try {
      const res = await fetch('/api/plugins/install', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin_id: plugin.id, instance_name: instanceName }),
      })
      const d = await res.json()
      if (d.success) { notify(d.message, 'success'); onChanged(); onClose() }
      else notify(d.detail || '安装失败', 'error')
    } catch { notify('安装请求失败', 'error') }
    setOperating(false)
  }

  const handleUninstall = async () => {
    setOperating(true)
    try {
      const res = await fetch('/api/plugins/uninstall', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin_id: plugin.id, instance_name: instanceName }),
      })
      const d = await res.json()
      if (d.success) { notify(d.message, 'success'); onChanged(); onClose() }
      else notify(d.detail || '卸载失败', 'error')
    } catch { notify('卸载请求失败', 'error') }
    setOperating(false)
  }

  const m = detail?.manifest
  const labelStyle = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
  const valStyle = { fontSize: 25, ...monoFont, color: '#707070' }

  return (
    <Modal open={open} onClose={onClose} width={720}>
      <div className="p-[40px] max-h-[90vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="text-center text-black/30 py-[40px]" style={labelStyle}>加载中...</div>
        ) : (
          <>
            <h2 className="text-black mb-[8px]" style={{ fontSize: 45, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
              {m?.name || plugin.name}
            </h2>
            <div className="flex flex-col gap-[6px]">
              {([
                ['ID', plugin.id],
                ['版本', m?.version || plugin.version],
                ['作者', m?.author?.name || plugin.author],
                ['简介', m?.description || plugin.description],
                ['兼容版本', `${plugin.compat_min || '?'} ~ ${plugin.compat_max || '最新'}`],
                ['开源许可', m?.license || plugin.license],
                ['清单版本', m?.manifest_version || plugin.manifest_version],
                ['关键词', (m?.keywords || plugin.keywords || []).join(', ') || '-'],
                ['语言', m?.default_locale || plugin.default_locale || '-'],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex items-baseline gap-[12px]">
                  <span className="text-black shrink-0" style={labelStyle}>{label}</span>
                  <span className="break-all" style={valStyle}>{val}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-[16px] mt-[24px]">
              <button
                onClick={handleInstall} disabled={operating}
                className="h-[54px] px-[36px] rounded-[27px] flex items-center gap-[12px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-40 relative"
              >
                <div className={pillShadow} style={pillShadowStyle} />
                <span style={btnFont}>{operating ? '处理中...' : isInstalled ? '重新安装' : '安装'}</span>
              </button>
              {isInstalled && (
                <button
                  onClick={handleUninstall} disabled={operating}
                  className="h-[54px] px-[36px] rounded-[27px] flex items-center gap-[12px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-40 relative"
                >
                  <div className={pillShadow} style={{ ...pillShadowStyle, borderColor: 'rgba(200,0,0,0.5)' }} />
                  <span style={{ ...btnFont, color: '#c00' }}>卸载</span>
                </button>
              )}
              <div className="flex-1" />
              {plugin.repo_url && (
                <a
                  href={plugin.repo_url} target="_blank" rel="noopener noreferrer"
                  className="w-[54px] h-[54px] rounded-[27px] flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-[1.08] active:scale-95 relative"
                  title="在 GitHub 上查看" onClick={e => e.stopPropagation()}
                >
                  <div className={pillShadow} style={pillShadowStyle} />
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                    <path d="M9 18c-4.51 2-5-2-7-2" />
                  </svg>
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ─── 原有：插件小卡片 ─── */
function PluginCard({ plugin, instanceSerial, onClick }: any) {
  const isInstalled = plugin.installed_in?.includes(instanceSerial)
  const cardLabel = { fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
  const cardMono = { fontSize: 18, ...monoFont, color: '#707070' }

  return (
    <div
      className="relative rounded-[20px] p-[20px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] animate-fade-slide-up"
      style={{
        border: '2px solid rgba(0,0,0,0.3)',
        boxShadow: '2px 3px 6px rgba(0,0,0,0.1)',
        background: isInstalled ? 'rgba(0,0,0,0.04)' : 'transparent',
      }}
      onClick={onClick}
    >
      {isInstalled && (
        <div className="absolute top-[12px] right-[16px] px-[10px] py-[2px] rounded-[10px]"
          style={{ background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.2)' }}>
          <span style={{ fontSize: 14, ...monoFont, color: '#555' }}>已安装</span>
        </div>
      )}
      <div className="text-black font-semibold truncate pr-[60px]" style={{ fontSize: 28, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
        {plugin.name}
      </div>
      <div className="flex items-center gap-[12px] mt-[4px]">
        <span style={cardMono}>{plugin.author}</span>
        <span style={{ ...cardMono, opacity: 0.5 }}>|</span>
        <span style={cardMono}>v{plugin.version}</span>
      </div>
      <div className="mt-[6px] text-black/60 line-clamp-2" style={cardLabel}>
        {plugin.description || '暂无描述'}
      </div>
      {plugin.keywords?.length > 0 && (
        <div className="flex flex-wrap gap-[6px] mt-[8px]">
          {plugin.keywords.slice(0, 4).map((k: string) => (
            <span key={k} className="px-[8px] py-[1px] rounded-[8px] text-black/40"
              style={{ fontSize: 14, ...monoFont, border: '1px solid rgba(0,0,0,0.15)' }}>
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── 本地插件管理面板 ─── */
interface UploadEntry {
  file: File
  name: string
  target: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
}

function PluginComposer({ instanceSerial, onDone }: { instanceSerial: string, onDone: () => void }) {
  const { notify } = useNotification()
  const [folderName, setFolderName] = useState('')
  const [tree, setTree] = useState<any[]>([])
  const [newSubFolder, setNewSubFolder] = useState('')
  const [uploadTarget, setUploadTarget] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [created, setCreated] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<UploadEntry[]>([])
  const uploadingRef = useRef(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const refreshTree = async () => {
    if (!folderName) return
    try {
      const r = await fetch(`/api/plugins/local/tree?instance_serial=${instanceSerial}&plugin_folder=${encodeURIComponent(folderName)}`)
      const d = await r.json()
      if (d.success) setTree(d.tree)
    } catch {}
  }

  const handleCreate = async () => {
    if (!folderName.trim()) { notify('请输入插件文件夹名称', 'error'); return }
    try {
      const r = await fetch('/api/plugins/local/create-folder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_serial: instanceSerial, plugin_folder: folderName, sub_path: '' })
      })
      const d = await r.json()
      if (d.success) { setCreated(true); notify('插件目录已创建', 'success'); refreshTree() }
      else notify(d.detail || '创建失败', 'error')
    } catch { notify('创建失败', 'error') }
  }

  const handleCreateSub = async () => {
    if (!newSubFolder.trim()) return
    try {
      const r = await fetch('/api/plugins/local/create-folder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_serial: instanceSerial, plugin_folder: folderName, sub_path: newSubFolder })
      })
      const d = await r.json()
      if (d.success) { setNewSubFolder(''); notify('子文件夹已创建', 'success'); refreshTree() }
    } catch { notify('创建子文件夹失败', 'error') }
  }

  const processUploadQueue = async (entries: UploadEntry[]) => {
    if (uploadingRef.current) return
    uploadingRef.current = true
    for (let idx = 0; idx < entries.length; idx++) {
      setUploadQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'uploading', progress: 0.3 } : e))
      const entry = entries[idx]
      const fd = new FormData()
      fd.append('instance_serial', instanceSerial)
      fd.append('plugin_folder', folderName)
      fd.append('sub_path', entry.target)
      fd.append('files', entry.file)
      try {
        setUploadQueue(prev => prev.map((e, i) => i === idx ? { ...e, progress: 0.6 } : e))
        const r = await fetch('/api/plugins/local/upload-files', { method: 'POST', body: fd })
        const d = await r.json()
        if (d.success) {
          setUploadQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'done', progress: 1 } : e))
        } else {
          setUploadQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'error', progress: 0 } : e))
        }
      } catch {
        setUploadQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'error', progress: 0 } : e))
      }
    }
    refreshTree()
    uploadingRef.current = false
  }

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const entries: UploadEntry[] = Array.from(files).map(f => ({
      file: f, name: f.name, target: uploadTarget,
      status: 'pending' as const, progress: 0,
    }))
    setUploadQueue(prev => [...prev, ...entries])
    processUploadQueue(entries)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFinalize = async () => {
    try {
      const r = await fetch('/api/plugins/local/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_serial: instanceSerial, plugin_folder: folderName })
      })
      const d = await r.json()
      if (d.success) { notify(`插件 ${d.plugin_name} 注册成功`, 'success'); onDone() }
      else notify(d.detail || '注册失败', 'error')
    } catch { notify('注册失败', 'error') }
  }

  // 收集所有文件夹路径用于上传目标选择
  const folderPaths = ['(根目录)']
  const collectDirs = (items: any[]) => {
    for (const it of items) {
      if (it.type === 'dir') {
        folderPaths.push(it.path)
        if (it.children) collectDirs(it.children)
      }
    }
  }
  collectDirs(tree)

  const labelStyle = { fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
  const inputStyle = "flex-1 h-[42px] px-[14px] rounded-[21px] bg-white/60 border-2 border-black/30 outline-none text-black"

  const renderTree = (items: any[], depth = 0) => (
    <div style={{ paddingLeft: depth * 16 }}>
      {items.map(it => (
        <div key={it.path}>
          <div className="flex items-center gap-[6px] py-[2px]" style={{ ...monoFont, fontSize: 16, color: it.type === 'dir' ? '#333' : '#777' }}>
            <span>{it.type === 'dir' ? '/' : ' '}{it.name}</span>
            {it.name === 'plugin.py' && <span className="text-green-600 text-xs">*</span>}
            {it.name === '_manifest.json' && <span className="text-green-600 text-xs">*</span>}
          </div>
          {it.type === 'dir' && it.children && renderTree(it.children, depth + 1)}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-[16px] animate-fade-slide-up">
      {/* 步骤1：创建插件文件夹 */}
      <div className="flex items-center gap-[12px]">
        <span className="text-black shrink-0" style={labelStyle}>插件文件夹名</span>
        <input
          value={folderName} onChange={e => setFolderName(e.target.value)}
          disabled={created} placeholder="例如: my-plugin"
          className={inputStyle} style={{ ...monoFont, fontSize: 20 }}
        />
        {!created ? (
          <button onClick={handleCreate} className="h-[42px] px-[18px] rounded-[21px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative shrink-0">
            <div className="absolute inset-0 rounded-[21px] pointer-events-none" style={pillShadowStyle} />
            <span style={{ ...labelStyle, position: 'relative' }}>创建</span>
          </button>
        ) : (
          <span className="text-black/30 shrink-0" style={labelStyle}>已创建</span>
        )}
      </div>

      {created && (
        <>
          {/* 文件树 */}
          <div className="rounded-[16px] p-[16px] max-h-[200px] overflow-y-auto custom-scrollbar" style={{ border: '2px solid rgba(0,0,0,0.15)', background: 'rgba(255,255,255,0.3)' }}>
            <div className="text-black/40 mb-[4px]" style={{ fontSize: 16, ...monoFont }}>/{folderName}/</div>
            {tree.length > 0 ? renderTree(tree) : <div className="text-black/20" style={{ fontSize: 16, ...monoFont }}>(空)</div>}
          </div>

          {/* 创建子文件夹 */}
          <div className="flex items-center gap-[12px]">
            <span className="text-black/60 shrink-0" style={labelStyle}>新建子文件夹</span>
            <input
              value={newSubFolder} onChange={e => setNewSubFolder(e.target.value)}
              placeholder="例如: utils" className={inputStyle} style={{ ...monoFont, fontSize: 20 }}
            />
            <button onClick={handleCreateSub} className="h-[42px] px-[18px] rounded-[21px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative shrink-0">
              <div className="absolute inset-0 rounded-[21px] pointer-events-none" style={pillShadowStyle} />
              <span style={{ ...labelStyle, position: 'relative' }}>创建</span>
            </button>
          </div>

          {/* 上传文件 */}
          <div className="flex items-center gap-[12px]">
            <span className="text-black/60 shrink-0" style={labelStyle}>上传到</span>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                className="h-[42px] px-[14px] rounded-[21px] bg-white/60 border-2 border-black/30 outline-none text-black cursor-pointer flex items-center gap-[8px]"
                style={{ ...monoFont, fontSize: 18, minWidth: 160 }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="flex-1 text-left truncate">{uploadTarget || '(根目录)'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <path d="M2 4L6 8L10 4" stroke="rgba(0,0,0,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {dropdownOpen && (
                <div
                  className="absolute top-[46px] left-0 min-w-full rounded-[14px] bg-white/60 backdrop-blur-md border-2 border-black/20 py-[6px] z-50 max-h-[200px] overflow-y-auto custom-scrollbar"
                  style={{ boxShadow: '2px 4px 12px rgba(0,0,0,0.12)' }}
                >
                  {folderPaths.map(p => {
                    const val = p === '(根目录)' ? '' : p
                    const active = uploadTarget === val
                    return (
                      <div
                        key={p}
                        className="px-[14px] py-[6px] cursor-pointer transition-colors duration-150"
                        style={{ ...monoFont, fontSize: 16, background: active ? 'rgba(0,0,0,0.07)' : 'transparent', color: active ? '#000' : '#555' }}
                        onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'rgba(0,0,0,0.04)') }}
                        onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent') }}
                        onClick={() => { setUploadTarget(val); setDropdownOpen(false) }}
                      >
                        {p}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="h-[42px] px-[18px] rounded-[21px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative shrink-0">
              <div className="absolute inset-0 rounded-[21px] pointer-events-none" style={pillShadowStyle} />
              <span style={{ ...labelStyle, position: 'relative' }}>选择文件</span>
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" title="上传文件" onChange={e => handleUpload(e.target.files)} />
          </div>

          {/* 上传队列进度 */}
          {uploadQueue.length > 0 && (
            <div className="flex flex-wrap gap-[8px]">
              {uploadQueue.map((entry, i) => (
                <div
                  key={`uq-${i}-${entry.name}`}
                  className="h-[42px] pl-[12px] pr-[18px] rounded-[21px] flex items-center gap-[6px] shrink-0 relative overflow-hidden"
                  style={{ opacity: entry.status === 'pending' ? 0.4 : 1 }}
                >
                  <div className="absolute inset-0 rounded-[21px] pointer-events-none" style={pillShadowStyle} />
                  <button
                    title="移除"
                    className="w-[22px] h-[22px] rounded-full flex items-center justify-center cursor-pointer hover:bg-black/10 transition-colors shrink-0"
                    onClick={() => setUploadQueue(prev => prev.filter((_, j) => j !== i))}
                  >
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                      <line x1="2" y1="2" x2="12" y2="12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="12" y1="2" x2="2" y2="12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <span style={{ ...monoFont, fontSize: 16, position: 'relative' }}>{entry.name}</span>
                  {entry.target && <span style={{ ...monoFont, fontSize: 12, color: '#aaa', position: 'relative' }}>→ {entry.target}</span>}
                  {entry.status === 'uploading' && (
                    <div className="absolute bottom-[3px] left-[18px] h-[3px] rounded-full" style={{ width: `${entry.progress * 100}%`, background: '#36b5ff', opacity: 0.8, transition: 'width 0.3s ease' }} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="text-black/30" style={{ fontSize: 16, ...monoFont }}>
            * plugin.py 和 _manifest.json 必须位于根目录
          </div>

          {/* 完成注册 */}
          <div className="flex items-center gap-[12px]">
            <button onClick={handleFinalize} className="h-[46px] px-[24px] rounded-[23px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative">
              <div className="absolute inset-0 rounded-[23px] pointer-events-none" style={pillShadowStyle} />
              <span style={{ fontSize: 24, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const }}>验证并注册插件</span>
            </button>
            <button onClick={onDone} className="h-[46px] px-[24px] rounded-[23px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative">
              <div className="absolute inset-0 rounded-[23px] pointer-events-none" style={{ ...pillShadowStyle, borderColor: 'rgba(0,0,0,0.3)' }} />
              <span className="text-black/50" style={{ fontSize: 24, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const }}>取消</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function LocalPluginDetailModal({ plugin, open, onClose }: { plugin: LocalPlugin | null, open: boolean, onClose: () => void }) {
  if (!plugin) return null

  const labelStyle = { fontSize: 23, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
  const valStyle = { fontSize: 22, ...monoFont, color: '#707070' }
  const installedAt = plugin.installed_at ? new Date(plugin.installed_at).toLocaleString() : '-'
  const compat = plugin.host_application
    ? `${plugin.host_application.min_version || '?'} ~ ${plugin.host_application.max_version || '最新'}`
    : '-'

  return (
    <Modal open={open} onClose={onClose} width={760}>
      <div className="p-[36px] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h2 className="text-black mb-[10px]" style={{ fontSize: 42, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
          {plugin.name}
        </h2>
        <div className="flex flex-col gap-[6px]">
          {([
            ['名称', plugin.name],
            ['ID', plugin.id],
            ['文件夹', plugin.folder_name],
            ['版本', plugin.version || '?'],
            ['作者', plugin.author || '-'],
            ['简介', plugin.description || '-'],
            ['许可', plugin.license || '-'],
            ['关键词', (plugin.keywords || []).join(', ') || '-'],
            ['兼容版本', compat],
            ['注册状态', plugin.registered ? '已注册' : '未注册'],
            ['注册时间', installedAt],
            ['manifest', plugin.has_manifest ? '存在' : '缺失'],
            ['plugin.py', plugin.has_plugin_py ? '存在' : '缺失'],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label} className="flex items-baseline gap-[12px]">
              <span className="text-black shrink-0" style={labelStyle}>{label}</span>
              <span className="break-all" style={valStyle}>{val}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-[12px] mt-[22px]">
          {plugin.homepage_url && (
            <a
              href={plugin.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-[46px] px-[18px] rounded-[23px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative"
            >
              <div className="absolute inset-0 rounded-[23px] pointer-events-none" style={pillShadowStyle} />
              <span style={{ ...monoFont, fontSize: 18, position: 'relative' }}>主页</span>
            </a>
          )}
          {plugin.repository_url && (
            <a
              href={plugin.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-[46px] h-[46px] rounded-[23px] flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-[1.08] active:scale-95 relative"
              title="查看仓库"
            >
              <div className="absolute inset-0 rounded-[23px] pointer-events-none" style={pillShadowStyle} />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative' }}>
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </a>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="h-[46px] px-[22px] rounded-[23px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative"
          >
            <div className="absolute inset-0 rounded-[23px] pointer-events-none" style={pillShadowStyle} />
            <span style={{ ...monoFont, fontSize: 20, position: 'relative' }}>关闭</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LocalPluginManager({ instanceSerial, instanceName }: { instanceSerial: string, instanceName: string }) {
  const { notify } = useNotification()
  const [localPlugins, setLocalPlugins] = useState<LocalPlugin[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const archiveInputRef = useRef<HTMLInputElement>(null)
  const [composing, setComposing] = useState(false)
  const [detailPlugin, setDetailPlugin] = useState<LocalPlugin | null>(null)

  const fetchLocal = () => {
    setLoading(true)
    fetch(`/api/plugins/local/list?instance_serial=${instanceSerial}`)
      .then(r => r.json())
      .then(d => { if (d.success) setLocalPlugins(d.plugins); setSelectedIds(new Set()) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLocal() }, [instanceSerial])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleScan = async () => {
    try {
      const res = await fetch('/api/plugins/local/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: instanceName, instance_serial: instanceSerial })
      })
      const d = await res.json()
      if (d.success) { notify(`扫描完成，注册了 ${d.registered_count} 个新插件`, 'success'); fetchLocal() }
      else notify(d.detail || '扫描失败', 'error')
    } catch { notify('扫描失败', 'error') }
  }

  const handleBatchUninstall = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定要卸载选中的 ${selectedIds.size} 个插件吗？`)) return
    try {
      const res = await fetch('/api/plugins/local/batch-uninstall', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: instanceName, instance_serial: instanceSerial, plugin_ids: Array.from(selectedIds) })
      })
      const d = await res.json()
      if (d.success) { notify(`成功卸载 ${d.removed.length} 个插件`, 'success'); fetchLocal() }
    } catch { notify('批量卸载失败', 'error') }
  }

  const handleBatchUnregister = async () => {
    if (selectedIds.size === 0) return
    const targetIds = localPlugins.filter(p => selectedIds.has(p.id) && p.registered).map(p => p.id)
    if (targetIds.length === 0) {
      notify('选中的插件里没有“已注册”项', 'error')
      return
    }
    if (!confirm(`确定要注销选中的 ${targetIds.length} 个插件吗？\n仅取消注册，不会删除插件文件。`)) return
    try {
      const res = await fetch('/api/plugins/local/batch-unregister', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: instanceName, instance_serial: instanceSerial, plugin_ids: targetIds })
      })
      const d = await res.json()
      if (d.success) { notify(`成功注销 ${d.unregistered.length} 个插件`, 'success'); fetchLocal() }
      else notify(d.detail || '批量注销失败', 'error')
    } catch { notify('批量注销失败', 'error') }
  }

  const doArchiveUpload = async (file: File) => {
    const fd = new FormData()
    fd.append('instance_serial', instanceSerial)
    fd.append('file', file)
    try {
      notify('正在解压导入中...', 'info')
      const res = await fetch('/api/plugins/local/upload-archive', { method: 'POST', body: fd })
      const d = await res.json()
      if (d.success) { notify(`导入成功: ${d.plugin_name}`, 'success'); fetchLocal() }
      else notify(`导入失败: ${d.detail}`, 'error')
    } catch { notify('压缩包上传失败', 'error') }
  }

  const handleArchiveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) doArchiveUpload(file)
    if (archiveInputRef.current) archiveInputRef.current.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const ext = file.name.toLowerCase()
    if (ext.endsWith('.zip') || ext.endsWith('.tar') || ext.endsWith('.tar.gz') || ext.endsWith('.tgz') || ext.endsWith('.7z')) {
      doArchiveUpload(file)
    } else {
      notify('仅支持 .zip / .tar / .tar.gz / .7z 压缩包', 'error')
    }
  }

  const localBtnStyle = { fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const, top: 1 }

  if (composing) {
    return <PluginComposer instanceSerial={instanceSerial} onDone={() => { setComposing(false); fetchLocal() }} />
  }

  return (
    <div className="h-full flex flex-col relative animate-fade-slide-up overflow-visible">
      {/* 拖拽导入区 */}
      <div
        className="min-h-[120px] rounded-[30px] flex flex-col items-center justify-center cursor-pointer transition-all duration-200 mb-[16px]"
        style={{
          border: `3px dashed ${dragging ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)'}`,
          background: dragging ? 'rgba(0,0,0,0.04)' : 'transparent',
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => archiveInputRef.current?.click()}
      >
        <svg width="64" height="40" viewBox="0 0 118 72" fill="none" className="mb-[8px]">
          <rect x="2.5" y="2.5" width="113" height="67" rx="17.5" stroke="rgba(0,0,0,0.2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="210 190" fill="none" />
          <path d="M59 15 L39 42 M59 15 L78 42" stroke="rgba(0,0,0,0.2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <span className="text-black/20" style={{ fontSize: 22, fontFamily: "'问藏书房','HarmonyOS Sans SC', sans-serif" }}>
          点击或拖拽压缩包导入插件{'  '}
          <span style={{ ...monoFont, fontStyle: 'italic' }}>|  *.zip</span>、
          <span style={{ ...monoFont, fontStyle: 'italic' }}>*.tar.gz</span>、
          <span style={{ ...monoFont, fontStyle: 'italic' }}>*.7z</span>
        </span>
        <input ref={archiveInputRef} type="file" accept=".zip,.tar,.gz,.tgz,.bz2,.7z" className="hidden" title="导入插件压缩包" onChange={handleArchiveChange} />
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-[12px] mb-[12px] overflow-visible px-[8px]">
        <button onClick={handleScan} className="h-[46px] px-[20px] rounded-[23px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative">
          <div className={pillShadow} style={{ ...pillShadowStyle, borderRadius: 23 }} />
          <span style={localBtnStyle}>扫描并注册</span>
        </button>
        <button onClick={() => setComposing(true)} className="h-[46px] px-[20px] rounded-[23px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative">
          <div className={pillShadow} style={{ ...pillShadowStyle, borderRadius: 23 }} />
          <span style={localBtnStyle}>组装插件</span>
        </button>
        {selectedIds.size > 0 && (
          <>
            <button onClick={handleBatchUnregister} className="h-[46px] px-[20px] rounded-[23px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative animate-fade-slide-up">
              <div className={pillShadow} style={{ ...pillShadowStyle, borderRadius: 23, borderColor: 'rgba(160,120,0,0.55)' }} />
              <span style={{ ...localBtnStyle, color: '#8a6400' }}>批量注销 ({selectedIds.size})</span>
            </button>
            <button onClick={handleBatchUninstall} className="h-[46px] px-[20px] rounded-[23px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative animate-fade-slide-up">
              <div className={pillShadow} style={{ ...pillShadowStyle, borderRadius: 23, borderColor: 'rgba(180,0,0,0.5)' }} />
              <span style={{ ...localBtnStyle, color: '#a00' }}>批量卸载 ({selectedIds.size})</span>
            </button>
          </>
        )}
      </div>

      {/* 插件列表 */}
      <div className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar px-[8px] pb-[8px]">
        {loading ? (
          <div className="flex items-center justify-center h-[120px] gap-[10px] animate-fade-in">
            <div className="rounded-full animate-spin" style={{ width: 20, height: 20, border: '3px solid rgba(0,0,0,0.15)', borderTopColor: 'rgba(0,0,0,0.5)' }} />
            <span className="text-black/20" style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>加载中...</span>
          </div>
        ) : localPlugins.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] animate-fade-in">
            <span className="text-black/20" style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>未找到本地插件</span>
          </div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {localPlugins.map((p, idx) => {
              const checked = selectedIds.has(p.id)
              return (
                <div
                  key={p.folder_name}
                  className="relative rounded-[14px] px-[14px] py-[10px] pl-[44px] transition-all duration-200 hover:scale-[1.01] cursor-pointer origin-center animate-fade-slide-up"
                  style={{
                    border: '2px solid rgba(0,0,0,0.2)',
                    boxShadow: '2px 3px 6px rgba(0,0,0,0.08)',
                    background: checked ? 'rgba(0,0,0,0.04)' : 'transparent',
                    animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards',
                  }}
                  onClick={() => toggleSelect(p.id)}
                >
                  {/* checkbox */}
                  <input
                    type="checkbox" className="absolute left-[14px] top-[16px] w-[18px] h-[18px] cursor-pointer accent-black"
                    checked={checked}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleSelect(p.id)}
                    title="选择"
                  />
                  <div className="flex items-center gap-[10px] min-w-0">
                    <span className="text-black font-semibold min-w-0 max-w-[220px] truncate" style={{ fontSize: 21, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>{p.name}</span>
                    <span className="shrink-0" style={{ ...monoFont, fontSize: 16, color: '#888' }}>v{p.version || '?'}</span>
                    <span className="min-w-0 max-w-[220px] truncate" style={{ ...monoFont, fontSize: 14, color: '#aaa' }}>{p.folder_name}</span>
                    <div className="flex-1" />
                    <button
                      className="h-[30px] px-[10px] rounded-[15px] shrink-0 cursor-pointer transition-all duration-200 hover:scale-[1.03] active:scale-95 relative"
                      onClick={e => { e.stopPropagation(); setDetailPlugin(p) }}
                    >
                      <div className="absolute inset-0 rounded-[15px] pointer-events-none" style={{ border: '1px solid rgba(0,0,0,0.25)' }} />
                      <span style={{ ...monoFont, fontSize: 13, position: 'relative' }}>详情</span>
                    </button>
                    {/* 状态标签 */}
                    {p.registered ? (
                      <span className="px-[8px] py-[1px] rounded-[8px] shrink-0" style={{ fontSize: 12, ...monoFont, color: '#555', background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.15)' }}>已注册</span>
                    ) : (
                      <span className="px-[8px] py-[1px] rounded-[8px] shrink-0" style={{ fontSize: 12, ...monoFont, color: '#a66', background: 'rgba(180,0,0,0.06)', border: '1px solid rgba(180,0,0,0.2)' }}>未注册</span>
                    )}
                    {(!p.has_manifest || !p.has_plugin_py) && (
                      <span className="px-[8px] py-[1px] rounded-[8px] shrink-0" style={{ fontSize: 12, ...monoFont, color: '#a00', background: 'rgba(180,0,0,0.06)', border: '1px solid rgba(180,0,0,0.2)' }}>缺少关键文件</span>
                    )}
                  </div>
                  {p.description && (
                    <div className="mt-[2px] text-black/50 line-clamp-1 pr-[6px]" style={{ fontSize: 14, ...monoFont }}>{p.description}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <LocalPluginDetailModal plugin={detailPlugin} open={!!detailPlugin} onClose={() => setDetailPlugin(null)} />
    </div>
  )
}

/* ─── 主页面 ─── */
export default function Plugins() {
  const { notify } = useNotification()
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [plugins, setPlugins] = useState<PluginSummary[]>([])
  const [showAll, setShowAll] = useState(false)
  const [detailPlugin, setDetailPlugin] = useState<PluginSummary | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  
  // 新增：本地管理模式开关
  const [isLocalMode, setIsLocalMode] = useState(false)

  // 加载实例列表
  useEffect(() => {
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([name, cfg]: [string, any]) => ({
          name,
          serial: cfg.serial_number,
          nickname: cfg.nickname || cfg.serial_number,
          absoluteSerial: cfg.absolute_serial ?? 0,
          botType: cfg.bot_type || 'MaiBot',
          version: cfg.version || '',
        }))
        setInstances(list)
      })
      .catch(() => {})
  }, [])

  // 加载远端插件列表
  const fetchPlugins = () => {
    if (!selected) return
    fetch(`/api/plugins/list?instance_serial=${selected}&show_all=${showAll}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setPlugins(d.plugins) })
      .catch(() => notify('获取插件列表失败', 'error'))
  }

  useEffect(() => { if (!isLocalMode) fetchPlugins() }, [selected, showAll, isLocalMode])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/plugins/refresh', { method: 'POST', credentials: 'include' })
      fetchPlugins()
      notify('插件列表已刷新', 'success')
    } catch { notify('刷新失败', 'error') }
    setRefreshing(false)
  }

  const filtered = plugins.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return p.name.toLowerCase().includes(s) || p.author.toLowerCase().includes(s)
      || p.id.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)
      || p.keywords?.some(k => k.toLowerCase().includes(s))
  })

  const selectedInstance = instances.find(i => i.serial === selected)
  const selectedName = selectedInstance ? instances.find(i => i.serial === selected)?.name || '' : ''

  // 实例搜索
  const [instSearch, setInstSearch] = useState('')
  const filteredInstances = instances.filter(i => {
    if (!instSearch) return true
    const s = instSearch.toLowerCase()
    return i.nickname.toLowerCase().includes(s) || i.serial.toLowerCase().includes(s)
  })

  return (
    <div className="flex flex-col p-12 h-full">
      <h1 className="text-black shrink-0 mb-[16px] animate-card-enter" style={pageTitleStyle}>插件管理</h1>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* 左侧：实例选择 (无改动) */}
        <div className="w-[425px] shrink-0 animate-card-enter">
          <GlassCard>
            <div className="p-[24px] flex flex-col h-full">
              <h2 className="text-black pb-[12px]" style={sectionTitle}>选择实例</h2>

              <div className="flex items-center h-[71px] px-[22px] gap-[12px] rounded-[35.5px] bg-white/60 border-2 border-black/50 shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
                  <line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <input
                  value={instSearch} onChange={e => setInstSearch(e.target.value)}
                  placeholder="Search instance"
                  className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20"
                  style={{ ...monoFont, fontSize: 25 }}
                />
              </div>

              <div className="flex-1 overflow-y-auto mt-[12px] px-[4px]">
                {filteredInstances.length === 0 ? (
                  <div className="flex items-center justify-center h-[120px] rounded-[20px] border-3 border-dashed border-[#9e9e9e]">
                    <span className="text-[#9e9e9e] font-semibold text-base" style={monoFont}>no instance</span>
                  </div>
                ) : (
                  filteredInstances.map((inst, i) => {
                    const isSelected = inst.serial === selected
                    const label = `${inst.nickname}|${inst.serial}|${inst.botType}`
                    return (
                      <div key={inst.serial}>
                        {isSelected && i > 0 && <div className="h-[6px]" />}
                        <button
                          className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden"
                          onClick={() => setSelected(inst.serial)}
                          style={{
                            height: 54, padding: isSelected ? '0 20px' : '0 4px',
                            borderRadius: isSelected ? 27 : 6,
                            background: isSelected ? 'rgba(255,255,255,0.6)' : 'transparent',
                            border: isSelected ? '2px solid rgba(0,0,0,0.5)' : '2px solid transparent',
                          }}
                        >
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                          <span className="truncate shrink-0" style={{ ...monoFont, fontSize: 30 }}>{label}</span>
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                        </button>
                        {isSelected && i < filteredInstances.length - 1 && <div className="h-[6px]" />}
                        {!isSelected && i < filteredInstances.length - 1 && <hr className="border-[#707070]" />}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* 右侧：插件列表 / 本地管理面板 */}
        <div className="flex-1 min-w-0 animate-card-enter" style={{ animationDelay: '80ms' }}>
          {selectedInstance ? (
            selectedInstance.botType === 'MoFox_bot' ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                  当前实例类型不支持自动安装插件
                </span>
              </div>
            ) : selectedInstance.version === 'classical' ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                  Classical 版本不支持插件功能
                </span>
              </div>
            ) : (
              <GlassCard>
                <div className="p-[28px] flex flex-col h-full">
                  {/* 顶部操作栏 */}
                  <div className="flex items-center gap-[16px] mb-[16px]">
                    <h2 className="text-black flex-1" style={sectionTitle}>
                      {isLocalMode ? '本地插件管理' : '可用插件'}
                    </h2>

                    {!isLocalMode && (
                      <div className="flex items-center h-[50px] px-[18px] gap-[8px] rounded-[25px] bg-white/60 border-2 border-black/50" style={{ width: 300 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                          <circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
                          <line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        <input
                          value={search} onChange={e => setSearch(e.target.value)}
                          placeholder="搜索插件"
                          className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20"
                          style={{ ...monoFont, fontSize: 20 }}
                        />
                      </div>
                    )}

                    {/* 本地/远端切换 */}
                    <button
                      onClick={() => setIsLocalMode(!isLocalMode)}
                      className="h-[50px] px-[20px] rounded-[25px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative"
                      style={{ background: isLocalMode ? 'rgba(0,0,0,0.1)' : 'transparent' }}
                    >
                      <div className="absolute inset-0 rounded-[25px] pointer-events-none" style={{...pillShadowStyle, borderColor: isLocalMode ? 'black' : 'rgba(0,0,0,0.5)' }} />
                      <span style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 1 }}>
                        {isLocalMode ? '返回远端市场' : '本地插件管理'}
                      </span>
                    </button>

                    {!isLocalMode && (
                      <>
                        <button
                          onClick={() => setShowAll(!showAll)}
                          className="h-[50px] px-[20px] rounded-[25px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 relative"
                        >
                          <div className="absolute inset-0 rounded-[25px] pointer-events-none" style={pillShadowStyle} />
                          <span style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 1 }}>
                            {showAll ? '全部' : '仅兼容'}
                          </span>
                        </button>
                        <button
                          onClick={handleRefresh} disabled={refreshing}
                          className="h-[50px] px-[20px] rounded-[25px] flex items-center cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-40 relative"
                        >
                          <div className="absolute inset-0 rounded-[25px] pointer-events-none" style={pillShadowStyle} />
                          <span style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 1 }}>
                            {refreshing ? '刷新中...' : '刷新'}
                          </span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* 核心内容区：按状态渲染网格或管理面板 */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar relative px-[12px] pb-[8px]">
                    {isLocalMode ? (
                      <LocalPluginManager instanceSerial={selected!} instanceName={selectedName} />
                    ) : (
                      filtered.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px]">
                          <span className="text-black/20" style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                            {plugins.length === 0 ? '正在加载插件列表...' : '没有匹配的插件'}
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-[16px] pb-[8px]">
                          {filtered.map(p => (
                            <PluginCard
                              key={p.id} plugin={p} instanceSerial={selected!}
                              onClick={() => setDetailPlugin(p)}
                            />
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </GlassCard>
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                请选择一个实例
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 远程插件详情弹窗 */}
      <PluginDetailModal
        plugin={detailPlugin} instanceName={selectedName} instanceSerial={selected || ''}
        open={!!detailPlugin} onClose={() => setDetailPlugin(null)} onChanged={fetchPlugins}
      />
    </div>
  )
}
