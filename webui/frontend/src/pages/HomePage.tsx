import SystemOverviewCard from '../components/home/SystemOverviewCard'
import InstanceOverviewCard from '../components/home/InstanceOverviewCard'
import QuickAccessCard from '../components/home/QuickAccessCard'
import DashboardChartCard from '../components/home/DashboardChartCard'

export default function HomePage() {
  return (
    <div className="grid grid-cols-2 gap-6 p-6 h-full auto-rows-fr">
      <SystemOverviewCard />
      <InstanceOverviewCard />
      <QuickAccessCard />
      <DashboardChartCard />
    </div>
  )
}
