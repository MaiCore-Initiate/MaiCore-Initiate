import SystemOverviewCard from '../components/home/SystemOverviewCard'
import InstanceOverviewCard from '../components/home/InstanceOverviewCard'
import QuickAccessCard from '../components/home/QuickAccessCard'
import DashboardChartCard from '../components/home/DashboardChartCard'

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6 p-6 h-full">
      {/* 第一行：等宽 */}
      <div className="grid grid-cols-2 gap-6">
        <SystemOverviewCard />
        <InstanceOverviewCard />
      </div>
      {/* 第二行：快捷访问固定390px，仪表盘填满 */}
      <div className="flex gap-6 flex-1 min-h-0">
        <div className="w-[390px] shrink-0">
          <QuickAccessCard />
        </div>
        <div className="flex-1 min-w-0">
          <DashboardChartCard />
        </div>
      </div>
    </div>
  )
}
