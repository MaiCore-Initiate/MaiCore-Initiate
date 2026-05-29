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

export interface WorkbenchCanvasProps {
  viewport: WorkbenchCanvasViewport
  selectedBlockId?: string
  blockMeta?: Partial<WorkbenchBlockMeta>
}
