import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS } from "@/types/facility";

const equipCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
  { key: 'equipment_code', label: '장비코드', group: '기본정보', width: 100, sticky: true },
  { key: 'equipment_type', label: '유형', group: '장비정보', width: 80 },
  { key: 'name', label: '장비명', group: '장비정보', width: 120 },
  { key: 'manufacturer', label: '제조사', group: '장비정보', width: 100 },
  { key: 'model_name', label: '모델', group: '장비정보', width: 100 },
  { key: 'serial_number', label: '시리얼', group: '장비정보', width: 120 },
  { key: 'install_date', label: '설치일', group: '장비정보', format: 'date', width: 100 },
  { key: 'warranty_end', label: '보증만료', group: '장비정보', format: 'date', width: 100 },
  { key: 'acquisition_cost', label: '취득원가', group: '장비정보', format: 'currency', subTotal: 'sum', width: 110 },
  { key: 'status', label: '상태', group: '장비정보', format: 'badge', width: 80, badgeMap: { normal: { label: '정상', color: 'bg-green-100 text-green-700' }, warning: { label: '이상', color: 'bg-yellow-100 text-yellow-700' }, broken: { label: '고장', color: 'bg-red-100 text-red-700' }, maintenance: { label: '점검중', color: 'bg-blue-100 text-blue-700' }, disposed: { label: '폐기', color: 'bg-muted text-muted-foreground' } } },
  { key: 'age_rate', label: '경과율(%)', group: '장비정보', format: 'percent', width: 80 },
  { key: 'last_maintenance_date', label: '최근점검일', group: '장비정보', format: 'date', width: 100 },
];

const maintCols: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
  { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
  { key: 'title', label: '제목', group: '유지보수', width: 180, sticky: true },
  { key: 'maintenance_type', label: '유형', group: '유지보수', width: 80 },
  { key: 'reported_date', label: '접수일', group: '유지보수', format: 'date', width: 100 },
  { key: 'completed_at', label: '완료일', group: '유지보수', format: 'date', width: 100 },
  { key: 'total_cost', label: '비용', group: '유지보수', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'status', label: '상태', group: '유지보수', format: 'badge', width: 80, badgeMap: { reported: { label: '접수', color: 'bg-yellow-100 text-yellow-700' }, in_progress: { label: '진행', color: 'bg-blue-100 text-blue-700' }, completed: { label: '완료', color: 'bg-green-100 text-green-700' } } },
];

export default function FacilityMaster() {
  const [tab, setTab] = useState('equipment');

  const { data: equipment = [], isLoading: el } = useQuery({
    queryKey: ['facility-master-equip'], queryFn: async () => {
      const { data } = await supabase.from('equipment').select('*, parking_lots(code, name)').order('equipment_code');
      return (data || []).map((e: any, i: number) => {
        const ageYears = e.install_date ? (Date.now() - new Date(e.install_date).getTime()) / (365.25 * 86400000) : 0;
        const ageRate = e.useful_life_years ? (ageYears / e.useful_life_years) * 100 : 0;
        return {
          _no: i + 1, lot_name: e.parking_lots?.name, equipment_code: e.equipment_code, equipment_type: e.equipment_type,
          name: e.name, manufacturer: e.manufacturer, model_name: e.model_name, serial_number: e.serial_number,
          install_date: e.install_date, warranty_end: e.warranty_end, acquisition_cost: e.acquisition_cost,
          status: e.status, age_rate: Math.round(ageRate * 10) / 10, last_maintenance_date: e.last_maintenance_date,
        };
      });
    },
  });

  const { data: maintenance = [], isLoading: ml } = useQuery({
    queryKey: ['facility-master-maint'], queryFn: async () => {
      const { data } = await supabase.from('maintenance_logs').select('*, parking_lots(code, name)').order('created_at', { ascending: false });
      return (data || []).map((m: any, i: number) => ({
        _no: i + 1, lot_name: m.parking_lots?.name, title: m.title, maintenance_type: m.maintenance_type,
        reported_date: m.reported_date, completed_at: m.completed_at,
        total_cost: (m.parts_cost || 0) + (m.labor_cost || 0) + (m.other_cost || 0), status: m.status,
      }));
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">시설관리 종합 현황</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="equipment">장비현황</TabsTrigger><TabsTrigger value="maintenance">유지보수</TabsTrigger></TabsList>
          <TabsContent value="equipment">
            <MasterDataView title="장비 종합 현황" columns={equipCols} data={equipment} loading={el} exportFileName="시설관리_장비" frozenColumns={3} />
          </TabsContent>
          <TabsContent value="maintenance">
            <MasterDataView title="유지보수 종합" columns={maintCols} data={maintenance} loading={ml} exportFileName="시설관리_유지보수" frozenColumns={3} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
