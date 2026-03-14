import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";
import { BID_STATUS_LABELS, BID_STATUS_COLORS } from "@/types/procurement";

const cols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'bid_number', label: '입찰번호', group: '기본정보', width: 130, sticky: true },
  { key: 'title', label: '사업명', group: '기본정보', width: 200, sticky: true },
  { key: 'bid_type', label: '입찰방식', group: '입찰정보', width: 80 },
  { key: 'contract_type', label: '계약유형', group: '입찰정보', width: 80 },
  { key: 'estimated_amount', label: '추정가', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'contract_amount', label: '계약금액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'savings_rate', label: '낙찰률', group: '금액', format: 'percent', width: 80 },
  { key: 'announce_date', label: '공고일', group: '일정', format: 'date', width: 100 },
  { key: 'bid_deadline', label: '마감일', group: '일정', format: 'date', width: 100 },
  { key: 'successful_bidder', label: '낙찰업체', group: '결과', width: 120 },
  { key: 'status', label: '상태', group: '결과', format: 'badge', width: 80, badgeMap: Object.fromEntries(Object.entries(BID_STATUS_LABELS).map(([k, v]) => [k, { label: v, color: BID_STATUS_COLORS[k] || '' }])) },
];

export default function ProcurementMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['procurement-master'], queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('*').order('created_at', { ascending: false });
      return (data || []).map((p: any, i: number) => ({
        _no: i + 1, ...p,
      }));
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="입찰관리 종합 현황"
        columns={cols}
        data={data || []}
        loading={isLoading}
        exportFileName="입찰관리종합"
        frozenColumns={3}
        onRowClick={(row) => window.location.href = `/procurement/projects/${row.id}`}
      />
    </DashboardLayout>
  );
}
