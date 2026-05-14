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
  | 'deploy.manage'
  | 'knowledge.manage'
  | 'components.manage'
  | 'multi-instance.manage'
  | 'ports.manage'
  | 'settings.system'
  | 'settings.security'
  | 'accounts.manage'
  | 'appearance.customize'
  | 'quick-access.customize'
  | 'member.upgrade.request'
  | 'misc.about.access'
  | 'misc.author.access'
  | 'misc.tech.access'
  | 'misc.libs.access'
  | 'misc.license.access'
  | 'misc.components.access'
  | 'misc.webshell.access'
  | 'misc.screensaver.access'
  | 'misc.desktop-pet.access'
  | 'misc.custom-console.access'

export interface AccountUser {
  id: string
  role: AccountRole
  status: AccountStatus
  name: string
  email: string
  avatar?: string
  password: string
  createdAt: string
  joinedVia: 'seed' | 'self-register' | 'admin-approve' | 'github'
  lastLoginAt?: string
  loginCodeEnabled: boolean
  githubAdminTransferPending: boolean
  passwordConfigured: boolean
  passwordManagedByGithub: boolean
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
  ready: boolean
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
  sendLoginCode: (identifier: string) => Promise<OperationResult>
  sendRegisterCode: (email: string) => Promise<OperationResult>
  sendSensitiveCode: (purpose: string) => Promise<OperationResult>
  activateAdminSession: (identifier: string, token: string) => Promise<OperationResult>
  loginLocal: (identifier: string, password: string, code: string) => Promise<OperationResult<{ user: AccountUser }>>
  logout: () => void
  registerAccount: (payload: RegisterPayload) => Promise<OperationResult<{ mode: 'registered' | 'applied' }>>
  updateProfile: (payload: ProfilePayload) => Promise<OperationResult>
  changePassword: (payload: PasswordPayload) => Promise<OperationResult>
  requestMemberUpgrade: (reason: string) => Promise<OperationResult>
  approveRequest: (requestId: string) => Promise<OperationResult>
  rejectRequest: (requestId: string) => Promise<OperationResult>
  setUserRole: (userId: string, role: Exclude<AccountRole, 'admin'>) => Promise<OperationResult>
  setRolePagePermission: (role: 'member' | 'guest', page: Page, allowed: boolean) => Promise<OperationResult>
  setRoleActionPermission: (role: 'member' | 'guest', action: ActionPermissionKey, allowed: boolean) => Promise<OperationResult>
  updateRegisterPolicy: (patch: Partial<RegisterPolicy>) => Promise<OperationResult>
  updateAppearancePolicy: (patch: Partial<AppearancePolicy>) => Promise<OperationResult>
  transferAdmin: (targetUserId: string, token: string, code: string) => Promise<OperationResult>
  refreshAccountState: () => Promise<OperationResult<{ currentUser: AccountUser | null }>>
  replaceGithubAdmin: (token: string, confirm?: boolean) => Promise<OperationResult>
}

interface BackendAccountUser {
  id: string
  role: AccountRole
  status: AccountStatus
  name: string
  email: string
  avatar?: string
  created_at?: string
  joined_via?: AccountUser['joinedVia'] | 'github-oauth'
  last_login_at?: string
  login_code_enabled?: boolean
  github_admin_transfer_pending?: boolean
  password_configured?: boolean
  password_managed_by_github?: boolean
}

interface BackendApprovalRequest {
  id: string
  type: ApprovalRequest['type']
  applicant_id?: string
  applicant_name?: string
  applicant_email?: string
  desired_role?: ApprovalRequest['desiredRole']
  reason?: string
  created_at?: string
  status?: ApprovalRequest['status']
}

interface BackendAuditItem {
  id: string
  action: string
  detail: string
  at: string
}

interface BackendRolePermissionTemplate {
  pages?: Partial<Record<Page, boolean>>
  actions?: Partial<Record<ActionPermissionKey, boolean>>
}

interface BackendAccountStateResponse {
  success: boolean
  logged_in?: boolean
  current_user?: BackendAccountUser | null
  current_admin?: BackendAccountUser | null
  users?: BackendAccountUser[]
  requests?: BackendApprovalRequest[]
  register_policy?: {
    whitelist_mode?: boolean
    allowed_domains?: string[]
    allow_guest_self_register?: boolean
    allow_guest_applications?: boolean
    allow_member_upgrade_applications?: boolean
    require_email_verification?: boolean
  }
  appearance_policy?: {
    sync_admin_appearance?: boolean
    allow_custom_appearance?: boolean
  }
  role_templates?: Record<'member' | 'guest', BackendRolePermissionTemplate>
  audit_trail?: BackendAuditItem[]
}

const STORAGE_KEY = 'mcstart.account-system.v1'

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
  'template-workbench',
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
  'template-workbench': '模板工作台',
  settings: '设置',
  'component-download': '组件下载',
}

export const ACTION_PERMISSION_ORDER: ActionPermissionKey[] = [
  'instances.control',
  'deploy.manage',
  'knowledge.manage',
  'components.manage',
  'multi-instance.manage',
  'ports.manage',
  'settings.system',
  'settings.security',
  'accounts.manage',
  'appearance.customize',
  'quick-access.customize',
  'member.upgrade.request',
  'misc.about.access',
  'misc.author.access',
  'misc.tech.access',
  'misc.libs.access',
  'misc.license.access',
  'misc.components.access',
  'misc.webshell.access',
  'misc.screensaver.access',
  'misc.desktop-pet.access',
  'misc.custom-console.access',
]

export const ACTION_PERMISSION_LABELS: Record<ActionPermissionKey, string> = {
  'instances.control': '实例启停与快捷启动',
  'deploy.manage': '实例部署与删除',
  'knowledge.manage': '知识库上传与构建',
  'components.manage': '组件下载与清理',
  'multi-instance.manage': '多开克隆与端口调整',
  'ports.manage': '端口预留与管理',
  'settings.system': '系统设置与 AI 配置',
  'settings.security': '安全配置与 Token 管理',
  'accounts.manage': '成员管理与申请审批',
  'appearance.customize': '个性化主题/背景',
  'quick-access.customize': '自定义快捷访问',
  'member.upgrade.request': '申请升级为成员',
  'misc.about.access': '杂项 / 关于项目',
  'misc.author.access': '杂项 / 关于作者',
  'misc.tech.access': '杂项 / 技术栈',
  'misc.libs.access': '杂项 / 开源库',
  'misc.license.access': '杂项 / 开源许可',
  'misc.components.access': '杂项 / 组件下载',
  'misc.webshell.access': '杂项 / WebShell',
  'misc.screensaver.access': '杂项 / 屏保',
  'misc.desktop-pet.access': '杂项 / 桌宠',
  'misc.custom-console.access': '杂项 / 自定义控制台',
}

const AccountSystemContext = createContext<AccountSystemContextValue | null>(null)

function nowIso() {
  return new Date().toISOString()
}

function normalize(value: string) {
  return value.trim().toLowerCase()
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
  memberPages['template-workbench'] = true
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
  memberActions['deploy.manage'] = true
  memberActions['knowledge.manage'] = true
  memberActions['multi-instance.manage'] = true
  memberActions['ports.manage'] = true
  memberActions['appearance.customize'] = true
  memberActions['quick-access.customize'] = true
  memberActions['misc.about.access'] = true
  memberActions['misc.author.access'] = true
  memberActions['misc.tech.access'] = true
  memberActions['misc.libs.access'] = true
  memberActions['misc.license.access'] = true
  memberActions['misc.components.access'] = true
  memberActions['misc.screensaver.access'] = true
  memberActions['misc.desktop-pet.access'] = true

  const guestActions = createEmptyActionPermissions()
  guestActions['appearance.customize'] = true
  guestActions['quick-access.customize'] = true
  guestActions['member.upgrade.request'] = true
  guestActions['misc.about.access'] = true
  guestActions['misc.author.access'] = true
  guestActions['misc.tech.access'] = true
  guestActions['misc.libs.access'] = true
  guestActions['misc.license.access'] = true
  guestActions['misc.components.access'] = true
  guestActions['misc.screensaver.access'] = true
  guestActions['misc.desktop-pet.access'] = true

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
        githubAdminTransferPending: false,
        passwordConfigured: false,
        passwordManagedByGithub: false,
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
    adminToken: defaults.adminToken,
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

export function getAvatarFallback(name: string, email: string) {
  const base = name.trim() || email.trim() || '访客'
  return base.slice(0, 2).toUpperCase()
}

function mapBackendUser(user: BackendAccountUser | null | undefined): AccountUser | null {
  if (!user) return null
  const joinedVia = user.joined_via === 'github-oauth' ? 'github' : (user.joined_via ?? 'seed')
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? '',
    password: '',
    createdAt: user.created_at ?? '',
    joinedVia,
    lastLoginAt: user.last_login_at ?? undefined,
    loginCodeEnabled: Boolean(user.login_code_enabled),
    githubAdminTransferPending: Boolean(user.github_admin_transfer_pending),
    passwordConfigured: Boolean(user.password_configured),
    passwordManagedByGithub: Boolean(user.password_managed_by_github),
  }
}

function mapBackendRequest(request: BackendApprovalRequest): ApprovalRequest {
  return {
    id: request.id,
    type: request.type,
    applicantId: request.applicant_id ?? '',
    applicantName: request.applicant_name ?? '',
    applicantEmail: request.applicant_email ?? '',
    desiredRole: request.desired_role ?? 'guest',
    reason: request.reason ?? '',
    createdAt: request.created_at ?? '',
    status: request.status ?? 'pending',
  }
}

function mapBackendState(payload: BackendAccountStateResponse, previousState?: AccountSystemState): AccountSystemState {
  const defaults = createDefaultState()
  const users = (payload.users ?? []).map(mapBackendUser).filter(Boolean) as AccountUser[]
  const mappedCurrentUser = mapBackendUser(payload.current_user)
  const currentUserId = mappedCurrentUser?.id ?? null
  const roleTemplates = payload.role_templates ?? ({} as NonNullable<BackendAccountStateResponse['role_templates']>)

  return normalizeState({
    adminToken: mappedCurrentUser?.role === 'admin' ? (previousState?.adminToken ?? '') : '',
    users: users.length ? users : defaults.users,
    currentUserId,
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
      whitelistMode: payload.register_policy?.whitelist_mode ?? defaults.registerPolicy.whitelistMode,
      allowedDomains: payload.register_policy?.allowed_domains ?? defaults.registerPolicy.allowedDomains,
      allowGuestSelfRegister: payload.register_policy?.allow_guest_self_register ?? defaults.registerPolicy.allowGuestSelfRegister,
      allowGuestApplications: payload.register_policy?.allow_guest_applications ?? defaults.registerPolicy.allowGuestApplications,
      allowMemberUpgradeApplications: payload.register_policy?.allow_member_upgrade_applications ?? defaults.registerPolicy.allowMemberUpgradeApplications,
      requireEmailVerification: payload.register_policy?.require_email_verification ?? defaults.registerPolicy.requireEmailVerification,
    },
    appearancePolicy: {
      syncAdminAppearance: payload.appearance_policy?.sync_admin_appearance ?? defaults.appearancePolicy.syncAdminAppearance,
      allowCustomAppearance: payload.appearance_policy?.allow_custom_appearance ?? defaults.appearancePolicy.allowCustomAppearance,
    },
    verificationCodes: {},
    loginGuards: {},
    requests: (payload.requests ?? []).map(mapBackendRequest),
    auditTrail: (payload.audit_trail ?? []).map(item => ({
      id: item.id,
      action: item.action,
      detail: item.detail,
      at: item.at,
    })),
  })
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
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem('webui_token')
      const persisted = pruneState(state)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...persisted,
        adminToken: '',
      }))
    } catch {
      // ignore persistence errors
    }
  }, [state])

  const applyBackendState = (payload: BackendAccountStateResponse, options?: { adminToken?: string; clearAdminToken?: boolean }) => {
    setState(prev => {
      const next = mapBackendState(payload, prev)
      return {
        ...next,
        adminToken: options?.clearAdminToken
          ? ''
          : (options?.adminToken ?? next.adminToken ?? prev.adminToken),
      }
    })
  }

  const requestJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) as T : {} as T
    if (!response.ok) {
      const message = typeof (data as any)?.detail === 'string'
        ? (data as any).detail
        : typeof (data as any)?.message === 'string'
          ? (data as any).message
          : `HTTP ${response.status}`
      throw new Error(message)
    }
    return data
  }

  const refreshState = async (options?: { adminToken?: string; clearAdminToken?: boolean }) => {
    const data = await requestJson<BackendAccountStateResponse>('/api/account/state')
    applyBackendState(data, options)
    return data
  }

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const data = await requestJson<BackendAccountStateResponse>('/api/account/state')
        if (cancelled) return
        applyBackendState(data)
      } catch {
        if (cancelled) return
        setState(prev => ({
          ...prev,
          adminToken: '',
          currentUserId: null,
          verificationCodes: {},
          loginGuards: {},
        }))
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

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

  const sendLoginCode = async (identifier: string): Promise<OperationResult> => {
    try {
      return await requestJson<OperationResult>('/api/account/send-login-code', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      })
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '发送登录验证码失败。' }
    }
  }

  const sendRegisterCode = async (email: string): Promise<OperationResult> => {
    try {
      return await requestJson<OperationResult>('/api/account/send-register-code', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '发送注册验证码失败。' }
    }
  }

  const sendSensitiveCode = async (purpose: string): Promise<OperationResult> => {
    try {
      return await requestJson<OperationResult>('/api/account/send-sensitive-code', {
        method: 'POST',
        body: JSON.stringify({ purpose }),
      })
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '发送安全验证码失败。' }
    }
  }

  const activateAdminSession = async (identifier: string, token: string): Promise<OperationResult> => {
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

    try {
      const result = await requestJson<OperationResult>('/api/account/login', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim() }),
      })
      if (result.success) {
        await refreshState({ adminToken: token.trim() })
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '管理员登录失败。' }
    }
  }

  const loginLocal = async (identifier: string, password: string, code: string): Promise<OperationResult<{ user: AccountUser }>> => {
    try {
      const result = await requestJson<OperationResult<{ user: BackendAccountUser }>>('/api/account/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, code }),
      })
      if (result.success) {
        await refreshState({ clearAdminToken: true })
      }
      return {
        ...result,
        data: result.data?.user ? { user: mapBackendUser(result.data.user)! } : undefined,
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '账号登录失败。' }
    }
  }

  const logout = () => {
    setState(prev => ({
      ...pruneState(prev),
      adminToken: '',
      currentUserId: null,
    }))
  }

  const registerAccount = async (payload: RegisterPayload): Promise<OperationResult<{ mode: 'registered' | 'applied' }>> => {
    try {
      const result = await requestJson<OperationResult<{ mode: 'registered' | 'applied' }>>('/api/account/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (result.success) {
        await refreshState({ clearAdminToken: true })
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '注册失败。' }
    }
  }

  const updateProfile = async (payload: ProfilePayload): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/profile', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '个人资料更新失败。' }
    }
  }

  const changePassword = async (payload: PasswordPayload): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: payload.currentPassword,
          next_password: payload.nextPassword,
          code: payload.code,
        }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '修改密码失败。' }
    }
  }

  const requestMemberUpgrade = async (reason: string): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/request-upgrade', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '提交升级申请失败。' }
    }
  }

  const approveRequest = async (requestId: string): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>(`/api/account/requests/${requestId}/approve`, {
        method: 'POST',
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '审批申请失败。' }
    }
  }

  const rejectRequest = async (requestId: string): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>(`/api/account/requests/${requestId}/reject`, {
        method: 'POST',
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '驳回申请失败。' }
    }
  }

  const setUserRole = async (userId: string, role: Exclude<AccountRole, 'admin'>): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>(`/api/account/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '调整账号等级失败。' }
    }
  }

  const setRolePagePermission = async (role: 'member' | 'guest', page: Page, allowed: boolean): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/permissions/page', {
        method: 'POST',
        body: JSON.stringify({ role, page, allowed }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '更新页面权限失败。' }
    }
  }

  const setRoleActionPermission = async (role: 'member' | 'guest', action: ActionPermissionKey, allowed: boolean): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/permissions/action', {
        method: 'POST',
        body: JSON.stringify({ role, action, allowed }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '更新操作权限失败。' }
    }
  }

  const updateRegisterPolicy = async (patch: Partial<RegisterPolicy>): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/policies/register', {
        method: 'POST',
        body: JSON.stringify({
          whitelist_mode: patch.whitelistMode,
          allowed_domains: patch.allowedDomains,
          allow_guest_self_register: patch.allowGuestSelfRegister,
          allow_guest_applications: patch.allowGuestApplications,
          allow_member_upgrade_applications: patch.allowMemberUpgradeApplications,
          require_email_verification: patch.requireEmailVerification,
        }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '更新注册规则失败。' }
    }
  }

  const updateAppearancePolicy = async (patch: Partial<AppearancePolicy>): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/policies/appearance', {
        method: 'POST',
        body: JSON.stringify({
          sync_admin_appearance: patch.syncAdminAppearance,
          allow_custom_appearance: patch.allowCustomAppearance,
        }),
      })
      if (result.success) {
        await refreshState()
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '更新个性化策略失败。' }
    }
  }

  const transferAdmin = async (targetUserId: string, token: string, code: string): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/transfer-admin', {
        method: 'POST',
        body: JSON.stringify({
          target_user_id: targetUserId,
          token,
          code,
        }),
      })
      if (result.success) {
        await refreshState({ clearAdminToken: true })
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '管理员转让失败。' }
    }
  }

  const refreshAccountState = async (): Promise<OperationResult<{ currentUser: AccountUser | null }>> => {
    try {
      const data = await refreshState({ clearAdminToken: true })
      return {
        success: true,
        message: '账号状态已刷新。',
        data: { currentUser: mapBackendUser(data.current_user) },
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '刷新账号状态失败。' }
    }
  }

  const replaceGithubAdmin = async (token: string, confirm = true): Promise<OperationResult> => {
    try {
      const result = await requestJson<OperationResult>('/api/account/github/replace-admin', {
        method: 'POST',
        body: JSON.stringify({ confirm, token }),
      })
      if (result.success) {
        await refreshState({ clearAdminToken: true })
      }
      return result
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '替换管理员失败。' }
    }
  }

  const value = useMemo<AccountSystemContextValue>(() => ({
    ready,
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
    refreshAccountState,
    replaceGithubAdmin,
  }), [
    ready,
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
