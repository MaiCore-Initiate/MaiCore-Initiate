import type { PointerEvent } from 'react'

export const workbenchCanvasFont = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"

export interface WorkbenchCanvasViewport {
  scale: number
  x: number
  y: number
}

export interface WorkbenchBlockMeta {
  author: string
  tags: string
  description: string
  templateId: string
  templateName: string
}

export interface WorkbenchPoint {
  x: number
  y: number
}

export interface WorkbenchSize {
  width: number
  height: number
}

export interface WorkbenchCanvasProps {
  viewport: WorkbenchCanvasViewport
  selectedBlockId?: WorkbenchBlockId | null
  onSelectedBlockChange?: (blockId: WorkbenchBlockId | null) => void
  blockMeta?: Partial<WorkbenchBlockMeta>
}

export type WorkbenchBlockId = 'start' | 'init'

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
