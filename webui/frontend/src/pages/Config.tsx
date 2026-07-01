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
  qqAccount: string
  maiPath?: string
  mofoxPath?: string
  neoMofoxPath?: string
  adapterPath?: string
  napcatPath?: string
  mongodbPath?: string
  webuiPath?: string
  venvPath?: string
  source?: string
  isPublishedTemplate?: boolean
  publishedActive?: boolean
  deploymentFlowName?: string
  deploymentFlowSequence?: string
}

interface RegisterForm {
  name: string
  serial_number: string
  nickname_path: string
  bot_type: string
  version_path: string
  qq_account: string
  mai_path: string
  mofox_path: string
  neo_mofox_path: string
  adapter_path: string
  napcat_path: string
  venv_path: string
  mongodb_path: string
  webui_path: string
}

type BotType = 'MaiBot' | 'MoFox-Core' | 'Neo-MoFox'

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }
const labelFont = { fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }

const emptyForm: RegisterForm = {
  name: '', serial_number: '', nickname_path: '', bot_type: 'MaiBot',
  version_path: '', qq_account: '', mai_path: '', mofox_path: '', neo_mofox_path: '',
  adapter_path: '', napcat_path: '', venv_path: '', mongodb_path: '', webui_path: '',
}

type Action = 'edit' | 'open-config' | 'open-folder' | null

const BOT_TYPE_OPTIONS: BotType[] = ['MaiBot', 'MoFox-Core', 'Neo-MoFox']

function normalizeBotType(botType: string): BotType {
  if (botType === 'MoFox_bot' || botType === 'MoFox-Core') return 'MoFox-Core'
  if (botType === 'Neo-MoFox') return 'Neo-MoFox'
  return 'MaiBot'
}

function getMainPathKey(botType: string): 'mai_path' | 'mofox_path' | 'neo_mofox_path' {
  const normalized = normalizeBotType(botType)
  if (normalized === 'MoFox-Core') return 'mofox_path'
  if (normalized === 'Neo-MoFox') return 'neo_mofox_path'
  return 'mai_path'
}

function getMainPathValue(form: Pick<RegisterForm, 'mai_path' | 'mofox_path' | 'neo_mofox_path'>, botType: string): string {
  return form[getMainPathKey(botType)] || ''
}

function switchBotTypeWithMainPath<T extends Pick<RegisterForm, 'bot_type' | 'mai_path' | 'mofox_path' | 'neo_mofox_path'>>(form: T, nextBotType: string): T {
  const normalized = normalizeBotType(nextBotType)
  const currentMainPath = getMainPathValue(form, form.bot_type)
  const nextKey = getMainPathKey(normalized)
  return {
    ...form,
    bot_type: normalized,
    [nextKey]: form[nextKey] || currentMainPath,
  } as T
}

function PillButton({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-[54px] px-[24px] rounded-[27px] cursor-pointer transition-all duration-300 shrink-0"
      style={{
        background: selected ? 'var(--mc-choice-selected-bg)' : 'transparent',
        border: `2px solid ${selected ? 'var(--mc-choice-selected-border)' : 'var(--mc-border-strong)'}`,
      }}
    >
      <span style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 2 }}>{label}</span>
    </button>
  )
}

const SOURCE_BADGE: Record<string, { label: string; bg: string; border: string }> = {
  register: { label: '本地注册', bg: 'rgba(179,220,255,0.55)', border: 'rgba(80,160,240,0.6)' },
  deploy:   { label: '联网部署', bg: 'rgba(179,255,195,0.55)', border: 'rgba(60,190,100,0.6)' },
  import:   { label: '导入',     bg: 'rgba(255,230,150,0.55)', border: 'rgba(210,160,40,0.6)' },
  onekey:   { label: '一键部署', bg: 'rgba(220,179,255,0.55)', border: 'rgba(150,80,240,0.6)' },
}

function SourceBadge({ source }: { source?: string }) {
  const s = source || 'register'
  const badge = SOURCE_BADGE[s] ?? SOURCE_BADGE.register
  return (
    <span
      style={{
        fontSize: 18,
        fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
        background: badge.bg,
        border: `1.5px solid ${badge.border}`,
        borderRadius: 10,
        padding: '1px 10px',
        color: 'var(--mc-text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {badge.label}
    </span>
  )
}

function FlowStatusBadge({ instance }: { instance: Instance }) {
  if (!instance.isPublishedTemplate) return null
  const inactive = instance.publishedActive === false
  return (
    <span
      style={{
        fontSize: 18,
        fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
        background: inactive ? 'rgba(120,120,120,0.18)' : 'rgba(74,222,128,0.22)',
        border: `1.5px solid ${inactive ? 'rgba(120,120,120,0.45)' : 'rgba(34,197,94,0.6)'}`,
        borderRadius: 10,
        padding: '1px 10px',
        color: 'var(--mc-text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {inactive ? '已灰化' : '部署流'}
    </span>
  )
}

/* 实例选择用的小卡片 */
function InstanceCard({ instance, selected, onClick, index }: {
  instance: Instance; selected: boolean; onClick: () => void; index: number
}) {
  const title = `${instance.nickname}.${instance.botType}`
  const inactive = instance.isPublishedTemplate && instance.publishedActive === false
  return (
    <div className="animate-fade-slide-up inline-block" style={{ animationDelay: `${index * 60}ms` }}>
      <GlassCard
        radius={24}
        shadow={selected ? '6px 6px 8px rgba(0,0,0,0.45)' : '4px 4px 4px rgba(0,0,0,0.25)'}
        borderColor={selected ? 'var(--mc-choice-selected-border)' : 'var(--mc-border-muted)'}
        borderWidth={selected ? 3 : 2}
        bgOpacity={0.62}
        className="cursor-pointer transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
        onClick={onClick}
      >
        <div className="px-[24px] py-[18px]" style={{ opacity: inactive ? 0.48 : 1 }}>
          <div className="flex items-center gap-[8px] mb-[2px]">
            <div className="text-black truncate" style={{ fontSize: 32, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
              {title}
            </div>
            <SourceBadge source={instance.source} />
            <FlowStatusBadge instance={instance} />
          </div>
          <div className="mt-[4px] flex flex-col gap-[2px]">
            <span style={{ ...valueFont, color: 'var(--mc-text-secondary)' }}>序列号：{instance.serial}</span>
            <span style={{ ...valueFont, color: 'var(--mc-text-secondary)' }}>版本：{instance.version || '-'}</span>
            <span style={{ ...valueFont, color: 'var(--mc-text-secondary)' }}>QQ账号：{instance.qqAccount || '-'}</span>
            {inactive && <span style={{ ...valueFont, color: 'var(--mc-text-faint)' }}>部署流已取消发布，操作权限已收回</span>}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

/* 胶囊切换选择器 — 参考设计稿 SVG */
function TypeToggle({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sliderStyle, setSliderStyle] = useState<{ left: number; width: number }>({ left: 5, width: 89 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const idx = Math.max(0, options.indexOf(value))
    const btn = container.querySelectorAll('button')[idx] as HTMLElement | undefined
    if (btn) {
      setSliderStyle({ left: btn.offsetLeft, width: btn.offsetWidth })
    }
  }, [value, options])

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center h-[50px] rounded-[25px] p-[5px]"
      style={{ filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))' }}
    >
      <div className="absolute inset-0 rounded-[25px] pointer-events-none" style={{ border: '2px solid var(--mc-border-strong)' }} />
      <div
        className="absolute h-[40px] rounded-[20px] transition-all duration-300 ease-out"
        style={{
          width: sliderStyle.width,
          left: sliderStyle.left,
          top: 3,
          background: 'var(--mc-control-solid)',
          border: '1px solid var(--mc-border-strong)',
          filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))',
        }}
      />
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="relative z-10 h-[40px] px-[20px] cursor-pointer bg-transparent border-none transition-colors duration-200"
          style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", color: value === opt ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)' }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

/* 输入行组件：标签在左，输入框在右 */
function FieldRow({ label, value, onChange, disabled, wide, index, children, placeholder }: {
  label: string; value?: string; onChange?: (v: string) => void; disabled?: boolean; wide?: boolean; index: number; children?: React.ReactNode; placeholder?: string
}) {
  return (
    <div className="flex items-center gap-[20px] animate-fade-slide-up" style={{ animationDelay: `${index * 40}ms` }}>
      <span className="text-black shrink-0 w-[210px] text-right" style={labelFont}>{label}</span>
      {children || (
        <div style={{ filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))' }}>
          <input
            value={value ?? ''}
            onChange={e => onChange?.(e.target.value)}
            disabled={disabled}
            title={label}
            placeholder={placeholder || '-'}
            className="h-[40px] px-[20px] rounded-[20px] border-2 border-black/50 outline-none transition-colors bg-transparent disabled:text-black/50 placeholder:text-black/25"
            style={{
              ...valueFont,
              width: wide ? 595 : 221,
              color: disabled ? 'var(--mc-text-faint)' : 'var(--mc-text-secondary)',
              borderColor: 'var(--mc-border-strong)',
            }}
          />
        </div>
      )}
    </div>
  )
}

/* 实例注册信息编辑面板 — 按设计稿布局 */
function EditPanel({ instance, onSaved, onClose }: { instance: Instance; onSaved: () => void; onClose: () => void }) {
  const { notify } = useNotification()
  const buildForm = () => ({
    serial_number: instance.serial,
    nickname_path: instance.nickname,
    version_path: instance.version,
    bot_type: normalizeBotType(instance.botType),
    qq_account: instance.qqAccount,
    mai_path: instance.maiPath || '',
    mofox_path: instance.mofoxPath || '',
    neo_mofox_path: instance.neoMofoxPath || '',
    adapter_path: instance.adapterPath || '',
    napcat_path: instance.napcatPath || '',
    venv_path: instance.venvPath || '',
    mongodb_path: instance.mongodbPath || '',
    webui_path: instance.webuiPath || '',
  })
  const [form, setForm] = useState(buildForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setForm(buildForm()) }, [instance])

  const mainPath = getMainPathValue(form, form.bot_type)
  const setMainPath = (v: string) => {
    setForm(prev => ({ ...prev, [getMainPathKey(prev.bot_type)]: v }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/webui/instances/${instance.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.status === 'success') {
        notify('实例信息更新成功', 'success')
        onSaved()
      } else {
        notify(data.detail || '更新失败', 'error')
      }
    } catch {
      notify('请求失败，请检查服务器', 'error')
    }
    setSaving(false)
  }

  return (
    <GlassCard key={instance.serial}>
      <div className="p-[40px] flex flex-col h-full overflow-y-auto gap-[12px] relative">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-[20px] right-[20px] w-[40px] h-[40px] rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-black/10 active:scale-90 bg-transparent border-none"
          title="关闭编辑"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>
        <h2 className="text-black animate-fade-slide-up" style={{ fontSize: 50, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
          实例注册信息
        </h2>

        <div className="flex flex-col gap-[12px] mt-[8px]">
          {/* 短字段 */}
          <FieldRow label="实例序列号" value={form.serial_number} onChange={v => setForm(p => ({ ...p, serial_number: v }))} index={0} />
          <FieldRow label="实例绝对序列号" value={String(instance.absoluteSerial)} disabled index={1} />
          <FieldRow label="来源" value={SOURCE_BADGE[instance.source || 'register']?.label ?? instance.source} disabled index={2} />
          <FieldRow label="实例昵称" value={form.nickname_path} onChange={v => setForm(p => ({ ...p, nickname_path: v }))} index={3} />
          <FieldRow label="实例版本" value={form.version_path} onChange={v => setForm(p => ({ ...p, version_path: v }))} index={4} />
          <FieldRow label="实例类型" index={5}>
            <TypeToggle options={BOT_TYPE_OPTIONS} value={form.bot_type} onChange={v => setForm(p => switchBotTypeWithMainPath(p, v))} />
          </FieldRow>
          <FieldRow label="QQ账号" value={form.qq_account} onChange={v => setForm(p => ({ ...p, qq_account: v }))} index={6} />

          {/* 长路径字段 */}
          <FieldRow label="主程序路径" value={mainPath} onChange={setMainPath} wide index={7} placeholder="bot.py 所在根目录" />
          <FieldRow label="适配器目录" value={form.adapter_path} onChange={v => setForm(p => ({ ...p, adapter_path: v }))} wide index={8} placeholder="main.py 所在根目录" />
          <FieldRow label="NapCat路径" value={form.napcat_path} onChange={v => setForm(p => ({ ...p, napcat_path: v }))} wide index={9} placeholder="NapCatWinBootMain.exe 文件路径" />
          <FieldRow label="虚拟环境路径" value={form.venv_path} onChange={v => setForm(p => ({ ...p, venv_path: v }))} wide index={10} />
          <FieldRow label="WebUI路径" value={form.webui_path} onChange={v => setForm(p => ({ ...p, webui_path: v }))} wide index={11} placeholder='若您部署的实例自带WebUI，则无需填写此字段' />
        </div>

        <div className="mt-auto pt-[16px] flex justify-end animate-fade-slide-up" style={{ animationDelay: '400ms' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-[54px] px-[40px] rounded-[27px] cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ background: 'rgba(179,255,174,0.5)', border: '2px solid rgba(0,0,0,0.5)' }}
          >
            <span style={{ fontSize: 28, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
              {saving ? '保存中...' : '保存修改'}
            </span>
          </button>
        </div>
      </div>
    </GlassCard>
  )
}

function RegisterModal({ open, onClose, onCreated, nextSerial }: { open: boolean; onClose: () => void; onCreated: () => void; nextSerial: number | null }) {
  const { notify } = useNotification()
  const [form, setForm] = useState<RegisterForm>({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!form.name.trim()) { notify('配置集名称不能为空', 'warning'); return }
    if (!form.serial_number.trim()) { notify('实例序列号不能为空', 'warning'); return }
    if (!form.nickname_path.trim()) { notify('实例昵称不能为空', 'warning'); return }

    setSaving(true)
    try {
      const { name, ...config } = form
      const res = await fetch('/api/webui/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, config }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        notify(`实例 "${name}" 注册成功`, 'success')
        setForm({ ...emptyForm })
        onCreated()
        onClose()
      } else {
        notify(data.detail || '注册失败', 'error')
      }
    } catch {
      notify('请求失败，请检查服务器', 'error')
    }
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} width={920}>
      <div className="p-[40px] flex flex-col gap-[12px] max-h-[85vh] overflow-y-auto">
        <h3 className="text-black" style={{ fontSize: 50, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
          注册新实例
        </h3>

        <div className="flex flex-col gap-[12px] mt-[8px]">
          <FieldRow label="配置集名称" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} index={0} />
          <FieldRow label="实例序列号" value={form.serial_number} onChange={v => setForm(p => ({ ...p, serial_number: v }))} index={1} />
          <FieldRow label="实例绝对序列号" value={String(nextSerial ?? '-')} disabled index={2} />
          <FieldRow label="实例昵称" value={form.nickname_path} onChange={v => setForm(p => ({ ...p, nickname_path: v }))} index={3} />
          <FieldRow label="实例版本" value={form.version_path} onChange={v => setForm(p => ({ ...p, version_path: v }))} index={4} />
          <FieldRow label="实例类型" index={5}>
            <TypeToggle options={BOT_TYPE_OPTIONS} value={form.bot_type} onChange={v => setForm(p => switchBotTypeWithMainPath(p, v))} />
          </FieldRow>
          <FieldRow label="QQ账号" value={form.qq_account} onChange={v => setForm(p => ({ ...p, qq_account: v }))} index={6} />
          <FieldRow label="主程序路径" value={getMainPathValue(form, form.bot_type)} onChange={v => setForm(p => ({ ...p, [getMainPathKey(p.bot_type)]: v }))} wide index={7} placeholder="bot.py 所在根目录" />
          <FieldRow label="适配器目录" value={form.adapter_path} onChange={v => setForm(p => ({ ...p, adapter_path: v }))} wide index={8} placeholder="main.py 所在根目录" />
          <FieldRow label="NapCat路径" value={form.napcat_path} onChange={v => setForm(p => ({ ...p, napcat_path: v }))} wide index={9} placeholder="NapCatWinBootMain.exe 文件路径" />
          <FieldRow label="WebUI路径" value={form.webui_path} onChange={v => setForm(p => ({ ...p, webui_path: v }))} wide index={10} />
        </div>

        <div className="flex gap-[16px] justify-end mt-[16px]">
          <button
            onClick={onClose}
            className="h-[54px] px-[40px] rounded-[27px] cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: 'rgba(255,255,255,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}
          >
            <span style={{ fontSize: 28, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 2 }}>取消</span>
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="h-[54px] px-[40px] rounded-[27px] cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ background: 'rgba(179,255,174,0.5)', border: '2px solid rgba(0,0,0,0.5)' }}
          >
            <span style={{ fontSize: 28, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 2 }}>
              {saving ? '注册中...' : '确认注册'}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

const needsInstanceSelect = (a: Action) => a === 'edit' || a === 'open-config' || a === 'open-folder'

export default function Config({ initialAction }: { initialAction?: Action }) {
  const { notify } = useNotification()
  const [instances, setInstances] = useState<Instance[]>([])
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [action, setAction] = useState<Action>(initialAction || null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)

  const fetchInstances = () => {
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([name, cfg]: [string, any]) => ({
          name,
          serial: cfg.serial_number ?? '',
          nickname: cfg.nickname || cfg.serial_number || '',
          absoluteSerial: cfg.absolute_serial ?? 0,
          botType: normalizeBotType(cfg.bot_type || 'MaiBot'),
          version: cfg.version || '',
          qqAccount: cfg.qq_account || '',
          maiPath: cfg.mai_path,
          mofoxPath: cfg.mofox_path,
          neoMofoxPath: cfg.neo_mofox_path,
          adapterPath: cfg.adapter_path,
          napcatPath: cfg.napcat_path,
          mongodbPath: cfg.mongodb_path,
          webuiPath: cfg.webui_path,
          venvPath: cfg.venv_path,
          source: cfg.source || 'register',
          isPublishedTemplate: Boolean(cfg.is_published_template),
          publishedActive: cfg.published_active !== false,
          deploymentFlowName: cfg.deployment_flow_name || '',
          deploymentFlowSequence: cfg.deployment_flow_sequence || '',
        }))
        setInstances(list)
        if (d?.next_serial != null) setNextSerial(d.next_serial)
      })
      .catch(() => notify('获取实例列表失败', 'error'))
  }

  useEffect(() => { fetchInstances() }, [])

  const selectedInstance = instances.find(i => i.name === selected)

  const switchAction = (a: Action) => {
    if (action === a) { setAction(null); setSelected(null) }
    else { setAction(a); setSelected(null) }
  }

  const handleSelectInstance = async (inst: Instance) => {
    if (inst.isPublishedTemplate && inst.publishedActive === false) {
      notify('该实例所属部署流已取消发布，不能操作', 'error')
      return
    }
    setSelected(inst.name)
    if (action === 'open-config') {
      try {
        const res = await fetch(inst.isPublishedTemplate ? `/api/deployment-mod/instances/${encodeURIComponent(inst.serial)}/stage` : `/api/webui/instances/${inst.name}/open-config`, {
          method: 'POST',
          credentials: 'include',
          headers: inst.isPublishedTemplate ? { 'Content-Type': 'application/json' } : undefined,
          body: inst.isPublishedTemplate ? JSON.stringify({ stage: 'config', user_inputs: {} }) : undefined,
        })
        const data = await res.json()
        if (data.task_id) notify('已提交配置打开任务', 'success')
        else if (data.use_template_stage) notify('该实例需要通过部署流配置阶段打开', 'warning')
        else if (data.success) notify('已打开配置文件', 'success')
        else notify(data.detail || '打开失败', 'error')
      } catch { notify('请求失败', 'error') }
    } else if (action === 'open-folder') {
      try {
        const res = await fetch(`/api/webui/instances/${inst.name}/open-folder`, { method: 'POST', credentials: 'include' })
        const data = await res.json()
        if (data.success) notify('已打开实例目录', 'success')
        else notify(data.detail || '打开失败', 'error')
      } catch { notify('请求失败', 'error') }
    }
  }

  const showCards = needsInstanceSelect(action)
  // 选中实例后，编辑模式下替换卡片为编辑面板
  const showEditPanel = action === 'edit' && selectedInstance

  return (
    <div className="flex flex-col p-6 h-full overflow-hidden">
      <h1 className="text-black shrink-0 mb-[16px] animate-card-enter" style={pageTitleStyle}>配置管理</h1>

      <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
        {/* 左侧：功能按钮 */}
        <div className="h-full min-h-0 shrink-0 animate-card-enter">
          <GlassCard>
            <div className="p-[24px] flex flex-col gap-[10px]">
              <h2 className="text-black pb-[8px]" style={sectionTitle}>操作</h2>
              <PillButton label="编辑实例注册信息" selected={action === 'edit'} onClick={() => switchAction('edit')} />
              <PillButton label="打开实例配置文件" selected={action === 'open-config'} onClick={() => switchAction('open-config')} />
              <PillButton label="打开实例所在目录" selected={action === 'open-folder'} onClick={() => switchAction('open-folder')} />
              <PillButton label="注册新实例" onClick={() => setShowRegister(true)} />
            </div>
          </GlassCard>
        </div>

        {/* 右侧 */}
        <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col gap-6 overflow-y-auto px-[12px]">
          {/* 编辑面板：选中实例后替换卡片 */}
          {showEditPanel ? (
            <div className="flex-1 min-h-0 animate-card-enter">
              <EditPanel instance={selectedInstance} onSaved={fetchInstances} onClose={() => setSelected(null)} />
            </div>
          ) : showCards ? (
            /* 实例卡片选择区 */
            <div className="shrink-0">
              <h2 className="text-black mb-[12px] animate-fade-slide-up" style={sectionTitle}>选择实例</h2>
              <div className="flex flex-wrap gap-[16px] p-[8px]">
                {instances.length === 0 ? (
                  <span className="text-black/20 animate-fade-slide-up" style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                    暂无注册实例
                  </span>
                ) : (
                  instances.map((inst, i) => (
                    <InstanceCard
                      key={inst.name}
                      instance={inst}
                      selected={inst.name === selected}
                      onClick={() => handleSelectInstance(inst)}
                      index={i}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            /* 无操作提示 */
            <div className="flex items-center justify-center h-full">
              <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                请选择一个操作
              </span>
            </div>
          )}
        </div>
      </div>

      <RegisterModal open={showRegister} onClose={() => setShowRegister(false)} onCreated={fetchInstances} nextSerial={nextSerial} />
    </div>
  )
}
