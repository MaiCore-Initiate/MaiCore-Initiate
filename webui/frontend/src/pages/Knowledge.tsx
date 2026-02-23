import { useState, useEffect, useRef, useCallback } from 'react'
import GlassCard from '../components/ui/GlassCard'
import Modal from '../components/ui/Modal'
import { useNotification } from '../components/ui/Notification'

interface Instance {
  serial: string
  nickname: string
  absoluteSerial: number
  botType: string
  version: string
}

interface KnowledgeInfo {
  version: string
  is_v0100: boolean
  is_v080: boolean
  raw_data: { files: { name: string; size_kb: number }[] }
  openie: { files: { name: string; size_kb: number }[] }
}

/** 上传队列中的文件条目 */
interface FileEntry {
  file: File
  name: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number // 0~1，仅用于上传中的视觉效果
}

const monoFont = { fontFamily: "'Ubuntu', monospace" }
const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont, color: '#707070' }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const btnFont = { fontSize: 30, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", position: 'relative' as const, top: 2 }
const fileFont = { fontSize: 30, fontFamily: "'JetBrainsMono', '问藏书房', monospace", position: 'relative' as const, top: 2 }

/* 边框阴影容器：绝对定位的边框层带阴影，不影响子元素 */
const pillShadow = "absolute inset-0 rounded-[27px] pointer-events-none"
const pillShadowStyle = { border: '2px solid rgba(0,0,0,0.5)', boxShadow: '2px 3px 6px rgba(0,0,0,0.15)' }

/* 设置弹窗样式 */
const settingLabel = { fontSize: 25, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }
const settingDesc = { fontSize: 20, fontFamily: "'Yu Gothic UI', sans-serif", opacity: 0.5 }
const settingInput = { fontSize: 25, fontFamily: "'CascadiaCode', 'Cascadia Code', monospace" }

interface LpmmSettings {
  enable: boolean
  lpmm_mode: string
  rag_synonym_search_top_k: number
  rag_synonym_threshold: number
  info_extraction_workers: number
  qa_relation_search_top_k: number
  qa_relation_threshold: number
  qa_paragraph_search_top_k: number
  qa_paragraph_node_weight: number
  qa_ent_filter_top_k: number
  qa_ppr_damping: number
  qa_res_top_k: number
  embedding_dimension: number
  max_embedding_workers: number
  embedding_chunk_size: number
  max_synonym_entities: number
  enable_ppr: boolean
}

/* ─── 开关组件 ─── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className="w-[74px] h-[40px] rounded-[20px] relative cursor-pointer transition-colors duration-200 shrink-0"
      style={{
        background: value ? 'rgba(0,144,255,0.41)' : 'rgba(0,0,0,0.41)',
        border: '1px solid rgba(0,0,0,0.5)',
      }}
      onClick={() => onChange(!value)}
    >
      <div
        className="w-[32px] h-[32px] rounded-full bg-white absolute top-[3px] transition-all duration-200"
        style={{ left: value ? 38 : 4 }}
      />
    </button>
  )
}

/* ─── 输入框组件 ─── */
function SettingInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative shrink-0" style={{ width: 221 }}>
      <div className="absolute inset-0 rounded-[20px] pointer-events-none" style={{ border: '2px solid rgba(0,0,0,0.5)', boxShadow: '3px 3px 4.5px rgba(0,0,0,0.16)' }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-[40px] px-[20px] rounded-[20px] bg-transparent outline-none text-black"
        style={settingInput}
      />
    </div>
  )
}

/* ─── 模式选择器 ─── */
function ModeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isAgent = value === 'agent'
  return (
    <div className="relative shrink-0 flex items-center" style={{ width: 221, height: 50 }}>
      <div className="absolute inset-0 rounded-[25px] pointer-events-none" style={{ border: '2px solid rgba(0,0,0,0.5)', boxShadow: '3px 3px 4.5px rgba(0,0,0,0.16)' }} />
      {/* 滑块 */}
      <div
        className="absolute top-[5px] rounded-[20px] bg-white transition-all duration-300 ease-in-out"
        style={{
          height: 40,
          width: isAgent ? 95 : 118,
          left: isAgent ? 4 : 99,
          border: '1px solid rgba(0,0,0,0.5)', boxShadow: '3px 3px 4.5px rgba(0,0,0,0.16)',
        }}
      />
      <button
        className="h-full flex items-center justify-center cursor-pointer relative z-10"
        style={{ width: 103, fontSize: 20, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}
        onClick={() => onChange('agent')}
        title="agent"
      >
        agent
      </button>
      <button
        className="h-full flex items-center justify-center cursor-pointer relative z-10"
        style={{ width: 118, fontSize: 20, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}
        onClick={() => onChange('classic')}
        title="classical"
      >
        classical
      </button>
    </div>
  )
}

/* ─── 设置项行 ─── */
function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[16px]">
      <div className="min-w-0">
        {desc && <p className="text-black m-0 leading-tight" style={settingDesc}>{desc}</p>}
        <p className="text-black m-0" style={settingLabel}>{label}</p>
      </div>
      {children}
    </div>
  )
}

/* ─── 知识库设置弹窗 ─── */
function KnowledgeSettingsModal({ serial, open, onClose }: { serial: string; open: boolean; onClose: () => void }) {
  const { notify } = useNotification()
  const [settings, setSettings] = useState<LpmmSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch(`/api/knowledge/${serial}/settings`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setSettings(d.settings) })
      .catch(() => notify('读取设置失败', 'error'))
  }, [serial, open])

  const update = <K extends keyof LpmmSettings>(key: K, val: LpmmSettings[K]) =>
    setSettings(prev => prev ? { ...prev, [key]: val } : prev)

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch(`/api/knowledge/${serial}/settings`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      const d = await res.json()
      if (d.success) { notify('设置已保存', 'success'); onClose() }
      else notify(d.detail || '保存失败', 'error')
    } catch { notify('保存请求失败', 'error') }
    setSaving(false)
  }

  if (!settings) return <Modal open={open} onClose={onClose} width={1083}><div className="p-[40px] text-center text-black/30" style={settingLabel}>加载中...</div></Modal>

  const numField = (key: keyof LpmmSettings) => (
    <SettingInput
      value={String(settings[key])}
      onChange={v => {
        const n = Number(v)
        if (!isNaN(n)) update(key, n as any)
      }}
    />
  )

  return (
    <Modal open={open} onClose={onClose} width={1083}>
      <div className="p-[40px] max-h-[85vh] overflow-y-auto custom-scrollbar">
        <h2 className="text-black mb-[20px]" style={{ fontSize: 50, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}>知识库设置</h2>

        <div className="flex gap-[60px]">
          {/* 左列 */}
          <div className="flex-1 flex flex-col gap-[16px]">
            <SettingRow label="启用知识库">
              <Toggle value={settings.enable} onChange={v => update('enable', v)} />
            </SettingRow>

            <SettingRow label="知识库模式" desc="classic传统模式/agent模式结合新记忆使用">
              <ModeSelector value={settings.lpmm_mode === 'classic' ? 'classical' : settings.lpmm_mode} onChange={v => update('lpmm_mode', v)} />
            </SettingRow>

            <SettingRow label="同义检索TopK">
              {numField('rag_synonym_search_top_k')}
            </SettingRow>

            <SettingRow label="同义阈值" desc="相似度高于该值的关系会被当作同义词">
              {numField('rag_synonym_threshold')}
            </SettingRow>

            <SettingRow label="实体抽取并行线程数" desc="实体抽取同时执行线程数，非Pro模型不要设置超过5">
              {numField('info_extraction_workers')}
            </SettingRow>

            <SettingRow label="关系检索TopK">
              {numField('qa_relation_search_top_k')}
            </SettingRow>

            <SettingRow label="关系阈值" desc="相似度高于该值的关系会被认为是相关关系">
              {numField('qa_relation_threshold')}
            </SettingRow>

            <SettingRow label="段落搜索TopK" desc="不能过小，可能影响搜索结果">
              {numField('qa_paragraph_search_top_k')}
            </SettingRow>

            <SettingRow label="段落节点权重" desc="在图搜索&PPR计算中的权重，当搜索仅使用DPR时，此参数不起作用">
              {numField('qa_paragraph_node_weight')}
            </SettingRow>
          </div>

          {/* 右列 */}
          <div className="flex-1 flex flex-col gap-[16px]">
            <SettingRow label="实体过滤TopK">
              {numField('qa_ent_filter_top_k')}
            </SettingRow>

            <SettingRow label="PPR阻尼系数">
              {numField('qa_ppr_damping')}
            </SettingRow>

            <SettingRow label="最终提供段落TopK">
              {numField('qa_res_top_k')}
            </SettingRow>

            <SettingRow label="嵌入向量维度">
              {numField('embedding_dimension')}
            </SettingRow>

            <SettingRow label="嵌入/抽取并发数">
              {numField('max_embedding_workers')}
            </SettingRow>

            <SettingRow label="每批嵌入的条数">
              {numField('embedding_chunk_size')}
            </SettingRow>

            <SettingRow label="同义边参限" desc="同义边参与的实体数上限，超限则跳过">
              {numField('max_synonym_entities')}
            </SettingRow>

            <SettingRow label="启用PPR">
              <Toggle value={settings.enable_ppr} onChange={v => update('enable_ppr', v)} />
            </SettingRow>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end mt-[24px]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-[54px] px-[36px] rounded-[27px] flex items-center gap-[12px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-40 relative"
          >
            <div className={pillShadow} style={pillShadowStyle} />
            <span style={btnFont}>{saving ? '保存中...' : '保存设置'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── 操作面板 ─── */
function KnowledgePanel({ instance }: { instance: Instance }) {
  const { notify } = useNotification()
  const [info, setInfo] = useState<KnowledgeInfo | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileQueue, setFileQueue] = useState<FileEntry[]>([])
  const [building, setBuilding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)

  const fetchInfo = useCallback(() => {
    fetch(`/api/knowledge/${instance.serial}/info`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success) setInfo(d) }).catch(() => {})
  }, [instance.serial])

  useEffect(() => { setInfo(null); setFileQueue([]); fetchInfo() }, [fetchInfo])

  /* 逐个上传文件队列 */
  const uploadQueue = async (entries: FileEntry[]) => {
    if (uploadingRef.current) return
    uploadingRef.current = true
    for (let idx = 0; idx < entries.length; idx++) {
      setFileQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'uploading', progress: 0.3 } : e))

      const entry = entries[idx]
      const isTxt = entry.name.toLowerCase().endsWith('.txt')
      const endpoint = isTxt
        ? `/api/knowledge/${instance.serial}/upload/txt`
        : `/api/knowledge/${instance.serial}/upload/openie`

      const fd = new FormData()
      fd.append('files', entry.file)
      fd.append('clear_existing', 'false')

      try {
        setFileQueue(prev => prev.map((e, i) => i === idx ? { ...e, progress: 0.6 } : e))
        const res = await fetch(endpoint, { method: 'POST', credentials: 'include', body: fd })
        const d = await res.json()
        if (d.success) {
          setFileQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'done', progress: 1 } : e))
        } else {
          setFileQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'error', progress: 0 } : e))
        }
      } catch {
        setFileQueue(prev => prev.map((e, i) => i === idx ? { ...e, status: 'error', progress: 0 } : e))
      }
    }
    fetchInfo()
    uploadingRef.current = false
  }

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => {
      const n = f.name.toLowerCase()
      return n.endsWith('.txt') || n.endsWith('.json')
    })
    if (arr.length === 0) { notify('仅支持 .txt 和 .json 文件', 'error'); return }

    const entries: FileEntry[] = arr.map(f => ({ file: f, name: f.name, status: 'pending' as const, progress: 0 }))
    setFileQueue(prev => [...prev, ...entries])
    uploadQueue(entries)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  /* 开始构建（运行 pipeline） */
  const handleBuild = async () => {
    setBuilding(true)
    try {
      const res = await fetch(`/api/knowledge/${instance.serial}/run/pipeline`, {
        method: 'POST', credentials: 'include',
      })
      const d = await res.json()
      if (d.success) notify('知识库构建已启动', 'success')
      else { notify(d.detail || '构建启动失败', 'error'); setBuilding(false) }
    } catch { notify('构建请求失败', 'error'); setBuilding(false) }
  }

  /* 终止构建 */
  const handleStop = async () => {
    try {
      const res = await fetch(`/api/knowledge/${instance.serial}/stop`, {
        method: 'POST', credentials: 'include',
      })
      const d = await res.json()
      if (d.success) { notify(d.message, 'success'); setBuilding(false) }
      else notify(d.detail || '终止失败', 'error')
    } catch { notify('终止请求失败', 'error') }
  }

  const leftData: [string, string][] = [
    ['实例类型', instance.botType],
    ['实例昵称', instance.nickname],
    ['实例序列号', instance.serial],
    ['实例绝对序列号', String(instance.absoluteSerial)],
  ]
  const rightData: [string, string][] = [
    ['LPMM状态', info?.is_v080 ? 'true' : 'false'],
    ['LPMM模式', info?.is_v0100 ? 'agent' : info?.is_v080 ? 'legacy' : '-'],
    ['PPR状态', info?.is_v0100 ? 'true' : 'false'],
    ['当前版本', instance.version || '-'],
  ]

  /* 合并已有文件 + 队列文件 */
  const existingFiles = [
    ...(info?.raw_data?.files ?? []).map(f => f.name),
    ...(info?.openie?.files ?? []).map(f => f.name),
  ]
  // 队列中已完成的文件名（去重用）
  const queueNames = new Set(fileQueue.map(e => e.name))
  const serverOnly = existingFiles.filter(n => !queueNames.has(n))

  const d = (i: number) => ({ animationDelay: `${i * 60}ms` })

  return (
    <GlassCard key={instance.serial}>
      <div className="p-[28px] flex flex-col h-full">
        {/* 实例概览 */}
        <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...d(0) }}>实例概览</h2>
        <div className="flex gap-0 mt-[8px] animate-fade-slide-up" style={d(1)}>
          <div className="space-y-[2px]">
            {leftData.map(([label, val], i) => (
              <div key={label} className="flex items-baseline gap-[16px] animate-fade-slide-up" style={d(2 + i)}>
                <span className="text-black shrink-0" style={labelFont}>{label}</span>
                <span style={valueFont}>{val}</span>
              </div>
            ))}
          </div>
          <div className="w-[3px] self-stretch bg-black/50 rounded-full shrink-0 mx-[100px]" />
          <div className="space-y-[2px]">
            {rightData.map(([label, val], i) => (
              <div key={label} className="flex items-baseline gap-[16px] animate-fade-slide-up" style={d(2 + i)}>
                <span className="text-black shrink-0" style={labelFont}>{label}</span>
                <span style={valueFont}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 上传知识库 */}
        <h2 className="text-black mt-[24px] animate-fade-slide-up" style={{ ...sectionTitle, ...d(6) }}>上传知识库</h2>

        {/* 拖拽上传区 */}
        <div
          className="animate-fade-slide-up mt-[10px] min-h-[155px] rounded-[30px] flex flex-col items-center justify-center cursor-pointer transition-all duration-200"
          style={{
            border: `3px dashed ${dragging ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)'}`,
            background: dragging ? 'rgba(0,0,0,0.04)' : 'transparent',
            ...d(7),
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {/* 上传图标 */}
          <svg width="118" height="72" viewBox="0 0 118 72" fill="none" className="mb-[12px]">
            <rect x="2.5" y="2.5" width="113" height="67" rx="17.5" stroke="rgba(0,0,0,0.2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="210 190" fill="none" />
            <path d="M59 15 L39 42 M59 15 L78 42" stroke="rgba(0,0,0,0.2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="text-black/20" style={{ fontSize: 25, fontFamily: "'问藏书房','Yu Gothic UI', sans-serif" }}>
            点击或拖拽上传{'  '}
            <span style={{ ...monoFont, fontStyle: 'italic' }}>|  *.txt</span>
            、
            <span style={{ ...monoFont, fontStyle: 'italic' }}>*.json</span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.json"
            className="hidden"
            title="上传知识库文件"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {/* 下半部分：文件列表（左） + 操作（右） */}
        <div className="flex mt-[16px] flex-1 min-h-0 gap-0">
          {/* 文件列表 */}
          <div className="flex-1 min-w-0 flex flex-col">
            <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...d(8) }}>文件列表</h2>
            <div className="flex-1 overflow-y-auto mt-[6px] flex flex-wrap gap-[8px] content-start">
              {/* 服务器已有文件（不在队列中的） */}
              {serverOnly.map((name, i) => (
                <div
                  key={`s-${name}`}
                  className="h-[54px] pl-[12px] pr-[24px] rounded-[27px] flex items-center gap-[8px] shrink-0 animate-fade-slide-up relative"
                  style={d(9 + i)}
                >
                  <div className={pillShadow} style={pillShadowStyle} />
                  <button
                    title="移除文件"
                    className="w-[28px] h-[28px] rounded-full flex items-center justify-center cursor-pointer hover:bg-black/10 transition-colors shrink-0"
                    onClick={async () => {
                      const isTxt = name.toLowerCase().endsWith('.txt')
                      const folder = isTxt ? 'raw_data' : 'openie'
                      try {
                        const res = await fetch(`/api/knowledge/${instance.serial}/delete_file`, {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ folder, filename: name }),
                        })
                        const d = await res.json()
                        if (d.success) { notify(`已删除 ${name}`, 'success'); fetchInfo() }
                        else notify(d.detail || '删除失败', 'error')
                      } catch { notify('删除请求失败', 'error') }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <line x1="2" y1="2" x2="12" y2="12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="12" y1="2" x2="2" y2="12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <span style={fileFont}>{name}</span>
                </div>
              ))}
              {/* 上传队列文件 */}
              {fileQueue.map((entry, i) => (
                <div
                  key={`q-${i}-${entry.name}`}
                  className="h-[54px] pl-[12px] pr-[24px] rounded-[27px] flex items-center gap-[8px] shrink-0 relative overflow-hidden animate-fade-slide-up"
                  style={{
                    opacity: entry.status === 'pending' ? 0.4 : 1,
                    ...d(9 + serverOnly.length + i),
                  }}
                >
                  <div className={pillShadow} style={pillShadowStyle} />
                  <button
                    title="移除文件"
                    className="w-[28px] h-[28px] rounded-full flex items-center justify-center cursor-pointer hover:bg-black/10 transition-colors shrink-0"
                    onClick={() => setFileQueue(prev => prev.filter((_, j) => j !== i))}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <line x1="2" y1="2" x2="12" y2="12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="12" y1="2" x2="2" y2="12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <span style={fileFont}>{entry.name}</span>
                  {/* 上传进度条 */}
                  {entry.status === 'uploading' && (
                    <div
                      className="absolute bottom-[4px] left-[24px] h-[4px] rounded-full"
                      style={{
                        width: `${entry.progress * 100}%`,
                        background: '#36b5ff',
                        opacity: 0.8,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 操作区 */}
          <div className="shrink-0 flex flex-col items-start ml-[30px]">
            <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...d(8) }}>操作</h2>
            <div className="flex flex-col gap-[12px] mt-[6px]">
              {/* 开始构建 / 终止构建 */}
              <button
                onClick={building ? handleStop : handleBuild}
                className="h-[54px] pl-[10px] pr-[24px] rounded-[27px] flex items-center gap-[12px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 animate-fade-slide-up relative"
                style={d(9)}
              >
                <div className={pillShadow} style={pillShadowStyle} />
                {building ? (
                  /* 终止图标：圆圈+叉号 */
                  <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
                    <g fill="none">
                      <path d="M14,0A14,14,0,1,1,0,14,14,14,0,0,1,14,0Z" stroke="none"/>
                      <path d="M 14 3 C 11.06179046630859 3 8.299449920654297 4.144199371337891 6.221820831298828 6.221820831298828 C 4.144199371337891 8.299449920654297 3 11.06179046630859 3 14 C 3 16.93819999694824 4.144199371337891 19.7005500793457 6.221820831298828 21.77816963195801 C 8.299449920654297 23.85580062866211 11.06179046630859 25 14 25 C 16.93819999694824 25 19.70053863525391 23.85580062866211 21.77816963195801 21.77816963195801 C 23.85580062866211 19.70053863525391 25 16.93819999694824 25 14 C 25 11.06179046630859 23.85580062866211 8.299449920654297 21.77816963195801 6.221820831298828 C 19.7005500793457 4.144199371337891 16.93819999694824 3 14 3 M 14 0 C 21.73197937011719 0 28 6.268009185791016 28 14 C 28 21.73197937011719 21.73197937011719 28 14 28 C 6.268009185791016 28 0 21.73197937011719 0 14 C 0 6.268009185791016 6.268009185791016 0 14 0 Z" stroke="none" fill="black"/>
                    </g>
                    <g transform="translate(14 -5.799) rotate(45)">
                      <path d="M0,12.9V0" transform="translate(14 7.548)" fill="none" stroke="black" strokeLinecap="round" strokeWidth="3"/>
                      <path d="M0,12.9V0" transform="translate(20.452 14) rotate(90)" fill="none" stroke="black" strokeLinecap="round" strokeWidth="3"/>
                    </g>
                  </svg>
                ) : (
                  /* 开始图标：圆弧+箭头 */
                  <svg width="34" height="34" viewBox="0 0 43.841 43.841" fill="none">
                    <g transform="translate(5.702 5.702)">
                      <path d="M14,0A14,14,0,1,1,0,14,14,14,0,0,1,14,0Z" transform="translate(16.218 36.017) rotate(-135)" fill="none" stroke="black" strokeLinecap="round" strokeWidth="3" strokeDasharray="40 30"/>
                      <g transform="translate(12.611 32.437) rotate(-90)">
                        <line y2="22" transform="translate(16.218 1.406)" fill="none" stroke="black" strokeLinecap="round" strokeWidth="3"/>
                        <line x2="7.5" y2="7.688" transform="translate(8.718 15.718)" fill="none" stroke="black" strokeLinecap="round" strokeWidth="3"/>
                        <line x1="7.5" y2="7.688" transform="translate(16.218 15.718)" fill="none" stroke="black" strokeLinecap="round" strokeWidth="3"/>
                      </g>
                    </g>
                  </svg>
                )}
                <span style={btnFont}>{building ? '终止构建' : '开始构建'}</span>
              </button>
              {/* 知识库设置 */}
              <button
                className="h-[54px] pl-[10px] pr-[24px] rounded-[27px] flex items-center gap-[12px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 animate-fade-slide-up relative"
                style={d(10)}
                onClick={() => setSettingsOpen(true)}
              >
                <div className={pillShadow} style={pillShadowStyle} />
                {/* 齿轮图标 */}
                <svg width="30" height="30" viewBox="0 0 30.995 30.996" fill="none" className="shrink-0">
                  <g transform="translate(-25.342 -51.187)">
                    <circle cx="4.25" cy="4.25" r="4.25" transform="translate(36.593 62.437)" fill="none" stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3"/>
                    <path d="M24.418,18.818a2.1,2.1,0,0,0,.42,2.316l.076.076a2.547,2.547,0,1,1-3.6,3.6l-.076-.076a2.117,2.117,0,0,0-3.589,1.5v.216a2.545,2.545,0,1,1-5.091,0v-.11a2.1,2.1,0,0,0-1.375-1.922,2.1,2.1,0,0,0-2.316.42l-.076.076a2.547,2.547,0,1,1-3.6-3.6l.076-.076a2.117,2.117,0,0,0-1.5-3.589H3.545a2.545,2.545,0,0,1,0-5.091H3.66a2.1,2.1,0,0,0,1.922-1.375,2.1,2.1,0,0,0-.42-2.316l-.076-.076a2.547,2.547,0,1,1,3.6-3.6l.076.076a2.1,2.1,0,0,0,2.316.42h.1a2.1,2.1,0,0,0,1.273-1.922v-.22a2.545,2.545,0,1,1,5.091,0V3.66a2.117,2.117,0,0,0,3.589,1.5l.076-.076a2.547,2.547,0,1,1,3.6,3.6l-.076.076a2.1,2.1,0,0,0-.42,2.316v.1a2.1,2.1,0,0,0,1.922,1.273h.216a2.546,2.546,0,0,1,0,5.091H26.34a2.1,2.1,0,0,0-1.922,1.278Z" transform="translate(25.843 51.687)" fill="none" stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3"/>
                  </g>
                </svg>
                <span style={btnFont}>知识库设置</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <KnowledgeSettingsModal serial={instance.serial} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </GlassCard>
  )
}

/* ─── 主页面 ─── */
export default function Knowledge() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([, cfg]: [string, any]) => ({
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

  const filtered = instances.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return i.nickname.toLowerCase().includes(s) || i.serial.toLowerCase().includes(s)
  })

  const selectedInstance = instances.find(i => i.serial === selected)

  return (
    <div className="flex flex-col p-6 h-full">
      <h1 className="text-black shrink-0 mb-[16px] animate-card-enter" style={pageTitleStyle}>知识库构建</h1>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* 左侧：实例选择卡片 */}
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
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search instance"
                  className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20"
                  style={{ ...monoFont, fontSize: 25 }}
                />
              </div>

              <div className="flex-1 overflow-y-auto mt-[12px] px-[4px]">
                {filtered.length === 0 ? (
                  <div className="flex items-center justify-center h-[120px] rounded-[20px] border-3 border-dashed border-[#9e9e9e]">
                    <span className="text-[#9e9e9e] font-semibold text-base" style={monoFont}>no instance</span>
                  </div>
                ) : (
                  filtered.map((inst, i) => {
                    const isSelected = inst.serial === selected
                    const label = `${inst.nickname}|${inst.serial}|${inst.absoluteSerial}`
                    return (
                      <div key={inst.serial}>
                        {isSelected && i > 0 && <div className="h-[6px]" />}
                        <button
                          className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden"
                          onClick={() => setSelected(inst.serial)}
                          style={{
                            height: 54,
                            padding: isSelected ? '0 20px' : '0 4px',
                            borderRadius: isSelected ? 27 : 6,
                            background: isSelected ? 'rgba(255,255,255,0.6)' : 'transparent',
                            border: isSelected ? '2px solid rgba(0,0,0,0.5)' : '2px solid transparent',
                          }}
                        >
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                          <span className="truncate shrink-0" style={{ ...monoFont, fontSize: 30 }}>{label}</span>
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                        </button>
                        {isSelected && i < filtered.length - 1 && <div className="h-[6px]" />}
                        {!isSelected && i < filtered.length - 1 && <hr className="border-[#707070]" />}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* 右侧：操作面板 */}
        <div className="flex-1 min-w-0 animate-card-enter" style={{ animationDelay: '80ms' }}>
          {selectedInstance ? (
            selectedInstance.botType === 'MoFox_bot' ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
                  MoFox_bot 暂不支持 LPMM 知识库功能
                </span>
              </div>
            ) : (
              <KnowledgePanel instance={selectedInstance} />
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
                请选择一个实例
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
