import type { PointerEvent } from 'react'

export const workbenchCanvasFont = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"

export interface WorkbenchCanvasViewport {
  scale: number
  canvasX: number
  canvasY: number
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

export interface WorkbenchCanvasProps {
  viewport: WorkbenchCanvasViewport
  selectedBlockId?: string
  blockMeta?: Partial<WorkbenchBlockMeta>
}

export interface WorkbenchBlockDragHandlers {
  onHeaderPointerDown?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerMove?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerUp?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerCancel?: (event: PointerEvent<SVGGElement>) => void
}
