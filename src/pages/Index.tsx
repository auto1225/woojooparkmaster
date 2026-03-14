import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiCard } from "@/components/KpiCard";
import { OverviewChart } from "@/components/OverviewChart";
import { RecentActivity } from "@/components/RecentActivity";
import { Users, BarChart3, Activity, TrendingUp } from "lucide-react";

const Index = () => {
  return (
    <DashboardLayout title="개요">
      <div className="space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="총 사용자"
            value="12,847"
            change="+12.5%"
            changeType="positive"
            icon={Users}
          />
          <KpiCard
            label="전환율"
            value="3.24%"
            change="+0.8%"
            changeType="positive"
            icon={TrendingUp}
          />
          <KpiCard
            label="활성 세션"
            value="1,429"
            change="-2.1%"
            changeType="negative"
            icon={Activity}
          />
          <KpiCard
            label="평균 체류시간"
            value="4m 32s"
            change="+18s"
            changeType="positive"
            icon={BarChart3}
          />
        </div>

        {/* Chart */}
        <OverviewChart />

        {/* Activity */}
        <RecentActivity />
      </div>
    </DashboardLayout>
  );
};

export default Index;
