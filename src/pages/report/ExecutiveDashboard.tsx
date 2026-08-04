/** P6-6: 종합 현황 대시보드 (시장/간부 보고용) */
import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PrintButton } from "@/components/common/PrintButton";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { Building2, Car, Users, Wrench, Banknote, MessageSquare, Calculator, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";

const EMPTY_ROWS: any[] = [];

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getQueryErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

export default function ExecutiveDashboard() {
  const { isDark } = useTheme();
  const { data: config } = useSystemConfig();
  const today = new Date();
  const monthStart = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
  const yearStart = toLocalDateString(new Date(today.getFullYear(), 0, 1));
  const todayStr = toLocalDateString(today);
  const monthStartTimestamp = `${monthStart}T00:00:00+09:00`;
  const todayEndTimestamp = `${todayStr}T23:59:59.999+09:00`;

  const lotsQuery = useQuery({
    queryKey: ['exec-lots'],
    queryFn: async () => {
      const { data, error } = await supabase.from('parking_lots').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const monthlyRevenueQuery = useQuery({
    queryKey: ['exec-rev-month', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase.from('revenue_daily')
        .select('total_amount, cash_amount, card_amount, mobile_amount, revenue_date')
        .gte('revenue_date', monthStart)
        .lte('revenue_date', todayStr);
      if (error) throw error;
      return data || [];
    },
  });

  const yearlyRevenueQuery = useQuery({
    queryKey: ['exec-rev-year', yearStart],
    queryFn: async () => {
      const { data, error } = await supabase.from('revenue_daily')
        .select('total_amount, revenue_date')
        .gte('revenue_date', yearStart)
        .lte('revenue_date', todayStr);
      if (error) throw error;
      return data || [];
    },
  });

  const complaintsQuery = useQuery({
    queryKey: ['exec-complaints', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase.from('complaints')
        .select('status, category, received_at, closed_at')
        .gte('received_at', monthStartTimestamp)
        .lte('received_at', todayEndTimestamp);
      if (error) throw error;
      return data || [];
    },
  });

  const equipmentQuery = useQuery({
    queryKey: ['exec-equip'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('status, equipment_type');
      if (error) throw error;
      return data || [];
    },
  });

  const budgetPlansQuery = useQuery({
    queryKey: ['exec-budget'],
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_plans').select('*').eq('fiscal_year', today.getFullYear()).eq('status', 'approved');
      if (error) throw error;
      return data || [];
    },
  });

  const budgetItemsQuery = useQuery({
    queryKey: ['exec-budget-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_items').select('item_name, allocated_amount, executed_amount, planned_amount').not('parent_item_id', 'is', null);
      if (error) throw error;
      return data || [];
    },
  });

  const lots = lotsQuery.data || EMPTY_ROWS;
  const monthlyRevenue = monthlyRevenueQuery.data || EMPTY_ROWS;
  const yearlyRevenue = yearlyRevenueQuery.data || EMPTY_ROWS;
  const complaints = complaintsQuery.data || EMPTY_ROWS;
  const equipment = equipmentQuery.data || EMPTY_ROWS;
  const budgetPlans = budgetPlansQuery.data || EMPTY_ROWS;
  const budgetItems = budgetItemsQuery.data || EMPTY_ROWS;
  const queryErrors = [
    ['주차장', lotsQuery.error],
    ['당월 수입', monthlyRevenueQuery.error],
    ['연간 수입', yearlyRevenueQuery.error],
    ['민원', complaintsQuery.error],
    ['장비', equipmentQuery.error],
    ['예산 계획', budgetPlansQuery.error],
    ['예산 집행', budgetItemsQuery.error],
  ].flatMap(([label, error]) => error ? [{ label, message: getQueryErrorMessage(error) }] : []);

  // Section 1
  const totalSpaces = lots.reduce((s: number, l: any) => s + (l.total_spaces || 0), 0);
  const disabledSpaces = lots.reduce((s: number, l: any) => s + (l.disabled_spaces || 0), 0);
  const evSpaces = lots.reduce((s: number, l: any) => s + (l.ev_spaces || 0), 0);
  const directOps = lots.filter((l: any) => l.operator_type === 'direct').length;
  const outsourced = lots.filter((l: any) => l.operator_type === 'outsourced').length;
  const otherOps = lots.filter((l: any) => !['direct', 'outsourced'].includes(l.operator_type)).length;
  const lotTypeSummary = ['offstreet', 'multilevel', 'onstreet']
    .map((type) => `${getParkingLotTypeLabel(type)} ${lots.filter((lot: any) => lot.lot_type === type).length}개소`)
    .join(' · ');

  // Section 2
  const monthRevTotal = monthlyRevenue.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const yearRevTotal = yearlyRevenue.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const cashTotal = monthlyRevenue.reduce((s: number, r: any) => s + (r.cash_amount || 0), 0);
  const cardTotal = monthlyRevenue.reduce((s: number, r: any) => s + (r.card_amount || 0), 0);
  const mobileTotal = monthlyRevenue.reduce((s: number, r: any) => s + (r.mobile_amount || 0), 0);

  // 6개월 추이
  const monthlyChart = useMemo(() => {
    const map: Record<string, number> = {};
    yearlyRevenue.forEach((r: any) => {
      const m = r.revenue_date?.slice(0, 7);
      if (m) map[m] = (map[m] || 0) + (r.total_amount || 0);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([m, v]) => ({ month: m.slice(5) + '월', amount: Math.round(v / 10000) }));
  }, [yearlyRevenue]);

  // Section 3
  const totalComplaints = complaints.length;
  const closedComplaints = complaints.filter((c: any) => c.status === 'closed').length;
  const processRate = totalComplaints > 0 ? ((closedComplaints / totalComplaints) * 100).toFixed(0) : '0';
  const avgDays = useMemo(() => {
    const closed = complaints.filter((c: any) => c.closed_at && c.received_at);
    if (closed.length === 0) return 0;
    const total = closed.reduce((s: number, c: any) => s + (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()), 0);
    return Math.round(total / closed.length / 86400000);
  }, [complaints]);

  // Section 4
  const totalBudget = budgetPlans.reduce((s: number, p: any) => s + (p.total_expenditure || 0), 0);
  const executedBudget = budgetItems.reduce((s: number, i: any) => s + (i.executed_amount || 0), 0);
  const budgetRate = totalBudget > 0 ? (executedBudget / totalBudget) * 100 : 0;

  // Section 5
  const totalEquip = equipment.length;
  const normalEquip = equipment.filter((e: any) => e.status === 'normal').length;
  const brokenEquip = equipment.filter((e: any) => ['warning', 'broken'].includes(e.status)).length;
  const equipRate = totalEquip > 0 ? ((normalEquip / totalEquip) * 100).toFixed(1) : '0';

  // Issues
  const issues: { icon: any; text: string; severity: 'warning' | 'danger' }[] = [];
  if (brokenEquip > 0) issues.push({ icon: Wrench, text: `이상/고장 장비 ${brokenEquip}건`, severity: brokenEquip > 3 ? 'danger' : 'warning' });
  const slaOver = complaints.filter((c: any) => {
    if (c.status === 'closed') return false;
    const days = (today.getTime() - new Date(c.received_at).getTime()) / 86400000;
    return days > 7;
  }).length;
  if (slaOver > 0) issues.push({ icon: MessageSquare, text: `SLA 초과 민원 ${slaOver}건`, severity: 'danger' });

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:block">
          <div>
            <h1 className="text-xl font-bold print:text-2xl">공영주차장 운영 현황</h1>
            <p className="text-sm text-muted-foreground">{config?.org_full_name || config?.org_name || ''} · 기준일: {today.toLocaleDateString('ko-KR')}</p>
          </div>
          <PrintButton className="print:hidden" />
        </div>

        {queryErrors.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5 print:hidden" role="alert">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">일부 통계 데이터를 불러오지 못했습니다.</p>
              <ul className="mt-2 space-y-1 text-xs text-destructive">
                {queryErrors.map(({ label, message }) => <li key={label}>{label}: {message}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Section 1: 기본 현황 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Building2 className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">총 주차장</span></div>
            <p className="text-2xl font-bold">{lots.length}<span className="text-sm font-normal text-muted-foreground">개소</span></p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{lotTypeSummary || '주차장 형태 정보 없음'}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Car className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">총 주차면수</span></div>
            <p className="text-2xl font-bold">{totalSpaces.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">면</span></p>
            <p className="text-[10px] text-muted-foreground">장애인 {disabledSpaces} / 전기차 {evSpaces}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-emerald-600" /><span className="text-xs text-muted-foreground">운영방식</span></div>
            <p className="text-lg font-bold">직영 {directOps} / 위탁 {outsourced}</p>
            <p className="text-[10px] text-muted-foreground">기타·미확인 {otherOps}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Wrench className="h-4 w-4 text-violet-600" /><span className="text-xs text-muted-foreground">장비 가동률</span></div>
            <p className="text-2xl font-bold">{equipRate}<span className="text-sm font-normal text-muted-foreground">%</span></p>
            <p className="text-[10px] text-muted-foreground">총 {totalEquip}대 (이상 {brokenEquip})</p>
          </CardContent></Card>
        </div>

        {/* Section 2: 수입 현황 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="page-break-inside-avoid">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4" />수입 현황</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">당월 수입</p><p className="text-lg font-bold">{(monthRevTotal / 10000).toLocaleString()}만원</p></div>
                <div><p className="text-xs text-muted-foreground">연 누적</p><p className="text-lg font-bold">{(yearRevTotal / 10000).toLocaleString()}만원</p></div>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={monthlyChart}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Bar dataKey="amount" name="수입(만원)" fill={CHART_COLORS.primary[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs">
                <span>현금 {((cashTotal / (monthRevTotal || 1)) * 100).toFixed(0)}%</span>
                <span>카드 {((cardTotal / (monthRevTotal || 1)) * 100).toFixed(0)}%</span>
                <span>모바일 {((mobileTotal / (monthRevTotal || 1)) * 100).toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: 민원 */}
          <Card className="page-break-inside-avoid">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" />민원 현황</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-xs text-muted-foreground">당월 접수</p><p className="text-lg font-bold">{totalComplaints}건</p></div>
                <div><p className="text-xs text-muted-foreground">처리율</p><p className="text-lg font-bold">{processRate}%</p></div>
                <div><p className="text-xs text-muted-foreground">평균처리</p><p className="text-lg font-bold">{avgDays}일</p></div>
              </div>
              {slaOver > 0 && <Badge variant="destructive" className="text-xs">SLA 초과 {slaOver}건</Badge>}
            </CardContent>
          </Card>
        </div>

        {/* Section 4: 예산 */}
        <Card className="page-break-inside-avoid">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calculator className="h-4 w-4" />예산 현황</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div><p className="text-xs text-muted-foreground">연 예산</p><p className="text-lg font-bold">{(totalBudget / 10000).toLocaleString()}만원</p></div>
              <div><p className="text-xs text-muted-foreground">집행액</p><p className="text-lg font-bold">{(executedBudget / 10000).toLocaleString()}만원</p></div>
              <div><p className="text-xs text-muted-foreground">집행률</p><p className="text-lg font-bold">{budgetRate.toFixed(1)}%</p></div>
            </div>
            <Progress value={budgetRate} className="h-3" />
          </CardContent>
        </Card>

        {/* 특이사항 */}
        {issues.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 page-break-inside-avoid">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />특이사항 / 주요 이슈</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {issues.map((issue, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <issue.icon className={`h-4 w-4 ${issue.severity === 'danger' ? 'text-destructive' : 'text-amber-600'}`} />
                    <span>{issue.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
