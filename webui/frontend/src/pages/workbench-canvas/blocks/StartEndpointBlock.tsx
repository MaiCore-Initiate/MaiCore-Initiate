import type { WorkbenchBlockDragHandlers, WorkbenchPoint } from '../types'

const outputPortOffset: WorkbenchPoint = { x: 95.711, y: 70.711 }

function PortCircle({ point }: { point: WorkbenchPoint }) {
  return (
    <g transform={`translate(${point.x - 2.5} ${point.y - 2.5})`}>
      <circle cx="2.5" cy="2.5" r="2.5" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </g>
  )
}

export default function StartEndpointBlock({
  position,
  selected,
  onSelect,
  dragHandlers,
}: {
  position: WorkbenchPoint
  selected: boolean
  onSelect?: () => void
  dragHandlers?: WorkbenchBlockDragHandlers
}) {
  return (
    <g transform={`translate(${position.x} ${position.y})`} data-workbench-block-id="start">
      {selected && (
        <circle cx="70.711" cy="71.066" r="66" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}
      <path
        d="M109.6,109.6a55.047,55.047,0,1,1-.218-78q.087.086.17.177t.162.185q.078.094.152.193t.142.2q.069.1.132.207t.123.213q.058.108.111.219t.1.224q.047.113.089.229t.079.233q.036.117.066.236t.055.239q.025.12.044.242t.031.243q.013.122.019.245t.008.245q0,.123,0,.245t-.017.245q-.011.122-.028.244t-.041.242q-.023.121-.052.24t-.065.237q-.035.118-.075.233t-.087.229q-.047.114-.1.225t-.109.22q-.057.109-.119.214t-.131.208q-.067.1-.14.2t-.15.194q-.077.1-.159.187t-.168.179q-.087.087-.177.17t-.185.161q-.094.078-.193.152t-.2.142q-.1.069-.206.132t-.213.122q-.108.058-.219.112t-.223.1q-.114.048-.229.09t-.233.078q-.117.036-.236.067t-.239.055q-.12.025-.241.043t-.244.031q-.122.013-.244.019t-.246.007q-.122,0-.245,0t-.245-.017q-.122-.011-.244-.029t-.242-.041q-.12-.023-.239-.053t-.237-.064q-.118-.035-.234-.076t-.229-.087q-.114-.046-.225-.1t-.22-.109q-.108-.057-.214-.12t-.208-.13q-.1-.068-.2-.14t-.194-.15q-.095-.077-.187-.159t-.178-.168A45.129,45.129,0,0,0,95.29,33a44.732,44.732,0,0,0-16.124-6.5,45.145,45.145,0,0,0-25.446,2.52,44.53,44.53,0,0,0-7.791,4.11,45,45,0,1,0,56.6,69.392q.087-.086.178-.169t.186-.16q.095-.078.194-.151t.2-.141q.1-.069.208-.132t.213-.121q.108-.057.219-.11t.225-.1q.113-.047.229-.089t.233-.077q.117-.035.236-.065t.24-.054q.12-.024.241-.042t.244-.03q.122-.012.245-.018t.245-.006q.123,0,.245.006t.245.018q.122.012.244.03t.241.042q.121.024.24.054t.236.065q.118.036.233.077t.229.089q.114.047.225.1t.219.11q.108.058.214.121t.207.132q.1.068.2.141t.193.151q.095.078.186.16t.178.169q.086.087.169.178t.16.186q.078.095.151.194t.141.2q.069.1.132.207t.121.214q.057.108.11.219t.1.225q.047.113.089.229t.077.233q.035.117.065.236t.054.24q.024.12.042.241t.03.244q.012.122.018.245t.006.245q0,.123-.006.245t-.018.245q-.012.122-.03.244t-.042.241q-.024.121-.054.24t-.065.236q-.036.118-.077.233t-.089.229q-.047.114-.1.225t-.11.219q-.058.108-.121.214t-.132.207q-.068.1-.141.2t-.151.193q-.078.095-.16.186T109.6,109.6Z"
        fill="currentColor"
      />
      <circle cx="70.711" cy="71.066" r="25" fill="none" stroke="currentColor" strokeWidth="10" />
      <PortCircle point={outputPortOffset} />
      <g
        className="cursor-grab active:cursor-grabbing"
        onClick={event => {
          event.stopPropagation()
          onSelect?.()
        }}
        onPointerDown={dragHandlers?.onHeaderPointerDown}
        onPointerMove={dragHandlers?.onHeaderPointerMove}
        onPointerUp={dragHandlers?.onHeaderPointerUp}
        onPointerCancel={dragHandlers?.onHeaderPointerCancel}
      >
        <circle cx="70.711" cy="71.066" r="61" fill="transparent" />
      </g>
    </g>
  )
}
