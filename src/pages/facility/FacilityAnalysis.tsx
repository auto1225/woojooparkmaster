/** P6-4: 시설/장비 분석 대시보드 */
import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Server, CheckCircle, AlertTriangle, Gauge, Wrench, FileSpreadsheet } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CompareKPI } from "@/components/common/CompareKPI";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { createExcelWorkbook } from "@/lib/excel-engine";

const STATUS_COLORS: Record<string, string> = {
  normal: '#16A34A', warning: '#F59E0B', broken: '#DC2626', maintenance: '#8B5CF6', decommissioned: '#94A3B8',
};
const STATUS_LABELS: Record<string, string> = {
  normal: '정상', warning: '이상', broken: '고장', maintenance: '점검중', decommissioned: '폐기',
};

export default function FacilityAnalysis() {
  const { isDark } = useTheme();
  const { data: config } = useSystemConfig();

  const { data: equipment = [] } = useQuery({
    queryKey: ['equip-analysis'],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('*, parking_lots(name)');
      return data || [];
    },
  });

  const { data: maintenance = [] } = useQuery({
    queryKey: ['maint-analysis'],
    queryFn: async () => {
      const { data } = await supabase.from('maintenance_logs').select('*').order('scheduled_date', { ascending: false });
      return data || [];
    },
  });

  const totalEquip = equipment.length;
  const normalCount = equipment.filter((e: any) => e.status === 'normal').length;
  const abnormalCount = equipment.filter((e: any) => ['warning', 'broken'].includes(e.status)).length;
  const operationRate = totalEquip > 0 ? (normalCount / totalEquip) * 100 : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthlyMaintCost = maintenance
    .filter((m: any) => m.scheduled_date >= monthStart)
    .reduce((s: number, m: any) => s + (m.actual_cost || 0), 0);

  // 상태 분포 도넛
  const statusDist = useMemo(() => {
    const map: Record<string, number> = {};
    equipment.forEach((e: any) => { map[e.status] = (map[e.status] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ name: STATUS_LABELS[status] || status, value: count, color: STATUS_COLORS[status] || '#94A3B8' }));
  }, [equipment]);

  // 유형별 현황
  const typeDist = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    equipment.forEach((e: any) => {
      const type = e.equipment_type || '기타';
      if (!map[type]) map[type] = {};
      map[type][e.status] = (map[type][e.status] || 0) + 1;
    });
    return Object.entries(map).map(([type, statuses]) => ({
      type, normal: statuses.normal || 0, warning: statuses.warning || 0, broken: statuses.broken || 0, maintenance: statuses.maintenance || 0,
    }));
  }, [equipment]);

  // 월별 유지보수비
  const monthlyMaint = useMemo(() => {
    const map: Record<string, number> = {};
    maintenance.forEach((m: any) => {
      const mo = m.scheduled_date?.slice(0, 7);
      if (mo) map[mo] = (map[mo] || 0) + (m.actual_cost || 0);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, cost]) => ({
      month: month.slice(5) + '월', cost: Math.round(cost / 10000),
    }));
  }, [maintenance]);

  // 노후화 장비
  const agingEquip = useMemo(() => {
    return equipment
      .filter((e: any) => e.installed_date && e.useful_life_years)
      .map((e: any) => {
        const installed = new Date(e.installed_date);
        const yearsElapsed = (now.getTime() - installed.getTime()) / (365.25 * 86400000);
        const ratio = (yearsElapsed / e.useful_life_years) * 100;
        return { ...e, yearsElapsed: Number(yearsElapsed.toFixed(1)), ratio: Number(ratio.toFixed(0)), lotName: e.parking_lots?.name || '-' };
      })
      .filter((e: any) => e.ratio >= 80)
      .sort((a: any, b: any) => b.ratio - a.ratio);
  }, [equipment]);

  const handleExcelExport = () => {
    createExcelWorkbook({
      fileName: '시설분석보고서',
      orgName: config?.org_name || '',
      title: '시설/장비 분석 보고서',
      sheets: [
        {
          name: '장비 현황 요약', type: 'summary',
          headers: [
            { key: 'item', label: '항목', width: 20 },
            { key: 'value', label: '값', width: 15 },
          ],
          data: [
            { item: '총 장비수', value: totalEquip },
            { item: '정상가동', value: normalCount },
            { item: '이상/고장', value: abnormalCount },
            { item: '가동률', value: `${operationRate.toFixed(1)}%` },
            { item: '당월 유지보수비', value: monthlyMaintCost },
          ],
          freezePane: { row: 1, col: 0 },
        },
        {
          name: '장비 전체목록', type: 'data',
          headers: [
            { key: 'name', label: '장비명', width: 16 },
            { key: 'type', label: '유형', width: 10 },
            { key: 'lot', label: '주차장', width: 14 },
            { key: 'status', label: '상태', width: 8 },
            { key: 'installed', label: '설치일', format: 'date' as const, width: 12 },
            { key: 'years', label: '경과(년)', format: 'number' as const },
            { key: 'ratio', label: '경과율(%)', format: 'number' as const },
          ],
          data: equipment.map((e: any) => {
            const installed = e.installed_date ? new Date(e.installed_date) : null;
            const years = installed ? ((now.getTime() - installed.getTime()) / (365.25 * 86400000)).toFixed(1) : '-';
            const ratio = (installed && e.useful_life_years) ? Math.round(((now.getTime() - installed.getTime()) / (365.25 * 86400000 * e.useful_life_years)) * 100) : '-';
            return {
              name: e.equipment_name, type: e.equipment_type, lot: e.parking_lots?.name || '-',
              status: STATUS_LABELS[e.status] || e.status, installed: e.installed_date, years, ratio,
            };
          }),
          autoFilter: true, freezePane: { row: 1, col: 0 },
        },
        {
          name: '노후화 분석', type: 'data',
          headers: [
            { key: 'name', label: '장비명', width: 16 },
            { key: 'type', label: '유형', width: 10 },
            { key: 'lotName', label: '주차장', width: 14 },
            { key: 'installed_date', label: '설치일', format: 'date' as const },
            { key: 'useful_life_years', label: '내용연수', format: 'number' as const },
            { key: 'ratio', label: '경과율(%)', format: 'number' as const },
            { key: 'status', label: '상태' },
          ],
          data: agingEquip.map((e: any) => ({
            name: e.equipment_name, type: e.equipment_type, lotName: e.lotName,
            installed_date: e.installed_date, useful_life_years: e.useful_life_years,
            ratio: e.ratio, status: STATUS_LABELS[e.status] || e.status,
          })),
          autoFilter: true, freezePane: { row: 1, col: 0 },
        },
      ],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">시설/장비 분석</h1>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExcelExport}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> 분석 엑셀
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <CompareKPI title="총 장비수" value={totalEquip} icon={Server} color="bg-primary/10 text-primary" />
          <CompareKPI title="정상가동" value={normalCount} icon={CheckCircle} color="bg-emerald-100 text-emerald-700" />
          <CompareKPI title="이상/고장" value={abnormalCount} icon={AlertTriangle} color="bg-red-100 text-red-600" />
          <CompareKPI title="가동률" value={Number(operationRate.toFixed(1))} suffix="%" icon={Gauge} color={operationRate >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"} />
          <CompareKPI title="당월 유지보수비" value={Math.round(monthlyMaintCost / 10000)} suffix="만원" icon={Wrench} color="bg-violet-100 text-violet-700" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">장비 상태 분포</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                    {statusDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {statusDist.map(d => (
                  <div key={d.name} className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} {d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">장비 유형별 현황</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={typeDist}>
                  <XAxis dataKey="type" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Legend />
                  <Bar dataKey="normal" name="정상" stackId="a" fill={STATUS_COLORS.normal} />
                  <Bar dataKey="warning" name="이상" stackId="a" fill={STATUS_COLORS.warning} />
                  <Bar dataKey="broken" name="고장" stackId="a" fill={STATUS_COLORS.broken} />
                  <Bar dataKey="maintenance" name="점검" stackId="a" fill={STATUS_COLORS.maintenance} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">월별 유지보수비 추이</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyMaint}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltipContent isDark={isDark} />} />
                  <Area type="monotone" dataKey="cost" name="유지보수비(만원)" stroke={CHART_COLORS.primary[1]} fill={CHART_COLORS.primary[1]} fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">장비 노후화 분석</CardTitle></CardHeader>
            <CardContent>
              {agingEquip.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="yearsElapsed" name="경과 연수" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="ratio" name="경과율(%)" tick={{ fontSize: 10 }} />
                    <ZAxis range={[30, 100]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter data={agingEquip.slice(0, 30)} fill={CHART_COLORS.status.warning}>
                      {agingEquip.slice(0, 30).map((e: any, i: number) => (
                        <Cell key={i} fill={e.ratio >= 100 ? STATUS_COLORS.broken : e.ratio >= 80 ? STATUS_COLORS.warning : STATUS_COLORS.normal} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">노후화 데이터 없음</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 교체 예상 장비 테이블 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">교체 예상 장비 (내용연수 80% 이상)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">장비명</TableHead>
                    <TableHead className="text-xs">유형</TableHead>
                    <TableHead className="text-xs">주차장</TableHead>
                    <TableHead className="text-xs">설치일</TableHead>
                    <TableHead className="text-xs">내용연수</TableHead>
                    <TableHead className="text-xs">경과율</TableHead>
                    <TableHead className="text-xs">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingEquip.slice(0, 20).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs font-medium">{e.equipment_name}</TableCell>
                      <TableCell className="text-xs">{e.equipment_type}</TableCell>
                      <TableCell className="text-xs">{e.lotName}</TableCell>
                      <TableCell className="text-xs">{e.installed_date}</TableCell>
                      <TableCell className="text-xs">{e.useful_life_years}년</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(e.ratio, 100)} className={`h-2 w-16 ${e.ratio >= 100 ? '[&>div]:bg-destructive' : '[&>div]:bg-amber-500'}`} />
                          <span className={`font-semibold ${e.ratio >= 100 ? 'text-destructive' : 'text-amber-600'}`}>{e.ratio}%</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={e.status === 'normal' ? 'default' : 'destructive'} className="text-[9px]">{STATUS_LABELS[e.status]}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {agingEquip.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">교체 예상 장비 없음</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
