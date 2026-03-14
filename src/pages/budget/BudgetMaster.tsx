import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";

const cols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'item_code', label: '항목코드', group: '기본정보', width: 100, sticky: true },
  { key: 'item_name', label: '항목명', group: '기본정보', width: 180, sticky: true },
  { key: 'budget_type', label: '구분', group: '편성정보', width: 70 },
  { key: 'category_l1', label: '대분류', group: '편성정보', width: 100 },
  { key: 'category_l2', label: '중분류', group: '편성정보', width: 100 },
  { key: 'planned_amount', label: '편성액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'allocated_amount', label: '배정액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'executed_amount', label: '집행액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'remaining_amount', label: '잔액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'execution_rate', label: '집행률', group: '금액', format: 'percent', width: 80 },
  { key: 'responsible_team', label: '담당팀', group: '기타', width: 80 },
];

export default function BudgetMaster() {
  const { data, isLoading } = useQuery({
    queryKey: ['budget-master'], queryFn: async () => {
      const { data } = await supabase.from('budget_items').select('*, budget_plans(title, fiscal_year, status)').order('sort_order');
      return (data || []).map((b: any, i: number) => ({
        _no: i + 1, item_code: b.item_code, item_name: b.item_name, budget_type: b.budget_type === 'revenue' ? '세입' : '세출',
        category_l1: b.category_l1, category_l2: b.category_l2,
        planned_amount: b.planned_amount, allocated_amount: b.allocated_amount,
        executed_amount: b.executed_amount, remaining_amount: b.remaining_amount,
        execution_rate: b.execution_rate, responsible_team: b.responsible_team,
      }));
    },
  });

  return (
    <DashboardLayout>
      <MasterDataView
        title="예산관리 종합 현황"
        subtitle="전체 예산 편성 및 집행 현황"
        columns={cols}
        data={data || []}
        loading={isLoading}
        exportFileName="예산관리종합"
        frozenColumns={3}
        filterConfig={[
          { key: 'budget_type', label: '구분', type: 'select', options: [{ value: '세입', label: '세입' }, { value: '세출', label: '세출' }] },
        ]}
      />
    </DashboardLayout>
  );
}
