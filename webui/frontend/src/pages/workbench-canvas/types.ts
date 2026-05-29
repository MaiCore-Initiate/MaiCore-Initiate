import type { PointerEvent } from 'react'

export const workbenchCanvasFont = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"

export interface WorkbenchCanvasViewport {
  scale: number
  x: number
  y: number
}

export interface WorkbenchBlockMeta {
  author: string
  tags: string[]
  description: string
  modId: string
  modName: string
  version: string
  minVersion: string
  maxVersion: string
  fileImport: boolean | null
  fileImportList: string[]
  runtime: string
  denoNet: boolean | null
  denoRead: boolean | null
  denoWrite: boolean | null
  denoEnv: boolean | null
  denoRun: boolean | null
  denoHrtime: boolean | null
  denoFfi: boolean | null
  denoSys: boolean | null
  denoAll: boolean | null
  denoCustomPermissions: boolean | null
  denoPermissionList: string[]
  platforms: string[]
  schemaVersion: string
}

export interface WorkbenchPoint {
  x: number
  y: number
}

export interface WorkbenchAddNodeAnchor {
  id: number
  point: WorkbenchPoint
}

export interface WorkbenchSize {
  width: number
  height: number
}

export interface WorkbenchCanvasProps {
  viewport: WorkbenchCanvasViewport
  addNodeAnchor?: WorkbenchAddNodeAnchor | null
  selectedBlockId?: WorkbenchBlockId | null
  onSelectedBlockChange?: (blockId: WorkbenchBlockId | null) => void
  blockMeta?: Partial<WorkbenchBlockMeta>
}

export type WorkbenchBlockId = 'start' | 'init' | 'components'

export interface WorkbenchBlockDragHandlers {
  onHeaderPointerDown?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerMove?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerUp?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerCancel?: (event: PointerEvent<SVGGElement>) => void
}

export type WorkbenchResizeDirection = 'right' | 'bottom' | 'corner'

export interface WorkbenchBlockResizeHandlers {
  onResizePointerDown?: (direction: WorkbenchResizeDirection, event: PointerEvent<SVGRectElement>) => void
  onResizePointerMove?: (event: PointerEvent<SVGRectElement>) => void
  onResizePointerUp?: (event: PointerEvent<SVGRectElement>) => void
  onResizePointerCancel?: (event: PointerEvent<SVGRectElement>) => void
}
