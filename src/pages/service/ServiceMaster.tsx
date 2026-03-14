import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/types/service";

const cols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'project_number', label: '사업번호', group: '기본정보', width: 120, sticky: true },
  { key: 'project_name', label: '사업명', group: '기본정보', width: 200, sticky: true },
  { key: 'contractor_name', label: '수행업체', group: '사업정보', width: 120 },
  { key: 'contract_amount', label: '계약금액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'paid_amount', label: '지급액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'start_date', label: '시작일', group: '일정', format: 'date', width: 100 },
  { key: 'end_date', label: '종료일', group: '일정', format: 'date', width: 100 },
  { key: 'progress_pct', label: '진척률', group: '진행', format: 'percent', width: 80 },
  { key: 'status', label: '상태', group: '진행', format: 'badge', width: 80, badgeMap: Object.fromEntries(Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => [k, { label: v, color: PROJECT_STATUS_COLORS[k] || '' }])) },
  { key: 'supervisor_name', label: '담당자', group: '진행', width: 80 },
];

export default function ServiceMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['service-master'], queryFn: async () => {
      const { data } = await supabase.from('service_projects').select('*, supervisor:profiles!service_projects_supervisor_id_fkey(name)').order('created_at', { ascending: false });
      return (data || []).map((p: any, i: number) => ({
        _no: i + 1, project_number: p.project_number, project_name: p.project_name,
        contractor_name: p.contractor_name, contract_amount: p.contract_amount, paid_amount: p.paid_amount,
        start_date: p.start_date, end_date: p.end_date, progress_pct: p.progress_pct, status: p.status,
        supervisor_name: p.supervisor?.name, id: p.id,
      }));
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="용역사업 종합 현황"
        columns={cols}
        data={data || []}
        loading={isLoading}
        exportFileName="용역사업종합"
        frozenColumns={3}
        onRowClick={(row) => window.location.href = `/service/projects/${row.id}`}
      />
    </DashboardLayout>
  );
}
