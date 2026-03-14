/** P6-11: 주차장 현황표 인쇄 페이지 */
import { DashboardLayout } from "@/components/DashboardLayout";
import { PrintButton } from "@/components/common/PrintButton";
import { PrintHeader } from "@/components/common/PrintHeader";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { createExcelWorkbook } from "@/lib/excel-engine";

export default function LotsPrintSummary() {
  const { data: config } = useSystemConfig();
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  const { data: lots = [] } = useQuery({
    queryKey: ['lots-print'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('*').order('code');
      return data || [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['equip-print'],
    queryFn: async () => {
      const { data } = await supabase.from('equipment').select('lot_id, equipment_type');
      return data || [];
    },
  });

  const getEquipCount = (lotId: string, type: string) => equipment.filter(e => e.lot_id === lotId && e.equipment_type === type).length;
  const totalSpaces = lots.reduce((s: number, l: any) => s + (l.total_spaces || 0), 0);
  const totalDisabled = lots.reduce((s: number, l: any) => s + (l.disabled_spaces || 0), 0);
  const totalEv = lots.reduce((s: number, l: any) => s + (l.ev_spaces || 0), 0);
  const directCount = lots.filter((l: any) => l.operation_type === '직영').length;
  const outsourcedCount = lots.filter((l: any) => l.operation_type === '위탁').length;

  const handleExcel = () => {
    createExcelWorkbook({
      fileName: '주차장현황표',
      orgName: config?.org_name || '',
      title: `유료 공영주차장 현황표`,
      subtitle: `기준일: ${today}`,
      sheets: [{
        name: '주차장 현황', type: 'data',
        headers: [
          { key: 'no', label: '번호', format: 'number' as const, width: 5 },
          { key: 'code', label: '코드', width: 8 },
          { key: 'name', label: '주차장명', width: 16 },
          { key: 'type', label: '유형', width: 8 },
          { key: 'spaces', label: '면수', format: 'number' as const, subTotal: 'sum' },
          { key: 'disabled', label: '장애인', format: 'number' as const, subTotal: 'sum' },
          { key: 'ev', label: '전기차', format: 'number' as const, subTotal: 'sum' },
          { key: 'operation', label: '운영', width: 8 },
          { key: 'barrier', label: '차단기' },
          { key: 'lpr', label: 'LPR' },
          { key: 'cctv', label: 'CCTV' },
          { key: 'kiosk', label: '정산기' },
        ],
        data: lots.map((l: any, i: number) => ({
          no: i + 1, code: l.code, name: l.name, type: l.lot_type || '-',
          spaces: l.total_spaces || 0, disabled: l.disabled_spaces || 0, ev: l.ev_spaces || 0,
          operation: l.operation_type || '-',
          barrier: getEquipCount(l.id, '차단기') > 0 ? '○' : '×',
          lpr: getEquipCount(l.id, 'LPR') > 0 ? '○' : '×',
          cctv: getEquipCount(l.id, 'CCTV') > 0 ? '○' : '×',
          kiosk: getEquipCount(l.id, '무인정산기') > 0 ? '○' : '×',
        })),
        autoFilter: true, freezePane: { row: 1, col: 3 },
        summaryRows: [{ type: 'total', label: '합 계', labelColumn: 0, style: 'bold_border' }],
        pageSetup: { orientation: 'landscape', paperSize: 'A4', fitToPage: true, fitToWidth: 1 },
      }],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-bold">주차장 현황표</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExcel}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> 엑셀
            </Button>
            <PrintButton />
          </div>
        </div>

        <div className="print:block">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold print:text-xl">{config?.org_full_name || config?.org_name || ''} 유료 공영주차장 현황표</h2>
            <p className="text-sm text-muted-foreground">기준일: {today}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs print:text-[10px]">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border p-1.5 text-center">번호</th>
                  <th className="border border-border p-1.5 text-center">코드</th>
                  <th className="border border-border p-1.5 text-left">주차장명</th>
                  <th className="border border-border p-1.5 text-center">유형</th>
                  <th className="border border-border p-1.5 text-right">면수</th>
                  <th className="border border-border p-1.5 text-right">장애인</th>
                  <th className="border border-border p-1.5 text-right">전기차</th>
                  <th className="border border-border p-1.5 text-center">직/위탁</th>
                  <th className="border border-border p-1.5 text-center">차단</th>
                  <th className="border border-border p-1.5 text-center">LPR</th>
                  <th className="border border-border p-1.5 text-center">CCTV</th>
                  <th className="border border-border p-1.5 text-center">정산</th>
                  <th className="border border-border p-1.5 text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l: any, i: number) => (
                  <tr key={l.id} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                    <td className="border border-border p-1 text-center">{i + 1}</td>
                    <td className="border border-border p-1 text-center font-mono">{l.code}</td>
                    <td className="border border-border p-1">{l.name}</td>
                    <td className="border border-border p-1 text-center">{l.lot_type || '-'}</td>
                    <td className="border border-border p-1 text-right">{l.total_spaces || 0}</td>
                    <td className="border border-border p-1 text-right">{l.disabled_spaces || 0}</td>
                    <td className="border border-border p-1 text-right">{l.ev_spaces || 0}</td>
                    <td className="border border-border p-1 text-center">{l.operation_type || '-'}</td>
                    <td className="border border-border p-1 text-center">{getEquipCount(l.id, '차단기') > 0 ? '○' : '×'}</td>
                    <td className="border border-border p-1 text-center">{getEquipCount(l.id, 'LPR') > 0 ? '○' : '×'}</td>
                    <td className="border border-border p-1 text-center">{getEquipCount(l.id, 'CCTV') > 0 ? '○' : '×'}</td>
                    <td className="border border-border p-1 text-center">{getEquipCount(l.id, '무인정산기') > 0 ? '○' : '×'}</td>
                    <td className="border border-border p-1">{l.operation_type === '위탁' ? l.contractor_name || '' : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold">
                  <td colSpan={4} className="border border-border p-1.5 text-center">합 계</td>
                  <td className="border border-border p-1.5 text-right">{totalSpaces}</td>
                  <td className="border border-border p-1.5 text-right">{totalDisabled}</td>
                  <td className="border border-border p-1.5 text-right">{totalEv}</td>
                  <td colSpan={6} className="border border-border p-1.5">직영:{directCount} / 위탁:{outsourcedCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
