import { useEffect, useMemo, useRef, useState } from 'react'
import SystemOverviewCard from '../components/home/SystemOverviewCard'
import InstanceOverviewCard from '../components/home/InstanceOverviewCard'
import QuickAccessCard from '../components/home/QuickAccessCard'
import DashboardChartCard from '../components/home/DashboardChartCard'
import type { Page, SubPageParams } from '../types'

const d = (i: number) => ({ animationDelay: `${i * 80}ms` })

type HomeLayoutMode = 'compact' | 'medium' | 'wide'

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return { ref, size }
}

export default function HomePage({
  onNavigate
}: {
  onNavigate?: (page: Page, params?: SubPageParams) => void
}) {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const layoutMode: HomeLayoutMode = size.width >= 1360 ? 'wide' : size.width >= 1100 ? 'medium' : 'compact'
  const isShort = size.height > 0 && size.height < 720
  const gap = isShort ? 16 : 24
  const topMinHeight = isShort ? 214 : 252
  const quickMinHeight = isShort ? 240 : 292
  const chartMinHeight = isShort ? 320 : 380

  const layout = useMemo(() => {
    if (layoutMode === 'wide') {
      return {
        columns: 'repeat(12, minmax(0, 1fr))',
        rows: `${topMinHeight}px minmax(${chartMinHeight}px, 1fr)`,
        areas: [
          '"system system system system system system instance instance instance instance instance instance"',
          '"quick quick quick dashboard dashboard dashboard dashboard dashboard dashboard dashboard dashboard dashboard"',
        ].join(' '),
      }
    }

    if (layoutMode === 'medium') {
      return {
        columns: 'repeat(2, minmax(0, 1fr))',
        rows: 'auto auto auto',
        areas: [
          '"system instance"',
          '"quick quick"',
          '"dashboard dashboard"',
        ].join(' '),
      }
    }

    return {
      columns: 'minmax(0, 1fr)',
      rows: 'auto auto auto auto',
      areas: [
        '"system"',
        '"instance"',
        '"quick"',
        '"dashboard"',
      ].join(' '),
    }
  }, [chartMinHeight, layoutMode, topMinHeight])

  const cardStyle = (area: string, minHeight: number, animationIndex: number) => ({
    ...d(animationIndex),
    gridArea: area,
    minHeight,
  })

  return (
    <div ref={ref} className="h-full overflow-auto p-[clamp(14px,1.25vw,24px)]">
      <div
        className="mx-auto grid min-h-full w-full auto-rows-min"
        style={{
          maxWidth: layoutMode === 'wide' ? 1760 : '100%',
          gap,
          gridTemplateColumns: layout.columns,
          gridTemplateRows: layout.rows,
          gridTemplateAreas: layout.areas,
        }}
      >
        <div className="min-w-0 animate-card-enter" style={cardStyle('system', topMinHeight, 0)}><SystemOverviewCard /></div>
        <div className="min-w-0 animate-card-enter" style={cardStyle('instance', topMinHeight, 1)}><InstanceOverviewCard /></div>
        <div className="min-w-0 animate-card-enter" style={cardStyle('quick', quickMinHeight, 2)}>
          <QuickAccessCard onNavigate={onNavigate} />
        </div>
        <div className="min-w-0 animate-card-enter" style={cardStyle('dashboard', chartMinHeight, 3)}>
          <DashboardChartCard />
        </div>
      </div>
    </div>
  )
}
