import SystemOverviewCard from '../components/home/SystemOverviewCard'
import InstanceOverviewCard from '../components/home/InstanceOverviewCard'
import QuickAccessCard from '../components/home/QuickAccessCard'
import DashboardChartCard from '../components/home/DashboardChartCard'
import type { Page, SubPageParams } from '../types'

const d = (i: number) => ({ animationDelay: `${i * 80}ms` })

export default function HomePage({
  onNavigate
}: {
  onNavigate?: (page: Page, params?: SubPageParams) => void
}) {
  return (
    <div className="flex flex-col gap-6 p-6 h-full">
      {/* 第一行：等宽 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="animate-card-enter" style={d(0)}><SystemOverviewCard /></div>
        <div className="animate-card-enter" style={d(1)}><InstanceOverviewCard /></div>
      </div>
      {/* 第二行：快捷访问固定390px，仪表盘填满 */}
      <div className="flex gap-6 flex-1 min-h-0">
        <div className="w-[390px] shrink-0 animate-card-enter" style={d(2)}>
          <QuickAccessCard onNavigate={onNavigate} />
        </div>
        <div className="flex-1 min-w-0 animate-card-enter" style={d(3)}>
          <DashboardChartCard />
        </div>
      </div>
    </div>
  )
}
