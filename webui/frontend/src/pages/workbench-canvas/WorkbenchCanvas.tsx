import CanvasConnectionLayer from './CanvasConnectionLayer'
import InitBlock from './blocks/InitBlock'
import StartEndpointBlock from './blocks/StartEndpointBlock'
import { workbenchCanvasFont, type WorkbenchBlockMeta, type WorkbenchCanvasProps } from './types'

const defaultBlockMeta: WorkbenchBlockMeta = {
  author: 'MCStartTeam',
  tags: 'test',
  description: '这是一个基于MCStart...',
  templateId: 'MaiCore-Start.Deplo...',
  templateName: '示例部署模组',
}

export default function WorkbenchCanvas({
  viewport,
  selectedBlockId = 'init',
  blockMeta,
}: WorkbenchCanvasProps) {
  const meta = { ...defaultBlockMeta, ...blockMeta }

  return (
    <div
      className="absolute left-0 top-0 z-0 h-[1920px] w-[1920px] origin-top-left"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        color: 'var(--dfw-text)',
        fontFamily: workbenchCanvasFont,
      }}
      aria-hidden
    >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" className="block overflow-visible">
        <StartEndpointBlock />
        <InitBlock selected={selectedBlockId === 'init'} meta={meta} />
        <CanvasConnectionLayer />
      </svg>
    </div>
  )
}
