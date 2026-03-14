import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";
import { CONTRACT_STATUS_LABELS } from "@/types/operations";

const contractCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'lot_code', label: '코드', group: '기본정보', width: 80, sticky: true },
  { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
  { key: 'contractor_name', label: '위탁업체', group: '계약정보', width: 120 },
  { key: 'contract_start', label: '시작일', group: '계약정보', format: 'date', width: 100 },
  { key: 'contract_end', label: '종료일', group: '계약정보', format: 'date', width: 100 },
  { key: 'contract_amount', label: '계약금액', group: '계약정보', format: 'currency', subTotal: 'sum', width: 120 },
  { key: 'revenue_share_rate', label: '수익배분(%)', group: '계약정보', format: 'percent', width: 90 },
  { key: 'status', label: '상태', group: '계약정보', format: 'badge', width: 80, badgeMap: { active: { label: '활성', color: 'bg-green-100 text-green-700' }, expired: { label: '만료', color: 'bg-red-100 text-red-700' }, terminated: { label: '해지', color: 'bg-muted text-muted-foreground' } } },
  { key: 'remaining_days', label: '잔여일', group: '계약정보', format: 'number', width: 70 },
];

const staffCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
  { key: 'name', label: '이름', group: '인력정보', width: 80, sticky: true },
  { key: 'position', label: '직책', group: '인력정보', width: 80 },
  { key: 'employment_type', label: '고용유형', group: '인력정보', width: 80 },
  { key: 'duty', label: '담당업무', group: '인력정보', width: 100 },
  { key: 'hire_date', label: '입사일', group: '인력정보', format: 'date', width: 100 },
  { key: 'phone', label: '연락처', group: '인력정보', width: 120 },
  { key: 'is_active', label: '상태', group: '인력정보', format: 'boolean', booleanLabels: { true: '재직', false: '퇴직' }, width: 70 },
];

const passCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'pass_number', label: '정기권번호', group: '기본정보', width: 130, sticky: true },
  { key: 'vehicle_number', label: '차량번호', group: '기본정보', width: 100, sticky: true },
  { key: 'lot_name', label: '주차장', group: '정기권정보', width: 120 },
  { key: 'holder_name', label: '이용자', group: '정기권정보', width: 80 },
  { key: 'pass_start', label: '시작', group: '정기권정보', format: 'date', width: 100 },
  { key: 'pass_end', label: '종료', group: '정기권정보', format: 'date', width: 100 },
  { key: 'fee_amount', label: '월요금', group: '정기권정보', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'status', label: '상태', group: '정기권정보', format: 'badge', width: 70, badgeMap: { active: { label: '활성', color: 'bg-green-100 text-green-700' }, expired: { label: '만료', color: 'bg-muted text-muted-foreground' }, cancelled: { label: '해지', color: 'bg-red-100 text-red-700' } } },
];

export default function OpsMaster() {
  const [tab, setTab] = useState('contracts');

  const { data: contracts = [], isLoading: cl } = useQuery({
    queryKey: ['ops-master-contracts'], queryFn: async () => {
      const { data } = await supabase.from('outsourcing_contracts').select('*, parking_lots(code, name)').order('contract_start', { ascending: false });
      return (data || []).map((c: any, i: number) => ({
        _no: i + 1, lot_code: c.parking_lots?.code, lot_name: c.parking_lots?.name,
        contractor_name: c.contractor_name, contract_start: c.contract_start, contract_end: c.contract_end,
        contract_amount: c.contract_amount, revenue_share_rate: c.revenue_share_rate, status: c.status,
        remaining_days: c.contract_end ? Math.max(0, Math.ceil((new Date(c.contract_end).getTime() - Date.now()) / 86400000)) : 0,
      }));
    },
  });

  const { data: staff = [], isLoading: sl } = useQuery({
    queryKey: ['ops-master-staff'], queryFn: async () => {
      const { data } = await supabase.from('operations_staff').select('*, parking_lots(code, name)').order('name');
      return (data || []).map((s: any, i: number) => ({
        _no: i + 1, lot_name: s.parking_lots?.name, name: s.name, position: s.position,
        employment_type: s.employment_type, duty: s.duty, hire_date: s.hire_date, phone: s.phone, is_active: s.is_active,
      }));
    },
  });

  const { data: passes = [], isLoading: pl } = useQuery({
    queryKey: ['ops-master-passes'], queryFn: async () => {
      const { data } = await supabase.from('monthly_passes').select('*, parking_lots(code, name)').order('created_at', { ascending: false });
      return (data || []).map((p: any, i: number) => ({
        _no: i + 1, pass_number: p.pass_number, vehicle_number: p.vehicle_number, lot_name: p.parking_lots?.name,
        holder_name: p.holder_name, pass_start: p.pass_start, pass_end: p.pass_end, fee_amount: p.fee_amount, status: p.status,
      }));
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">운영관리 종합 현황</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="contracts">위탁운영</TabsTrigger><TabsTrigger value="staff">인력현황</TabsTrigger><TabsTrigger value="passes">월정기권</TabsTrigger></TabsList>
          <TabsContent value="contracts">
            <MasterDataView title="위탁운영 종합" columns={contractCols} data={contracts} loading={cl} exportFileName="운영관리_위탁운영" frozenColumns={3} />
          </TabsContent>
          <TabsContent value="staff">
            <MasterDataView title="인력현황 종합" columns={staffCols} data={staff} loading={sl} exportFileName="운영관리_인력" frozenColumns={3} />
          </TabsContent>
          <TabsContent value="passes">
            <MasterDataView title="월정기권 종합" columns={passCols} data={passes} loading={pl} exportFileName="운영관리_정기권" frozenColumns={3} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
