import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MasterDataView, type MasterColumn } from "@/components/common/MasterDataView";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '작성중', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: '조사중', color: 'bg-blue-100 text-blue-700' },
  review: { label: '검토중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인완료', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
};

const columns: MasterColumn[] = [
  { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true, sortable: false },
  { key: 'lot_code', label: '주차장코드', group: '기본정보', width: 100, sticky: true },
  { key: 'lot_name', label: '주차장명', group: '기본정보', width: 140, sticky: true },
  { key: 'address_jibun', label: '지번주소', group: '기본정보', width: 200 },
  { key: 'address_road', label: '도로명주소', group: '기본정보', width: 200 },
  { key: 'survey_date', label: '조사일', group: '기본정보', format: 'date', width: 100 },
  { key: 'surveyor_name', label: '조사자', group: '기본정보', width: 80 },
  { key: 'status', label: '상태', group: '기본정보', format: 'badge', badgeMap: STATUS_MAP, width: 80 },
  { key: 'lot_type', label: '유형', group: '기본현황', width: 80 },
  { key: 'operator_type', label: '운영주체', group: '기본현황', width: 80 },
  { key: 'total_spaces', label: '총주차면', group: '기본현황', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'disabled_spaces', label: '장애인면', group: '기본현황', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'ev_spaces', label: '전기차면', group: '기본현황', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'surface_type', label: '바닥포장', group: '기본현황', width: 80 },
  { key: 'site_area', label: '부지면적㎡', group: '기본현황', format: 'number', width: 90 },
  { key: 'weekday_hours', label: '운영시간(평일)', group: '운영현황', width: 120 },
  { key: 'weekend_hours', label: '운영시간(주말)', group: '운영현황', width: 120 },
  { key: 'base_fee', label: '기본요금', group: '운영현황', format: 'currency', width: 90 },
  { key: 'additional_fee', label: '추가요금', group: '운영현황', format: 'currency', width: 90 },
  { key: 'daily_max_fee', label: '1일최대', group: '운영현황', format: 'currency', width: 90 },
  { key: 'monthly_pass_fee', label: '월정기권', group: '운영현황', format: 'currency', width: 90 },
  { key: 'staff_count', label: '관리인원', group: '운영현황', format: 'number', subTotal: 'sum', width: 80 },
  { key: 'has_gate', label: '차단기', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
  { key: 'has_lpr', label: 'LPR', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
  { key: 'has_cctv', label: 'CCTV', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
  { key: 'has_kiosk', label: '무인정산기', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 80 },
  { key: 'has_sensor', label: '센서', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
  { key: 'cctv_count', label: 'CCTV수량', group: '인프라현황', format: 'number', width: 80 },
  { key: 'daily_avg_vehicles', label: '일평균이용', group: '이용현황', format: 'number', subTotal: 'sum', width: 90 },
  { key: 'peak_occupancy_rate', label: '피크점유율', group: '이용현황', format: 'percent', width: 90 },
  { key: 'avg_occupancy_rate', label: '평균점유율', group: '이용현황', format: 'percent', width: 90 },
  { key: 'monthly_revenue', label: '월수입', group: '이용현황', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'needs_sensor', label: '센서필요', group: '센서설치계획', format: 'boolean', booleanLabels: { true: '필요', false: '불필요' }, width: 80 },
  { key: 'recommended_sensor_count', label: '권장센서수', group: '센서설치계획', format: 'number', subTotal: 'sum', width: 90 },
  { key: 'estimated_cost', label: '예상비용', group: '센서설치계획', format: 'currency', subTotal: 'sum', width: 100 },
  { key: 'photo_count', label: '사진수', group: '조사메타', format: 'number', width: 70 },
];

export default function SurveysMaster() {
  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['surveys-master'],
    queryFn: async () => {
      const { data } = await supabase.from('surveys')
        .select(`*, parking_lots(code, name, address_jibun, address_road, lot_type, operator_type, total_spaces),
          survey_basic_info(*), survey_operation(*), survey_infra(*), survey_usage(*), survey_sensor_plan(*)`)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const tableData = rawData.map((s: any, i: number) => ({
    _no: i + 1,
    id: s.id,
    lot_code: s.parking_lots?.code,
    lot_name: s.parking_lots?.name,
    address_jibun: s.parking_lots?.address_jibun,
    address_road: s.parking_lots?.address_road,
    survey_date: s.survey_date,
    surveyor_name: s.surveyor_name,
    status: s.status,
    lot_type: s.parking_lots?.lot_type,
    operator_type: s.parking_lots?.operator_type,
    total_spaces: s.survey_basic_info?.[0]?.total_spaces || s.parking_lots?.total_spaces,
    disabled_spaces: s.survey_basic_info?.[0]?.disabled_spaces,
    ev_spaces: s.survey_basic_info?.[0]?.ev_spaces,
    surface_type: s.survey_basic_info?.[0]?.surface_type,
    site_area: s.survey_basic_info?.[0]?.site_area,
    weekday_hours: s.survey_operation?.[0]?.weekday_hours,
    weekend_hours: s.survey_operation?.[0]?.weekend_hours,
    base_fee: s.survey_operation?.[0]?.base_fee,
    additional_fee: s.survey_operation?.[0]?.additional_fee,
    daily_max_fee: s.survey_operation?.[0]?.daily_max_fee,
    monthly_pass_fee: s.survey_operation?.[0]?.monthly_pass_fee,
    staff_count: s.survey_operation?.[0]?.staff_count,
    has_gate: s.survey_infra?.[0]?.has_gate,
    has_lpr: s.survey_infra?.[0]?.has_lpr,
    has_cctv: s.survey_infra?.[0]?.has_cctv,
    has_kiosk: s.survey_infra?.[0]?.has_kiosk,
    has_sensor: s.survey_infra?.[0]?.has_sensor,
    cctv_count: s.survey_infra?.[0]?.cctv_count,
    daily_avg_vehicles: s.survey_usage?.[0]?.daily_avg_vehicles,
    peak_occupancy_rate: s.survey_usage?.[0]?.peak_occupancy_rate,
    avg_occupancy_rate: s.survey_usage?.[0]?.avg_occupancy_rate,
    monthly_revenue: s.survey_usage?.[0]?.monthly_revenue,
    needs_sensor: s.survey_sensor_plan?.[0]?.needs_sensor,
    recommended_sensor_count: s.survey_sensor_plan?.[0]?.recommended_sensor_count,
    estimated_cost: s.survey_sensor_plan?.[0]?.estimated_cost,
    photo_count: s.photo_count || 0,
  }));

  return (
    <DashboardLayout>
      <MasterDataView
        title="현황조사 종합 현황"
        subtitle="전체 주차장의 조사 결과를 한눈에 비교합니다"
        columns={columns}
        data={tableData}
        loading={isLoading}
        frozenColumns={3}
        exportFileName="현황조사종합"
        filterConfig={[
          { key: 'status', label: '조사 상태', type: 'select', options: Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label })) },
          { key: 'lot_type', label: '주차장유형', type: 'select', options: [{ value: '노외', label: '노외' }, { value: '노상', label: '노상' }] },
        ]}
        onRowClick={(row) => window.location.href = `/surveys/${row.id}`}
      />
    </DashboardLayout>
  );
}
