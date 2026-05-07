import { useState, type ReactNode } from 'react'
import {
  CirclePlus,
  Clock,
  Cloud,
  File,
  Folder,
  Globe,
  Plus,
  Search,
  Star,
  Upload,
} from 'lucide-react'
import { CardSquaresIcon, ListDashesIcon } from '../components/icons/SidebarIcons'

export type TemplateWorkbenchSection = 'recent' | 'my-templates' | 'market' | 'starred'
export type TemplateWorkbenchItemType = 'deployment-flow' | 'folder' | 'script' | 'archive'
export type TemplateWorkbenchLayout = 'card' | 'list'

export interface TemplateWorkbenchItem {
  id: string
  name: string
  type: TemplateWorkbenchItemType
  updatedAt: string
  childCount?: number
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
  onSelectSection?: (section: TemplateWorkbenchSection) => void
}

const defaultItems: TemplateWorkbenchItem[] = [
  { id: 'draft-1', name: '未命名', type: 'deployment-flow', updatedAt: '20分钟前' },
  { id: 'draft-2', name: '未命名1', type: 'deployment-flow', updatedAt: '22分钟前' },
  { id: 'draft-3', name: '未命名2', type: 'deployment-flow', updatedAt: '30分钟前' },
  { id: 'folder-abc', name: 'abc', type: 'folder', updatedAt: '昨天', childCount: 3 },
]

const sidebarItems: Array<{ id: TemplateWorkbenchSection; label: string; icon: typeof Clock; top: number }> = [
  { id: 'recent', label: '最近', icon: Clock, top: 96 },
  { id: 'my-templates', label: '我的模板', icon: File, top: 149 },
  { id: 'market', label: '资源集市', icon: Globe, top: 202 },
]

const cardPositions = [
  { left: 400, top: 306 },
  { left: 693, top: 306 },
  { left: 986, top: 306 },
  { left: 1279, top: 306 },
]

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"

function typeLabel(type: TemplateWorkbenchItemType) {
  const labels: Record<TemplateWorkbenchItemType, string> = {
    'deployment-flow': '部署流程',
    folder: '文件夹',
    script: '部署脚本',
    archive: '归档包',
  }
  return labels[type]
}

function FileCard({
  item,
  left,
  top,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="absolute rounded-[10px] border text-left transition-colors hover:bg-[var(--twb-hover)]"
      style={{ left, top, width: 272, height: 206.72, borderColor: 'var(--twb-card-border)', color: 'var(--twb-text)' }}
    >
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

function FolderCard({
  item,
  left,
  top,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
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

function ProjectCard({
  item,
  left,
  top,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  if (item.type === 'folder') return <FolderCard item={item} left={left} top={top} onOpen={onOpen} />
  return <FileCard item={item} left={left} top={top} onOpen={onOpen} />
}

function ProjectRow({
  item,
  index,
  topBase,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  index: number
  topBase: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  const top = topBase + index * 80
  const isFolder = item.type === 'folder'
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="absolute text-left transition-colors hover:bg-[var(--twb-hover)]"
      style={{ left: 400, top, width: 1470, height: 60, color: 'var(--twb-text)' }}
    >
      <div className="absolute rounded-[5px] border" style={{ left: 0, top: 0, width: 60, height: 60, borderColor: 'var(--twb-card-border)' }} />
      {!isFolder && <Star size={25} strokeWidth={1.5} className="absolute" style={{ left: 73, top: 18 }} />}
      <div className="absolute leading-none" style={{ left: isFolder ? 69 : 103, top: 24, fontFamily: font, fontSize: 25, fontWeight: 300 }}>
        {item.name}
      </div>
      <div className="absolute flex items-center leading-none" style={{ left: 571, top: 22, fontFamily: font, fontSize: 25, fontWeight: 300 }}>
        {isFolder ? <Folder size={31} className="mr-[2px]" /> : <Cloud size={31} className="mr-[2px]" />}
        {typeLabel(item.type)}
      </div>
      <div className="absolute leading-none" style={{ left: 1119, top: 24, color: 'var(--twb-muted)', fontFamily: font, fontSize: 25, fontWeight: 300 }}>
        {item.updatedAt}
      </div>
    </button>
  )
}

function ContentHeader({
  layoutMode,
  onToggleLayout,
}: {
  layoutMode: TemplateWorkbenchLayout
  onToggleLayout: () => void
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
              全部项目
            </text>
          </g>
          <text transform="translate(530 130)" fill="currentColor" fontSize="30" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">
            回收站
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
      <button type="button" className="absolute left-0 top-0 h-[48px] w-[120px]" aria-label="全部项目" />
      <button type="button" className="absolute left-[130px] top-0 h-[48px] w-[120px]" aria-label="回收站" />
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
  onSelectSection,
}: TemplateWorkbenchProps) {
  const [activeSection, setActiveSection] = useState<TemplateWorkbenchSection>('my-templates')
  const [layoutMode, setLayoutMode] = useState<TemplateWorkbenchLayout>('card')
  const projectItems = items ?? defaultItems

  const selectSection = (section: TemplateWorkbenchSection) => {
    setActiveSection(section)
    onSelectSection?.(section)
  }

  return (
    <div className="template-workbench relative h-full w-full overflow-hidden" style={{ background: 'var(--twb-bg)', color: 'var(--twb-text)' }}>
      <aside className="absolute left-0 top-0 z-10 h-[1080px] w-[350px]" style={{ background: 'var(--twb-sidebar-bg)' }}>
        <div className="absolute left-[70px] top-[29px] leading-none" style={{ fontFamily: font, fontSize: 30, fontWeight: 900 }}>
          MCStart
        </div>

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
          onClick={onImportProject}
          className="absolute flex items-center rounded-[6px] border transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 1406, top: 15, width: 134, height: 41, borderColor: 'var(--twb-border)', color: 'var(--twb-text)' }}
        >
          <Upload size={32} className="ml-[8px]" />
          <span className="ml-[4px] leading-none" style={{ fontFamily: font, fontSize: 20, fontWeight: 500 }}>导入项目</span>
        </button>
      </header>

      <main className="absolute left-0 top-0 z-0 h-[1080px] w-[1920px]">
        <ContentHeader
          layoutMode={layoutMode}
          onToggleLayout={() => setLayoutMode(prev => prev === 'card' ? 'list' : 'card')}
        />

        <QuickActions
          onCreateProject={onCreateProject}
          onCreateFolder={onCreateFolder}
          onUploadProject={onUploadProject}
        />

        {slots?.contentLeading}

        {layoutMode === 'card' && projectItems.slice(0, 4).map((item, index) => (
          <ProjectCard
            key={item.id}
            item={item}
            left={cardPositions[index].left}
            top={cardPositions[index].top}
            onOpen={onOpenItem}
          />
        ))}

        {layoutMode === 'list' && (
          <>
            <div className="absolute leading-none" style={{ left: 400, top: 306, color: 'var(--twb-muted)', fontFamily: font, fontSize: 20, fontWeight: 300 }}>名称</div>
            <div className="absolute leading-none" style={{ left: 940, top: 306, color: 'var(--twb-muted)', fontFamily: font, fontSize: 20, fontWeight: 300 }}>文件类型</div>
            <div className="absolute leading-none" style={{ left: 1520, top: 306, color: 'var(--twb-muted)', fontFamily: font, fontSize: 20, fontWeight: 300 }}>更新时间</div>
            <div className="absolute h-px w-[1470px]" style={{ left: 400, top: 338, background: 'var(--twb-border-soft)' }} />

            {projectItems.map((item, index) => (
              <ProjectRow key={item.id} item={item} index={index} topBase={350} onOpen={onOpenItem} />
            ))}
          </>
        )}

        {slots?.contentTrailing}
      </main>
    </div>
  )
}
