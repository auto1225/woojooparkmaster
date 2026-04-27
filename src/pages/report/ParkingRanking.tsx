/** P6-5: 주차장 성과 랭킹 / 벤치마킹 */
import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { Trophy, FileSpreadsheet } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { DateQuickFilter } from "@/components/common/DateQuickFilter";
import { CHART_COLORS, ChartTooltipContent } from "@/lib/chart-config";
import { useTheme } from "@/hooks/useTheme";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { createExcelWorkbook } from "@/lib/excel-engine";

const MEDALS = ['🥇', '🥈', '🥉'];
const GRADE_COLORS: Record<string, string> = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-blue-100 text-blue-700', C: 'bg-amber-100 text-amber-700', D: 'bg-red-100 text-red-700' };

function getGrade(value: number, values: number[], inverse = false): string {
  const sorted = [...values].sort((a, b) => inverse ? a - b : b - a);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q2 = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  if (!inverse) {
    if (value >= q1) return 'A';
    if (value >= q2) return 'B';
    if (value >= q3) return 'C';
    return 'D';
  }
  if (value <= q1) return 'A';
  if (value <= q2) return 'B';
  if (value <= q3) return 'C';
  return 'D';
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

export default function ParkingRanking() {
  const { isDark } = useTheme();
  const { data: config } = useSystemConfig();
  const now = new Date();
  const [dateStart, setDateStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [dateEnd, setDateEnd] = useState(now.toISOString().split('T')[0]);

  const { data: lots = [] } = useQuery({
    queryKey: ['ranking-lots'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name, total_spaces, lot_type, operation_type');
      return data || [];
    },
  });

  const { data: revenue = [] } = useQuery({
    queryKey: ['ranking-revenue', dateStart, dateEnd],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily')
        .select('lot_id, total_amount, total_vehicles, revenue_date')
        .gte('revenue_date', dateStart).lte('revenue_date', dateEnd);
      return data || [];
    },
  });

  const { data: complaints = [] } = useQuery({
    queryKey: ['ranking-complaints', dateStart, dateEnd],
    queryFn: async () => {
      const { data } = await supabase.from('complaints')
        .select('lot_id, satisfaction_score')
        .gte('received_at', dateStart).lte('received_at', dateEnd + 'T23:59:59');
      return data || [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['ranking-equip'],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('lot_id, status');
      return data || [];
    },
  });

  const days = useMemo(() => {
    const d1 = new Date(dateStart), d2 = new Date(dateEnd);
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
  }, [dateStart, dateEnd]);

  const rankings = useMemo(() => {
    const lotData = lots.map((lot: any) => {
      const lotRevenue = revenue.filter((r: any) => r.lot_id === lot.id);
      const totalRev = lotRevenue.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
      const totalVehicles = lotRevenue.reduce((s: number, r: any) => s + (r.total_vehicles || 0), 0);
      const spaces = lot.total_spaces || 1;

      const revenueEfficiency = totalRev / spaces / days;
      const usageRate = (totalVehicles / days) / spaces;
      const lotComplaints = complaints.filter((c: any) => c.lot_id === lot.id);
      const complaintRate = lotComplaints.length / spaces;
      const satisfaction = lotComplaints.length > 0
        ? lotComplaints.reduce((s: number, c: any) => s + (c.satisfaction_score || 0), 0) / lotComplaints.filter((c: any) => c.satisfaction_score).length || 0
        : 0;
      const lotEquip = equipment.filter((e: any) => e.lot_id === lot.id);
      const equipRate = lotEquip.length > 0 ? (lotEquip.filter((e: any) => e.status === 'normal').length / lotEquip.length) * 100 : 100;

      return { ...lot, revenueEfficiency, usageRate, complaintRate, satisfaction, equipRate, totalRev };
    });

    const revEffValues = lotData.map(l => l.revenueEfficiency);
    const usageValues = lotData.map(l => l.usageRate);
    const complaintValues = lotData.map(l => l.complaintRate);
    const satisfactionValues = lotData.filter(l => l.satisfaction > 0).map(l => l.satisfaction);
    const equipValues = lotData.map(l => l.equipRate);

    return lotData.map(lot => {
      const revNorm = normalize(lot.revenueEfficiency, Math.min(...revEffValues), Math.max(...revEffValues));
      const useNorm = normalize(lot.usageRate, Math.min(...usageValues), Math.max(...usageValues));
      const compNorm = 100 - normalize(lot.complaintRate, Math.min(...complaintValues), Math.max(...complaintValues));
      const satNorm = lot.satisfaction > 0 ? normalize(lot.satisfaction, Math.min(...satisfactionValues), Math.max(...satisfactionValues)) : 50;
      const eqNorm = normalize(lot.equipRate, Math.min(...equipValues), Math.max(...equipValues));

      const score = revNorm * 0.4 + useNorm * 0.25 + compNorm * 0.15 + eqNorm * 0.1 + satNorm * 0.1;

      return {
        ...lot,
        revGrade: getGrade(lot.revenueEfficiency, revEffValues),
        useGrade: getGrade(lot.usageRate, usageValues),
        compGrade: getGrade(lot.complaintRate, complaintValues, true),
        eqGrade: getGrade(lot.equipRate, equipValues),
        satGrade: lot.satisfaction > 0 ? getGrade(lot.satisfaction, satisfactionValues) : '-',
        score: Number(score.toFixed(1)),
        revNorm, useNorm, compNorm, eqNorm, satNorm,
      };
    }).sort((a, b) => b.score - a.score);
  }, [lots, revenue, complaints, equipment, days]);

  const top5Radar = useMemo(() => {
    const top = rankings.slice(0, 5);
    const axes = ['수입효율', '이용률', '민원율', '가동률', '만족도'];
    return axes.map((axis, i) => {
      const entry: Record<string, any> = { axis };
      top.forEach(lot => {
        const values = [lot.revNorm, lot.useNorm, lot.compNorm, lot.eqNorm, lot.satNorm];
        entry[lot.name] = Number(values[i].toFixed(0));
      });
      return entry;
    });
  }, [rankings]);

  const handleExcelExport = () => {
    createExcelWorkbook({
      fileName: '주차장성과랭킹',
      orgName: config?.org_name || '',
      title: '주차장 성과 종합 랭킹',
      subtitle: `기간: ${dateStart} ~ ${dateEnd}`,
      sheets: [{
        name: '성과 종합 랭킹', type: 'data',
        headers: [
          { key: 'rank', label: '순위', format: 'number' as const, width: 6 },
          { key: 'name', label: '주차장명', width: 16 },
          { key: 'spaces', label: '면수', format: 'number' as const },
          { key: 'revEff', label: '수입효율', format: 'number' as const },
          { key: 'revGrade', label: '등급' },
          { key: 'useRate', label: '이용률', format: 'percent' as const },
          { key: 'useGrade', label: '등급' },
          { key: 'compRate', label: '민원율', format: 'number' as const },
          { key: 'compGrade', label: '등급' },
          { key: 'eqRate', label: '가동률(%)', format: 'number' as const },
          { key: 'score', label: '종합점수', format: 'number' as const },
        ],
        data: rankings.map((r, i) => ({
          rank: i + 1, name: r.name, spaces: r.total_spaces,
          revEff: Math.round(r.revenueEfficiency), revGrade: r.revGrade,
          useRate: Number(r.usageRate.toFixed(2)), useGrade: r.useGrade,
          compRate: Number(r.complaintRate.toFixed(3)), compGrade: r.compGrade,
          eqRate: Number(r.equipRate.toFixed(1)), score: r.score,
        })),
        autoFilter: true, freezePane: { row: 1, col: 2 },
        pageSetup: { orientation: 'landscape', paperSize: 'A4', fitToPage: true, fitToWidth: 1 },
      }],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h1 className="text-xl font-bold">주차장 성과 랭킹</h1>
          </div>
          <div className="flex items-center gap-2">
            <DateQuickFilter onSelect={(s, e) => { setDateStart(s); setDateEnd(e); }} />
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExcelExport}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> 엑셀
            </Button>
          </div>
        </div>

        {/* Radar Chart for Top 5 */}
        {rankings.length >= 3 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">상위 5개소 성과 비교</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={top5Radar}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                  {rankings.slice(0, 5).map((lot, i) => (
                    <Radar key={lot.id} name={lot.name} dataKey={lot.name}
                      stroke={CHART_COLORS.categorical[i]} fill={CHART_COLORS.categorical[i]} fillOpacity={0.1} strokeWidth={2} />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Ranking Table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">종합 성과 스코어카드</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-12">순위</TableHead>
                    <TableHead className="text-xs">주차장명</TableHead>
                    <TableHead className="text-xs text-right">면수</TableHead>
                    <TableHead className="text-xs text-center">수입효율</TableHead>
                    <TableHead className="text-xs text-center">이용률</TableHead>
                    <TableHead className="text-xs text-center">민원율</TableHead>
                    <TableHead className="text-xs text-center">가동률</TableHead>
                    <TableHead className="text-xs text-center">만족도</TableHead>
                    <TableHead className="text-xs text-center">종합점수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings.map((lot, i) => (
                    <TableRow key={lot.id}>
                      <TableCell className="text-xs font-bold">{i < 3 ? MEDALS[i] : i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{lot.name}</TableCell>
                      <TableCell className="text-xs text-right">{lot.total_spaces}</TableCell>
                      <TableCell className="text-center"><Badge className={`text-[9px] ${GRADE_COLORS[lot.revGrade]}`}>{lot.revGrade}</Badge></TableCell>
                      <TableCell className="text-center"><Badge className={`text-[9px] ${GRADE_COLORS[lot.useGrade]}`}>{lot.useGrade}</Badge></TableCell>
                      <TableCell className="text-center"><Badge className={`text-[9px] ${GRADE_COLORS[lot.compGrade]}`}>{lot.compGrade}</Badge></TableCell>
                      <TableCell className="text-center"><Badge className={`text-[9px] ${GRADE_COLORS[lot.eqGrade]}`}>{lot.eqGrade}</Badge></TableCell>
                      <TableCell className="text-center">
                        {lot.satGrade !== '-' ? <Badge className={`text-[9px] ${GRADE_COLORS[lot.satGrade]}`}>{lot.satGrade}</Badge> : <span className="text-[9px] text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          <Progress value={lot.score} className="h-2 w-12" />
                          <span className="text-xs font-bold">{lot.score}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rankings.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">데이터가 없습니다</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
