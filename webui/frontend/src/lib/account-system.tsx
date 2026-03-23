import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Page } from '../types'

export type AccountRole = 'admin' | 'member' | 'guest'
export type AccountStatus = 'active' | 'pending'
export type ActionPermissionKey =
  | 'instances.control'
  | 'settings.system'
  | 'settings.security'
  | 'accounts.manage'
  | 'appearance.customize'
  | 'quick-access.customize'
  | 'member.upgrade.request'

export interface AccountUser {
  id: string
  role: AccountRole
  status: AccountStatus
  name: string
  email: string
  avatar?: string
  password: string
  createdAt: string
  joinedVia: 'seed' | 'self-register' | 'admin-approve'
  lastLoginAt?: string
  loginCodeEnabled: boolean
}

export interface VerificationRecord {
  purpose: string
  code: string
  expiresAt: number
}

export interface LoginGuardRecord {
  attempts: number
  lockedUntil: number
}

export interface ApprovalRequest {
  id: string
  type: 'guest-registration' | 'member-upgrade'
  applicantId: string
  applicantName: string
  applicantEmail: string
  desiredRole: 'guest' | 'member'
  reason: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface AuditItem {
  id: string
  action: string
  detail: string
  at: string
}

export interface RegisterPolicy {
  whitelistMode: boolean
  allowedDomains: string[]
  allowGuestSelfRegister: boolean
  allowGuestApplications: boolean
  allowMemberUpgradeApplications: boolean
  requireEmailVerification: boolean
}

export interface AppearancePolicy {
  syncAdminAppearance: boolean
  allowCustomAppearance: boolean
}

export interface RolePermissionTemplate {
  pages: Record<Page, boolean>
  actions: Record<ActionPermissionKey, boolean>
}

interface AccountSystemState {
  adminToken: string
  users: AccountUser[]
  currentUserId: string | null
  roleTemplates: Record<'member' | 'guest', RolePermissionTemplate>
  registerPolicy: RegisterPolicy
  appearancePolicy: AppearancePolicy
  verificationCodes: Record<string, VerificationRecord>
  loginGuards: Record<string, LoginGuardRecord>
  requests: ApprovalRequest[]
  auditTrail: AuditItem[]
}

export interface OperationResult<T = undefined> {
  success: boolean
  message: string
  code?: string
  data?: T
}

interface RegisterPayload {
  name: string
  email: string
  password: string
  code?: string
  avatar?: string
  reason?: string
}

interface ProfilePayload {
  name: string
  avatar?: string
}

interface PasswordPayload {
  currentPassword: string
  nextPassword: string
  code: string
}

interface AccountSystemContextValue {
  adminToken: string
  currentUser: AccountUser | null
  currentAdmin: AccountUser
  users: AccountUser[]
  requests: ApprovalRequest[]
  pendingRequests: ApprovalRequest[]
  registerPolicy: RegisterPolicy
  appearancePolicy: AppearancePolicy
  roleTemplates: Record<'member' | 'guest', RolePermissionTemplate>
  auditTrail: AuditItem[]
  findUserByIdentifier: (identifier: string) => AccountUser | null
  canAccessPage: (page: Page, user?: AccountUser | null) => boolean
  can: (action: ActionPermissionKey, user?: AccountUser | null) => boolean
  sendLoginCode: (identifier: string) => OperationResult
  sendRegisterCode: (email: string) => OperationResult
  sendSensitiveCode: (purpose: string) => OperationResult
  activateAdminSession: (identifier: string, token: string) => OperationResult
  loginLocal: (identifier: string, password: string, code: string) => OperationResult<{ user: AccountUser }>
  logout: () => void
  registerAccount: (payload: RegisterPayload) => OperationResult<{ mode: 'registered' | 'applied' }>
  updateProfile: (payload: ProfilePayload) => OperationResult
  changePassword: (payload: PasswordPayload) => OperationResult
  requestMemberUpgrade: (reason: string) => OperationResult
  approveRequest: (requestId: string) => OperationResult
  rejectRequest: (requestId: string) => OperationResult
  setUserRole: (userId: string, role: Exclude<AccountRole, 'admin'>) => OperationResult
  setRolePagePermission: (role: 'member' | 'guest', page: Page, allowed: boolean) => OperationResult
  setRoleActionPermission: (role: 'member' | 'guest', action: ActionPermissionKey, allowed: boolean) => OperationResult
  updateRegisterPolicy: (patch: Partial<RegisterPolicy>) => OperationResult
  updateAppearancePolicy: (patch: Partial<AppearancePolicy>) => OperationResult
  transferAdmin: (targetUserId: string, token: string, code: string) => OperationResult
}

const STORAGE_KEY = 'mcstart.account-system.v1'
const CODE_TTL_MS = 5 * 60 * 1000
const LOGIN_LOCK_MS = 5 * 60 * 1000
const LOGIN_FAIL_LIMIT = 5

export const DEFAULT_EMAIL_WHITELIST = [
  'qq.com',
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  '163.com',
  '126.com',
  'yeah.net',
  'foxmail.com',
  'sina.com',
  'aliyun.com',
  'yahoo.com',
  'proton.me',
  'protonmail.com',
]

export const ROLE_LABELS: Record<AccountRole, string> = {
  admin: '管理员',
  member: '成员',
  guest: '访客',
}

export const PAGE_PERMISSION_ORDER: Page[] = [
  'home',
  'instances',
  'config',
  'knowledge',
  'db-migration',
  'plugins',
  'deploy',
  'status',
  'logs',
  'misc',
  'settings',
  'component-download',
]

export const PAGE_PERMISSION_LABELS: Record<Page, string> = {
  home: '首页',
  instances: '实例启动/多开',
  config: '配置管理',
  knowledge: '知识库构建',
  'db-migration': '数据库迁移',
  plugins: '插件管理',
  deploy: '实例部署辅助系统',
  status: '查看运行状态',
  logs: '日志查看器',
  misc: '杂项',
  settings: '设置',
  'component-download': '组件下载',
}

export const ACTION_PERMISSION_ORDER: ActionPermissionKey[] = [
  'instances.control',
  'settings.system',
  'settings.security',
  'accounts.manage',
  'appearance.customize',
  'quick-access.customize',
  'member.upgrade.request',
]

export const ACTION_PERMISSION_LABELS: Record<ActionPermissionKey, string> = {
  'instances.control': '实例启停与快捷启动',
  'settings.system': '系统设置与 AI 配置',
  'settings.security': '安全配置与 Token 管理',
  'accounts.manage': '成员管理与申请审批',
  'appearance.customize': '个性化主题/背景',
  'quick-access.customize': '自定义快捷访问',
  'member.upgrade.request': '申请升级为成员',
}

const AccountSystemContext = createContext<AccountSystemContextValue | null>(null)

function nowIso() {
  return new Date().toISOString()
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function getDomain(email: string) {
  const pieces = normalize(email).split('@')
  return pieces.length === 2 ? pieces[1] : ''
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

function createEmptyPagePermissions() {
  return PAGE_PERMISSION_ORDER.reduce((acc, page) => {
    acc[page] = false
    return acc
  }, {} as Record<Page, boolean>)
}

function createEmptyActionPermissions() {
  return ACTION_PERMISSION_ORDER.reduce((acc, action) => {
    acc[action] = false
    return acc
  }, {} as Record<ActionPermissionKey, boolean>)
}

function createDefaultRoleTemplates(): Record<'member' | 'guest', RolePermissionTemplate> {
  const memberPages = createEmptyPagePermissions()
  memberPages.home = true
  memberPages.instances = true
  memberPages.config = true
  memberPages.knowledge = true
  memberPages.plugins = true
  memberPages.deploy = true
  memberPages.status = true
  memberPages.logs = true
  memberPages.misc = true
  memberPages.settings = true
  memberPages['component-download'] = true

  const guestPages = createEmptyPagePermissions()
  guestPages.home = true
  guestPages.status = true
  guestPages.logs = true
  guestPages.misc = true
  guestPages.settings = true
  guestPages['component-download'] = true

  const memberActions = createEmptyActionPermissions()
  memberActions['instances.control'] = true
  memberActions['appearance.customize'] = true
  memberActions['quick-access.customize'] = true

  const guestActions = createEmptyActionPermissions()
  guestActions['appearance.customize'] = true
  guestActions['quick-access.customize'] = true
  guestActions['member.upgrade.request'] = true

  return {
    member: {
      pages: memberPages,
      actions: memberActions,
    },
    guest: {
      pages: guestPages,
      actions: guestActions,
    },
  }
}

function createDefaultState(): AccountSystemState {
  return {
    adminToken: '',
    users: [
      {
        id: 'system-admin',
        role: 'admin',
        status: 'active',
        name: '系统管理员',
        email: 'admin@maicore.local',
        password: '',
        createdAt: nowIso(),
        joinedVia: 'seed',
        loginCodeEnabled: false,
      },
    ],
    currentUserId: null,
    roleTemplates: createDefaultRoleTemplates(),
    registerPolicy: {
      whitelistMode: true,
      allowedDomains: DEFAULT_EMAIL_WHITELIST,
      allowGuestSelfRegister: true,
      allowGuestApplications: true,
      allowMemberUpgradeApplications: true,
      requireEmailVerification: true,
    },
    appearancePolicy: {
      syncAdminAppearance: true,
      allowCustomAppearance: false,
    },
    verificationCodes: {},
    loginGuards: {},
    requests: [],
    auditTrail: [],
  }
}

function normalizeState(raw: Partial<AccountSystemState> | null | undefined): AccountSystemState {
  const defaults = createDefaultState()
  const roleTemplates = raw?.roleTemplates ?? defaults.roleTemplates
  const users = Array.isArray(raw?.users) && raw.users.length > 0 ? raw.users : defaults.users
  const hasAdmin = users.some(user => user.role === 'admin')
  const normalizedUsers = hasAdmin ? users : [...users, defaults.users[0]]

  const state: AccountSystemState = {
    adminToken: typeof raw?.adminToken === 'string' ? raw.adminToken : defaults.adminToken,
    users: normalizedUsers,
    currentUserId: typeof raw?.currentUserId === 'string' ? raw.currentUserId : null,
    roleTemplates: {
      member: {
        pages: {
          ...defaults.roleTemplates.member.pages,
          ...(roleTemplates.member?.pages ?? {}),
        },
        actions: {
          ...defaults.roleTemplates.member.actions,
          ...(roleTemplates.member?.actions ?? {}),
        },
      },
      guest: {
        pages: {
          ...defaults.roleTemplates.guest.pages,
          ...(roleTemplates.guest?.pages ?? {}),
        },
        actions: {
          ...defaults.roleTemplates.guest.actions,
          ...(roleTemplates.guest?.actions ?? {}),
        },
      },
    },
    registerPolicy: {
      ...defaults.registerPolicy,
      ...(raw?.registerPolicy ?? {}),
      allowedDomains: Array.isArray(raw?.registerPolicy?.allowedDomains)
        ? raw!.registerPolicy!.allowedDomains.filter(Boolean)
        : defaults.registerPolicy.allowedDomains,
    },
    appearancePolicy: {
      ...defaults.appearancePolicy,
      ...(raw?.appearancePolicy ?? {}),
    },
    verificationCodes: raw?.verificationCodes ?? defaults.verificationCodes,
    loginGuards: raw?.loginGuards ?? defaults.loginGuards,
    requests: Array.isArray(raw?.requests) ? raw!.requests! : defaults.requests,
    auditTrail: Array.isArray(raw?.auditTrail) ? raw!.auditTrail! : defaults.auditTrail,
  }

  if (state.currentUserId && !state.users.some(user => user.id === state.currentUserId)) {
    state.currentUserId = null
  }

  return pruneState(state)
}

function pruneState(state: AccountSystemState): AccountSystemState {
  const now = Date.now()
  const verificationCodes = Object.fromEntries(
    Object.entries(state.verificationCodes).filter(([, value]) => value.expiresAt > now),
  )
  const loginGuards = Object.fromEntries(
    Object.entries(state.loginGuards).filter(([, value]) => value.lockedUntil > now || value.attempts > 0),
  )

  return {
    ...state,
    verificationCodes,
    loginGuards,
  }
}

function recordAudit(state: AccountSystemState, action: string, detail: string): AccountSystemState {
  const nextItem: AuditItem = {
    id: uid('audit'),
    action,
    detail,
    at: nowIso(),
  }
  return {
    ...state,
    auditTrail: [nextItem, ...state.auditTrail].slice(0, 60),
  }
}

export function getAvatarFallback(name: string, email: string) {
  const base = name.trim() || email.trim() || '访客'
  return base.slice(0, 2).toUpperCase()
}

export function useAccountSystem() {
  const context = useContext(AccountSystemContext)
  if (!context) {
    throw new Error('useAccountSystem 必须在 AccountSystemProvider 中使用')
  }
  return context
}

export function AccountSystemProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountSystemState>(() => {
    if (typeof window === 'undefined') return createDefaultState()
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return normalizeState(raw ? JSON.parse(raw) : null)
    } catch {
      return createDefaultState()
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneState(state)))
    } catch {
      // ignore persistence errors
    }
  }, [state])

  const users = useMemo(() => state.users, [state.users])
  const currentUser = useMemo(
    () => state.users.find(user => user.id === state.currentUserId) ?? null,
    [state.currentUserId, state.users],
  )
  const currentAdmin = useMemo(
    () => state.users.find(user => user.role === 'admin') ?? state.users[0],
    [state.users],
  )

  const canAccessPage = (page: Page, user?: AccountUser | null) => {
    const target = user ?? currentUser
    if (!target || target.status !== 'active') return false
    if (target.role === 'admin') return true
    return state.roleTemplates[target.role].pages[page] ?? false
  }

  const can = (action: ActionPermissionKey, user?: AccountUser | null) => {
    const target = user ?? currentUser
    if (!target || target.status !== 'active') return false
    if (target.role === 'admin') return true
    return state.roleTemplates[target.role].actions[action] ?? false
  }

  const findUserByIdentifier = (identifier: string) => {
    const needle = normalize(identifier)
    if (!needle) return null
    return state.users.find(user =>
      normalize(user.email) === needle || normalize(user.name) === needle,
    ) ?? null
  }

  const sendCode = (key: string, purpose: string): OperationResult => {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = Date.now() + CODE_TTL_MS

    setState(prev => {
      const pruned = pruneState(prev)
      return {
        ...pruned,
        verificationCodes: {
          ...pruned.verificationCodes,
          [key]: { purpose, code, expiresAt },
        },
      }
    })

    return {
      success: true,
      message: '验证码已生成，当前为前端演示模式。',
      code,
    }
  }

  const sendLoginCode = (identifier: string): OperationResult => {
    const user = findUserByIdentifier(identifier)
    if (!user || user.status !== 'active') {
      return { success: false, message: '未找到可登录的账号。' }
    }
    if (user.role === 'admin') {
      return { success: false, message: '管理员请直接使用系统 Token 登录。' }
    }
    return sendCode(`login:${user.id}`, `login:${user.email}`)
  }

  const sendRegisterCode = (email: string): OperationResult => {
    if (!isValidEmail(email)) {
      return { success: false, message: '请输入正确的邮箱地址。' }
    }
    return sendCode(`register:${normalize(email)}`, `register:${email}`)
  }

  const sendSensitiveCode = (purpose: string): OperationResult => {
    if (!currentUser) {
      return { success: false, message: '请先登录后再进行安全验证。' }
    }
    return sendCode(`sensitive:${currentUser.id}:${purpose}`, `sensitive:${purpose}`)
  }

  const activateAdminSession = (identifier: string, token: string): OperationResult => {
    const adminNeedle = normalize(identifier)
    const canMatchAdmin = (
      adminNeedle === normalize(currentAdmin.name) ||
      adminNeedle === normalize(currentAdmin.email)
    )

    if (!canMatchAdmin) {
      return { success: false, message: '请输入当前管理员账号名或邮箱。' }
    }
    if (!token.trim()) {
      return { success: false, message: '请输入系统 Token。' }
    }

    setState(prev => recordAudit({
      ...pruneState(prev),
      adminToken: token.trim(),
      currentUserId: currentAdmin.id,
      users: prev.users.map(user => (
        user.id === currentAdmin.id
          ? { ...user, lastLoginAt: nowIso() }
          : user
      )),
    }, 'admin-login', `${currentAdmin.name} 使用系统 Token 登录`))

    return { success: true, message: '管理员登录成功。' }
  }

  const loginLocal = (identifier: string, password: string, code: string): OperationResult<{ user: AccountUser }> => {
    const user = findUserByIdentifier(identifier)
    if (!user || user.status !== 'active' || user.role === 'admin') {
      return { success: false, message: '账号不存在，或当前账号必须使用管理员 Token 登录。' }
    }

    const guard = state.loginGuards[user.id]
    if (guard && guard.lockedUntil > Date.now()) {
      const seconds = Math.ceil((guard.lockedUntil - Date.now()) / 1000)
      return { success: false, message: `尝试次数过多，请在 ${seconds} 秒后重试。` }
    }

    if (user.password !== password) {
      const nextAttempts = (guard?.attempts ?? 0) + 1
      const lockedUntil = nextAttempts >= LOGIN_FAIL_LIMIT ? Date.now() + LOGIN_LOCK_MS : 0
      setState(prev => {
        const pruned = pruneState(prev)
        return {
          ...pruned,
          loginGuards: {
            ...pruned.loginGuards,
            [user.id]: { attempts: nextAttempts, lockedUntil },
          },
        }
      })
      if (lockedUntil > 0) {
        return { success: false, message: '密码错误次数过多，账号已被暂时锁定。' }
      }
      return { success: false, message: `密码错误，还可尝试 ${Math.max(0, LOGIN_FAIL_LIMIT - nextAttempts)} 次。` }
    }

    const codeKey = `login:${user.id}`
    if (user.loginCodeEnabled) {
      const verify = state.verificationCodes[codeKey]
      if (!verify || verify.code !== code.trim()) {
        return { success: false, message: '登录验证码无效，请重新发送。' }
      }
    }

    setState(prev => {
      const pruned = pruneState(prev)
      return recordAudit({
        ...pruned,
        currentUserId: user.id,
        users: prev.users.map(item => (
          item.id === user.id ? { ...item, lastLoginAt: nowIso() } : item
        )),
        verificationCodes: Object.fromEntries(
          Object.entries(pruned.verificationCodes).filter(([key]) => key !== codeKey),
        ),
        loginGuards: Object.fromEntries(
          Object.entries(pruned.loginGuards).filter(([key]) => key !== user.id),
        ),
      }, 'account-login', `${user.name} 以 ${ROLE_LABELS[user.role]} 身份登录`)
    })

    return {
      success: true,
      message: '登录成功。',
      data: { user },
    }
  }

  const logout = () => {
    setState(prev => ({
      ...pruneState(prev),
      currentUserId: null,
    }))
  }

  const registerAccount = (payload: RegisterPayload): OperationResult<{ mode: 'registered' | 'applied' }> => {
    const name = payload.name.trim()
    const email = payload.email.trim()
    const password = payload.password

    if (!name) {
      return { success: false, message: '请填写显示名称。' }
    }
    if (!isValidEmail(email)) {
      return { success: false, message: '请输入正确的邮箱地址。' }
    }
    if (!isStrongPassword(password)) {
      return { success: false, message: '密码至少 8 位，且需包含字母和数字。' }
    }
    if (state.users.some(user => normalize(user.email) === normalize(email))) {
      return { success: false, message: '该邮箱已经被注册。' }
    }

    const domain = getDomain(email)
    const domainAllowed = !state.registerPolicy.whitelistMode ||
      state.registerPolicy.allowedDomains.map(normalize).includes(domain)

    if (state.registerPolicy.requireEmailVerification) {
      const verify = state.verificationCodes[`register:${normalize(email)}`]
      if (!verify || verify.code !== (payload.code ?? '').trim()) {
        return { success: false, message: '邮箱验证码错误或已过期。' }
      }
    }

    const canDirectRegister = state.registerPolicy.allowGuestSelfRegister && domainAllowed
    if (!canDirectRegister && !state.registerPolicy.allowGuestApplications) {
      return { success: false, message: '当前系统不开放自助注册或申请，请联系管理员。' }
    }

    const nextUser: AccountUser = {
      id: uid('user'),
      role: 'guest',
      status: canDirectRegister ? 'active' : 'pending',
      name,
      email,
      avatar: payload.avatar,
      password,
      createdAt: nowIso(),
      joinedVia: canDirectRegister ? 'self-register' : 'admin-approve',
      loginCodeEnabled: true,
    }

    setState(prev => {
      const pruned = pruneState(prev)
      let nextState: AccountSystemState = {
        ...pruned,
        users: [...pruned.users, nextUser],
        verificationCodes: Object.fromEntries(
          Object.entries(pruned.verificationCodes).filter(([key]) => key !== `register:${normalize(email)}`),
        ),
      }

      if (!canDirectRegister) {
        nextState = {
          ...nextState,
          requests: [
            {
              id: uid('request'),
              type: 'guest-registration',
              applicantId: nextUser.id,
              applicantName: nextUser.name,
              applicantEmail: nextUser.email,
              desiredRole: 'guest',
              reason: payload.reason?.trim() || '申请创建访客账号',
              createdAt: nowIso(),
              status: 'pending',
            },
            ...nextState.requests,
          ],
        }
      }

      return recordAudit(
        nextState,
        canDirectRegister ? 'register-direct' : 'register-apply',
        `${nextUser.email} ${canDirectRegister ? '直接注册为访客' : '提交访客注册申请'}`,
      )
    })

    return {
      success: true,
      message: canDirectRegister ? '访客账号已创建，请返回登录。' : '注册申请已提交，等待管理员审核。',
      data: { mode: canDirectRegister ? 'registered' : 'applied' },
    }
  }

  const updateProfile = (payload: ProfilePayload): OperationResult => {
    if (!currentUser) {
      return { success: false, message: '请先登录。' }
    }
    if (!payload.name.trim()) {
      return { success: false, message: '显示名称不能为空。' }
    }

    setState(prev => recordAudit({
      ...pruneState(prev),
      users: prev.users.map(user => (
        user.id === currentUser.id
          ? {
              ...user,
              name: payload.name.trim(),
              avatar: payload.avatar,
            }
          : user
      )),
    }, 'profile-update', `${currentUser.email} 更新了个人资料`))

    return { success: true, message: '个人资料已更新。' }
  }

  const changePassword = (payload: PasswordPayload): OperationResult => {
    if (!currentUser) {
      return { success: false, message: '请先登录。' }
    }
    if (currentUser.role === 'admin') {
      return { success: false, message: '管理员账号使用系统 Token 登录，不在这里修改密码。' }
    }
    if (currentUser.password !== payload.currentPassword) {
      return { success: false, message: '当前密码不正确。' }
    }
    if (!isStrongPassword(payload.nextPassword)) {
      return { success: false, message: '新密码至少 8 位，且需包含字母和数字。' }
    }
    const key = `sensitive:${currentUser.id}:password`
    const verify = state.verificationCodes[key]
    if (!verify || verify.code !== payload.code.trim()) {
      return { success: false, message: '安全验证码错误或已过期。' }
    }

    setState(prev => {
      const pruned = pruneState(prev)
      return recordAudit({
        ...pruned,
        users: prev.users.map(user => (
          user.id === currentUser.id
            ? { ...user, password: payload.nextPassword }
            : user
        )),
        verificationCodes: Object.fromEntries(
          Object.entries(pruned.verificationCodes).filter(([codeKey]) => codeKey !== key),
        ),
      }, 'password-change', `${currentUser.email} 修改了登录密码`)
    })

    return { success: true, message: '登录密码已更新。' }
  }

  const requestMemberUpgrade = (reason: string): OperationResult => {
    if (!currentUser) {
      return { success: false, message: '请先登录。' }
    }
    if (currentUser.role !== 'guest') {
      return { success: false, message: '当前账号不是访客，无需申请升级。' }
    }
    if (!state.registerPolicy.allowMemberUpgradeApplications) {
      return { success: false, message: '管理员已关闭成员升级申请。' }
    }
    if (!reason.trim()) {
      return { success: false, message: '请填写申请理由。' }
    }
    const existed = state.requests.some(request =>
      request.type === 'member-upgrade' &&
      request.applicantId === currentUser.id &&
      request.status === 'pending',
    )
    if (existed) {
      return { success: false, message: '你已经提交过升级申请，请等待管理员处理。' }
    }

    setState(prev => recordAudit({
      ...pruneState(prev),
      requests: [
        {
          id: uid('request'),
          type: 'member-upgrade',
          applicantId: currentUser.id,
          applicantName: currentUser.name,
          applicantEmail: currentUser.email,
          desiredRole: 'member',
          reason: reason.trim(),
          createdAt: nowIso(),
          status: 'pending',
        },
        ...prev.requests,
      ],
    }, 'member-upgrade-request', `${currentUser.email} 提交了成员升级申请`))

    return { success: true, message: '升级申请已提交。' }
  }

  const approveRequest = (requestId: string): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以审批申请。' }
    }
    const request = state.requests.find(item => item.id === requestId)
    if (!request || request.status !== 'pending') {
      return { success: false, message: '申请不存在或已处理。' }
    }

    setState(prev => {
      const pruned = pruneState(prev)
      const users: AccountUser[] = pruned.users.map((user): AccountUser => {
        if (user.id !== request.applicantId) return user
        if (request.type === 'guest-registration') {
          return { ...user, status: 'active', role: 'guest', joinedVia: 'admin-approve' as const }
        }
        return { ...user, role: 'member' }
      })

      return recordAudit({
        ...pruned,
        users,
        requests: pruned.requests.map(item => (
          item.id === requestId ? { ...item, status: 'approved' } : item
        )),
      }, 'request-approve', `${request.applicantEmail} 的 ${request.desiredRole} 申请已批准`)
    })

    return { success: true, message: '申请已批准。' }
  }

  const rejectRequest = (requestId: string): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以驳回申请。' }
    }
    const request = state.requests.find(item => item.id === requestId)
    if (!request || request.status !== 'pending') {
      return { success: false, message: '申请不存在或已处理。' }
    }

    setState(prev => recordAudit({
      ...pruneState(prev),
      requests: prev.requests.map(item => (
        item.id === requestId ? { ...item, status: 'rejected' } : item
      )),
    }, 'request-reject', `${request.applicantEmail} 的 ${request.desiredRole} 申请已驳回`))

    return { success: true, message: '申请已驳回。' }
  }

  const setUserRole = (userId: string, role: Exclude<AccountRole, 'admin'>): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以调整账号等级。' }
    }
    const target = state.users.find(user => user.id === userId)
    if (!target) {
      return { success: false, message: '目标账号不存在。' }
    }
    if (target.role === 'admin') {
      return { success: false, message: '管理员账号请使用专用转让流程。' }
    }

    setState(prev => recordAudit({
      ...pruneState(prev),
      users: prev.users.map(user => (
        user.id === userId
          ? { ...user, role, status: 'active' }
          : user
      )),
    }, 'role-change', `${target.email} 被调整为 ${ROLE_LABELS[role]}`))

    return { success: true, message: `已将账号调整为${ROLE_LABELS[role]}。` }
  }

  const setRolePagePermission = (role: 'member' | 'guest', page: Page, allowed: boolean): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以调整权限模板。' }
    }
    setState(prev => recordAudit({
      ...pruneState(prev),
      roleTemplates: {
        ...prev.roleTemplates,
        [role]: {
          ...prev.roleTemplates[role],
          pages: {
            ...prev.roleTemplates[role].pages,
            [page]: allowed,
          },
        },
      },
    }, 'page-permission-update', `${ROLE_LABELS[role]} 页面权限 ${PAGE_PERMISSION_LABELS[page]} => ${allowed ? '允许' : '禁止'}`))
    return { success: true, message: '页面权限模板已更新。' }
  }

  const setRoleActionPermission = (role: 'member' | 'guest', action: ActionPermissionKey, allowed: boolean): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以调整权限模板。' }
    }
    setState(prev => recordAudit({
      ...pruneState(prev),
      roleTemplates: {
        ...prev.roleTemplates,
        [role]: {
          ...prev.roleTemplates[role],
          actions: {
            ...prev.roleTemplates[role].actions,
            [action]: allowed,
          },
        },
      },
    }, 'action-permission-update', `${ROLE_LABELS[role]} 操作权限 ${ACTION_PERMISSION_LABELS[action]} => ${allowed ? '允许' : '禁止'}`))
    return { success: true, message: '操作权限模板已更新。' }
  }

  const updateRegisterPolicy = (patch: Partial<RegisterPolicy>): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以调整注册规则。' }
    }

    const nextDomains = patch.allowedDomains
      ? patch.allowedDomains.map(item => normalize(item)).filter(Boolean)
      : undefined

    setState(prev => recordAudit({
      ...pruneState(prev),
      registerPolicy: {
        ...prev.registerPolicy,
        ...patch,
        ...(nextDomains ? { allowedDomains: nextDomains } : {}),
      },
    }, 'register-policy-update', '管理员更新了注册与申请规则'))

    return { success: true, message: '注册规则已更新。' }
  }

  const updateAppearancePolicy = (patch: Partial<AppearancePolicy>): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有管理员可以调整个性化策略。' }
    }

    setState(prev => recordAudit({
      ...pruneState(prev),
      appearancePolicy: {
        ...prev.appearancePolicy,
        ...patch,
      },
    }, 'appearance-policy-update', '管理员更新了外观同步策略'))

    return { success: true, message: '个性化策略已更新。' }
  }

  const transferAdmin = (targetUserId: string, token: string, code: string): OperationResult => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { success: false, message: '只有当前管理员可以转让管理员权限。' }
    }
    const target = state.users.find(user => user.id === targetUserId)
    if (!target || target.status !== 'active' || target.role !== 'member') {
      return { success: false, message: '管理员只能转让给已激活的成员账号。' }
    }
    if (state.adminToken !== token.trim()) {
      return { success: false, message: '系统 Token 校验失败。' }
    }
    const key = `sensitive:${currentUser.id}:transfer-admin`
    const verify = state.verificationCodes[key]
    if (!verify || verify.code !== code.trim()) {
      return { success: false, message: '转让验证码无效。' }
    }

    setState(prev => {
      const pruned = pruneState(prev)
      return recordAudit({
        ...pruned,
        users: prev.users.map(user => {
          if (user.id === currentUser.id) return { ...user, role: 'member' }
          if (user.id === targetUserId) return { ...user, role: 'admin' }
          return user
        }),
        verificationCodes: Object.fromEntries(
          Object.entries(pruned.verificationCodes).filter(([codeKey]) => codeKey !== key),
        ),
        currentUserId: targetUserId,
      }, 'admin-transfer', `管理员权限已转让给 ${target.email}`)
    })

    return { success: true, message: '管理员权限已成功转让。' }
  }

  const value = useMemo<AccountSystemContextValue>(() => ({
    adminToken: state.adminToken,
    currentUser,
    currentAdmin,
    users,
    requests: state.requests,
    pendingRequests: state.requests.filter(request => request.status === 'pending'),
    registerPolicy: state.registerPolicy,
    appearancePolicy: state.appearancePolicy,
    roleTemplates: state.roleTemplates,
    auditTrail: state.auditTrail,
    findUserByIdentifier,
    canAccessPage,
    can,
    sendLoginCode,
    sendRegisterCode,
    sendSensitiveCode,
    activateAdminSession,
    loginLocal,
    logout,
    registerAccount,
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
  }), [
    state,
    currentAdmin,
    currentUser,
    users,
  ])

  return (
    <AccountSystemContext.Provider value={value}>
      {children}
    </AccountSystemContext.Provider>
  )
}
