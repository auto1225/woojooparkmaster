import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_COLORS, CATEGORY_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, CHANNEL_LABELS } from "@/types/complaint";

const cols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'complaint_number', label: '민원번호', group: '기본정보', width: 130, sticky: true },
  { key: 'title', label: '제목', group: '기본정보', width: 200, sticky: true },
  { key: 'category', label: '유형', group: '민원정보', width: 80 },
  { key: 'channel', label: '채널', group: '민원정보', width: 70 },
  { key: 'priority', label: '우선순위', group: '민원정보', format: 'badge', width: 80, badgeMap: Object.fromEntries(Object.entries(PRIORITY_LABELS).map(([k, v]) => [k, { label: v, color: PRIORITY_COLORS[k] || '' }])) },
  { key: 'lot_name', label: '주차장', group: '민원정보', width: 100 },
  { key: 'received_at', label: '접수일', group: '처리정보', format: 'date', width: 100 },
  { key: 'closed_at', label: '완료일', group: '처리정보', format: 'date', width: 100 },
  { key: 'processing_days', label: '처리일수', group: '처리정보', format: 'number', subTotal: 'avg', width: 70 },
  { key: 'is_overdue', label: 'SLA초과', group: '처리정보', format: 'boolean', booleanLabels: { true: '초과', false: '-' }, width: 70 },
  { key: 'assigned_name', label: '담당자', group: '처리정보', width: 80 },
  { key: 'satisfaction_score', label: '만족도', group: '처리정보', format: 'number', subTotal: 'avg', width: 70 },
  { key: 'status', label: '상태', group: '처리정보', format: 'badge', width: 80, badgeMap: Object.fromEntries(Object.entries(COMPLAINT_STATUS_LABELS).map(([k, v]) => [k, { label: v, color: COMPLAINT_STATUS_COLORS[k] || '' }])) },
];

export default function ComplaintMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['complaint-master'], queryFn: async () => {
      const { data } = await supabase.from('complaints')
        .select('*, parking_lots(code, name), profiles!complaints_assigned_to_fkey(name)')
        .order('received_at', { ascending: false });
      return (data || []).map((c: any, i: number) => {
        const days = c.closed_at && c.received_at ? Math.ceil((new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000) : null;
        return {
          _no: i + 1, id: c.id, complaint_number: c.complaint_number, title: c.title,
          category: CATEGORY_LABELS[c.category] || c.category, channel: CHANNEL_LABELS[c.channel] || c.channel,
          priority: c.priority, lot_name: c.parking_lots?.name,
          received_at: c.received_at, closed_at: c.closed_at, processing_days: days,
          is_overdue: c.is_overdue, assigned_name: (c as any).profiles?.name,
          satisfaction_score: c.satisfaction_score, status: c.status,
        };
      });
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="민원관리 종합 현황"
        columns={cols}
        data={data || []}
        loading={isLoading}
        exportFileName="민원관리종합"
        frozenColumns={3}
        filterConfig={[
          { key: 'status', label: '상태', type: 'select', options: Object.entries(COMPLAINT_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })) },
          { key: 'priority', label: '우선순위', type: 'select', options: Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: v })) },
        ]}
        onRowClick={(row) => window.location.href = `/complaints/${row.id}`}
      />
    </DashboardLayout>
  );
}
