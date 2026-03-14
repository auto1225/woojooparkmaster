/** P6-11: 월간 수입 보고서 인쇄 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PrintButton } from "@/components/common/PrintButton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useSystemConfig } from "@/hooks/useSystemConfig";

export default function RevenuePrintMonthly() {
  const [searchParams] = useSearchParams();
  const { data: config } = useSystemConfig();
  const monthParam = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const [year, month] = monthParam.split('-').map(Number);

  const monthStart = `${monthParam}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];

  const { data: lots = [] } = useQuery({
    queryKey: ['rev-print-lots'],
    queryFn: async () => { const { data } = await supabase.from('parking_lots').select('id, code, name').order('code'); return data || []; },
  });

  const { data: revenue = [] } = useQuery({
    queryKey: ['rev-print', monthParam],
    queryFn: async () => {
      const { data } = await supabase.from('revenue_daily')
        .select('lot_id, revenue_date, total_amount, cash_amount, card_amount, mobile_amount, total_vehicles')
        .gte('revenue_date', monthStart).lte('revenue_date', monthEnd)
        .order('revenue_date');
      return data || [];
    },
  });

  const totalAmount = revenue.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const totalCash = revenue.reduce((s: number, r: any) => s + (r.cash_amount || 0), 0);
  const totalCard = revenue.reduce((s: number, r: any) => s + (r.card_amount || 0), 0);
  const totalMobile = revenue.reduce((s: number, r: any) => s + (r.mobile_amount || 0), 0);
  const totalVehicles = revenue.reduce((s: number, r: any) => s + (r.total_vehicles || 0), 0);

  // Lot summaries
  const lotSummaries = useMemo(() => {
    return lots.map((lot: any) => {
      const lotRevs = revenue.filter((r: any) => r.lot_id === lot.id);
      return {
        code: lot.code, name: lot.name,
        total: lotRevs.reduce((s: number, r: any) => s + (r.total_amount || 0), 0),
        vehicles: lotRevs.reduce((s: number, r: any) => s + (r.total_vehicles || 0), 0),
      };
    }).filter(l => l.total > 0).sort((a, b) => b.total - a.total);
  }, [lots, revenue]);

  // Daily pivot
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyPivot = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${monthParam}-${String(day).padStart(2, '0')}`;
      const dayRevs = revenue.filter((r: any) => r.revenue_date === dateStr);
      const byLot: Record<string, number> = {};
      dayRevs.forEach((r: any) => {
        const lot = lots.find((l: any) => l.id === r.lot_id);
        if (lot) byLot[lot.code] = (byLot[lot.code] || 0) + (r.total_amount || 0);
      });
      return { day, total: dayRevs.reduce((s: number, r: any) => s + (r.total_amount || 0), 0), byLot };
    });
  }, [revenue, lots, daysInMonth, monthParam]);

  const lotCodes = lotSummaries.map(l => l.code);

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-bold">월간 수입 보고서</h1>
          <PrintButton />
        </div>

        {/* Page 1: 총괄 */}
        <div className="page-break-inside-avoid">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold">{config?.org_full_name || ''} 공영주차장 월간 수입 보고서</h2>
            <p className="text-sm text-muted-foreground">{year}년 {month}월</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="border border-border rounded p-4">
              <h3 className="text-sm font-semibold mb-2">수입 총괄</h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1">월 총수입</td><td className="text-right font-bold">{totalAmount.toLocaleString()}원</td></tr>
                  <tr><td className="py-1">이용차량</td><td className="text-right">{totalVehicles.toLocaleString()}대</td></tr>
                  <tr><td className="py-1">일평균 수입</td><td className="text-right">{Math.round(totalAmount / daysInMonth).toLocaleString()}원</td></tr>
                </tbody>
              </table>
            </div>
            <div className="border border-border rounded p-4">
              <h3 className="text-sm font-semibold mb-2">결제수단별</h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1">현금</td><td className="text-right">{totalCash.toLocaleString()}원</td><td className="text-right text-muted-foreground">{totalAmount > 0 ? ((totalCash / totalAmount) * 100).toFixed(1) : 0}%</td></tr>
                  <tr><td className="py-1">카드</td><td className="text-right">{totalCard.toLocaleString()}원</td><td className="text-right text-muted-foreground">{totalAmount > 0 ? ((totalCard / totalAmount) * 100).toFixed(1) : 0}%</td></tr>
                  <tr><td className="py-1">모바일</td><td className="text-right">{totalMobile.toLocaleString()}원</td><td className="text-right text-muted-foreground">{totalAmount > 0 ? ((totalMobile / totalAmount) * 100).toFixed(1) : 0}%</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3 className="text-sm font-semibold mb-2">주차장별 수입 요약</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-1 text-center">순위</th>
                <th className="border border-border p-1">코드</th>
                <th className="border border-border p-1">주차장명</th>
                <th className="border border-border p-1 text-right">수입(원)</th>
                <th className="border border-border p-1 text-right">비율</th>
                <th className="border border-border p-1 text-right">차량(대)</th>
              </tr>
            </thead>
            <tbody>
              {lotSummaries.map((l, i) => (
                <tr key={l.code} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                  <td className="border border-border p-1 text-center">{i + 1}</td>
                  <td className="border border-border p-1 font-mono">{l.code}</td>
                  <td className="border border-border p-1">{l.name}</td>
                  <td className="border border-border p-1 text-right">{l.total.toLocaleString()}</td>
                  <td className="border border-border p-1 text-right">{((l.total / totalAmount) * 100).toFixed(1)}%</td>
                  <td className="border border-border p-1 text-right">{l.vehicles.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-bold">
                <td colSpan={3} className="border border-border p-1 text-center">합 계</td>
                <td className="border border-border p-1 text-right">{totalAmount.toLocaleString()}</td>
                <td className="border border-border p-1 text-right">100%</td>
                <td className="border border-border p-1 text-right">{totalVehicles.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Page 2: 일별 피벗 */}
        <div className="page-break-before page-break-inside-avoid">
          <h3 className="text-sm font-semibold mb-2">일별 × 주차장별 수입</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border p-1 text-center">일자</th>
                  {lotCodes.map(c => <th key={c} className="border border-border p-1 text-center">{c}</th>)}
                  <th className="border border-border p-1 text-right font-bold">합계</th>
                </tr>
              </thead>
              <tbody>
                {dailyPivot.map(d => (
                  <tr key={d.day} className={d.day % 2 === 0 ? 'bg-muted/30' : ''}>
                    <td className="border border-border p-0.5 text-center">{d.day}일</td>
                    {lotCodes.map(c => (
                      <td key={c} className="border border-border p-0.5 text-right">{d.byLot[c] ? (d.byLot[c] / 10000).toFixed(0) : '-'}</td>
                    ))}
                    <td className="border border-border p-0.5 text-right font-semibold">{(d.total / 10000).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold">
                  <td className="border border-border p-1 text-center">합계</td>
                  {lotCodes.map(c => {
                    const total = dailyPivot.reduce((s, d) => s + (d.byLot[c] || 0), 0);
                    return <td key={c} className="border border-border p-1 text-right">{(total / 10000).toFixed(0)}</td>;
                  })}
                  <td className="border border-border p-1 text-right">{(totalAmount / 10000).toFixed(0)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-[8px] text-muted-foreground mt-1">단위: 만원</p>
          </div>
        </div>

        {/* 결재란 */}
        <div className="page-break-inside-avoid mt-8 print:mt-12">
          <div className="flex justify-end">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-border p-2 w-20">담당</th>
                  <th className="border border-border p-2 w-20">팀장</th>
                  <th className="border border-border p-2 w-20">과장</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border p-4 h-16"></td>
                  <td className="border border-border p-4 h-16"></td>
                  <td className="border border-border p-4 h-16"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
