import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockMeta, type WorkbenchPoint } from '../types'

const inputPortOffset: WorkbenchPoint = { x: 5, y: 115.5 }

function AddConnectorButton() {
  return (
    <g>
      <circle cx="12" cy="12" r="12" transform="translate(294 104)" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <path d="M301,116h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M306,111v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </g>
  )
}

function InputPort() {
  return (
    <g transform={`translate(${inputPortOffset.x - 2.5} ${inputPortOffset.y - 2.5})`}>
      <circle cx="2.5" cy="2.5" r="2.5" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </g>
  )
}

function TextLine({
  y,
  label,
  value,
}: {
  y: number
  label: string
  value: string
}) {
  return (
    <text x="15" y={y} fontSize="20" fontFamily={workbenchCanvasFont} fontWeight="500">
      <tspan>{label}</tspan>
      <tspan fontWeight="300">{value}</tspan>
    </text>
  )
}

export default function InitBlock({
  position,
  selected,
  meta,
  dragHandlers,
}: {
  position: WorkbenchPoint
  selected: boolean
  meta: WorkbenchBlockMeta
  dragHandlers?: WorkbenchBlockDragHandlers
}) {
  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      <rect x="5" y="5" width="301" height="221" rx="30" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      {selected && (
        <path
          d="M36,0H276a36,36,0,0,1,36,36V195a36,36,0,0,1-36,36H36A36,36,0,0,1,0,195V36A36,36,0,0,1,36,0Zm0,2A34,34,0,0,0,2,36V195a34,34,0,0,0,34,34H276a34,34,0,0,0,34-34V36A34,34,0,0,0,276,2Z"
          fill="var(--dfw-blue)"
        />
      )}
      <path d="M30,0H271a30,30,0,0,1,30,30V53H0V30A30,30,0,0,1,30,0Z" transform="translate(5 5)" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <text x="20" y="42" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="500">初始化块</text>
      <TextLine y={89} label="作者：" value={meta.author} />
      <TextLine y={115} label="标签 ： " value={meta.tags} />
      <TextLine y={141} label="描述 ： " value={meta.description} />
      <TextLine y={167} label="模板ID ： " value={meta.templateId} />
      <TextLine y={193} label="模板名 ： " value={meta.templateName} />
      <text x="21" y="211" fontSize="20" fontFamily={workbenchCanvasFont} fontWeight="500">......</text>
      <AddConnectorButton />
      <InputPort />
      <g
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={dragHandlers?.onHeaderPointerDown}
        onPointerMove={dragHandlers?.onHeaderPointerMove}
        onPointerUp={dragHandlers?.onHeaderPointerUp}
        onPointerCancel={dragHandlers?.onHeaderPointerCancel}
      >
        <path d="M30,0H271a30,30,0,0,1,30,30V53H0V30A30,30,0,0,1,30,0Z" transform="translate(5 5)" fill="transparent" />
      </g>
    </g>
  )
}
