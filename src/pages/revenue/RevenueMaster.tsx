import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";

const dailyCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
  { key: 'revenue_date', label: '수입일', group: '기본정보', format: 'date', width: 100, sticky: true },
  { key: 'cash_amount', label: '현금', group: '수입현황', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'card_amount', label: '카드', group: '수입현황', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'mobile_amount', label: '모바일', group: '수입현황', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'monthly_pass_amount', label: '정기권', group: '수입현황', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'other_amount', label: '기타', group: '수입현황', format: 'currency', subTotal: 'sum', width: 80 },
  { key: 'total', label: '합계', group: '수입현황', format: 'currency', subTotal: 'sum', width: 110 },
  { key: 'total_vehicles', label: '이용차량', group: '이용현황', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'exemption_count', label: '감면건수', group: '이용현황', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'exemption_amount', label: '감면액', group: '이용현황', format: 'currency', subTotal: 'sum', width: 90 },
  { key: 'verified', label: '검증', group: '이용현황', format: 'boolean', booleanLabels: { true: '완료', false: '미검증' }, width: 70 },
];

export default function RevenueMaster() {
  const [tab, setTab] = useState('daily');

  const { data: daily = [], isLoading } = useQuery({
    queryKey: ['revenue-master-daily'], queryFn: async () => {
      const { data } = await supabase.from('revenue_daily').select('*, parking_lots(code, name)').order('revenue_date', { ascending: false }).limit(500);
      return (data || []).map((r: any, i: number) => ({
        _no: i + 1, lot_name: r.parking_lots?.name, revenue_date: r.revenue_date,
        cash_amount: r.cash_amount, card_amount: r.card_amount, mobile_amount: r.mobile_amount,
        monthly_pass_amount: r.monthly_pass_amount, other_amount: r.other_amount,
        total: (r.cash_amount||0)+(r.card_amount||0)+(r.mobile_amount||0)+(r.monthly_pass_amount||0)+(r.other_amount||0),
        total_vehicles: r.total_vehicles, exemption_count: r.exemption_count, exemption_amount: r.exemption_amount,
        verified: r.verified,
      }));
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">수입관리 종합 현황</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="daily">일별 수입</TabsTrigger></TabsList>
          <TabsContent value="daily">
            <MasterDataView
              title="일별 수입 종합"
              columns={dailyCols}
              data={daily}
              loading={isLoading}
              exportFileName="수입관리_일별수입"
              frozenColumns={3}
              filterConfig={[
                { key: 'verified', label: '검증', type: 'select', options: [{ value: 'true', label: '완료' }, { value: 'false', label: '미검증' }] },
              ]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
