import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";
import { REPORT_STATUS_LABELS } from "@/types/report";

const cols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'report_number', label: '보고서번호', group: '기본정보', width: 150, sticky: true },
  { key: 'title', label: '보고서명', group: '기본정보', width: 200, sticky: true },
  { key: 'template_name', label: '템플릿', group: '보고서정보', width: 120 },
  { key: 'period', label: '기간', group: '보고서정보', width: 150 },
  { key: 'file_format', label: '형식', group: '보고서정보', width: 60 },
  { key: 'file_size', label: '크기', group: '보고서정보', format: 'number', width: 80 },
  { key: 'page_count', label: '페이지', group: '보고서정보', format: 'number', width: 60 },
  { key: 'created_at', label: '생성일', group: '상태', format: 'date', width: 100 },
  { key: 'status', label: '상태', group: '상태', format: 'badge', width: 80, badgeMap: Object.fromEntries(Object.entries(REPORT_STATUS_LABELS).map(([k, v]) => [k, { label: v.label, color: v.color }])) },
  { key: 'generation_time_ms', label: '생성시간(ms)', group: '상태', format: 'number', width: 90 },
];

export default function ReportMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-master'], queryFn: async () => {
      const { data } = await supabase.from('report_generated')
        .select('*, template:report_templates(name)')
        .order('created_at', { ascending: false }).limit(500);
      return (data || []).map((r: any, i: number) => ({
        _no: i + 1, report_number: r.report_number, title: r.title,
        template_name: r.template?.name, period: r.period_start ? `${r.period_start}~${r.period_end || ''}` : '-',
        file_format: (r.file_format || 'pdf').toUpperCase(), file_size: r.file_size,
        page_count: r.page_count, created_at: r.created_at, status: r.status,
        generation_time_ms: r.generation_time_ms,
      }));
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="보고서 종합 현황"
        columns={cols}
        data={data || []}
        loading={isLoading}
        exportFileName="보고서종합"
        frozenColumns={3}
        filterConfig={[
          { key: 'status', label: '상태', type: 'select', options: Object.entries(REPORT_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v.label })) },
        ]}
      />
    </DashboardLayout>
  );
}
