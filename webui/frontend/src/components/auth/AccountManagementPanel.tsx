import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  ACTION_PERMISSION_LABELS,
  ACTION_PERMISSION_ORDER,
  DEFAULT_EMAIL_WHITELIST,
  getAvatarFallback,
  PAGE_PERMISSION_LABELS,
  PAGE_PERMISSION_ORDER,
  ROLE_LABELS,
  useAccountSystem,
} from '../../lib/account-system'
import { useNotification } from '../ui/Notification'

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('头像读取失败'))
    reader.readAsDataURL(file)
  })
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        width: 62,
        height: 34,
        borderRadius: 17,
        border: '2px solid rgba(0,0,0,0.25)',
        background: checked ? 'rgba(74,249,51,0.9)' : 'rgba(180,180,180,0.5)',
        position: 'relative',
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: checked ? 32 : 2,
          transition: 'left 0.2s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
        }}
      />
    </button>
  )
}

function Avatar({
  name,
  email,
  avatar,
  size = 64,
}: {
  name: string
  email: string
  avatar?: string
  size?: number
}) {
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        border: '2px solid rgba(0,0,0,0.2)',
        background: 'rgba(255,255,255,0.4)',
      }}
    >
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.32, fontFamily: "'Ubuntu', 'HarmonyOS Sans SC', monospace", color: 'rgba(0,0,0,0.62)' }}>
          {getAvatarFallback(name, email)}
        </span>
      )}
    </div>
  )
}

const titleFont = { fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const monoFont = { fontFamily: "'Ubuntu', 'HarmonyOS Sans SC', monospace" }

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-black/80" style={{ ...titleFont, fontSize: 30 }}>
      {children}
    </div>
  )
}

export default function AccountManagementPanel() {
  const {
    currentUser,
    currentAdmin,
    users,
    pendingRequests,
    registerPolicy,
    appearancePolicy,
    roleTemplates,
    can,
    sendSensitiveCode,
    updateProfile,
    changePassword,
    requestMemberUpgrade,
    approveRequest,
    rejectRequest,
    setUserRole,
    setRolePagePermission,
    setRoleActionPermission,
    updateRegisterPolicy,
    updateAppearancePolicy,
    transferAdmin,
    auditTrail,
    adminToken,
  } = useAccountSystem()
  const { notify } = useNotification()

  const [profileName, setProfileName] = useState(currentUser?.name ?? '')
  const [profileAvatar, setProfileAvatar] = useState(currentUser?.avatar ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [passwordCode, setPasswordCode] = useState('')
  const [passwordHint, setPasswordHint] = useState('')
  const [upgradeReason, setUpgradeReason] = useState('')
  const [whitelistDraft, setWhitelistDraft] = useState(registerPolicy.allowedDomains.join('\n'))
  const [transferTarget, setTransferTarget] = useState('')
  const [transferToken, setTransferToken] = useState('')
  const [transferCode, setTransferCode] = useState('')
  const [transferHint, setTransferHint] = useState('')

  useEffect(() => {
    setProfileName(currentUser?.name ?? '')
    setProfileAvatar(currentUser?.avatar ?? '')
  }, [currentUser])

  useEffect(() => {
    setWhitelistDraft(registerPolicy.allowedDomains.join('\n'))
  }, [registerPolicy.allowedDomains])

  const members = useMemo(() => {
    return users.filter(user => user.status === 'active' && user.role === 'member')
  }, [users])

  const pushResult = (result: { success: boolean; message: string }) => {
    notify(result.message, result.success ? 'success' : 'warning')
  }

  if (!currentUser) {
    return null
  }

  const onProfileAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setProfileAvatar(dataUrl)
    } catch {
      notify('头像读取失败。', 'error')
    }
  }

  const handleProfileSave = () => {
    const result = updateProfile({ name: profileName, avatar: profileAvatar })
    notify(result.message, result.success ? 'success' : 'warning')
  }

  const handleSendPasswordCode = () => {
    const result = sendSensitiveCode('password')
    if (!result.success) {
      notify(result.message, 'warning')
      return
    }
    const hint = `安全验证码：${result.code}`
    setPasswordHint(hint)
    notify(hint, 'success')
  }

  const handleChangePassword = () => {
    const result = changePassword({
      currentPassword,
      nextPassword,
      code: passwordCode,
    })
    notify(result.message, result.success ? 'success' : 'warning')
    if (result.success) {
      setCurrentPassword('')
      setNextPassword('')
      setPasswordCode('')
    }
  }

  const handleUpgradeApply = () => {
    const result = requestMemberUpgrade(upgradeReason)
    notify(result.message, result.success ? 'success' : 'warning')
    if (result.success) setUpgradeReason('')
  }

  const handleSaveWhitelist = () => {
    const result = updateRegisterPolicy({
      allowedDomains: whitelistDraft
        .split(/[\n,]+/)
        .map(item => item.trim())
        .filter(Boolean),
    })
    notify(result.message, result.success ? 'success' : 'warning')
  }

  const handleTransferCode = () => {
    const result = sendSensitiveCode('transfer-admin')
    if (!result.success) {
      notify(result.message, 'warning')
      return
    }
    const hint = `转让验证码：${result.code}`
    setTransferHint(hint)
    notify(hint, 'success')
  }

  const handleTransferAdmin = () => {
    const result = transferAdmin(transferTarget, transferToken, transferCode)
    notify(result.message, result.success ? 'success' : 'warning')
    if (result.success) {
      setTransferCode('')
      setTransferToken('')
      setTransferTarget('')
    }
  }

  return (
    <div className="space-y-[18px]">
      <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
        <SectionTitle>账号资料</SectionTitle>
        <div className="mt-[16px] flex items-center gap-[18px]">
          <Avatar name={profileName || currentUser.name} email={currentUser.email} avatar={profileAvatar} size={88} />
          <div className="flex-1 grid grid-cols-2 gap-[14px]">
            <input
              value={profileName}
              onChange={event => setProfileName(event.target.value)}
              placeholder="显示名称"
              className="bg-white/40 border-2 border-black/20 rounded-[18px] px-[18px] outline-none"
              style={{ height: 52, ...titleFont, fontSize: 22 }}
            />
            <div className="bg-white/25 border-2 border-black/10 rounded-[18px] px-[18px] flex items-center text-black/55" style={{ height: 52, ...monoFont, fontSize: 18 }}>
              {currentUser.email}
            </div>
          </div>
        </div>
        <div className="mt-[14px] flex items-center gap-[12px] flex-wrap">
          <label
            className="cursor-pointer rounded-[18px] px-[16px] py-[10px]"
            style={{ border: '2px solid rgba(0,0,0,0.2)', background: 'rgba(255,255,255,0.24)', ...titleFont, fontSize: 20 }}
          >
            上传新头像
            <input type="file" accept="image/*" hidden onChange={onProfileAvatarChange} />
          </label>
          <button
            type="button"
            onClick={handleProfileSave}
            className="cursor-pointer rounded-[18px] px-[16px] py-[10px]"
            style={{ border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(255,255,255,0.34)', ...titleFont, fontSize: 20 }}
          >
            保存资料
          </button>
          <span className="text-black/45" style={{ ...monoFont, fontSize: 15 }}>
            当前身份：{ROLE_LABELS[currentUser.role]} · {currentUser.status === 'active' ? '已激活' : '待审核'}
          </span>
        </div>
      </div>

      <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
        <SectionTitle>账号安全</SectionTitle>
        {currentUser.role === 'admin' ? (
          <div className="mt-[12px] text-black/55" style={{ ...titleFont, fontSize: 22 }}>
            管理员账号使用系统 Token 登录，安全配置由上方“安全配置”板块统一管理。
          </div>
        ) : (
          <>
            <div className="mt-[14px] grid grid-cols-3 gap-[12px]">
              <input value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} type="password" placeholder="当前密码" className="bg-white/40 border-2 border-black/20 rounded-[18px] px-[18px] outline-none" style={{ height: 50, ...monoFont, fontSize: 18 }} />
              <input value={nextPassword} onChange={event => setNextPassword(event.target.value)} type="password" placeholder="新密码（至少8位，含字母和数字）" className="bg-white/40 border-2 border-black/20 rounded-[18px] px-[18px] outline-none" style={{ height: 50, ...monoFont, fontSize: 18 }} />
              <div className="flex gap-[10px]">
                <input value={passwordCode} onChange={event => setPasswordCode(event.target.value)} placeholder="安全验证码" className="flex-1 bg-white/40 border-2 border-black/20 rounded-[18px] px-[18px] outline-none" style={{ height: 50, ...monoFont, fontSize: 18 }} />
                <button type="button" onClick={handleSendPasswordCode} className="cursor-pointer rounded-[18px] px-[14px]" style={{ border: '2px solid rgba(0,0,0,0.25)', background: 'rgba(255,255,255,0.3)', ...titleFont, fontSize: 18 }}>
                  发送
                </button>
              </div>
            </div>
            <div className="mt-[10px] flex items-center justify-between gap-[12px] flex-wrap">
              <div className="text-black/45" style={{ ...monoFont, fontSize: 15 }}>
                {passwordHint || '修改密码前需要通过安全验证码校验。'}
              </div>
              <button type="button" onClick={handleChangePassword} className="cursor-pointer rounded-[18px] px-[16px] py-[10px]" style={{ border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(255,255,255,0.34)', ...titleFont, fontSize: 20 }}>
                更新密码
              </button>
            </div>
          </>
        )}
      </div>

      {currentUser.role === 'guest' && can('member.upgrade.request') ? (
        <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
          <SectionTitle>成员升级申请</SectionTitle>
          <textarea
            value={upgradeReason}
            onChange={event => setUpgradeReason(event.target.value)}
            placeholder="说明你需要哪些成员能力，例如启停实例、查看部署与插件管理等。"
            className="mt-[14px] w-full resize-none rounded-[18px] border-2 border-black/15 bg-white/35 px-[18px] py-[14px] outline-none"
            style={{ minHeight: 110, ...titleFont, fontSize: 20 }}
          />
          <div className="mt-[12px] flex items-center justify-between gap-[12px] flex-wrap">
            <div className="text-black/45" style={{ ...monoFont, fontSize: 15 }}>
              申请通过后，你会自动获得当前“成员模板”下的页面与操作权限。
            </div>
            <button type="button" onClick={handleUpgradeApply} className="cursor-pointer rounded-[18px] px-[16px] py-[10px]" style={{ border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(255,255,255,0.34)', ...titleFont, fontSize: 20 }}>
              提交升级申请
            </button>
          </div>
        </div>
      ) : null}

      {currentUser.role === 'admin' && can('accounts.manage') ? (
        <>
          <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
            <SectionTitle>申请与成员管理</SectionTitle>
            <div className="mt-[14px] space-y-[12px]">
              {pendingRequests.length === 0 ? (
                <div className="rounded-[18px] border-2 border-dashed border-black/15 px-[18px] py-[18px] text-black/40" style={{ ...titleFont, fontSize: 20 }}>
                  当前没有待处理申请。
                </div>
              ) : pendingRequests.map(request => (
                <div key={request.id} className="rounded-[18px] border-2 border-black/10 bg-white/25 px-[16px] py-[14px]">
                  <div className="flex items-center justify-between gap-[12px]">
                    <div>
                      <div className="text-black/75" style={{ ...titleFont, fontSize: 22 }}>
                        {request.applicantName} · {request.type === 'guest-registration' ? '访客注册申请' : '成员升级申请'}
                      </div>
                      <div className="mt-[4px] text-black/45" style={{ ...monoFont, fontSize: 14 }}>
                        {request.applicantEmail} · {request.createdAt.replace('T', ' ').slice(0, 19)}
                      </div>
                    </div>
                    <div className="flex gap-[8px]">
                      <button type="button" onClick={() => pushResult(approveRequest(request.id))} className="cursor-pointer rounded-[16px] px-[14px] py-[8px]" style={{ border: '2px solid rgba(0,0,0,0.25)', background: 'rgba(74,249,51,0.18)', ...titleFont, fontSize: 18 }}>
                        批准
                      </button>
                      <button type="button" onClick={() => pushResult(rejectRequest(request.id))} className="cursor-pointer rounded-[16px] px-[14px] py-[8px]" style={{ border: '2px solid rgba(0,0,0,0.25)', background: 'rgba(255,140,140,0.18)', ...titleFont, fontSize: 18 }}>
                        驳回
                      </button>
                    </div>
                  </div>
                  <div className="mt-[8px] text-black/55" style={{ ...titleFont, fontSize: 18 }}>
                    {request.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
            <SectionTitle>注册与个性化规则</SectionTitle>
            <div className="mt-[14px] grid grid-cols-2 gap-[22px]">
              <div className="space-y-[12px]">
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>白名单模式</span>
                  <Toggle checked={registerPolicy.whitelistMode} onChange={value => pushResult(updateRegisterPolicy({ whitelistMode: value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>允许访客直接注册</span>
                  <Toggle checked={registerPolicy.allowGuestSelfRegister} onChange={value => pushResult(updateRegisterPolicy({ allowGuestSelfRegister: value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>允许访客提交申请</span>
                  <Toggle checked={registerPolicy.allowGuestApplications} onChange={value => pushResult(updateRegisterPolicy({ allowGuestApplications: value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>允许访客申请升级成员</span>
                  <Toggle checked={registerPolicy.allowMemberUpgradeApplications} onChange={value => pushResult(updateRegisterPolicy({ allowMemberUpgradeApplications: value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>注册需邮箱验证码</span>
                  <Toggle checked={registerPolicy.requireEmailVerification} onChange={value => pushResult(updateRegisterPolicy({ requireEmailVerification: value }))} />
                </div>
              </div>

              <div className="space-y-[12px]">
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>同步管理员主题/背景</span>
                  <Toggle checked={appearancePolicy.syncAdminAppearance} onChange={value => pushResult(updateAppearancePolicy({ syncAdminAppearance: value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ ...titleFont, fontSize: 21 }}>允许成员/访客自定义</span>
                  <Toggle checked={appearancePolicy.allowCustomAppearance} onChange={value => pushResult(updateAppearancePolicy({ allowCustomAppearance: value }))} />
                </div>
                <div className="rounded-[18px] border-2 border-black/10 bg-white/20 p-[14px] text-black/45" style={{ ...monoFont, fontSize: 14, lineHeight: 1.7 }}>
                  推荐白名单：{DEFAULT_EMAIL_WHITELIST.join(', ')}
                </div>
              </div>
            </div>

            <div className="mt-[16px]">
              <div className="text-black/72" style={{ ...titleFont, fontSize: 22 }}>邮箱白名单</div>
              <textarea
                value={whitelistDraft}
                onChange={event => setWhitelistDraft(event.target.value)}
                className="mt-[10px] w-full resize-none rounded-[18px] border-2 border-black/15 bg-white/35 px-[18px] py-[14px] outline-none"
                style={{ minHeight: 140, ...monoFont, fontSize: 16 }}
              />
              <div className="mt-[10px] flex justify-end">
                <button type="button" onClick={handleSaveWhitelist} className="cursor-pointer rounded-[18px] px-[16px] py-[10px]" style={{ border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(255,255,255,0.34)', ...titleFont, fontSize: 20 }}>
                  保存白名单
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
            <SectionTitle>成员与访客权限模板</SectionTitle>
            <div className="mt-[14px] overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left pb-[10px]" style={{ ...titleFont, fontSize: 20 }}>项目</th>
                    <th className="text-center pb-[10px]" style={{ ...titleFont, fontSize: 20 }}>成员</th>
                    <th className="text-center pb-[10px]" style={{ ...titleFont, fontSize: 20 }}>访客</th>
                  </tr>
                </thead>
                <tbody>
                  {PAGE_PERMISSION_ORDER.map(page => (
                    <tr key={page}>
                      <td className="py-[8px]" style={{ ...titleFont, fontSize: 18 }}>{PAGE_PERMISSION_LABELS[page]}</td>
                      <td className="py-[8px] text-center"><Toggle checked={roleTemplates.member.pages[page]} onChange={value => pushResult(setRolePagePermission('member', page, value))} /></td>
                      <td className="py-[8px] text-center"><Toggle checked={roleTemplates.guest.pages[page]} onChange={value => pushResult(setRolePagePermission('guest', page, value))} /></td>
                    </tr>
                  ))}
                  {ACTION_PERMISSION_ORDER.map(action => (
                    <tr key={action}>
                      <td className="py-[8px]" style={{ ...titleFont, fontSize: 18 }}>{ACTION_PERMISSION_LABELS[action]}</td>
                      <td className="py-[8px] text-center"><Toggle checked={roleTemplates.member.actions[action]} onChange={value => pushResult(setRoleActionPermission('member', action, value))} /></td>
                      <td className="py-[8px] text-center"><Toggle checked={roleTemplates.guest.actions[action]} onChange={value => pushResult(setRoleActionPermission('guest', action, value))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
            <SectionTitle>账号名册</SectionTitle>
            <div className="mt-[14px] space-y-[10px]">
              {users.map(user => (
                <div key={user.id} className="flex items-center justify-between gap-[14px] rounded-[18px] border-2 border-black/10 bg-white/20 px-[14px] py-[12px]">
                  <div className="flex items-center gap-[12px] min-w-0">
                    <Avatar name={user.name} email={user.email} avatar={user.avatar} />
                    <div className="min-w-0">
                      <div className="truncate text-black/78" style={{ ...titleFont, fontSize: 21 }}>{user.name}</div>
                      <div className="truncate text-black/45" style={{ ...monoFont, fontSize: 14 }}>{user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-[10px] flex-wrap justify-end">
                    <span className="rounded-full px-[12px] py-[6px] text-black/60" style={{ border: '1px solid rgba(0,0,0,0.12)', ...titleFont, fontSize: 16 }}>
                      {ROLE_LABELS[user.role]} · {user.status === 'active' ? '已激活' : '待审核'}
                    </span>
                    {user.role !== 'admin' ? (
                      <>
                        <button type="button" onClick={() => pushResult(setUserRole(user.id, 'member'))} className="cursor-pointer rounded-[14px] px-[12px] py-[8px]" style={{ border: '2px solid rgba(0,0,0,0.2)', background: 'rgba(255,255,255,0.26)', ...titleFont, fontSize: 17 }}>
                          设为成员
                        </button>
                        <button type="button" onClick={() => pushResult(setUserRole(user.id, 'guest'))} className="cursor-pointer rounded-[14px] px-[12px] py-[8px]" style={{ border: '2px solid rgba(0,0,0,0.2)', background: 'rgba(255,255,255,0.26)', ...titleFont, fontSize: 17 }}>
                          设为访客
                        </button>
                      </>
                    ) : (
                      <span className="text-black/42" style={{ ...monoFont, fontSize: 14 }}>当前唯一管理员</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
            <SectionTitle>管理员账号转让</SectionTitle>
            <div className="mt-[14px] grid grid-cols-[1fr,1fr,1fr,160px] gap-[12px]">
              <select value={transferTarget} onChange={event => setTransferTarget(event.target.value)} className="rounded-[18px] border-2 border-black/15 bg-white/35 px-[16px] outline-none" style={{ height: 50, ...titleFont, fontSize: 18 }}>
                <option value="">选择目标成员</option>
                {members.map(member => (
                  <option key={member.id} value={member.id}>{member.name} · {member.email}</option>
                ))}
              </select>
              <input value={transferToken} onChange={event => setTransferToken(event.target.value)} type="password" placeholder={`系统 Token${adminToken ? '（已缓存）' : ''}`} className="rounded-[18px] border-2 border-black/15 bg-white/35 px-[16px] outline-none" style={{ height: 50, ...monoFont, fontSize: 18 }} />
              <input value={transferCode} onChange={event => setTransferCode(event.target.value)} placeholder="转让验证码" className="rounded-[18px] border-2 border-black/15 bg-white/35 px-[16px] outline-none" style={{ height: 50, ...monoFont, fontSize: 18 }} />
              <button type="button" onClick={handleTransferCode} className="cursor-pointer rounded-[18px]" style={{ border: '2px solid rgba(0,0,0,0.25)', background: 'rgba(255,255,255,0.3)', ...titleFont, fontSize: 18 }}>
                发送验证码
              </button>
            </div>
            <div className="mt-[10px] flex items-center justify-between gap-[12px] flex-wrap">
              <div className="text-black/45" style={{ ...monoFont, fontSize: 15 }}>
                {transferHint || `当前管理员：${currentAdmin.name} · 转让后唯一管理员会切换到目标成员。`}
              </div>
              <button type="button" onClick={handleTransferAdmin} className="cursor-pointer rounded-[18px] px-[16px] py-[10px]" style={{ border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(255,255,255,0.34)', ...titleFont, fontSize: 20 }}>
                执行转让
              </button>
            </div>
          </div>

          <div className="rounded-[20px] border-2 border-black/15 bg-white/25 p-[20px]">
            <SectionTitle>审计轨迹</SectionTitle>
            <div className="mt-[14px] max-h-[240px] overflow-auto space-y-[8px] pr-[4px]">
              {auditTrail.length === 0 ? (
                <div className="text-black/40" style={{ ...monoFont, fontSize: 15 }}>暂无记录。</div>
              ) : auditTrail.map(item => (
                <div key={item.id} className="rounded-[16px] border border-black/10 bg-white/20 px-[14px] py-[10px]">
                  <div className="text-black/72" style={{ ...titleFont, fontSize: 18 }}>{item.action}</div>
                  <div className="mt-[2px] text-black/45" style={{ ...monoFont, fontSize: 14 }}>{item.detail}</div>
                  <div className="mt-[4px] text-black/35" style={{ ...monoFont, fontSize: 13 }}>{item.at.replace('T', ' ').slice(0, 19)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
