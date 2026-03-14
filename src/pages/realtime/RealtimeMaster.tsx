import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";

const cols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
  { key: 'total_spaces', label: '총면수', group: '기본정보', format: 'number', subTotal: 'sum', width: 70, sticky: true },
  { key: 'occupied_spaces', label: '점유', group: '실시간', format: 'number', subTotal: 'sum', width: 60 },
  { key: 'available', label: '잔여', group: '실시간', format: 'number', subTotal: 'sum', width: 60 },
  { key: 'occupancy_rate', label: '점유율', group: '실시간', format: 'percent', subTotal: 'avg', width: 70 },
  { key: 'congestion_level', label: '혼잡도', group: '실시간', format: 'badge', width: 70, badgeMap: { empty: { label: '여유', color: 'bg-green-100 text-green-700' }, normal: { label: '보통', color: 'bg-blue-100 text-blue-700' }, crowded: { label: '혼잡', color: 'bg-orange-100 text-orange-700' }, full: { label: '만차', color: 'bg-red-100 text-red-700' } } },
  { key: 'today_total_in', label: '입차', group: '당일통계', format: 'number', subTotal: 'sum', width: 60 },
  { key: 'today_total_out', label: '출차', group: '당일통계', format: 'number', subTotal: 'sum', width: 60 },
  { key: 'last_updated', label: '최종갱신', group: '상태', format: 'date', width: 130 },
];

export default function RealtimeMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['realtime-master'], queryFn: async () => {
      const { data } = await supabase.from('lot_realtime_status').select('*, parking_lots(code, name, total_spaces)').order('lot_id');
      return (data || []).map((r: any, i: number) => ({
        _no: i + 1, lot_name: r.parking_lots?.name, total_spaces: r.total_spaces || r.parking_lots?.total_spaces,
        occupied_spaces: r.occupied_spaces, available: (r.total_spaces || 0) - (r.occupied_spaces || 0),
        occupancy_rate: r.total_spaces > 0 ? ((r.occupied_spaces || 0) / r.total_spaces * 100) : 0,
        congestion_level: r.congestion_level, today_total_in: r.today_total_in, today_total_out: r.today_total_out,
        last_updated: r.last_updated,
      }));
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="실시간정보 종합 현황"
        columns={cols}
        data={data || []}
        loading={isLoading}
        exportFileName="실시간정보종합"
        frozenColumns={3}
        filterConfig={[
          { key: 'congestion_level', label: '혼잡도', type: 'select', options: [{ value: 'empty', label: '여유' }, { value: 'normal', label: '보통' }, { value: 'crowded', label: '혼잡' }, { value: 'full', label: '만차' }] },
        ]}
      />
    </DashboardLayout>
  );
}
