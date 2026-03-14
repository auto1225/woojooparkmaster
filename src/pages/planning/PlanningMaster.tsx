import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";

const siteCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'site_number', label: '부지번호', group: '기본정보', width: 100, sticky: true },
  { key: 'name', label: '부지명', group: '기본정보', width: 150, sticky: true },
  { key: 'address_jibun', label: '소재지', group: '위치정보', width: 200 },
  { key: 'area', label: '면적(㎡)', group: '규모', format: 'number', width: 90 },
  { key: 'estimated_spaces', label: '예상면수', group: '규모', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'estimated_cost', label: '예상사업비', group: '규모', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'location_score', label: '접근성', group: '평가', format: 'number', width: 60 },
  { key: 'demand_score', label: '수요', group: '평가', format: 'number', width: 60 },
  { key: 'feasibility_score', label: '경제성', group: '평가', format: 'number', width: 60 },
  { key: 'legal_score', label: '법적', group: '평가', format: 'number', width: 60 },
  { key: 'total_score', label: '총점', group: '평가', format: 'number', subTotal: 'avg', width: 60 },
  { key: 'status', label: '상태', group: '평가', format: 'badge', width: 80, badgeMap: { candidate: { label: '후보', color: 'bg-blue-100 text-blue-700' }, selected: { label: '선정', color: 'bg-green-100 text-green-700' }, rejected: { label: '탈락', color: 'bg-red-100 text-red-700' } } },
];

export default function PlanningMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['planning-master'], queryFn: async () => {
      const { data } = await supabase.from('site_candidates').select('*').order('total_score', { ascending: false });
      return (data || []).map((s: any, i: number) => ({ _no: i + 1, ...s }));
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="신설기획 종합 현황"
        columns={siteCols}
        data={data || []}
        loading={isLoading}
        exportFileName="신설기획종합"
        frozenColumns={3}
      />
    </DashboardLayout>
  );
}
