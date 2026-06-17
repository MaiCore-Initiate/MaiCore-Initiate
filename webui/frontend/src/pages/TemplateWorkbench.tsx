import { useCallback, useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'
import CreateProjectDialog, { type CreatedProjectInfo } from '../components/CreateProjectDialog'
import EditProjectDialog, { type EditableProject } from '../components/EditProjectDialog'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog'
import ProjectContextMenu, { type ProjectContextAction } from '../components/ProjectContextMenu'
import {
  CirclePlus,
  Clock,
  File,
  Folder,
  Globe,
  Plus,
  Search,
  Star,
  Upload,
} from 'lucide-react'
import { CardSquaresIcon, ListDashesIcon } from '../components/icons/SidebarIcons'
import { getFileIconByName } from './workbench-canvas/blocks/fileIcons'

export type TemplateWorkbenchSection = 'recent' | 'my-templates' | 'market' | 'starred'
export type TemplateWorkbenchItemType = 'deployment-flow' | 'folder' | 'script' | 'archive'
export type TemplateWorkbenchLayout = 'card' | 'list'
type TemplateWorkbenchRoute =
  | { type: 'home' }
  | { type: 'project'; sequence: string; dir: string }
type WorkbenchItemRole = 'project' | 'template-file' | 'imported-file' | 'imported-folder'
type WorkbenchFileKind = 'folder' | 'code' | 'binary' | 'text' | 'log' | 'template'

export interface TemplateWorkbenchItem {
  id: string
  name: string
  type: TemplateWorkbenchItemType
  updatedAt: string
  role?: WorkbenchItemRole
  fileKind?: WorkbenchFileKind
  sizeLabel?: string
  fileName?: string
  sourcePath?: string
  childCount?: number
  templatePath?: string
  sequence?: string
  cover?: string | null
  forceFolder?: boolean | null
  displayMode?: 'folder' | 'card'
  fileCount?: number
}

interface WorkbenchProjectIndex {
  sequence: string
  mod_name: string
  path: string
  mod_id?: string
  description?: string
  author?: string
  cover?: string | null
  files?: Array<{
    id: string
    name: string
    path: string
    size: number
    modifiedAt: string
    binary: boolean
    language: string
  }>
  workbench_meta?: {
    fileImportList?: string[]
    modId?: string
  } | null
  force_folder?: boolean | null
  display_mode?: 'folder' | 'card'
}

export interface TemplateWorkbenchSlots {
  sidebarFooter?: ReactNode
  toolbarTrailing?: ReactNode
  contentLeading?: ReactNode
  contentTrailing?: ReactNode
}

export interface TemplateWorkbenchProps {
  items?: TemplateWorkbenchItem[]
  slots?: TemplateWorkbenchSlots
  onCreateProject?: () => void
  onCreateFolder?: () => void
  onUploadProject?: () => void
  onImportProject?: () => void
  onOpenItem?: (item: TemplateWorkbenchItem) => void
  onOpenWorkbenchCanvas?: (sequence: string) => void
  onSelectSection?: (section: TemplateWorkbenchSection) => void
  onReturnToSource?: () => void
}

const defaultItems: TemplateWorkbenchItem[] = []

const sidebarItems: Array<{ id: TemplateWorkbenchSection; label: string; icon: typeof Clock; top: number }> = [
  { id: 'recent', label: '最近', icon: Clock, top: 96 },
  { id: 'my-templates', label: '我的模板', icon: File, top: 149 },
  { id: 'market', label: '资源集市', icon: Globe, top: 202 },
]

// 卡片网格布局：5 列等距、行高 250px；top 起始 306 与原视觉一致。
// 用 useMemo 在 contentItems 变化时按 index 算 left/top，避免硬编码固定 4 个位置。
const CARD_COLUMNS = 5
const CARD_LEFT_START = 400
const CARD_LEFT_STEP = 293
const CARD_TOP_START = 306
const CARD_TOP_STEP = 250

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
const layoutCookieName = 'template_workbench_layout'

function readLayoutCookie(): TemplateWorkbenchLayout {
  if (typeof document === 'undefined') return 'card'
  const part = document.cookie.split('; ').find(item => item.startsWith(`${layoutCookieName}=`))
  const value = part ? decodeURIComponent(part.split('=').slice(1).join('=')) : ''
  return value === 'list' ? 'list' : 'card'
}

function writeLayoutCookie(value: TemplateWorkbenchLayout) {
  if (typeof document === 'undefined') return
  document.cookie = `${layoutCookieName}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`
}

function formatFileSize(size?: number) {
  if (typeof size !== 'number' || Number.isNaN(size)) return '0 B'
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

function extOf(name: string) {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function classifyFile(name: string, binary?: boolean): WorkbenchFileKind {
  const ext = extOf(name)
  if (binary || ext === 'jar' || ext === 'exe') return 'binary'
  if (ext === 'txt') return 'text'
  if (ext === 'log' || ext === 'jsonl') return 'log'
  if (ext === 'toml') return 'template'
  return 'code'
}

function fileKindLabel(kind?: WorkbenchFileKind) {
  const labels: Record<WorkbenchFileKind, string> = {
    folder: '文件夹',
    code: '代码文件',
    binary: '二进制文件',
    text: '文本文档',
    log: '日志文件',
    template: '部署流程',
  }
  return labels[kind ?? 'code']
}

function basename(path: string) {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? path
}

function normalizeWorkbenchPath(path?: string | null) {
  return (path ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function parentWorkbenchPath(path: string) {
  const normalized = normalizeWorkbenchPath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  parts.pop()
  return parts.join('/')
}

function templateNameForProject(project: WorkbenchProjectIndex) {
  const pathName = basename(project.path)
  if (pathName.toLowerCase().endsWith('.toml')) return pathName
  const modId = project.mod_id || project.workbench_meta?.modId || project.mod_name || 'deployment-template'
  return `${modId}.toml`
}

function projectCoverUrl(project: WorkbenchProjectIndex, version = 0) {
  if (!resolveProjectDeploymentFlowCover(project)) return null
  const base = `/api/template-workbench/projects/${encodeURIComponent(project.sequence)}/cover`
  // 用 version 做 cache buster：替换或保留 cover 时递增 version，强制 <img> 重新加载同名 cover 文件
  return version > 0 ? `${base}?v=${version}` : base
}

// 取项目内最新的「部署流程」封面。当前一个项目对应一个 toml，
// 所以就是 project.cover；将来若支持一个项目多个 toml，
// 在这里按 updatedAt 排序取最新那张即可。
function resolveProjectDeploymentFlowCover(project: WorkbenchProjectIndex): string | null | undefined {
  return project.cover
}

function projectToItem(project: WorkbenchProjectIndex, coverVersion = 0): TemplateWorkbenchItem {
  const fileCount = project.files?.length ?? 0
  const coverUrl = projectCoverUrl(project, coverVersion)
  const displayMode = project.display_mode ?? (fileCount > 0 || project.cover ? 'folder' : 'card')
  return {
    id: project.sequence,
    name: project.mod_name || '未命名',
    type: 'deployment-flow',
    role: 'project',
    fileKind: displayMode === 'folder' ? 'folder' : 'template',
    updatedAt: '已保存',
    templatePath: project.path,
    sequence: project.sequence,
    cover: coverUrl,
    forceFolder: project.force_folder ?? null,
    displayMode,
    fileCount,
  }
}

function createTemplateFileItem(project: WorkbenchProjectIndex, coverVersion = 0): TemplateWorkbenchItem {
  const templateName = templateNameForProject(project)
  return {
    id: `${project.sequence}:template:${templateName}`,
    name: templateName,
    type: 'script',
    role: 'template-file',
    fileKind: 'template',
    fileName: templateName,
    updatedAt: '已保存',
    sequence: project.sequence,
    cover: projectCoverUrl(project, coverVersion),
    templatePath: project.path,
    sizeLabel: '模板文件',
  }
}

function createImportedFileItem(project: WorkbenchProjectIndex, file: NonNullable<WorkbenchProjectIndex['files']>[number]): TemplateWorkbenchItem {
  const kind = classifyFile(file.name, file.binary)
  const relpath = normalizeWorkbenchPath(file.path?.trim() || file.name)
  const displayName = basename(relpath)
  return {
    id: `${project.sequence}:file:${file.id || relpath}`,
    name: displayName,
    type: kind === 'binary' ? 'archive' : 'script',
    role: 'imported-file',
    fileKind: kind,
    fileName: displayName,
    sourcePath: relpath,
    updatedAt: formatFileSize(file.size),
    sizeLabel: formatFileSize(file.size),
    sequence: project.sequence,
  }
}

function createImportedFolderItem(project: WorkbenchProjectIndex, dirRelpath: string, fileCount: number): TemplateWorkbenchItem {
  // dirRelpath 形如 "version/JSON"，name 显示最后一段（"JSON"）
  const parts = dirRelpath.split('/').filter(Boolean)
  const tail = parts[parts.length - 1] ?? dirRelpath
  return {
    id: `${project.sequence}:folder:${dirRelpath}`,
    name: tail,
    type: 'folder',
    role: 'imported-folder',
    fileKind: 'folder',
    fileName: tail,
    sourcePath: dirRelpath,
    updatedAt: `${fileCount} 个文件`,
    sizeLabel: `${fileCount} 个文件`,
    childCount: fileCount,
    sequence: project.sequence,
  }
}

function FileCard({
  item,
  left,
  top,
  onOpen,
  onContextMenu,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
  onContextMenu?: (event: ReactMouseEvent, item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      onContextMenu={event => {
        if (!onContextMenu) return
        event.preventDefault()
        onContextMenu(event, item)
      }}
      className="absolute overflow-hidden rounded-[10px] border text-left transition-colors hover:bg-[var(--twb-hover)]"
      style={{ left, top, width: 272, height: 206.72, borderColor: 'var(--twb-card-border)', color: 'var(--twb-text)' }}
    >
      {item.cover ? (
        <div
          className="absolute inset-x-[-1px] top-[-1px] rounded-t-[10px] bg-cover bg-center"
          style={{
            height: 153,
            backgroundImage: `url("${item.cover}")`,
            backgroundColor: 'var(--twb-bg)',
          }}
        />
      ) : (
        <div
          className="absolute inset-x-[-1px] top-[-1px] rounded-t-[10px]"
          style={{ height: 153, background: 'var(--twb-bg)' }}
        />
      )}
      <div
        className="absolute inset-x-[-1px] bottom-[-1px] rounded-b-[10px] border"
        style={{ height: 53.72, borderColor: 'var(--twb-card-border)', background: 'var(--twb-bg)' }}
      />
      <div className="absolute" style={{ left: 7, top: 162 }}>
        <div className="leading-none" style={{ fontFamily: font, fontSize: 18, fontWeight: 700 }}>{item.name}</div>
        <div className="mt-[7px] leading-none" style={{ color: 'var(--twb-muted)', fontFamily: font, fontSize: 15, fontWeight: 300 }}>{item.updatedAt}</div>
      </div>
      <Star size={25} strokeWidth={1.5} className="absolute" style={{ right: 7, bottom: 18 }} />
    </button>
  )
}

function ImportedFileCard({
  item,
  left,
  top,
  onOpen,
  onContextMenu,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
  onContextMenu?: (event: ReactMouseEvent, item: TemplateWorkbenchItem) => void
}) {
  const Icon = getFileIconByName(item.fileName ?? item.name)
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      onContextMenu={event => {
        if (!onContextMenu) return
        event.preventDefault()
        onContextMenu(event, item)
      }}
      className="absolute overflow-hidden rounded-[10px] border text-left transition-colors hover:bg-[var(--twb-hover)]"
      style={{ left, top, width: 272, height: 206.72, borderColor: 'var(--twb-card-border)', color: 'var(--twb-text)' }}
    >
      {item.cover ? (
        <div
          className="absolute inset-x-[-1px] top-[-1px] rounded-t-[10px] bg-cover bg-center"
          style={{ height: 153, backgroundImage: `url("${item.cover}")` }}
        />
      ) : (
        <div className="absolute inset-x-[-1px] top-[-1px] flex items-center justify-center rounded-t-[10px]" style={{ height: 153, background: 'var(--twb-bg)' }}>
          <Icon size={78} />
        </div>
      )}
      <div
        className="absolute inset-x-[-1px] bottom-[-1px] rounded-b-[10px] border"
        style={{ height: 53.72, borderColor: 'var(--twb-card-border)', background: 'var(--twb-bg)' }}
      />
      <div className="absolute min-w-0" style={{ left: 7, right: 48, top: 162 }}>
        <div className="truncate leading-none" style={{ fontFamily: font, fontSize: 18, fontWeight: 700 }}>{item.name}</div>
        <div className="mt-[7px] leading-none" style={{ color: 'var(--twb-muted)', fontFamily: font, fontSize: 15, fontWeight: 300 }}>{item.sizeLabel ?? item.updatedAt}</div>
      </div>
    </button>
  )
}

function FolderCard({
  item,
  left,
  top,
  onOpen,
  onContextMenu,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
  onContextMenu?: (event: ReactMouseEvent, item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      onContextMenu={event => {
        if (!onContextMenu) return
        event.preventDefault()
        onContextMenu(event, item)
      }}
      className="absolute text-left transition-transform hover:-translate-y-[1px]"
      style={{ left, top, width: 273, height: 207, color: 'var(--twb-text)' }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 273 207" fill="none" aria-hidden>
        <path
          d="M12 1H88C90.4 1 92.7 1.8 94.7 3.2L134 31.5C136 32.9 138.3 33.7 140.7 33.7H261C267.1 33.7 272 38.6 272 44.7V195C272 201.1 267.1 206 261 206H12C5.9 206 1 201.1 1 195V12C1 5.9 5.9 1 12 1Z"
          fill="var(--twb-folder-fill)"
          stroke="var(--twb-folder-border)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M2 154H271V195C271 200.5 266.5 205 261 205H12C6.5 205 2 200.5 2 195V154Z" fill="var(--twb-folder-band)" />
        <path d="M2 154H271" stroke="var(--twb-card-border)" />
      </svg>
      <div className="absolute" style={{ left: 7, top: 162 }}>
        <div className="leading-none" style={{ fontFamily: font, fontSize: 18, fontWeight: 700 }}>{item.name}</div>
        <div className="mt-[7px] leading-none" style={{ color: 'var(--twb-muted)', fontFamily: font, fontSize: 15, fontWeight: 300 }}>{item.updatedAt}</div>
      </div>
      {typeof item.childCount === 'number' && (
        <div className="absolute leading-none" style={{ right: 20, top: 170, fontFamily: font, fontSize: 20, fontWeight: 500 }}>
          +{item.childCount}
        </div>
      )}
    </button>
  )
}

function ProjectFolderCard({
  item,
  left,
  top,
  onOpen,
  onContextMenu,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
  onContextMenu?: (event: ReactMouseEvent, item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      onContextMenu={event => {
        if (!onContextMenu) return
        event.preventDefault()
        onContextMenu(event, item)
      }}
      className="absolute text-left transition-transform hover:-translate-y-[1px]"
      style={{ left, top, width: 273, height: 207, color: 'var(--twb-text)' }}
    >
      <svg className="absolute inset-0 z-[1] h-full w-full" viewBox="0 0 273 207" fill="none" aria-hidden>
        <path
          d="M12 1H88C90.4 1 92.7 1.8 94.7 3.2L134 31.5C136 32.9 138.3 33.7 140.7 33.7H261C267.1 33.7 272 38.6 272 44.7V195C272 201.1 267.1 206 261 206H12C5.9 206 1 201.1 1 195V12C1 5.9 5.9 1 12 1Z"
          stroke="#FFD500"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      {/* 封面容器：z-0 放在外框描边之下；用被裁切掉信息栏部分的 folder 形状做 clipPath，超出裁切边框的部分被裁切掉（自然不覆盖信息栏） */}
      <div
        className="absolute inset-0 z-0"
        style={{
          clipPath:
            "path('M12 1H88C90.4 1 92.7 1.8 94.7 3.2L134 31.5C136 32.9 138.3 33.7 140.7 33.7H261C267.1 33.7 272 38.6 272 44.7V154H1V12C1 5.9 5.9 1 12 1Z')",
        }}
      >
        {item.cover ? (
          <img
            src={item.cover}
            alt="项目封面"
            className="h-full w-full object-cover"
            onError={event => {
              // 封面丢失时降级为 Folder 图标
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Folder size={40} strokeWidth={1.2} className="opacity-30" />
          </div>
        )}
      </div>
      {/* band 衬底：50% 透明 #FFD500；左右下角 10px 圆角以免尖角戳出 folder 外框 */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 154,
          left: 1.5,
          right: 1.5,
          bottom: 1.5,
          background: 'rgba(255, 213, 0, 0.5)',
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
        }}
      />
      <div className="absolute" style={{ left: 7, top: 162 }}>
        <div className="leading-none" style={{ fontFamily: font, fontSize: 18, fontWeight: 700 }}>{item.name}</div>
        <div className="mt-[7px] leading-none" style={{ color: 'var(--twb-muted)', fontFamily: font, fontSize: 15, fontWeight: 300 }}>{item.updatedAt}</div>
      </div>
      {typeof item.fileCount === 'number' && item.fileCount > 0 && (
        <div className="absolute leading-none" style={{ right: 20, top: 170, fontFamily: font, fontSize: 20, fontWeight: 500 }}>
          +{item.fileCount}
        </div>
      )}
    </button>
  )
}

function ProjectCard({
  item,
  left,
  top,
  onOpen,
  onContextMenu,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
  onContextMenu?: (event: ReactMouseEvent, item: TemplateWorkbenchItem) => void
}) {
  if (item.type === 'folder' || item.role === 'imported-folder') return <FolderCard item={item} left={left} top={top} onOpen={onOpen} onContextMenu={onContextMenu} />
  if (item.role === 'imported-file' || item.role === 'template-file') return <ImportedFileCard item={item} left={left} top={top} onOpen={onOpen} onContextMenu={onContextMenu} />
  if (item.displayMode === 'folder') return <ProjectFolderCard item={item} left={left} top={top} onOpen={onOpen} onContextMenu={onContextMenu} />
  return <FileCard item={item} left={left} top={top} onOpen={onOpen} onContextMenu={onContextMenu} />
}

function FolderTypeGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M4 26L4 8C4 7.98363 4.0004 7.96728 4.0012 7.95094C4.00201 7.93459 4.00321 7.91827 4.00481 7.90199C4.00642 7.8857 4.00843 7.86946 4.01083 7.85327C4.01323 7.83708 4.01602 7.82096 4.01921 7.80491C4.0224 7.78886 4.02599 7.7729 4.02996 7.75702C4.03395 7.74115 4.03831 7.72538 4.04306 7.70971C4.04781 7.69405 4.05294 7.67852 4.05845 7.66311C4.06397 7.6477 4.06986 7.63244 4.07613 7.61731C4.08238 7.6022 4.08901 7.58724 4.09601 7.57245C4.10301 7.55765 4.11037 7.54303 4.11807 7.5286C4.12579 7.51417 4.13386 7.49993 4.14227 7.4859C4.15068 7.47186 4.15943 7.45803 4.16853 7.44443C4.17763 7.43082 4.18705 7.41744 4.19679 7.4043C4.20654 7.39116 4.2166 7.37826 4.22699 7.36561C4.23737 7.35295 4.24806 7.34056 4.25905 7.32844C4.27004 7.31631 4.28132 7.30446 4.29289 7.29289C4.30446 7.28132 4.31631 7.27004 4.32844 7.25905C4.34056 7.24806 4.35295 7.23737 4.36561 7.22699C4.37826 7.2166 4.39116 7.20654 4.4043 7.19679C4.41744 7.18704 4.43082 7.17762 4.44443 7.16853C4.45803 7.15943 4.47186 7.15068 4.4859 7.14227C4.49993 7.13386 4.51417 7.12579 4.5286 7.11807C4.54303 7.11037 4.55765 7.10301 4.57245 7.09601C4.58724 7.08901 4.6022 7.08238 4.61731 7.07613C4.63244 7.06986 4.6477 7.06397 4.66311 7.05845C4.67852 7.05294 4.69405 7.04781 4.70971 7.04306C4.72538 7.03831 4.74115 7.03395 4.75702 7.02996C4.7729 7.02599 4.78886 7.0224 4.80491 7.01921C4.82096 7.01602 4.83708 7.01323 4.85327 7.01083C4.86946 7.00843 4.8857 7.00642 4.90199 7.00481C4.91827 7.00321 4.93459 7.00201 4.95094 7.0012C4.96728 7.0004 4.98363 7 5 7L11.6625 7C11.7162 7.00023 11.7696 7.00469 11.8226 7.0134C11.8756 7.02212 11.9275 7.03497 11.9785 7.05195C12.0295 7.06893 12.0788 7.08984 12.1264 7.11468C12.174 7.13951 12.2194 7.16795 12.2625 7.2L15.7375 9.8C15.7806 9.83205 15.826 9.86049 15.8736 9.88532C15.9212 9.91016 15.9705 9.93106 16.0215 9.94805C16.0724 9.96504 16.1244 9.97789 16.1774 9.9866C16.2304 9.99531 16.2837 9.99977 16.3375 10L25 10C25.0164 10 25.0327 10.0004 25.0491 10.0012C25.0655 10.002 25.0818 10.0032 25.098 10.0048C25.1144 10.0064 25.1306 10.0084 25.1467 10.0108C25.1629 10.0132 25.179 10.016 25.1951 10.0192C25.2111 10.0224 25.2271 10.026 25.243 10.03C25.2589 10.0339 25.2746 10.0383 25.2903 10.0431C25.3059 10.0478 25.3215 10.0529 25.3369 10.0584C25.3522 10.064 25.3675 10.0698 25.3826 10.0761C25.3978 10.0824 25.4128 10.089 25.4275 10.096C25.4424 10.103 25.457 10.1104 25.4714 10.1181C25.4858 10.1258 25.5 10.1339 25.5141 10.1423C25.5281 10.1507 25.542 10.1594 25.5556 10.1685C25.5693 10.1776 25.5826 10.187 25.5958 10.1968C25.6089 10.2065 25.6217 10.2166 25.6344 10.227C25.647 10.2374 25.6594 10.2481 25.6715 10.2591C25.6836 10.27 25.6955 10.2813 25.7071 10.2929C25.7188 10.3045 25.73 10.3163 25.741 10.3284C25.7519 10.3406 25.7626 10.353 25.773 10.3656C25.7834 10.3783 25.7935 10.3912 25.8032 10.4043C25.813 10.4174 25.8224 10.4308 25.8315 10.4444C25.8406 10.458 25.8494 10.4719 25.8577 10.4859C25.8661 10.4999 25.8743 10.5142 25.8819 10.5286C25.8896 10.543 25.897 10.5576 25.904 10.5724C25.911 10.5872 25.9176 10.6022 25.9239 10.6173C25.9301 10.6324 25.936 10.6477 25.9415 10.6631C25.9471 10.6785 25.9522 10.694 25.957 10.7097C25.9618 10.7254 25.9661 10.7411 25.97 10.757C25.974 10.7729 25.9776 10.7889 25.9807 10.8049C25.984 10.821 25.9867 10.8371 25.9891 10.8533C25.9915 10.8695 25.9935 10.8857 25.9951 10.902C25.9967 10.9183 25.998 10.9346 25.9988 10.9509C25.9996 10.9673 26 10.9836 26 11L26 14" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M4 26L7.75 16.625C7.75908 16.602 7.769 16.5794 7.77979 16.5571C7.79056 16.5349 7.80216 16.513 7.81458 16.4916C7.82699 16.4703 7.84019 16.4494 7.85418 16.429C7.86816 16.4086 7.8829 16.3888 7.89838 16.3695C7.91385 16.3502 7.93003 16.3315 7.9469 16.3134C7.96379 16.2953 7.98133 16.2779 7.99951 16.2611C8.0177 16.2444 8.03649 16.2283 8.05589 16.213C8.07528 16.1977 8.09522 16.1831 8.11571 16.1693C8.1362 16.1554 8.15718 16.1424 8.17865 16.1301C8.20012 16.1178 8.22202 16.1063 8.24435 16.0958C8.26669 16.0851 8.28939 16.0753 8.31245 16.0664C8.33551 16.0575 8.35889 16.0494 8.38255 16.0422C8.40621 16.0352 8.43013 16.0289 8.45426 16.0235C8.4784 16.0182 8.50271 16.0137 8.52719 16.0101C8.55166 16.0066 8.57624 16.004 8.6009 16.0023C8.62558 16.0006 8.65028 15.9998 8.675 16L14.7 16C14.7485 15.9995 14.7967 15.9956 14.8446 15.9884C14.8926 15.9812 14.9398 15.9707 14.9862 15.957C15.0328 15.9432 15.0781 15.9264 15.1222 15.9064C15.1664 15.8864 15.209 15.8634 15.25 15.8375L17.75 14.1625C17.791 14.1366 17.8336 14.1136 17.8778 14.0936C17.9219 14.0736 17.9673 14.0568 18.0138 14.043C18.0601 14.0293 18.1074 14.0188 18.1554 14.0116C18.2033 14.0044 18.2515 14.0005 18.3 14L28.6125 14C28.6321 14 28.6519 14.0006 28.6715 14.0017C28.6911 14.0029 28.7108 14.0047 28.7302 14.007C28.7499 14.0092 28.7693 14.0121 28.7886 14.0156C28.808 14.0191 28.8272 14.0232 28.8464 14.0278C28.8655 14.0323 28.8845 14.0375 28.9034 14.0433C28.9223 14.0489 28.9409 14.0552 28.9592 14.062C28.9778 14.0688 28.996 14.0762 29.014 14.0841C29.032 14.092 29.0497 14.1005 29.0674 14.1094C29.0849 14.1183 29.1021 14.1278 29.1191 14.1377C29.136 14.1477 29.1526 14.1582 29.169 14.1691C29.1854 14.18 29.2015 14.1915 29.2171 14.2034C29.2327 14.2153 29.2481 14.2277 29.263 14.2405C29.278 14.2533 29.2926 14.2665 29.3067 14.2801C29.3209 14.2938 29.3346 14.3079 29.348 14.3224C29.3614 14.3368 29.3743 14.3516 29.3866 14.3669C29.3991 14.3821 29.4111 14.3977 29.4226 14.4136C29.4342 14.4296 29.4452 14.4459 29.4559 14.4625C29.4665 14.4791 29.4765 14.496 29.486 14.5131C29.4956 14.5303 29.5046 14.5478 29.5133 14.5655C29.5219 14.5833 29.5299 14.6012 29.5374 14.6194C29.5448 14.6376 29.5518 14.656 29.5581 14.6746C29.5645 14.6932 29.5704 14.712 29.5758 14.731C29.581 14.7499 29.5858 14.769 29.5899 14.7882C29.594 14.8075 29.5976 14.8268 29.6007 14.8462C29.6038 14.8657 29.6061 14.8852 29.608 14.9049C29.6099 14.9245 29.6112 14.9441 29.6119 14.9637C29.6126 14.9834 29.6127 15.0031 29.6124 15.0227C29.6119 15.0424 29.6109 15.062 29.6092 15.0816C29.6076 15.1013 29.6055 15.1208 29.6028 15.1403C29.5999 15.1597 29.5966 15.1792 29.5928 15.1985C29.5889 15.2177 29.5844 15.2369 29.5793 15.2559C29.5742 15.275 29.5686 15.2938 29.5625 15.3125L26 26L4 26Z" />
    </svg>
  )
}

function CodeTypeGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32.0001220703125" height="32" viewBox="0 0 32.0001220703125 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M8 11L2 16L8 21" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M24.0001 11L30.0001 16L24.0001 21" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M20.0001 5L12.0001 27" />
    </svg>
  )
}

function BinaryTypeGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="21" height="24" viewBox="0 0 21 24" fill="none" aria-hidden>
      <path fill="currentColor" d="M0 24L0 0L4.95876 0L4.95876 2.04255L1.82158 2.04255L1.82158 21.9574L4.95876 21.9574L4.95876 24L0 24Z" />
      <path fill="currentColor" d="M16.0412 24L16.0412 21.9574L19.1784 21.9574L19.1784 2.04255L16.0412 2.04255L16.0412 0L21 0L21 24L16.0412 24Z" />
      <path fill="currentColor" d="M4.5199 11.32L4.5199 10.336L6.8959 10.336L6.8959 3.496L4.5199 5.272L4.5199 4.036L6.4999 2.56L7.9759 2.56L7.9759 10.336L9.9199 10.336L9.9199 11.32L4.5199 11.32Z" />
      <path fill="currentColor" d="M14.2399 11.44C13.0279 11.44 12.3139 10.738 12.3139 10.738C11.5999 10.036 11.5999 8.86 11.5999 8.86L11.5999 5.02C11.5999 3.844 12.3139 3.142 12.3139 3.142C13.0279 2.44 14.2399 2.44 14.2399 2.44C15.4519 2.44 16.1659 3.142 16.1659 3.142C16.8799 3.844 16.8799 5.02 16.8799 5.02L16.8799 8.86C16.8799 9.64 16.5559 10.222 16.5559 10.222C16.2319 10.804 15.6379 11.122 15.6379 11.122C15.0439 11.44 14.2399 11.44 14.2399 11.44ZM14.2399 10.516C14.9599 10.516 15.3979 10.054 15.3979 10.054C15.8359 9.592 15.8359 8.86 15.8359 8.86L15.8359 5.02C15.8359 4.288 15.3979 3.826 15.3979 3.826C14.9599 3.364 14.2399 3.364 14.2399 3.364C13.5199 3.364 13.0819 3.826 13.0819 3.826C12.6439 4.288 12.6439 5.02 12.6439 5.02L12.6439 8.86C12.6439 9.592 13.0819 10.054 13.0819 10.054C13.5199 10.516 14.2399 10.516 14.2399 10.516ZM14.2399 7.6C13.9159 7.6 13.7179 7.42 13.7179 7.42C13.5199 7.24 13.5199 6.904 13.5199 6.904C13.5199 6.58 13.7179 6.406 13.7179 6.406C13.9159 6.232 14.2399 6.232 14.2399 6.232C14.5639 6.232 14.7619 6.406 14.7619 6.406C14.9599 6.58 14.9599 6.904 14.9599 6.904C14.9599 7.24 14.7619 7.42 14.7619 7.42C14.5639 7.6 14.2399 7.6 14.2399 7.6Z" />
      <path fill="currentColor" d="M7.0399 21.44C5.8279 21.44 5.1139 20.738 5.1139 20.738C4.3999 20.036 4.3999 18.86 4.3999 18.86L4.3999 15.02C4.3999 13.844 5.1139 13.142 5.1139 13.142C5.8279 12.44 7.0399 12.44 7.0399 12.44C8.2519 12.44 8.9659 13.142 8.9659 13.142C9.6799 13.844 9.6799 15.02 9.6799 15.02L9.6799 18.86C9.6799 19.64 9.3559 20.222 9.3559 20.222C9.0319 20.804 8.4379 21.122 8.4379 21.122C7.8439 21.44 7.0399 21.44 7.0399 21.44ZM7.0399 20.516C7.7599 20.516 8.1979 20.054 8.1979 20.054C8.6359 19.592 8.6359 18.86 8.6359 18.86L8.6359 15.02C8.6359 14.288 8.1979 13.826 8.1979 13.826C7.7599 13.364 7.0399 13.364 7.0399 13.364C6.3199 13.364 5.8819 13.826 5.8819 13.826C5.4439 14.288 5.4439 15.02 5.4439 15.02L5.4439 18.86C5.4439 19.592 5.8819 20.054 5.8819 20.054C6.3199 20.516 7.0399 20.516 7.0399 20.516ZM7.0399 17.6C6.7159 17.6 6.5179 17.42 6.5179 17.42C6.3199 17.24 6.3199 16.904 6.3199 16.904C6.3199 16.58 6.5179 16.406 6.5179 16.406C6.7159 16.232 7.0399 16.232 7.0399 16.232C7.3639 16.232 7.5619 16.406 7.5619 16.406C7.7599 16.58 7.7599 16.904 7.7599 16.904C7.7599 17.24 7.5619 17.42 7.5619 17.42C7.3639 17.6 7.0399 17.6 7.0399 17.6Z" />
      <path fill="currentColor" d="M11.7199 21.32L11.7199 20.336L14.0959 20.336L14.0959 13.496L11.7199 15.272L11.7199 14.036L13.6999 12.56L15.1759 12.56L15.1759 20.336L17.1199 20.336L17.1199 21.32L11.7199 21.32Z" />
    </svg>
  )
}

function TextTypeGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M12 19L20 19" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M12 15L20 15" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M20 5L25 5C25.0164 5 25.0327 5.0004 25.0491 5.0012C25.0655 5.00201 25.0818 5.00321 25.098 5.00481C25.1144 5.00642 25.1306 5.00843 25.1467 5.01083C25.1629 5.01323 25.179 5.01602 25.1951 5.01921C25.2111 5.0224 25.2271 5.02599 25.243 5.02996C25.2589 5.03395 25.2746 5.03831 25.2903 5.04306C25.3059 5.04781 25.3215 5.05294 25.3369 5.05845C25.3522 5.06397 25.3675 5.06986 25.3826 5.07613C25.3978 5.08238 25.4128 5.08901 25.4275 5.09601C25.4424 5.10301 25.457 5.11037 25.4714 5.11807C25.4858 5.12579 25.5 5.13386 25.5141 5.14227C25.5281 5.15068 25.542 5.15943 25.5556 5.16853C25.5693 5.17763 25.5826 5.18705 25.5958 5.19679C25.6089 5.20654 25.6217 5.2166 25.6344 5.22699C25.647 5.23737 25.6594 5.24806 25.6715 5.25905C25.6836 5.27004 25.6955 5.28132 25.7071 5.29289C25.7188 5.30446 25.73 5.31631 25.741 5.32844C25.7519 5.34056 25.7626 5.35295 25.773 5.36561C25.7834 5.37826 25.7935 5.39116 25.8032 5.4043C25.813 5.41744 25.8224 5.43082 25.8315 5.44443C25.8406 5.45803 25.8494 5.47186 25.8577 5.4859C25.8661 5.49993 25.8743 5.51417 25.8819 5.5286C25.8896 5.54303 25.897 5.55765 25.904 5.57245C25.911 5.58724 25.9176 5.6022 25.9239 5.61731C25.9301 5.63244 25.936 5.6477 25.9415 5.66311C25.9471 5.67852 25.9522 5.69405 25.957 5.70971C25.9618 5.72538 25.9661 5.74115 25.97 5.75702C25.974 5.7729 25.9776 5.78886 25.9807 5.80491C25.984 5.82096 25.9867 5.83708 25.9891 5.85327C25.9915 5.86946 25.9935 5.8857 25.9951 5.90199C25.9967 5.91827 25.998 5.93459 25.9988 5.95094C25.9996 5.96728 26 5.98363 26 6L26 27C26 27.0164 25.9996 27.0327 25.9988 27.0491C25.998 27.0655 25.9967 27.0818 25.9951 27.098C25.9935 27.1144 25.9915 27.1306 25.9891 27.1467C25.9867 27.1629 25.984 27.179 25.9807 27.1951C25.9776 27.2111 25.974 27.2271 25.97 27.243C25.9661 27.2589 25.9618 27.2746 25.957 27.2903C25.9522 27.3059 25.9471 27.3215 25.9415 27.3369C25.936 27.3522 25.9301 27.3675 25.9239 27.3826C25.9176 27.3978 25.911 27.4128 25.904 27.4275C25.897 27.4424 25.8896 27.457 25.8819 27.4714C25.8743 27.4858 25.8661 27.5 25.8577 27.5141C25.8494 27.5281 25.8406 27.542 25.8315 27.5556C25.8224 27.5693 25.813 27.5826 25.8032 27.5958C25.7935 27.6089 25.7834 27.6217 25.773 27.6344C25.7626 27.647 25.7519 27.6594 25.741 27.6715C25.73 27.6836 25.7188 27.6955 25.7071 27.7071C25.6955 27.7188 25.6836 27.73 25.6715 27.741C25.6594 27.7519 25.647 27.7626 25.6344 27.773C25.6217 27.7834 25.6089 27.7935 25.5958 27.8032C25.5826 27.813 25.5693 27.8224 25.5556 27.8315C25.542 27.8406 25.5281 27.8494 25.5141 27.8577C25.5 27.8661 25.4858 27.8743 25.4714 27.8819C25.457 27.8896 25.4424 27.897 25.4275 27.904C25.4128 27.911 25.3978 27.9176 25.3826 27.9239C25.3675 27.9301 25.3522 27.936 25.3369 27.9415C25.3215 27.947 25.3059 27.9521 25.2903 27.957C25.2746 27.9618 25.2589 27.9661 25.243 27.97C25.2271 27.974 25.2111 27.9776 25.1951 27.9807C25.179 27.984 25.1629 27.9867 25.1467 27.9891C25.1306 27.9915 25.1144 27.9935 25.098 27.9951C25.0818 27.9967 25.0655 27.998 25.0491 27.9988C25.0327 27.9996 25.0164 28 25 28L7 28C6.98363 28 6.96728 27.9996 6.95094 27.9988C6.93459 27.998 6.91827 27.9967 6.90199 27.9951C6.8857 27.9935 6.86946 27.9915 6.85327 27.9891C6.83708 27.9867 6.82096 27.984 6.80491 27.9807C6.78886 27.9776 6.7729 27.974 6.75702 27.97C6.74115 27.9661 6.72538 27.9618 6.70971 27.957C6.69405 27.9521 6.67852 27.947 6.66311 27.9415C6.6477 27.936 6.63244 27.9301 6.61731 27.9239C6.6022 27.9176 6.58724 27.911 6.57245 27.904C6.55765 27.897 6.54303 27.8896 6.5286 27.8819C6.51417 27.8743 6.49993 27.8661 6.4859 27.8577C6.47186 27.8494 6.45803 27.8406 6.44443 27.8315C6.43082 27.8224 6.41744 27.813 6.4043 27.8032C6.39116 27.7935 6.37826 27.7834 6.36561 27.773C6.35295 27.7626 6.34056 27.7519 6.32844 27.741C6.31631 27.73 6.30446 27.7188 6.29289 27.7071C6.28132 27.6955 6.27004 27.6836 6.25905 27.6715C6.24806 27.6594 6.23737 27.647 6.22699 27.6344C6.2166 27.6217 6.20654 27.6089 6.19679 27.5958C6.18704 27.5826 6.17762 27.5693 6.16853 27.5556C6.15943 27.542 6.15068 27.5281 6.14227 27.5141C6.13386 27.5 6.12579 27.4858 6.11807 27.4714C6.11037 27.457 6.10301 27.4424 6.09601 27.4275C6.08901 27.4128 6.08238 27.3978 6.07613 27.3826C6.06986 27.3675 6.06397 27.3522 6.05845 27.3369C6.05294 27.3215 6.04781 27.3059 6.04306 27.2903C6.03831 27.2746 6.03395 27.2589 6.02996 27.243C6.02599 27.2271 6.0224 27.2111 6.01921 27.1951C6.01602 27.179 6.01323 27.1629 6.01083 27.1467C6.00843 27.1306 6.00642 27.1144 6.00481 27.098C6.00321 27.0818 6.00201 27.0655 6.0012 27.0491C6.0004 27.0327 6 27.0164 6 27L6 6C6 5.98363 6.0004 5.96728 6.0012 5.95094C6.00201 5.93459 6.00321 5.91827 6.00481 5.90199C6.00642 5.8857 6.00843 5.86946 6.01083 5.85327C6.01323 5.83708 6.01602 5.82096 6.01921 5.80491C6.0224 5.78886 6.02599 5.7729 6.02996 5.75702C6.03395 5.74115 6.03831 5.72538 6.04306 5.70971C6.04781 5.69405 6.05294 5.67852 6.05845 5.66311C6.06397 5.6477 6.06986 5.63244 6.07613 5.61731C6.08238 5.6022 6.08901 5.58724 6.09601 5.57245C6.10301 5.55765 6.11037 5.54303 6.11807 5.5286C6.12579 5.51417 6.13386 5.49993 6.14227 5.4859C6.15068 5.47186 6.15943 5.45803 6.16853 5.44443C6.17762 5.43082 6.18704 5.41744 6.19679 5.4043C6.20654 5.39116 6.2166 5.37826 6.22699 5.36561C6.23737 5.35295 6.24806 5.34056 6.25905 5.32844C6.27004 5.31631 6.28132 5.30446 6.29289 5.29289C6.30446 5.28132 6.31631 5.27004 6.32844 5.25905C6.34056 5.24806 6.35295 5.23737 6.36561 5.22699C6.37826 26.2166 6.39116 5.20654 6.4043 5.19679C6.41744 5.18705 6.43082 5.17763 6.44443 5.16853C6.45803 5.15943 6.47186 5.15068 6.4859 5.14227C6.49993 5.13386 6.51417 5.12579 6.5286 5.11807C6.54303 5.11037 6.55765 5.10301 6.57245 5.09601C6.58724 5.08901 6.6022 5.08238 6.61731 5.07613C6.63244 5.06986 6.6477 5.06397 6.66311 5.05845C6.67852 5.05294 6.69405 5.04781 6.70971 5.04306C6.72538 5.03831 6.74115 5.03395 6.75702 5.02996C6.7729 5.02599 6.78886 5.0224 6.80491 5.01921C6.82096 5.01602 6.83708 5.01323 6.85327 5.01083C6.86946 5.00843 6.8857 5.00642 6.90199 5.00481C6.91827 5.00321 6.93459 5.00201 6.95094 5.0012C6.96728 5.0004 6.98363 5 7 5L12 5" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M11 9L11 8C11 7.91818 11.002 7.8364 11.006 7.75466C11.01 7.67292 11.0161 7.59135 11.0241 7.50991C11.0321 7.42847 11.0421 7.34729 11.0541 7.26635C11.0661 7.18541 11.0801 7.10481 11.0961 7.02455C11.112 6.94429 11.13 6.86448 11.1498 6.7851C11.1697 6.70572 11.1915 6.62689 11.2153 6.54857C11.239 6.47026 11.2647 6.39259 11.2923 6.31555C11.3198 6.23851 11.3493 6.16219 11.3806 6.08659C11.4119 6.01099 11.4451 5.9362 11.4801 5.86223C11.515 5.78825 11.5518 5.71517 11.5904 5.64301C11.629 5.57085 11.6693 5.49967 11.7114 5.42949C11.7534 5.3593 11.7972 5.29019 11.8427 5.22215C11.8881 5.15411 11.9352 5.08722 11.984 5.0215C12.0327 4.95578 12.083 4.89129 12.1349 4.82804C12.1869 4.76478 12.2403 4.70284 12.2952 4.6422C12.3502 4.58157 12.4066 4.52233 12.4645 4.46446C12.5223 4.4066 12.5816 4.3502 12.6423 4.29525C12.7028 4.24029 12.7647 4.18686 12.828 4.13495C12.8912 4.08303 12.9557 4.0327 13.0215 3.98396C13.0872 3.93522 13.1541 3.88812 13.2221 3.84265C13.2902 3.79719 13.3593 3.75343 13.4295 3.71136C13.4997 3.66929 13.5708 3.62897 13.643 3.5904C13.7152 3.55183 13.7882 3.51504 13.8623 3.48005C13.9362 3.44507 14.011 3.41192 14.0866 3.3806C14.1622 3.34928 14.2385 3.31984 14.3155 3.29227C14.3926 3.26471 14.4703 3.23905 14.5486 3.2153C14.6269 3.19154 14.7057 3.16972 14.7851 3.14984C14.8645 3.12996 14.9443 3.11204 15.0245 3.09608C15.1047 3.08011 15.1854 3.06612 15.2664 3.05411C15.3473 3.04211 15.4285 3.0321 15.5099 3.02408C15.5914 3.01606 15.673 3.01004 15.7546 3.00603C15.8364 3.00201 15.9182 3 16 3C16.0818 3 16.1636 3.00201 16.2454 3.00603C16.327 3.01004 16.4086 3.01606 16.4901 3.02408C16.5715 3.0321 16.6527 3.04211 16.7336 3.05411C16.8146 3.06612 16.8953 3.08011 16.9755 3.09608C17.0557 3.11204 17.1355 3.12997 17.2149 3.14985C17.2943 3.16972 17.3731 3.19154 17.4514 3.2153C17.5297 3.23905 17.6074 3.26471 17.6845 3.29227C17.7615 3.31984 17.8378 3.34928 17.9134 3.3806C17.989 3.41192 18.0638 3.44507 18.1378 3.48005C18.2118 3.51504 18.2848 3.55183 18.357 3.5904C18.4292 3.62897 18.5003 3.66929 18.5705 3.71136C18.6407 3.75343 18.7098 3.79719 18.7779 3.84265C18.8459 3.88812 18.9128 3.93522 18.9785 3.98396C19.0443 4.0327 19.1087 4.08303 19.172 4.13495C19.2353 4.18686 19.2972 4.24029 19.3577 4.29525C19.4184 4.3502 19.4777 4.4066 19.5355 4.46446C19.5934 4.52233 19.6498 4.58157 19.7048 4.6422C19.7597 4.70284 19.8131 4.76478 19.865 4.82804C19.9169 4.89129 19.9673 4.95578 20.016 5.0215C20.0648 5.08722 20.1119 5.15411 20.1574 5.22215C20.2028 5.29019 20.2465 5.3593 20.2886 5.42949C20.3307 5.49967 20.371 5.57085 20.4096 5.64301C20.4482 5.71517 20.485 5.78825 20.52 5.86223C20.5549 5.9362 20.588 6.01099 20.6194 6.08659C20.6507 6.16219 20.6802 6.23851 20.7078 6.31555C20.7353 6.39259 20.761 6.47026 20.7847 6.54857C20.8085 6.62689 20.8303 6.70572 20.8501 6.7851C20.87 6.86448 20.888 6.94429 20.9039 7.02455C20.9199 7.10481 20.9339 7.18541 20.9459 7.26635C20.9579 7.34729 20.9679 7.42847 20.9759 7.50991C20.984 7.59135 20.99 7.67292 20.994 7.75466C20.998 7.8364 21 7.91818 21 8L21 9L11 9Z" />
    </svg>
  )
}

function LogTypeGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M12 12L20 12" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M12 16L20 16" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M12 20L16 20" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M19.5875 27L6 27C5.98363 27 5.96728 26.9996 5.95094 26.9988C5.93459 26.998 5.91827 26.9967 5.90199 26.9951C5.8857 26.9935 5.86946 26.9915 5.85327 26.9891C5.83708 26.9867 5.82096 26.984 5.80491 26.9807C5.78886 26.9776 5.7729 26.974 5.75702 26.97C5.74115 26.966 5.72538 26.9616 5.70971 26.9569C5.69405 26.9521 5.67852 26.947 5.66311 26.9415C5.6477 26.936 5.63244 26.9301 5.61731 26.9239C5.6022 26.9176 5.58724 26.911 5.57245 26.904C5.55765 26.897 5.54303 26.8896 5.5286 26.8819C5.51417 26.8743 5.49993 26.8661 5.4859 26.8577C5.47186 26.8494 5.45803 26.8406 5.44443 26.8315C5.43082 26.8224 5.41744 26.813 5.4043 26.8032C5.39116 26.7935 5.37826 26.7834 5.36561 26.773C5.35295 26.7626 5.34056 26.7519 5.32844 26.741C5.31631 26.73 5.30446 26.7188 5.29289 26.7071C5.28132 26.6955 5.27004 26.6836 5.25905 26.6715C5.24806 26.6594 5.23737 26.647 5.22699 26.6344C5.2166 26.6217 5.20654 26.6089 5.19679 26.5958C5.18705 26.5826 5.17763 26.5693 5.16853 26.5556C5.15943 26.542 5.15068 26.5281 5.14227 26.5141C5.13386 26.5 5.12579 26.4858 5.11807 26.4714C5.11037 26.457 5.10301 26.4424 5.09601 26.4275C5.08901 26.4128 5.08238 26.3978 5.07613 26.3826C5.06986 26.3675 5.06397 26.3522 5.05845 26.3369C5.05294 26.3215 5.04781 26.3059 5.04306 26.2903C5.03831 26.2746 5.03395 26.2589 5.02996 26.243C5.02599 26.2271 5.0224 26.2111 5.01921 26.1951C5.01602 26.179 5.01323 26.1629 5.01083 26.1467C5.00843 26.1306 5.00642 26.1144 5.00481 26.098C5.00321 26.0818 5.00201 26.0655 5.0012 26.0491C5.0004 26.0327 5 26.0164 5 26L5 6C5 5.98363 5.0004 5.96728 5.0012 5.95094C5.00201 5.93459 5.00321 5.91827 5.00481 5.90199C5.00642 5.8857 5.00843 5.86946 5.01083 5.85327C5.01323 5.83708 5.01602 5.82096 5.01921 5.80491C5.0224 5.78886 5.02599 5.7729 5.02996 5.75702C5.03395 5.74115 5.03831 5.72538 5.04306 5.70971C5.04781 5.69405 5.05294 5.67852 5.05845 5.66311C5.06397 5.6477 5.06986 5.63244 5.07613 5.61731C5.08238 5.6022 5.08901 5.58724 5.09601 5.57245C5.10301 5.55765 6.11037 5.54303 6.11807 5.5286C6.12579 5.51417 6.13386 5.49993 6.14227 5.4859C6.15068 5.47186 6.15943 5.45803 6.16853 5.44443C6.17763 5.43082 6.18705 5.41744 6.19679 5.4043C6.20654 5.39116 6.2166 5.37826 6.22699 5.36561C6.23737 5.35295 6.24806 5.34056 6.25905 5.32844C6.27004 5.31631 6.28132 5.30446 6.29289 5.29289C6.30446 5.28132 6.31631 5.27004 6.32844 5.25905C6.34056 5.24806 6.35295 5.23737 6.36561 5.22699C6.37826 26.2166 6.39116 5.20654 6.4043 5.19679C6.41744 5.18705 6.43082 5.17763 6.44443 5.16853C6.45803 5.15943 6.47186 5.15068 6.4859 5.14227C6.49993 5.13386 6.51417 5.12579 6.5286 5.11807C6.54303 5.11037 6.55765 5.10301 6.57245 5.09601C6.58724 5.08901 6.6022 5.08238 6.61731 5.07613C6.63244 5.06986 6.6477 5.06397 6.66311 5.05845C6.67852 5.05294 6.69405 5.04781 6.70971 5.04306C6.72538 5.03831 6.74115 5.03395 6.75702 5.02996C6.7729 5.02599 6.78886 5.0224 6.80491 5.01921C6.82096 5.01602 6.83708 5.01323 6.85327 5.01083C6.86946 5.00843 6.8857 5.00642 6.90199 5.00481C6.91827 5.00321 6.93459 5.00201 6.95094 5.0012C6.96728 5.0004 6.98363 5 6 5L26 5C26.0164 5 26.0327 5.0004 26.0491 5.0012C26.0655 5.00201 26.0818 5.00321 26.098 5.00481C26.1144 5.00642 26.1306 5.00843 26.1467 5.01083C26.1629 5.01323 26.179 5.01602 26.1951 5.01921C26.2111 5.0224 26.2271 5.02599 26.243 5.02996C26.2589 5.03395 26.2746 5.03831 26.2903 5.04306C26.3059 5.04781 26.3215 5.05294 26.3369 5.05845C26.3522 5.06397 26.3675 5.06986 26.3826 5.07613C26.3978 5.08238 26.4128 5.08901 26.4275 5.09601C26.4424 5.10301 26.457 5.11037 26.4714 5.11807C26.4858 5.12579 26.5 5.13386 26.5141 5.14227C26.5281 5.15068 26.542 5.15943 26.5556 5.16853C26.5693 5.17763 26.5826 5.18705 26.5958 5.19679C26.6089 5.20654 26.6217 5.2166 26.6344 5.22699C26.647 5.23737 26.6594 5.24806 26.6715 5.25905C26.6836 5.27004 26.6955 5.28132 26.7071 5.29289C26.7188 5.30446 26.73 5.31631 26.741 5.32844C26.7519 5.34056 26.7626 5.35295 26.773 5.36561C26.7834 5.37826 26.7935 5.39116 26.8032 5.4043C26.813 5.41744 26.8224 5.43082 26.8315 5.44443C26.8406 5.45803 26.8494 5.47186 26.8577 5.4859C26.8661 5.49993 26.8743 5.51417 26.8819 5.5286C26.8896 5.54303 26.897 5.55765 26.904 5.57245C26.911 5.58724 26.9176 5.6022 26.9239 5.61731C26.9301 5.63244 26.936 5.6477 26.9415 5.66311C26.947 5.67852 26.9521 5.69405 26.957 5.70971C26.9618 5.72538 26.9661 5.74115 26.97 5.75702C26.974 5.7729 26.9776 5.78886 26.9807 5.80491C26.984 5.82096 26.9867 5.83708 26.9891 5.85327C26.9915 5.86946 26.9935 5.8857 26.9951 5.90199C26.9967 5.91827 26.998 5.93459 26.9988 5.95094C26.9996 5.96728 27 5.98363 27 6L27 19.5875C27.0001 19.6199 26.9986 19.6523 26.9956 19.6844C26.9925 19.7166 26.9879 19.7486 26.9816 19.7805C26.9755 19.8123 26.9678 19.8436 26.9584 19.8746C26.949 19.9058 26.9382 19.9362 26.926 19.9661C26.9136 19.9961 26.8999 20.0254 26.8848 20.054C26.8696 20.0826 26.853 20.1104 26.8351 20.1374C26.8172 20.1642 26.798 20.1903 26.7775 20.2154C26.757 20.2405 26.7354 20.2646 26.7125 20.2875L20.2875 26.7125C20.2646 26.7354 20.2405 26.757 20.2154 26.7775C20.1903 26.798 20.1642 26.8172 20.1374 26.8351C20.1104 26.853 20.0826 26.8696 20.054 26.8848C20.0254 26.8999 19.9961 26.9136 19.9661 26.926C19.9362 26.9382 19.9058 26.949 19.8746 26.9584C19.8436 26.9678 19.8123 26.9755 19.7805 26.9816C19.7486 26.9879 19.7166 26.9925 19.6844 26.9956C19.6523 26.9986 19.6199 27.0001 19.5875 27Z" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M26.9125 20L20 20L20 26.9125" />
    </svg>
  )
}

function DeploymentFlowTypeGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M14.7625 21.7625L19 26L23.2375 21.7625" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M19 16L19 26" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M12 26L9 26C8.88544 26 8.77095 25.9972 8.65652 25.9916C8.54211 25.986 8.42789 25.9775 8.31388 25.9663C8.19986 25.9551 8.0862 25.9411 7.97289 25.9242C7.85956 25.9074 7.74673 25.8879 7.63436 25.8655C7.522 25.8431 7.41026 25.8181 7.29914 25.7902C7.18801 25.7624 7.07764 25.7319 6.96801 25.6986C6.85838 25.6654 6.74964 25.6294 6.64178 25.5907C6.53391 25.5521 6.42705 25.511 6.32121 25.4671C6.21537 25.4233 6.11067 25.3769 6.00711 25.3279C5.90355 25.279 5.80126 25.2275 5.70022 25.1735C5.59919 25.1195 5.49954 25.063 5.40127 25.0041C5.30301 24.9452 5.20626 24.8839 5.11101 24.8202C5.01575 24.7566 4.92211 24.6908 4.8301 24.6225C4.73809 24.5542 4.64781 24.4838 4.55925 24.4111C4.47069 24.3384 4.38398 24.2635 4.29909 24.1866C4.2142 24.1097 4.13126 24.0308 4.05025 23.9497C3.96924 23.8687 3.89028 23.7858 3.81334 23.7009C3.7364 23.616 3.6616 23.5293 3.58892 23.4408C3.51625 23.3522 3.44579 23.2619 3.37755 23.1699C3.30931 23.0779 3.24336 22.9842 3.17971 22.889C3.11606 22.7938 3.05479 22.697 2.9959 22.5988C2.937 22.5005 2.88055 22.4008 2.82655 22.2998C2.77255 22.1987 2.72106 22.0965 2.67208 21.9929C2.62309 21.8893 2.57668 21.7846 2.53284 21.6787C2.489 21.5729 2.44779 21.4661 2.40919 21.3582C2.3706 21.2503 2.33467 21.1416 2.30141 21.032C2.26816 20.9223 2.23762 20.812 2.20977 20.7009C2.18194 20.5897 2.15685 20.478 2.1345 20.3656C2.11215 20.2533 2.09257 20.1405 2.07576 20.0271C2.05895 19.9138 2.04494 19.8001 2.03371 19.6861C2.02248 19.5721 2.01405 19.4579 2.00844 19.3435C2.00281 19.2291 2 19.1146 2 19C2 18.8854 2.00281 18.7709 2.00844 18.6565C2.01405 18.5421 2.02248 18.4279 2.03371 18.3139C2.04494 18.1999 2.05895 18.0862 2.07576 17.9729C2.09257 17.8595 2.11215 17.7467 2.1345 17.6344C2.15685 17.522 2.18194 17.4103 2.20977 17.2991C2.23762 17.188 2.26816 17.0777 2.30141 16.968C2.33467 16.8584 2.3706 16.7497 2.40919 16.6418C2.44779 16.5339 2.489 16.4271 2.53284 16.3213C2.57668 16.2154 2.62309 16.1107 2.67208 16.0071C2.72106 15.9035 2.77255 15.8013 2.82655 15.7002C2.88055 15.5992 2.937 15.4995 2.9959 15.4012C3.05479 15.303 3.11606 15.2063 3.17971 15.111C3.24336 15.0157 3.30931 14.9221 3.37755 14.8301C3.44579 14.7381 3.51625 14.6478 3.58892 14.5592C3.6616 14.4707 3.7364 14.384 3.81334 14.2991C3.89028 14.2142 3.96924 14.1313 4.05025 14.0503C4.13126 13.9692 4.2142 13.8903 4.29909 13.8134C4.38398 13.7365 4.47069 13.6616 4.55925 13.5889C4.6478 13.5162 4.73809 13.4458 4.8301 13.3775C4.92211 13.3092 5.01575 13.2433 5.11101 13.1798C5.20626 13.1161 5.30301 13.0548 5.40127 12.9959C5.49954 12.937 5.59919 12.8805 5.70022 12.8265C5.80126 12.7725 5.90355 12.721 6.00711 12.6721C6.11067 12.6231 6.21537 12.5767 6.32121 12.5329C6.42705 12.489 6.53391 12.4478 6.64178 12.4092C6.74964 12.3706 6.85838 12.3347 6.96801 12.3014C7.07764 12.2682 7.18801 12.2376 7.29914 12.2098C7.41026 12.1819 7.522 12.1569 7.63436 12.1345C7.74673 12.1122 7.85956 12.0926 7.97289 12.0758C8.0862 12.059 8.19986 12.0449 8.31388 12.0337C8.42789 12.0225 8.5421 12.0141 8.65652 12.0084C8.77095 12.0028 8.88544 12 9 12C9.29284 11.9999 9.58459 12.0176 9.87525 12.0532C10.1659 12.0887 10.4533 12.1418 10.7375 12.2125" />
      <path stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" d="M10 16C10 15.8028 10.0058 15.6058 10.0175 15.4089C10.0291 15.2121 10.0466 15.0157 10.0699 14.8199C10.0931 14.6241 10.1222 14.4291 10.157 14.235C10.1918 14.0409 10.2323 13.8481 10.2785 13.6564C10.3247 13.4646 10.3766 13.2744 10.434 13.0858C10.4915 12.8972 10.5545 12.7104 10.623 12.5255C10.6915 12.3406 10.7655 12.1579 10.8448 11.9773C10.9241 11.7968 11.0087 11.6187 11.0986 11.4432C11.1884 11.2677 11.2834 11.0949 11.3835 10.925C11.4836 10.7551 11.5886 10.5883 11.6985 10.4246C11.8084 10.2609 11.9231 10.1006 12.0426 9.94365C12.162 9.78674 12.286 9.63349 12.4145 9.4839C12.543 9.33432 12.6758 9.18866 12.8129 9.04692C12.95 8.9052 13.0911 8.76765 13.2364 8.63428C13.3816 8.5009 13.5307 8.37193 13.6836 8.24738C13.8365 8.12282 13.9929 8.00289 14.1529 7.88758C14.3129 7.77227 14.4761 7.6618 14.6426 7.55615C14.8091 7.45051 14.9786 7.34987 15.1511 7.25425C15.3235 7.15864 15.4987 7.0682 15.6765 6.98294C15.8543 6.89768 16.0345 6.81775 16.217 6.74315C16.3996 6.66855 16.5842 6.59941 16.7708 6.53574C16.9574 6.47206 17.1458 6.41395 17.3359 6.36141C17.526 6.30888 17.7174 6.26201 17.9102 6.22079C18.1031 6.17958 18.297 6.14411 18.4919 6.11438C18.6869 6.08464 18.8825 6.06068 19.0789 6.04252C19.2752 6.02435 19.4719 6.012 19.669 6.00548C19.8661 5.99895 20.0632 5.99826 20.2604 6.00339C20.4575 6.00852 20.6543 6.01948 20.8507 6.03627C21.0472 6.05304 21.2431 6.07561 21.4382 6.10397C21.6334 6.13233 21.8275 6.16644 22.0206 6.20628C22.2138 6.24613 22.4056 6.29165 22.596 6.34284C22.7864 6.39403 22.9751 6.45081 23.1623 6.51316C23.3494 6.57552 23.5344 6.64336 23.7175 6.71667C23.9006 6.78997 24.0814 6.86863 24.2598 6.95264C24.4381 7.03664 24.6139 7.12584 24.787 7.22023C24.9601 7.31462 25.1304 7.41406 25.2976 7.51854C25.4649 7.62301 25.6289 7.73233 25.7896 7.84649C25.9505 7.96066 26.1077 8.07949 26.2615 8.20296C26.4153 8.32644 26.5653 8.45434 26.7114 8.58669C26.8575 8.71904 26.9998 8.8556 27.1379 8.99635C27.276 9.13711 27.4097 9.28183 27.5394 9.43049C27.6689 9.57916 27.7939 9.73154 27.9145 9.88761C28.035 10.0437 28.1507 10.2032 28.2619 10.3661C28.373 10.529 28.4791 10.6951 28.5805 10.8643C28.6817 11.0335 28.7779 11.2056 28.869 11.3804C28.9601 11.5553 29.046 11.7328 29.1266 11.9128C29.2073 12.0927 29.2824 12.2749 29.3522 12.4594C29.422 12.6438 29.4862 12.8301 29.5451 13.0184C29.604 13.2066 29.6571 13.3963 29.7046 13.5877C29.7523 13.7791 29.7941 13.9717 29.8302 14.1656C29.8664 14.3595 29.8969 14.5542 29.9215 14.7499C29.9461 14.9455 29.965 15.1417 29.9781 15.3385C29.9911 15.5352 29.9984 15.7322 29.9998 15.9294C30.0011 16.1265 29.9967 16.3236 29.9865 16.5206C29.9761 16.7175 29.9601 16.914 29.9382 17.1099C29.9164 17.3059 29.8886 17.501 29.8552 17.6954C29.8219 17.8897 29.7826 18.0829 29.7377 18.275C29.6929 18.467 29.6424 18.6575 29.5863 18.8466C29.5301 19.0356 29.4685 19.2229 29.4013 19.4082C29.3341 19.5936 29.2615 19.7769 29.1834 19.958C29.1052 20.1391 29.022 20.3177 28.9334 20.4939C28.8447 20.67 28.751 20.8434 28.6521 21.014C28.5532 21.1846 28.4495 21.3521 28.3406 21.5166C28.2319 21.6811 28.1184 21.8423 28 22" />
    </svg>
  )
}

function FileTypeGlyph({ kind }: { kind?: WorkbenchFileKind }) {
  if (kind === 'folder') return <FolderTypeGlyph />
  if (kind === 'binary') return <BinaryTypeGlyph />
  if (kind === 'text') return <TextTypeGlyph />
  if (kind === 'log') return <LogTypeGlyph />
  if (kind === 'template') return <DeploymentFlowTypeGlyph />
  return <CodeTypeGlyph />
}

function ProjectList({
  items,
  onOpen,
  onContextMenu,
}: {
  items: TemplateWorkbenchItem[]
  onOpen?: (item: TemplateWorkbenchItem) => void
  onContextMenu?: (event: ReactMouseEvent, item: TemplateWorkbenchItem) => void
}) {
  const rowStart = 61
  const rowGap = 80
  const height = items.length > 0 ? rowStart + (items.length - 1) * rowGap + 60 : 121

  return (
    <div className="absolute" style={{ left: 400, top: 285, width: 1470, height, color: 'var(--twb-text)' }}>
      {items.map((item, index) => {
        const rowY = rowStart + index * rowGap
        const NameIcon = item.fileKind === 'folder' ? null : getFileIconByName(item.fileName ?? item.name)
        const isDeploymentFlow = item.fileKind === 'template'
        return (
          <div key={item.id} className="absolute" style={{ left: 0, top: rowY, width: 1470, height: 60 }}>
            <button
              type="button"
              onClick={() => onOpen?.(item)}
              onContextMenu={event => {
                if (!onContextMenu) return
                event.preventDefault()
                onContextMenu(event, item)
              }}
              className="absolute inset-0 z-0 rounded-[5px] transition-colors hover:bg-[var(--twb-hover)]"
              aria-label={`打开${item.name}`}
            />
            {isDeploymentFlow ? (
              // 部署流程行：优先用 cover 作封面（缩小版），没有 cover 时降级为图标
              item.cover ? (
                <div
                  className="pointer-events-none absolute left-0 top-0 z-10 h-[60px] w-[60px] rounded-[5px] bg-cover bg-center"
                  style={{ backgroundImage: `url("${item.cover}")` }}
                />
              ) : (
                <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-[60px] w-[60px] items-center justify-center" style={{ color: 'var(--twb-text)' }}>
                  <DeploymentFlowTypeGlyph />
                </div>
              )
            ) : (
              <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-[60px] w-[60px] items-center justify-center rounded-[5px] border" style={{ borderColor: 'var(--twb-border)', background: 'var(--twb-bg)' }}>
                {item.fileKind === 'folder' ? <FolderTypeGlyph /> : NameIcon ? <NameIcon size={36} /> : null}
              </div>
            )}
            <div
              className="pointer-events-none absolute truncate leading-none"
              style={{ left: 70, top: 18, width: 420, color: 'var(--twb-text)', fontFamily: font, fontSize: 25, fontWeight: 300 }}
            >
              {item.name}
            </div>
            <div className="pointer-events-none absolute flex items-center" style={{ left: 539.5, top: 13.5, width: 340, height: 32 }}>
              <FileTypeGlyph kind={item.fileKind} />
              <span className="ml-[1px] leading-none" style={{ color: 'var(--twb-text)', fontFamily: font, fontSize: 25, fontWeight: 300 }}>
                {fileKindLabel(item.fileKind)}
              </span>
            </div>
            <div className="pointer-events-none absolute truncate leading-none" style={{ left: 1120, top: 18, width: 300, color: 'var(--twb-muted)', fontFamily: font, fontSize: 25, fontWeight: 300 }}>
              {item.updatedAt}
            </div>
          </div>
        )
      })}
      <svg className="absolute left-0 top-0 z-10 pointer-events-none overflow-visible" width="1470" height={height} viewBox={`0 0 1470 ${height}`} fill="none" aria-hidden>
        <text x="0" y="21" fill="var(--twb-muted)" fontSize="20" fontFamily={font} fontWeight="300">名称</text>
        <text x="540" y="21" fill="var(--twb-muted)" fontSize="20" fontFamily={font} fontWeight="300">文件类型</text>
        <text x="1120" y="21" fill="var(--twb-muted)" fontSize="20" fontFamily={font} fontWeight="300">更新时间</text>
        <path d="M0 31H1470" stroke="var(--twb-muted)" strokeWidth="1" />
      </svg>
    </div>
  )
}

function ContentHeader({
  layoutMode,
  onToggleLayout,
  title = '全部项目',
  secondaryLabel = '回收站',
  onSecondaryClick,
}: {
  layoutMode: TemplateWorkbenchLayout
  onToggleLayout: () => void
  title?: string
  secondaryLabel?: string
  onSecondaryClick?: () => void
}) {
  const LayoutIcon = layoutMode === 'card' ? CardSquaresIcon : ListDashesIcon
  return (
    <div className="absolute" style={{ left: 400, top: 98, width: 1470, height: 48, color: 'var(--twb-text)' }}>
      <svg className="absolute inset-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="1470" height="48" viewBox="0 0 1470 48" aria-hidden>
        <g transform="translate(-400 -98)">
          <path d="M0,.5H1470" transform="translate(400 144.5)" fill="none" stroke="currentColor" strokeWidth="1" />
          <g transform="translate(400 96.63)">
            <path d="M0,47H120" transform="translate(0 -0.63)" fill="none" stroke="var(--twb-blue)" strokeWidth="5" />
            <text transform="translate(0 33.37)" fill="currentColor" fontSize="30" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">
              {title}
            </text>
          </g>
          <text transform="translate(530 130)" fill="currentColor" fontSize="30" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">
            {secondaryLabel}
          </text>
          <g transform="translate(1685.75 114.95)">
            <text transform="translate(0.25 23.05)" fill="currentColor" fontSize="25" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">
              更新时间
            </text>
            <g transform="translate(3 -2)">
              <path d="M121.125,11.75,113,19.875l-8.125-8.125" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <rect width="32" height="32" transform="translate(97.25 0.05)" fill="none" />
            </g>
          </g>
        </g>
      </svg>
      <button type="button" className="absolute left-0 top-0 h-[48px] w-[120px]" aria-label={title} />
      <button type="button" onClick={onSecondaryClick} className="absolute left-[130px] top-0 h-[48px] w-[120px]" aria-label={secondaryLabel} />
      <button type="button" className="absolute left-[1285px] top-0 h-[48px] w-[140px]" aria-label="排序方式" />
      <button
        type="button"
        onClick={onToggleLayout}
        className="absolute left-[1438px] top-[15px] flex h-[32px] w-[32px] items-center justify-center transition-colors hover:bg-[var(--twb-hover)]"
        aria-label={layoutMode === 'card' ? '当前卡片布局，点击切换到列表布局' : '当前列表布局，点击切换到卡片布局'}
      >
        <LayoutIcon />
      </button>
    </div>
  )
}

function QuickActions({
  onCreateProject,
  onCreateFolder,
  onUploadProject,
}: {
  onCreateProject?: () => void
  onCreateFolder?: () => void
  onUploadProject?: () => void
}) {
  return (
    <div className="absolute" style={{ left: 400, top: 196, width: 961, height: 61, color: 'var(--twb-text)' }}>
      <svg className="absolute inset-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="961" height="61" viewBox="0 0 961 61" aria-hidden>
        <g transform="translate(-399.5 -195.5)">
          <g>
            <rect width="300" height="60" rx="10" transform="translate(400 196)" fill="none" stroke="currentColor" strokeWidth="1" />
            <g transform="translate(404.5 205.5)">
              <rect width="40" height="40" transform="translate(0.5 0.5)" fill="none" />
              <g opacity="0.2"><path d="M24.25,5.5v8.75H33Z" fill="currentColor" /></g>
              <path d="M31.75,35.5H9.25l-.061,0-.061,0-.061-.007-.06-.011-.06-.013-.059-.016-.058-.019L8.772,35.4l-.056-.025-.055-.028-.053-.03-.052-.033-.05-.035-.048-.038-.046-.04-.044-.042-.042-.044-.04-.046-.038-.048-.035-.05-.033-.052-.03-.054q-.014-.027-.028-.055T8.1,34.728q-.012-.028-.022-.057c-.007-.019-.013-.039-.019-.058s-.011-.039-.016-.059-.009-.04-.013-.06-.007-.04-.01-.061-.005-.04-.008-.061,0-.041,0-.061,0-.041,0-.061V6.75q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.06q.006-.03.013-.06t.016-.059q.009-.029.019-.058T8.1,6.272q.012-.028.025-.056t.028-.055q.014-.027.03-.053l.033-.052.035-.05.038-.048.04-.046.042-.044.044-.042.046-.04.048-.038.05-.035.052-.033.053-.03.055-.028L8.772,5.6l.057-.022.058-.019.059-.016.06-.013.06-.01.061-.008.061,0,.061,0h15L33,14.25v20c0,.021,0,.041,0,.061s0,.041,0,.061,0,.041-.007.061-.006.04-.011.061-.008.04-.013.06-.01.04-.016.059-.012.039-.019.058-.014.038-.022.057-.016.038-.025.056-.018.037-.028.055-.02.036-.03.054-.021.035-.033.052l-.035.05-.038.048-.04.046-.042.044-.044.042-.046.04-.048.038-.05.035-.052.033-.054.03-.055.028-.056.025-.057.022-.058.019-.059.016-.06.013-.061.011-.061.007-.061,0Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M24.25,5.5v8.75H33" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M16.75,24.25h7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M20.5,20.5V28" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(657.5 213.5)">
              <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
              <path d="M4.25,12.5h16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M12.5,4.25v16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(-8 -2)">
              <text transform="translate(458 227)" fill="currentColor" fontSize="22" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">新建项目</text>
              <text transform="translate(458 249)" fill="var(--twb-muted)" fontSize="15" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">部署流程、部署脚本</text>
            </g>
          </g>

          <g transform="translate(330)">
            <rect width="300" height="60" rx="10" transform="translate(400 196)" fill="none" stroke="currentColor" strokeWidth="1" />
            <g transform="translate(657.5 213.5)">
              <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
              <path d="M4.25,12.5h16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M12.5,4.25v16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(-8 -2)">
              <text transform="translate(458 227)" fill="currentColor" fontSize="22" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">新建文件夹</text>
              <text transform="translate(458 249)" fill="var(--twb-muted)" fontSize="15" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">文件收纳归类</text>
            </g>
            <g transform="translate(404.5 205.5)">
              <rect width="40" height="40" transform="translate(0.5 0.5)" fill="none" />
              <g opacity="0.2"><path d="M15.078,16.75H5.5V10.5q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.061c0-.02.008-.04.013-.06s.01-.04.016-.059.012-.039.019-.058.014-.038.022-.057.016-.038.025-.056.018-.037.028-.055.02-.036.03-.053l.033-.052.035-.05.038-.048.04-.046.042-.044.044-.042.046-.04L6.005,9.5l.05-.035.052-.033.053-.03.055-.028.056-.025.057-.022L6.387,9.3l.059-.016.06-.013.06-.01.061-.008.061,0,.061,0h8.328a1.265,1.265,0,0,1,.75.25L20.5,13l-4.672,3.5a1.254,1.254,0,0,1-.17.107,1.241,1.241,0,0,1-.185.078,1.259,1.259,0,0,1-.395.065Z" fill="currentColor" /></g>
              <path d="M20.5,13H34.25l.061,0,.061,0,.061.008.061.01.06.014.059.016.058.019.057.022.056.025.055.028.054.03.052.033.05.035.048.038.046.04.044.042.042.044.04.047.038.048.035.05q.017.026.033.052c.01.017.021.035.03.053s.019.036.028.055.017.037.025.056.015.038.022.057.013.039.019.058.011.039.016.059.009.04.013.06.007.04.011.061.006.04.007.061,0,.041,0,.061,0,.041,0,.061v17.5c0,.021,0,.041,0,.061s0,.041,0,.061,0,.041-.007.061-.006.04-.011.061-.008.04-.013.06-.01.04-.016.059-.013.039-.019.058-.014.038-.022.057-.016.038-.025.056-.018.037-.028.055-.02.036-.03.054-.021.035-.033.052l-.035.05-.038.048-.04.046-.042.044-.044.042-.046.04-.048.038-.05.035-.052.033-.054.03-.055.028-.056.025-.057.022-.058.019-.059.016-.06.013-.061.011-.061.007-.061,0-.061,0H6.75l-.061,0-.061,0-.061-.007-.06-.011-.06-.013-.059-.016-.058-.019L6.272,32.9l-.056-.025-.055-.028-.053-.03-.052-.033-.05-.035-.048-.038-.046-.04-.044-.042-.042-.044-.04-.046-.038-.048-.035-.05-.033-.052-.03-.054q-.014-.027-.028-.055T5.6,32.228q-.012-.028-.022-.057c-.007-.019-.013-.039-.019-.058s-.011-.039-.016-.059-.009-.04-.013-.06-.007-.04-.01-.061-.005-.04-.008-.061,0-.041,0-.061,0-.041,0-.061v-15" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M15.078,16.75H5.5V10.5q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.061c0-.02.008-.04.013-.06s.01-.04.016-.059.012-.039.019-.058.014-.038.022-.057.016-.038.025-.056.018-.037.028-.055.02-.036.03-.053l.033-.052.035-.05.038-.048.04-.046.042-.044.044-.042.046-.04L6.005,9.5l.05-.035.052-.033.053-.03.055-.028.056-.025.057-.022L6.387,9.3l.059-.016.06-.013.06-.01.061-.008.061,0,.061,0h8.328a1.265,1.265,0,0,1,.75.25L20.5,13l-4.672,3.5a1.254,1.254,0,0,1-.17.107,1.241,1.241,0,0,1-.185.078,1.259,1.259,0,0,1-.395.065Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M16.75,23.625h7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M20.5,19.875v7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
          </g>

          <g transform="translate(660)">
            <rect width="300" height="60" rx="10" transform="translate(400 196)" fill="none" stroke="currentColor" strokeWidth="1" />
            <g transform="translate(657.5 213.5)">
              <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
              <path d="M4.25,12.5h16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M12.5,4.25v16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(-8 -2)">
              <text transform="translate(458 227)" fill="currentColor" fontSize="22" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">上传项目</text>
              <text transform="translate(458 249)" fill="var(--twb-muted)" fontSize="15" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">.toml、.zip、.mcsmod、.iso...</text>
            </g>
            <g transform="translate(404.5 205.5)">
              <rect width="40" height="40" transform="translate(0.5 0.5)" fill="none" />
              <g opacity="0.2"><rect width="32.5" height="12.5" rx="1" transform="translate(4.25 20.5)" fill="currentColor" /></g>
              <path d="M28,20.5h7.5l.061,0,.061,0,.061.007.061.01.06.013.059.016.058.019.057.022.056.025.055.028.054.03.052.033.05.035.048.038.046.04.044.042.042.045.04.046.038.048.035.05.033.052c.01.018.021.035.03.054s.019.036.028.055.017.037.025.056.015.038.022.057.013.039.019.058.011.039.016.059.009.04.013.06.007.04.011.061.006.04.007.061,0,.041,0,.061,0,.041,0,.061v10q0,.031,0,.061c0,.02,0,.041,0,.061s0,.041-.007.061-.006.04-.011.061-.008.04-.013.06-.01.04-.016.059-.012.039-.019.058-.014.038-.022.057-.016.038-.025.056-.018.037-.028.055-.02.036-.03.054-.021.035-.033.052l-.035.05-.038.048-.04.046-.042.044-.044.042-.046.04-.048.038-.05.035-.052.033-.054.03-.055.028-.056.025-.057.022-.058.019-.059.016-.06.013-.061.011-.061.007-.061,0L35.5,33H5.5l-.061,0-.061,0-.061-.007-.06-.011-.06-.013-.059-.016-.058-.019L5.022,32.9l-.056-.025-.055-.028-.053-.03-.052-.033-.05-.035-.048-.038-.046-.04-.044-.042-.042-.044-.04-.046L4.5,32.495l-.035-.05-.033-.052-.03-.054q-.014-.027-.028-.055t-.025-.056c-.008-.019-.015-.038-.022-.057s-.013-.039-.019-.058-.011-.039-.016-.059-.009-.04-.013-.06-.007-.04-.01-.061-.005-.04-.008-.061,0-.041,0-.061,0-.041,0-.061v-10q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.061q.006-.03.013-.06t.016-.059q.009-.029.019-.058c.007-.019.014-.038.022-.057s.016-.038.025-.056.018-.037.028-.055.02-.036.03-.054l.033-.052.035-.05.038-.048.04-.046.042-.045.044-.042.046-.04.048-.038.05-.035.052-.033.053-.03.055-.028.056-.025.057-.022.058-.019.059-.016.06-.013.06-.01.061-.007.061,0,.061,0H13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M20.5,20.5V4.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M13,11.75l7.5-7.5,7.5,7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <circle cx="1.875" cy="1.875" r="1.875" transform="translate(28 24.875)" fill="currentColor" />
            </g>
          </g>
        </g>
      </svg>
      <button type="button" onClick={onCreateProject} className="absolute left-0 top-0 h-[61px] w-[300px]" aria-label="新建项目" />
      <button type="button" onClick={onCreateFolder} className="absolute left-[330px] top-0 h-[61px] w-[300px]" aria-label="新建文件夹" />
      <button type="button" onClick={onUploadProject} className="absolute left-[660px] top-0 h-[61px] w-[300px]" aria-label="上传项目" />
    </div>
  )
}

export default function TemplateWorkbench({
  items,
  slots,
  onCreateProject,
  onCreateFolder,
  onUploadProject,
  onImportProject,
  onOpenItem,
  onOpenWorkbenchCanvas,
  onSelectSection,
  onReturnToSource,
}: TemplateWorkbenchProps) {
  const [activeSection, setActiveSection] = useState<TemplateWorkbenchSection>('my-templates')
  const [layoutMode, setLayoutMode] = useState<TemplateWorkbenchLayout>(() => readLayoutCookie())
  const [route, setRoute] = useState<TemplateWorkbenchRoute>({ type: 'home' })
  const [registeredProjects, setRegisteredProjects] = useState<WorkbenchProjectIndex[]>([])
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; project: WorkbenchProjectIndex }
    | null
  >(null)
  const [editTarget, setEditTarget] = useState<WorkbenchProjectIndex | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkbenchProjectIndex | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // cover cache buster：替换/重传封面时给对应 sequence 递增 version，projectCoverUrl 会拼到 ?v=<version>，
  // 让 <img src> 变化从而绕过浏览器对同名 cover 的启发式缓存
  const [coverVersion, setCoverVersion] = useState<Record<string, number>>({})

  const reloadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/template-workbench/projects', { credentials: 'include' })
      if (!res.ok) return
      const projects = await res.json() as WorkbenchProjectIndex[]
      setRegisteredProjects(projects)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const projectItems = useMemo(() => {
    if (items) return items
    if (!registeredProjects.length) return defaultItems

    return registeredProjects.map(project => projectToItem(project, coverVersion[project.sequence] ?? 0))
  }, [items, registeredProjects, coverVersion])

  const selectedProject = useMemo(() => {
    if (route.type === 'home') return null
    return registeredProjects.find(project => project.sequence === route.sequence) ?? null
  }, [registeredProjects, route])

  const contentItems = useMemo(() => {
    if (route.type === 'home') return projectItems
    if (!selectedProject) return []
    const currentDir = normalizeWorkbenchPath(route.dir)
    const files = selectedProject.files ?? []
    const directFiles: typeof files = []
    const folderCounts = new Map<string, number>()
    for (const f of files) {
      const rel = normalizeWorkbenchPath(f.path?.trim() || f.name)
      if (!rel) continue
      const remaining = currentDir
        ? (rel.startsWith(`${currentDir}/`) ? rel.slice(currentDir.length + 1) : '')
        : rel
      if (!remaining) continue
      const slash = remaining.indexOf('/')
      if (slash === -1) {
        directFiles.push(f)
      } else {
        const child = remaining.slice(0, slash)
        const folder = currentDir ? `${currentDir}/${child}` : child
        folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
      }
    }
    const folderItems = Array.from(folderCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folder, count]) => createImportedFolderItem(selectedProject, folder, count))
    const directFileItems = [...directFiles]
      .sort((a, b) => normalizeWorkbenchPath(a.path || a.name).localeCompare(normalizeWorkbenchPath(b.path || b.name)))
      .map(file => createImportedFileItem(selectedProject, file))
    return [
      ...(currentDir ? [] : [createTemplateFileItem(selectedProject, coverVersion[selectedProject.sequence] ?? 0)]),
      ...folderItems,
      ...directFileItems,
    ]
  }, [projectItems, route, selectedProject, coverVersion])

  const cardLayout = useMemo(
    () => contentItems.map((_, index) => ({
      left: CARD_LEFT_START + (index % CARD_COLUMNS) * CARD_LEFT_STEP,
      top: CARD_TOP_START + Math.floor(index / CARD_COLUMNS) * CARD_TOP_STEP,
    })),
    [contentItems],
  )

  // main 高度按卡片排到的最底行自适应（最少保留原 1080px 设计稿高度）
  const mainMinHeight = useMemo(() => {
    const lastTop = cardLayout.length
      ? cardLayout[cardLayout.length - 1].top
      : CARD_TOP_START
    return Math.max(1080, lastTop + 207 + 80)
  }, [cardLayout])

  const contentTitle = route.type === 'home'
    ? '全部项目'
    : (route.dir ? basename(route.dir) : selectedProject?.mod_name) || '项目内容'
  const contentSecondaryLabel = route.type === 'home' ? '回收站' : '返回上级'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/template-workbench/projects', { credentials: 'include' })
        if (!response.ok) return
        const projects = await response.json() as WorkbenchProjectIndex[]
        if (!cancelled) setRegisteredProjects(projects)
      } catch (error) {
        console.error(error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadProjects])

  const selectSection = (section: TemplateWorkbenchSection) => {
    setActiveSection(section)
    setRoute({ type: 'home' })
    onSelectSection?.(section)
  }

  const createDeploymentProject = () => {
    onCreateProject?.()
    setCreateProjectDialogOpen(true)
  }

  const handleCreatedProject = (project: CreatedProjectInfo) => {
    setCreateProjectDialogOpen(false)
    setRegisteredProjects(prev => prev.some(item => item.sequence === project.sequence) ? prev : [...prev, project])
    onOpenWorkbenchCanvas?.(project.sequence)
  }

  const openItem = async (item: TemplateWorkbenchItem) => {
    onOpenItem?.(item)
    if (item.role === 'project' && item.sequence && item.displayMode === 'folder') {
      setRoute({ type: 'project', sequence: item.sequence, dir: '' })
      return
    }
    if (item.role === 'imported-folder' && item.sequence) {
      setRoute({ type: 'project', sequence: item.sequence, dir: normalizeWorkbenchPath(item.sourcePath) })
      return
    }
    if (item.role === 'imported-file') return
    if (item.type !== 'deployment-flow' && item.role !== 'template-file') return

    if (item.sequence) {
      onOpenWorkbenchCanvas?.(item.sequence)
      return
    }

    // 无 sequence 的占位项（demo）：直接走新建流程
    setCreateProjectDialogOpen(true)
  }

  const navigateBackInWorkbench = () => {
    if (route.type === 'project') {
      if (route.dir) {
        setRoute({ type: 'project', sequence: route.sequence, dir: parentWorkbenchPath(route.dir) })
        return
      }
      setRoute({ type: 'home' })
    }
  }

  const toggleLayoutMode = () => {
    setLayoutMode(prev => {
      const next = prev === 'card' ? 'list' : 'card'
      writeLayoutCookie(next)
      return next
    })
  }

  const handleContextMenu = (event: React.MouseEvent, item: TemplateWorkbenchItem) => {
    if (!item.sequence) return
    const project = registeredProjects.find(p => p.sequence === item.sequence)
    if (!project) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, project })
  }

  const handleContextAction = async (action: ProjectContextAction) => {
    if (!contextMenu) return
    const project = contextMenu.project
    setContextMenu(null)
    if (action === 'delete') {
      setDeleteTarget(project)
      return
    }
    if (action === 'edit') {
      setEditTarget(project)
      return
    }
    if (action === 'auto' || action === 'folder' || action === 'card') {
      try {
        const res = await fetch(
          `/api/template-workbench/projects/${encodeURIComponent(project.sequence)}/display-mode`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: action }),
          },
        )
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          throw new Error(`切换失败 (${res.status}): ${txt}`)
        }
        const updated = await res.json() as WorkbenchProjectIndex
        setRegisteredProjects(prev => prev.map(p => p.sequence === updated.sequence ? updated : p))
      } catch (err) {
        setActionError((err as Error).message ?? String(err))
      }
    }
  }

  const handleEditedProject = (updated: EditableProject) => {
    setEditTarget(null)
    // 完全用后端最新数据重拉一次（GET /projects），避免 partial update 与后端隐式
    // 状态（如 display_mode 自动重算）不同步。cover 字段一定会反映最新值。
    // 同步给该 sequence 递增 cover version，强制同名 cover 文件被 <img> 重新请求（绕开浏览器缓存）
    if (updated.cover) {
      setCoverVersion(prev => ({ ...prev, [updated.sequence]: Date.now() }))
    }
    void reloadProjects()
    void updated
  }

  const handleDeleteProject = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      const res = await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(target.sequence)}`,
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`删除失败 (${res.status}): ${txt}`)
      }
      const data = await res.json() as { disk_cleaned?: boolean; disk_error?: string | null }
      if (!data.disk_cleaned) {
        setActionError(`项目已从列表移除，但部分文件无法删除：${data.disk_error ?? '未知原因'}。请手动清理磁盘。`)
      }
      setRegisteredProjects(prev => prev.filter(p => p.sequence !== target.sequence))
    } catch (err) {
      setActionError((err as Error).message ?? String(err))
    }
  }

  return (
    <div className="template-workbench relative h-full w-full overflow-hidden" style={{ background: 'var(--twb-bg)', color: 'var(--twb-text)' }}>
      <aside className="absolute left-0 top-0 z-10 h-[1080px] w-[350px]" style={{ background: 'var(--twb-sidebar-bg)' }}>
        <button
          type="button"
          onClick={onReturnToSource}
          className="absolute left-[20px] top-[20px] flex h-[40px] items-center transition-colors hover:bg-[var(--twb-hover)]"
          style={{ width: 210, color: 'var(--twb-text)' }}
          aria-label="返回进入工作台前的页面"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.png`}
            alt=""
            aria-hidden
            className="h-[40px] w-[40px] rounded-[10px] object-cover"
          />
          <span className="ml-[10px] leading-none" style={{ fontFamily: font, fontSize: 30, fontWeight: 900 }}>
            MCStart
          </span>
        </button>

        {sidebarItems.map(({ id, label, icon: Icon, top }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSection(id)}
            className="absolute flex items-center text-left transition-colors hover:bg-[var(--twb-hover)]"
            style={{
              left: 20,
              top,
              width: 214,
              height: 40,
              background: activeSection === id ? 'var(--twb-selected)' : 'transparent',
              border: activeSection === id ? '1px solid var(--twb-blue)' : '1px solid transparent',
              color: 'var(--twb-text)',
            }}
          >
            <Icon size={32} className="ml-[3px]" />
            <span className="ml-[12px] leading-none" style={{ fontFamily: font, fontSize: 25, fontWeight: 500 }}>{label}</span>
          </button>
        ))}

        <div className="absolute left-[25px] top-[278px] h-px w-[300px]" style={{ background: 'var(--twb-border)' }} />
        <button
          type="button"
          onClick={() => selectSection('starred')}
          className="absolute flex items-center text-left transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 17, top: 296, width: 316, height: 40, color: 'var(--twb-text)' }}
        >
          <Star size={32} />
          <span className="ml-[17px] leading-none" style={{ fontFamily: font, fontSize: 25, fontWeight: 500 }}>星标工作台</span>
          <CirclePlus size={28} className="ml-auto" />
        </button>

        {slots?.sidebarFooter && <div className="absolute left-[25px] bottom-[25px] right-[25px]">{slots.sidebarFooter}</div>}
      </aside>

      <header className="absolute left-[350px] top-0 z-10 h-[71px] w-[1570px] border-b" style={{ borderColor: 'var(--twb-border)' }}>
        <button
          type="button"
          onClick={onCreateProject}
          className="absolute flex items-center justify-center transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 18, top: 19, width: 33, height: 33, color: 'var(--twb-text)' }}
        >
          <Plus size={32} />
        </button>
        <div className="absolute left-[69px] top-[16px] h-[40px] w-px" style={{ background: 'var(--twb-border)' }} />
        <label className="absolute flex items-center rounded-[6px] border" style={{ left: 95, top: 15, width: 482, height: 41, borderColor: 'var(--twb-border)', color: 'var(--twb-muted)' }}>
          <Search size={30} className="ml-[10px]" />
          <input
            className="ml-[10px] min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--twb-muted)]"
            placeholder="搜索项目、文件、文件夹"
            style={{ color: 'var(--twb-text)', fontFamily: font, fontSize: 20, fontWeight: 300 }}
          />
        </label>
        <div className="absolute" style={{ right: 30, top: 15 }}>{slots?.toolbarTrailing}</div>
        <button
          type="button"
          onClick={onReturnToSource}
          className="absolute flex items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 1345, top: 15, width: 41, height: 41, color: 'var(--twb-text)' }}
          aria-label="返回进入工作台前的页面"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="41" height="41" viewBox="0 0 41 41" fill="none" aria-hidden>
            <path
              fill="currentColor"
              d="M5.5 0L35.5 0C38.5376 0 41 2.46243 41 5.5L41 35.5C41 38.5376 38.5376 41 35.5 41L5.5 41C2.46243 41 2.98023e-08 38.5376 2.98023e-08 35.5L2.98023e-08 5.5C2.98023e-08 2.46243 2.46243 0 5.5 0ZM5.5 1C3.01472 1 1 3.01472 1 5.5L1 35.5C1 37.9853 3.01472 40 5.5 40L35.5 40C37.9853 40 40 37.9853 40 35.5L40 5.5C40 3.01472 37.9853 1 35.5 1L5.5 1Z"
            />
            <path
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              d="M26.5 17.5L26.5 21.5L14.5 21.5"
            />
            <path
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              d="M17.5 18.5L14.5 21.5L17.5 24.5"
            />
            <path
              fill="currentColor"
              d="M9.5 9.5L31.5 9.5C32.6046 9.5 33.5 10.3954 33.5 11.5L33.5 29.5C33.5 30.6046 32.6046 31.5 31.5 31.5L9.5 31.5C8.39543 31.5 7.5 30.6046 7.5 29.5L7.5 11.5C7.5 10.3954 8.39543 9.5 9.5 9.5ZM9.5 11.5C9.5 11.5 9.5 11.5 9.5 11.5L9.5 29.5C9.5 29.5 9.5 29.5 9.5 29.5L31.5 29.5C31.5 29.5 31.5 29.5 31.5 29.5L31.5 11.5C31.5 11.5 31.5 11.5 31.5 11.5L9.5 11.5Z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onImportProject}
          className="absolute flex items-center rounded-[6px] border transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 1406, top: 15, width: 134, height: 41, borderColor: 'var(--twb-border)', color: 'var(--twb-text)' }}
        >
          <Upload size={32} className="ml-[8px]" />
          <span className="ml-[4px] leading-none" style={{ fontFamily: font, fontSize: 20, fontWeight: 500 }}>导入项目</span>
        </button>
      </header>

      <main className="absolute left-0 top-0 z-0 w-[1920px] pb-[80px]" style={{ minHeight: mainMinHeight }}>
        <ContentHeader
          layoutMode={layoutMode}
          onToggleLayout={toggleLayoutMode}
          title={contentTitle}
          secondaryLabel={contentSecondaryLabel}
          onSecondaryClick={navigateBackInWorkbench}
        />

        <QuickActions
          onCreateProject={createDeploymentProject}
          onCreateFolder={onCreateFolder}
          onUploadProject={onUploadProject}
        />

        {slots?.contentLeading}

        {layoutMode === 'card' && contentItems.map((item, index) => (
          <ProjectCard
            key={item.id}
            item={item}
            left={cardLayout[index].left}
            top={cardLayout[index].top}
            onOpen={openItem}
            onContextMenu={handleContextMenu}
          />
        ))}

        {layoutMode === 'list' && (
          <ProjectList items={contentItems} onOpen={openItem} onContextMenu={handleContextMenu} />
        )}

        {slots?.contentTrailing}
      </main>

      <CreateProjectDialog
        open={createProjectDialogOpen}
        onClose={() => setCreateProjectDialogOpen(false)}
        onCreated={handleCreatedProject}
      />

      {contextMenu && (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          project={{
            sequence: contextMenu.project.sequence,
            mod_name: contextMenu.project.mod_name,
            force_folder: contextMenu.project.force_folder ?? null,
          }}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}

      <EditProjectDialog
        open={editTarget !== null}
        project={
          editTarget
            ? {
                sequence: editTarget.sequence,
                mod_name: editTarget.mod_name,
                mod_id: editTarget.mod_id ?? '',
                description: editTarget.description ?? '',
                author: editTarget.author ?? '',
                path: editTarget.path,
                cover: editTarget.cover ?? null,
              }
            : null
        }
        onClose={() => setEditTarget(null)}
        onSaved={handleEditedProject}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        projectName={deleteTarget?.mod_name ?? ''}
        projectPath={deleteTarget?.path ?? ''}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProject}
      />

      {actionError && (
        <div
          className="absolute right-4 top-4 z-[40] max-w-sm rounded-lg border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm text-red-100 shadow-lg"
          role="alert"
        >
          {actionError}
          <button
            type="button"
            className="ml-3 underline opacity-80 hover:opacity-100"
            onClick={() => setActionError(null)}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
