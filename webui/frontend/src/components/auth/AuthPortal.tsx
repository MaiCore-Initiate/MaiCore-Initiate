import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNotification } from '../ui/Notification'
import { getAvatarFallback, ROLE_LABELS, useAccountSystem } from '../../lib/account-system'

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('头像读取失败'))
    reader.readAsDataURL(file)
  })
}

function AvatarCircle({
  name,
  email,
  avatar,
  size = 112,
}: {
  name: string
  email: string
  avatar?: string
  size?: number
}) {
  const fallback = getAvatarFallback(name, email)
  return (
    <div
      className="overflow-hidden rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        border: '3px solid rgba(0,0,0,0.35)',
        background: 'rgba(255,255,255,0.35)',
        boxShadow: '0 12px 24px rgba(0,0,0,0.18)',
      }}
    >
      {avatar ? (
        <img src={avatar} alt={name || email} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.3, fontFamily: "'Ubuntu', 'HarmonyOS Sans SC', monospace", color: 'rgba(0,0,0,0.6)' }}>
          {fallback}
        </span>
      )}
    </div>
  )
}

const titleFont = { fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const monoFont = { fontFamily: "'Ubuntu', 'HarmonyOS Sans SC', monospace" }

export default function AuthPortal({ onAuthenticated }: { onAuthenticated: () => void }) {
  const {
    currentAdmin,
    registerPolicy,
    findUserByIdentifier,
    sendLoginCode,
    sendRegisterCode,
    activateAdminSession,
    loginLocal,
    registerAccount,
  } = useAccountSystem()
  const { notify } = useNotification()

  const [view, setView] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState('')
  const [secret, setSecret] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [loginHint, setLoginHint] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirm, setRegisterConfirm] = useState('')
  const [registerCode, setRegisterCode] = useState('')
  const [registerReason, setRegisterReason] = useState('')
  const [registerAvatar, setRegisterAvatar] = useState('')
  const [registerHint, setRegisterHint] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [view])

  const previewUser = useMemo(() => {
    return findUserByIdentifier(identifier) ?? (identifier.trim() ? null : currentAdmin)
  }, [currentAdmin, findUserByIdentifier, identifier])

  const whitelistPreview = useMemo(() => {
    return registerPolicy.allowedDomains.slice(0, 8).join(' / ')
  }, [registerPolicy.allowedDomains])

  const issueLoginCode = async () => {
    const result = await sendLoginCode(identifier)
    if (!result.success) {
      notify(result.message, 'warning')
      return
    }
    const hint = `演示验证码：${result.code}`
    setLoginHint(hint)
    notify(hint, 'success')
  }

  const issueRegisterCode = async () => {
    const result = await sendRegisterCode(registerEmail)
    if (!result.success) {
      notify(result.message, 'warning')
      return
    }
    const hint = `注册验证码：${result.code}`
    setRegisterHint(hint)
    notify(hint, 'success')
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (!identifier.trim() || !secret.trim()) {
      notify('请填写账号名/邮箱和登录凭证。', 'warning')
      return
    }

    setSubmitting(true)

    try {
      const matched = findUserByIdentifier(identifier)
      if (matched?.role === 'admin') {
        const result = await activateAdminSession(identifier, secret)
        if (!result.success) {
          notify(result.message, 'error')
          return
        }
        notify('管理员身份已验证。', 'success')
        onAuthenticated()
        return
      }

      const result = await loginLocal(identifier, secret, loginCode)
      if (!result.success) {
        notify(result.message, 'warning')
        return
      }

      onAuthenticated()
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (registerPassword !== registerConfirm) {
      notify('两次输入的密码不一致。', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const result = await registerAccount({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
        code: registerCode,
        avatar: registerAvatar,
        reason: registerReason,
      })

      if (!result.success) {
        notify(result.message, 'warning')
        return
      }

      notify(result.message, 'success')
      setIdentifier(registerEmail)
      setSecret('')
      setLoginCode('')
      setView('login')
    } finally {
      setSubmitting(false)
    }
  }

  const onAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setRegisterAvatar(dataUrl)
    } catch {
      notify('头像读取失败。', 'error')
    }
  }

  const loginTitle = previewUser?.role === 'admin' ? '使用系统 Token 登录管理员账号' : '输入账号凭证继续使用系统'
  const previewName = previewUser?.name ?? identifier.trim() ?? ''
  const previewEmail = previewUser?.email ?? identifier.trim() ?? currentAdmin.email
  const isLoginView = view === 'login'

  return (
    <div
      className="bg-white/5 border-2 border-black/30 backdrop-blur-[50px] shadow-login-card animate-scale-fade-in"
      style={{
        width: isLoginView ? 'min(720px, calc(100vw - 22px))' : 'min(720px, calc(100vw - 36px))',
        height: isLoginView ? 'calc(100vh - 2px)' : 'auto',
        maxHeight: 'calc(100vh - 2px)',
        overflowY: isLoginView ? 'hidden' : 'auto',
        borderRadius: 30,
        padding: isLoginView ? '20px clamp(18px,4vw,30px) 16px' : '30px clamp(18px,4vw,38px) 26px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-center justify-center gap-[12px]">
        {(['login', 'register'] as const).map(item => {
          const active = view === item
          return (
            <button
              key={item}
              onClick={() => setView(item)}
              className="cursor-pointer transition-colors"
              style={{
                width: 168,
                height: 52,
                borderRadius: 28,
                border: active ? '3px solid rgba(0,0,0,0.55)' : '2px solid rgba(0,0,0,0.2)',
                background: active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)',
                ...titleFont,
                fontSize: 24,
                color: 'rgba(0,0,0,0.75)',
              }}
            >
              {item === 'login' ? '账号登录' : '注册账号'}
            </button>
          )
        })}
      </div>

      <div key={view} className="flex flex-1 flex-col animate-scale-in" style={{ animationDuration: '0.28s' }}>
        <h1 className={`${isLoginView ? 'mt-[24px]' : 'mt-[34px]'} text-center text-black/80`} style={{ ...titleFont, fontSize: 54 }}>
          账号中心
        </h1>
        <p className={`${isLoginView ? 'mt-[10px]' : 'mt-[14px]'} text-center text-black/50`} style={{ ...titleFont, fontSize: 22 }}>
          {view === 'login' ? loginTitle : '创建访客账号，或提交访客注册申请'}
        </p>

        {view === 'login' ? (
          <form className="mt-[20px] flex flex-1 flex-col items-center justify-center gap-[18px]" onSubmit={handleLogin}>
          <AvatarCircle
            name={previewName || '访客'}
            email={previewEmail}
            avatar={previewUser?.avatar}
            size={100}
          />

          <div className="w-full grid grid-cols-1 gap-[14px] md:grid-cols-2">
            <input
              ref={inputRef}
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value)
                setLoginHint('')
              }}
              placeholder="账号名 / 邮箱"
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 26, padding: '0 24px', ...titleFont, fontSize: 26 }}
            />
            <input
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              type={previewUser?.role === 'admin' ? 'password' : 'password'}
              placeholder={previewUser?.role === 'admin' ? '系统 Token' : '登录密码'}
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 26, padding: '0 24px', ...titleFont, fontSize: 26 }}
            />
          </div>

          <div className="w-full grid grid-cols-1 gap-[14px] md:grid-cols-[1fr,156px]">
            <input
              value={loginCode}
              onChange={(event) => setLoginCode(event.target.value)}
              placeholder={previewUser?.role === 'admin' ? '管理员无需验证码' : '登录验证码'}
              disabled={previewUser?.role === 'admin'}
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none disabled:opacity-50"
              style={{ height: 68, borderRadius: 26, padding: '0 24px', ...monoFont, fontSize: 26 }}
            />
            <button
              type="button"
              onClick={() => void issueLoginCode()}
              disabled={!identifier.trim() || previewUser?.role === 'admin'}
              className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                height: 68,
                borderRadius: 26,
                border: '3px solid rgba(0,0,0,0.4)',
                background: 'rgba(255,255,255,0.32)',
                ...titleFont,
                fontSize: 22,
              }}
            >
              获取验证码
            </button>
          </div>

          <div className="w-full rounded-[24px] border-2 border-black/15 bg-white/18 px-[20px] py-[14px]">
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <div className="text-black/75" style={{ ...titleFont, fontSize: 22 }}>
                  {previewUser ? `${previewUser.name} · ${ROLE_LABELS[previewUser.role]}` : '管理员账号使用系统 Token 登录'}
                </div>
                <div className="mt-[4px] text-black/45" style={{ ...monoFont, fontSize: 16 }}>
                  {previewUser?.email || currentAdmin.email}
                </div>
              </div>
              {previewUser?.status === 'pending' ? (
                <span className="rounded-full px-[14px] py-[6px] text-black/60" style={{ border: '1px solid rgba(0,0,0,0.2)', ...titleFont, fontSize: 18 }}>
                  待审核
                </span>
              ) : null}
            </div>
            <div className="mt-[10px] text-black/45" style={{ ...monoFont, fontSize: 16 }}>
              {loginHint || (previewUser?.role === 'admin'
                ? '管理员需要使用系统初始化时生成的 Token。'
                : '验证码将直接显示')}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              height: 74,
              borderRadius: 30,
              border: '3px solid rgba(0,0,0,0.45)',
              background: 'rgba(255,255,255,0.5)',
              ...titleFont,
              fontSize: 30,
              color: 'rgba(0,0,0,0.72)',
            }}
          >
            {submitting ? '验证中...' : '登录'}
          </button>
          </form>
        ) : (
          <form className="mt-[34px] flex flex-col gap-[20px]" onSubmit={handleRegister}>
          <div className="flex flex-col items-start gap-[18px] md:flex-row md:items-center md:gap-[22px]">
            <AvatarCircle name={registerName || '新访客'} email={registerEmail} avatar={registerAvatar} size={104} />
            <label
              className="cursor-pointer rounded-[24px] px-[24px] py-[14px]"
              style={{ border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(255,255,255,0.28)', ...titleFont, fontSize: 24 }}
            >
              上传头像
              <input type="file" accept="image/*" hidden onChange={onAvatarChange} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
            <input
              ref={inputRef}
              value={registerName}
              onChange={(event) => setRegisterName(event.target.value)}
              placeholder="显示名称"
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 28, padding: '0 24px', ...titleFont, fontSize: 26 }}
            />
            <input
              value={registerEmail}
              onChange={(event) => {
                setRegisterEmail(event.target.value)
                setRegisterHint('')
              }}
              placeholder="邮箱地址"
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 28, padding: '0 24px', ...monoFont, fontSize: 24 }}
            />
            <input
              value={registerPassword}
              onChange={(event) => setRegisterPassword(event.target.value)}
              type="password"
              placeholder="设置密码"
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 28, padding: '0 24px', ...monoFont, fontSize: 24 }}
            />
            <input
              value={registerConfirm}
              onChange={(event) => setRegisterConfirm(event.target.value)}
              type="password"
              placeholder="确认密码"
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 28, padding: '0 24px', ...monoFont, fontSize: 24 }}
            />
          </div>

          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[1fr,180px]">
            <input
              value={registerCode}
              onChange={(event) => setRegisterCode(event.target.value)}
              placeholder="验证码"
              className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none"
              style={{ height: 68, borderRadius: 28, padding: '0 24px', ...monoFont, fontSize: 24 }}
            />
            <button
              type="button"
              onClick={() => void issueRegisterCode()}
              className="cursor-pointer"
              style={{
                height: 68,
                borderRadius: 28,
                border: '3px solid rgba(0,0,0,0.4)',
                background: 'rgba(255,255,255,0.32)',
                ...titleFont,
                fontSize: 24,
              }}
            >
              获取验证码
            </button>
          </div>

          <textarea
            value={registerReason}
            onChange={(event) => setRegisterReason(event.target.value)}
            placeholder="若不满足直注册条件，这里会作为提交给管理员的申请说明。"
            className="bg-white/15 border-[3px] border-black/40 text-black/80 placeholder-black/30 focus:outline-none resize-none"
            style={{ minHeight: 120, borderRadius: 28, padding: '18px 24px', ...titleFont, fontSize: 24 }}
          />

          <div className="rounded-[24px] border-2 border-black/15 bg-white/18 px-[20px] py-[16px]">
            <div className="text-black/72" style={{ ...titleFont, fontSize: 24 }}>
              当前注册规则
            </div>
            <div className="mt-[8px] text-black/50" style={{ ...monoFont, fontSize: 15, lineHeight: 1.7 }}>
              {registerPolicy.allowGuestSelfRegister ? '允许访客自助注册；' : '不允许访客直接注册；'}
              {registerPolicy.allowGuestApplications ? '允许提交访客申请；' : '已关闭访客申请；'}
              {registerPolicy.requireEmailVerification ? '注册必须经过验证码校验。' : '当前未开启验证码。'}
            </div>
            <div className="mt-[8px] text-black/42" style={{ ...monoFont, fontSize: 15 }}>
              {registerHint || `白名单模式：${registerPolicy.whitelistMode ? '开启' : '关闭'} · 常见域名：${whitelistPreview}`}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              height: 76,
              borderRadius: 32,
              border: '3px solid rgba(0,0,0,0.45)',
              background: 'rgba(255,255,255,0.5)',
              ...titleFont,
              fontSize: 30,
              color: 'rgba(0,0,0,0.72)',
            }}
          >
            {submitting ? '提交中...' : '创建账号 / 提交申请'}
          </button>
          </form>
        )}
      </div>

      <p className={`${isLoginView ? 'mt-[14px]' : 'mt-[26px]'} text-center text-black/40`} style={{ ...monoFont, fontSize: 15 }}>
        © 2026 xiaoCZX · 账号系统前端原型
      </p>
    </div>
  )
}
