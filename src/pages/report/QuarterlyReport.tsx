/** P6-11: 분기 종합 보고서 (인쇄용) */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PrintButton } from "@/components/common/PrintButton";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useSystemConfig } from "@/hooks/useSystemConfig";

export default function QuarterlyReport() {
  const [searchParams] = useSearchParams();
  const { data: config } = useSystemConfig();
  const quarterParam = searchParams.get('quarter') || `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const [yearStr, qStr] = quarterParam.split('-Q');
  const year = Number(yearStr);
  const quarter = Number(qStr);
  const qStart = new Date(year, (quarter - 1) * 3, 1).toISOString().split('T')[0];
  const qEnd = new Date(year, quarter * 3, 0).toISOString().split('T')[0];

  const { data: lots = [] } = useQuery({
    queryKey: ['qr-lots'],
    queryFn: async () => { const { data } = await supabase.from('parking_lots').select('id, name, total_spaces, operation_type, lot_type'); return data || []; },
  });

  const { data: revenue = [] } = useQuery({
    queryKey: ['qr-rev', qStart, qEnd],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily').select('lot_id, total_amount, revenue_date').gte('revenue_date', qStart).lte('revenue_date', qEnd);
      return data || [];
    },
  });

  const { data: complaints = [] } = useQuery({
    queryKey: ['qr-comp', qStart, qEnd],
    queryFn: async () => {
      const { data } = await supabase.from('complaints').select('status, category, received_at, closed_at').gte('received_at', qStart).lte('received_at', qEnd + 'T23:59:59');
      return data || [];
    },
  });

  const { data: budgetPlans = [] } = useQuery({
    queryKey: ['qr-budget'],
    queryFn: async () => { const { data } = await supabase.from('budget_plans').select('*').eq('fiscal_year', year).eq('status', 'approved'); return data || []; },
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['qr-budget-items'],
    queryFn: async () => { const { data } = await supabase.from('budget_items').select('item_name, allocated_amount, executed_amount, planned_amount'); return data || []; },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['qr-equip'],
    queryFn: async () => { const { data } = await supabase.from('equipment').select('status, equipment_type'); return data || []; },
  });

  const totalSpaces = lots.reduce((s: number, l: any) => s + (l.total_spaces || 0), 0);
  const qRevenue = revenue.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const totalComplaints = complaints.length;
  const closedComplaints = complaints.filter((c: any) => c.status === 'closed').length;
  const totalBudget = budgetPlans.reduce((s: number, p: any) => s + (p.total_expenditure || 0), 0);
  const executedBudget = budgetItems.reduce((s: number, i: any) => s + (i.executed_amount || 0), 0);
  const budgetRate = totalBudget > 0 ? (executedBudget / totalBudget) * 100 : 0;
  const totalEquip = equipment.length;
  const normalEquip = equipment.filter((e: any) => e.status === 'normal').length;

  // Revenue TOP 10
  const revTop10 = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    revenue.forEach((r: any) => {
      const lot = lots.find((l: any) => l.id === r.lot_id);
      if (!lot) return;
      if (!map[lot.id]) map[lot.id] = { name: lot.name, total: 0 };
      map[lot.id].total += r.total_amount || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [revenue, lots]);

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-bold">분기 종합 보고서</h1>
          <PrintButton />
        </div>

        {/* 표지 */}
        <div className="text-center py-12 print:py-24 page-break-after">
          <p className="text-sm text-muted-foreground mb-8">{config?.org_full_name || config?.org_name || ''}</p>
          <h1 className="text-3xl font-bold mb-4">공영주차장 운영 현황 보고서</h1>
          <p className="text-xl text-muted-foreground">{year}년 제{quarter}분기</p>
          <p className="text-sm text-muted-foreground mt-8">({qStart} ~ {qEnd})</p>
        </div>

        {/* 1. 현황 총괄 */}
        <div className="page-break-inside-avoid">
          <h2 className="text-lg font-bold mb-3 border-b-2 border-primary pb-1">1. 현황 총괄</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">총 주차장</span><p className="text-xl font-bold">{lots.length}개소</p></div>
            <div><span className="text-muted-foreground">총 주차면수</span><p className="text-xl font-bold">{totalSpaces.toLocaleString()}면</p></div>
            <div><span className="text-muted-foreground">운영방식</span><p className="text-xl font-bold">직영 {lots.filter((l: any) => l.operation_type === '직영').length} / 위탁 {lots.filter((l: any) => l.operation_type === '위탁').length}</p></div>
          </div>
        </div>

        {/* 2. 수입 현황 */}
        <div className="page-break-inside-avoid">
          <h2 className="text-lg font-bold mb-3 border-b-2 border-primary pb-1">2. 수입 현황</h2>
          <p className="text-sm mb-3">분기 총수입: <strong>{(qRevenue / 10000).toLocaleString()}만원</strong></p>
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-muted">
              <th className="border border-border p-1">순위</th>
              <th className="border border-border p-1">주차장명</th>
              <th className="border border-border p-1 text-right">수입(원)</th>
              <th className="border border-border p-1 text-right">비율</th>
            </tr></thead>
            <tbody>
              {revTop10.map((r, i) => (
                <tr key={i}><td className="border border-border p-1 text-center">{i + 1}</td>
                  <td className="border border-border p-1">{r.name}</td>
                  <td className="border border-border p-1 text-right">{r.total.toLocaleString()}</td>
                  <td className="border border-border p-1 text-right">{((r.total / qRevenue) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 3. 민원 현황 */}
        <div className="page-break-inside-avoid">
          <h2 className="text-lg font-bold mb-3 border-b-2 border-primary pb-1">3. 민원 현황</h2>
          <div className="grid grid-cols-3 gap-4 text-sm mb-2">
            <div><span className="text-muted-foreground">접수</span><p className="font-bold">{totalComplaints}건</p></div>
            <div><span className="text-muted-foreground">처리</span><p className="font-bold">{closedComplaints}건 ({totalComplaints > 0 ? ((closedComplaints / totalComplaints) * 100).toFixed(0) : 0}%)</p></div>
            <div><span className="text-muted-foreground">미처리</span><p className="font-bold">{totalComplaints - closedComplaints}건</p></div>
          </div>
        </div>

        {/* 4. 예산 */}
        <div className="page-break-inside-avoid">
          <h2 className="text-lg font-bold mb-3 border-b-2 border-primary pb-1">4. 예산 집행</h2>
          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
            <div><span className="text-muted-foreground">연 예산</span><p className="font-bold">{(totalBudget / 10000).toLocaleString()}만원</p></div>
            <div><span className="text-muted-foreground">집행액</span><p className="font-bold">{(executedBudget / 10000).toLocaleString()}만원</p></div>
            <div><span className="text-muted-foreground">집행률</span><p className="font-bold">{budgetRate.toFixed(1)}%</p></div>
          </div>
          <Progress value={budgetRate} className="h-3" />
        </div>

        {/* 5. 시설 */}
        <div className="page-break-inside-avoid">
          <h2 className="text-lg font-bold mb-3 border-b-2 border-primary pb-1">5. 시설 현황</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">총 장비</span><p className="font-bold">{totalEquip}대</p></div>
            <div><span className="text-muted-foreground">정상가동</span><p className="font-bold">{normalEquip}대</p></div>
            <div><span className="text-muted-foreground">가동률</span><p className="font-bold">{totalEquip > 0 ? ((normalEquip / totalEquip) * 100).toFixed(1) : 0}%</p></div>
          </div>
        </div>

        {/* 6. 향후 계획 */}
        <div className="page-break-inside-avoid">
          <h2 className="text-lg font-bold mb-3 border-b-2 border-primary pb-1">6. 주요 성과 및 향후 계획</h2>
          <div className="border border-border rounded p-4 min-h-[120px]">
            <p className="text-xs text-muted-foreground italic">(작성란)</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
