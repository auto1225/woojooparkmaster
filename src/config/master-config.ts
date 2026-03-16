/**
 * 중앙 집중식 마스터 뷰 설정
 * ─────────────────────────────
 * 모든 모듈의 컬럼, 쿼리, 필터, 변환 로직을 한 곳에서 관리합니다.
 * 컬럼 추가/삭제/변경 시 이 파일만 수정하면 엑셀·PDF·화면에 자동 반영됩니다.
 */
import type { MasterColumn, FilterDef } from "@/components/common/MasterDataView";
import { supabase } from "@/integrations/supabase/client";

/* ────── Badge Maps (공통 상태 맵) ────── */
const SURVEY_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '작성중', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: '조사중', color: 'bg-blue-100 text-blue-700' },
  submitted: { label: '제출됨', color: 'bg-purple-100 text-purple-700' },
  review: { label: '검토중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인완료', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
};

const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: '활성', color: 'bg-green-100 text-green-700' },
  expired: { label: '만료', color: 'bg-red-100 text-red-700' },
  terminated: { label: '해지', color: 'bg-muted text-muted-foreground' },
};

const PASS_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: '활성', color: 'bg-green-100 text-green-700' },
  expired: { label: '만료', color: 'bg-muted text-muted-foreground' },
  cancelled: { label: '해지', color: 'bg-red-100 text-red-700' },
};

const EQUIP_STATUS: Record<string, { label: string; color: string }> = {
  normal: { label: '정상', color: 'bg-green-100 text-green-700' },
  warning: { label: '이상', color: 'bg-yellow-100 text-yellow-700' },
  broken: { label: '고장', color: 'bg-red-100 text-red-700' },
  maintenance: { label: '점검중', color: 'bg-blue-100 text-blue-700' },
  disposed: { label: '폐기', color: 'bg-muted text-muted-foreground' },
};

const MAINT_STATUS: Record<string, { label: string; color: string }> = {
  reported: { label: '접수', color: 'bg-yellow-100 text-yellow-700' },
  assigned: { label: '배정', color: 'bg-purple-100 text-purple-700' },
  in_progress: { label: '진행', color: 'bg-blue-100 text-blue-700' },
  pending_parts: { label: '부품대기', color: 'bg-orange-100 text-orange-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  verified: { label: '확인', color: 'bg-teal-100 text-teal-700' },
};

const CONGESTION: Record<string, { label: string; color: string }> = {
  empty: { label: '여유', color: 'bg-green-100 text-green-700' },
  normal: { label: '보통', color: 'bg-blue-100 text-blue-700' },
  crowded: { label: '혼잡', color: 'bg-orange-100 text-orange-700' },
  full: { label: '만차', color: 'bg-red-100 text-red-700' },
};

const SITE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-muted text-muted-foreground' },
  evaluation: { label: '평가중', color: 'bg-blue-100 text-blue-700' },
  candidate: { label: '후보', color: 'bg-blue-100 text-blue-700' },
  selected: { label: '선정', color: 'bg-green-100 text-green-700' },
  rejected: { label: '탈락', color: 'bg-red-100 text-red-700' },
};

/* ────── Tab Config ────── */
export interface MasterTabConfig {
  key: string;
  label: string;
  columns: MasterColumn[];
  filterConfig?: FilterDef[];
  exportFileName: string;
  frozenColumns?: number;
  queryKey: string;
  queryFn: () => Promise<Record<string, any>[]>;
  onRowClick?: (row: Record<string, any>) => string;
}

/* ────── Module Config ────── */
export interface MasterModuleConfig {
  code: string;
  title: string;
  subtitle?: string;
  tabs: MasterTabConfig[];
}

/* ═══════════════════════════════════════════
   모듈별 설정
   ═══════════════════════════════════════════ */

const MODULES: Record<string, MasterModuleConfig> = {};

/* ── 현황조사 (SURVEY) ── */
MODULES.SURVEY = {
  code: 'SURVEY',
  title: '현황조사 종합 현황',
  subtitle: '전체 주차장의 조사 결과를 한눈에 비교합니다',
  tabs: [{
    key: 'surveys',
    label: '조사현황',
    exportFileName: '현황조사종합',
    frozenColumns: 3,
    queryKey: 'surveys-master',
    columns: [
      { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true, sortable: false },
      { key: 'lot_code', label: '주차장코드', group: '기본정보', width: 100, sticky: true },
      { key: 'lot_name', label: '주차장명', group: '기본정보', width: 140, sticky: true },
      { key: 'address', label: '소재지', group: '기본정보', width: 200 },
      { key: 'survey_date', label: '조사일', group: '기본정보', format: 'date', width: 100 },
      { key: 'surveyor_name', label: '조사자', group: '기본정보', width: 80 },
      { key: 'status', label: '상태', group: '기본정보', format: 'badge', badgeMap: SURVEY_STATUS, width: 80 },
      { key: 'lot_type', label: '유형', group: '기본현황', width: 80 },
      { key: 'operator_type', label: '운영주체', group: '기본현황', width: 80 },
      { key: 'total_spaces', label: '총주차면', group: '기본현황', format: 'number', subTotal: 'sum', width: 80 },
      { key: 'disabled_spaces', label: '장애인면', group: '기본현황', format: 'number', subTotal: 'sum', width: 80 },
      { key: 'ev_spaces', label: '전기차면', group: '기본현황', format: 'number', subTotal: 'sum', width: 80 },
      { key: 'surface_type', label: '바닥포장', group: '기본현황', width: 80 },
      { key: 'operating_hours', label: '운영시간', group: '운영현황', width: 100 },
      { key: 'management_type', label: '관리방식', group: '운영현황', width: 80 },
      { key: 'staff_count', label: '관리인원', group: '운영현황', format: 'number', subTotal: 'sum', width: 80 },
      { key: 'has_barrier', label: '차단기', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
      { key: 'has_lpr', label: 'LPR', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
      { key: 'has_cctv', label: 'CCTV', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
      { key: 'has_kiosk', label: '무인정산기', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 80 },
      { key: 'sensor_installed', label: '센서', group: '인프라현황', format: 'boolean', booleanLabels: { true: '있음', false: '없음' }, width: 70 },
      { key: 'sensor_count', label: '센서수량', group: '인프라현황', format: 'number', width: 80 },
      { key: 'avg_usage_rate', label: '평균이용률', group: '이용현황', width: 90 },
      { key: 'planned_sensors', label: '계획센서수', group: '센서설치계획', format: 'number', subTotal: 'sum', width: 90 },
      { key: 'planned_gateways', label: '계획GW수', group: '센서설치계획', format: 'number', subTotal: 'sum', width: 80 },
      { key: 'display_sw_feasibility', label: '전광판연동', group: '센서설치계획', width: 90 },
    ],
    filterConfig: [
      { key: 'status', label: '조사 상태', type: 'select', options: Object.entries(SURVEY_STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
      { key: 'lot_type', label: '주차장유형', type: 'select', options: [{ value: '노외', label: '노외' }, { value: '노상', label: '노상' }] },
    ],
    queryFn: async () => {
      const { data } = await supabase.from('surveys')
        .select(`*, parking_lots(code, name, address_jibun, address_road, lot_type, operator_type, total_spaces),
          survey_basic_info(*), survey_operation(*), survey_infra(*), survey_usage(*), survey_sensor_plan(*)`)
        .order('created_at', { ascending: false });
      return (data || []).map((s: any, i: number) => ({
        _no: i + 1, id: s.id,
        lot_code: s.parking_lots?.code, lot_name: s.parking_lots?.name,
        address: s.survey_basic_info?.[0]?.address || s.parking_lots?.address_jibun || s.parking_lots?.address_road,
        survey_date: s.survey_date, surveyor_name: s.surveyor_name, status: s.status,
        lot_type: s.survey_basic_info?.[0]?.lot_type || s.parking_lots?.lot_type,
        operator_type: s.survey_basic_info?.[0]?.operator_type || s.parking_lots?.operator_type,
        total_spaces: s.survey_basic_info?.[0]?.total_spaces || s.parking_lots?.total_spaces,
        disabled_spaces: s.survey_basic_info?.[0]?.disabled_spaces,
        ev_spaces: s.survey_basic_info?.[0]?.ev_spaces,
        surface_type: s.survey_basic_info?.[0]?.surface_type,
        operating_hours: s.survey_operation?.[0]?.operating_hours,
        management_type: s.survey_operation?.[0]?.management_type,
        staff_count: s.survey_operation?.[0]?.staff_count,
        has_barrier: s.survey_infra?.[0]?.has_barrier,
        has_lpr: s.survey_infra?.[0]?.has_lpr,
        has_cctv: s.survey_infra?.[0]?.has_cctv,
        has_kiosk: s.survey_infra?.[0]?.has_kiosk,
        sensor_installed: s.survey_infra?.[0]?.sensor_installed,
        sensor_count: s.survey_infra?.[0]?.sensor_count,
        avg_usage_rate: s.survey_usage?.[0]?.avg_usage_rate,
        planned_sensors: s.survey_sensor_plan?.[0]?.planned_sensors,
        planned_gateways: s.survey_sensor_plan?.[0]?.planned_gateways,
        display_sw_feasibility: s.survey_sensor_plan?.[0]?.display_sw_feasibility,
      }));
    },
    onRowClick: (row) => `/surveys/${row.id}`,
  }],
};

/* ── 운영관리 (OPS) ── */
MODULES.OPS = {
  code: 'OPS',
  title: '운영관리 종합 현황',
  tabs: [
    {
      key: 'contracts', label: '위탁운영', exportFileName: '운영관리_위탁운영', frozenColumns: 3,
      queryKey: 'ops-master-contracts',
      columns: [
        { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
        { key: 'lot_code', label: '코드', group: '기본정보', width: 80, sticky: true },
        { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
        { key: 'company_name', label: '위탁업체', group: '계약정보', width: 120 },
        { key: 'contract_start', label: '시작일', group: '계약정보', format: 'date', width: 100 },
        { key: 'contract_end', label: '종료일', group: '계약정보', format: 'date', width: 100 },
        { key: 'contract_amount', label: '계약금액', group: '계약정보', format: 'currency', subTotal: 'sum', width: 120 },
        { key: 'revenue_share_rate', label: '수익배분(%)', group: '계약정보', format: 'percent', width: 90 },
        { key: 'status', label: '상태', group: '계약정보', format: 'badge', width: 80, badgeMap: CONTRACT_STATUS },
        { key: 'remaining_days', label: '잔여일', group: '계약정보', format: 'number', width: 70 },
      ],
      queryFn: async () => {
        const { data } = await supabase.from('outsourcing_contracts').select('*, parking_lots(code, name)').order('contract_start', { ascending: false });
        return (data || []).map((c: any, i: number) => ({
          _no: i + 1, lot_code: c.parking_lots?.code, lot_name: c.parking_lots?.name,
          company_name: c.company_name, contract_start: c.contract_start, contract_end: c.contract_end,
          contract_amount: c.contract_amount, revenue_share_rate: c.revenue_share_rate, status: c.status,
          remaining_days: c.contract_end ? Math.max(0, Math.ceil((new Date(c.contract_end).getTime() - Date.now()) / 86400000)) : 0,
        }));
      },
    },
    {
      key: 'staff', label: '인력현황', exportFileName: '운영관리_인력', frozenColumns: 3,
      queryKey: 'ops-master-staff',
      columns: [
        { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
        { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
        { key: 'staff_name', label: '이름', group: '인력정보', width: 80, sticky: true },
        { key: 'position', label: '직책', group: '인력정보', width: 80 },
        { key: 'staff_type', label: '고용유형', group: '인력정보', width: 80 },
        { key: 'hire_date', label: '입사일', group: '인력정보', format: 'date', width: 100 },
        { key: 'phone', label: '연락처', group: '인력정보', width: 120 },
        { key: 'is_active', label: '상태', group: '인력정보', format: 'boolean', booleanLabels: { true: '재직', false: '퇴직' }, width: 70 },
      ],
      queryFn: async () => {
        const { data } = await supabase.from('operations_staff').select('*, parking_lots(code, name)').order('staff_name');
        return (data || []).map((s: any, i: number) => ({
          _no: i + 1, lot_name: s.parking_lots?.name, staff_name: s.staff_name, position: s.position,
          staff_type: s.staff_type, hire_date: s.hire_date, phone: s.phone, is_active: s.is_active,
        }));
      },
    },
    {
      key: 'passes', label: '월정기권', exportFileName: '운영관리_정기권', frozenColumns: 3,
      queryKey: 'ops-master-passes',
      columns: [
        { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
        { key: 'pass_number', label: '정기권번호', group: '기본정보', width: 130, sticky: true },
        { key: 'vehicle_number', label: '차량번호', group: '기본정보', width: 100, sticky: true },
        { key: 'lot_name', label: '주차장', group: '정기권정보', width: 120 },
        { key: 'holder_name', label: '이용자', group: '정기권정보', width: 80 },
        { key: 'pass_start', label: '시작', group: '정기권정보', format: 'date', width: 100 },
        { key: 'pass_end', label: '종료', group: '정기권정보', format: 'date', width: 100 },
        { key: 'fee_amount', label: '월요금', group: '정기권정보', format: 'currency', subTotal: 'sum', width: 100 },
        { key: 'status', label: '상태', group: '정기권정보', format: 'badge', width: 70, badgeMap: PASS_STATUS },
      ],
      queryFn: async () => {
        const { data } = await supabase.from('monthly_passes').select('*, parking_lots(code, name)').order('created_at', { ascending: false });
        return (data || []).map((p: any, i: number) => ({
          _no: i + 1, pass_number: p.pass_number, vehicle_number: p.vehicle_number, lot_name: p.parking_lots?.name,
          holder_name: p.holder_name, pass_start: p.pass_start, pass_end: p.pass_end, fee_amount: p.fee_amount, status: p.status,
        }));
      },
    },
  ],
};

/* ── 시설관리 (FACILITY) ── */
MODULES.FACILITY = {
  code: 'FACILITY',
  title: '시설관리 종합 현황',
  tabs: [
    {
      key: 'equipment', label: '장비현황', exportFileName: '시설관리_장비', frozenColumns: 3,
      queryKey: 'facility-master-equip',
      columns: [
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
        { key: 'status', label: '상태', group: '장비정보', format: 'badge', width: 80, badgeMap: EQUIP_STATUS },
        { key: 'age_rate', label: '경과율(%)', group: '장비정보', format: 'percent', width: 80 },
        { key: 'last_maintenance_date', label: '최근점검일', group: '장비정보', format: 'date', width: 100 },
      ],
      queryFn: async () => {
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
    },
    {
      key: 'maintenance', label: '유지보수', exportFileName: '시설관리_유지보수', frozenColumns: 3,
      queryKey: 'facility-master-maint',
      columns: [
        { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
        { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
        { key: 'title', label: '제목', group: '유지보수', width: 180, sticky: true },
        { key: 'maintenance_type', label: '유형', group: '유지보수', width: 80 },
        { key: 'reported_date', label: '접수일', group: '유지보수', format: 'date', width: 100 },
        { key: 'completed_at', label: '완료일', group: '유지보수', format: 'date', width: 100 },
        { key: 'total_cost', label: '비용', group: '유지보수', format: 'currency', subTotal: 'sum', width: 100 },
        { key: 'status', label: '상태', group: '유지보수', format: 'badge', width: 80, badgeMap: MAINT_STATUS },
      ],
      queryFn: async () => {
        const { data } = await supabase.from('maintenance_logs').select('*, parking_lots(code, name)').order('created_at', { ascending: false });
        return (data || []).map((m: any, i: number) => ({
          _no: i + 1, lot_name: m.parking_lots?.name, title: m.title, maintenance_type: m.maintenance_type,
          reported_date: m.reported_date, completed_at: m.completed_at,
          total_cost: (m.parts_cost || 0) + (m.labor_cost || 0) + (m.other_cost || 0), status: m.status,
        }));
      },
    },
  ],
};

/* ── 수입관리 (REVENUE) ── */
MODULES.REVENUE = {
  code: 'REVENUE',
  title: '수입관리 종합 현황',
  tabs: [{
    key: 'daily', label: '일별 수입', exportFileName: '수입관리_일별수입', frozenColumns: 3,
    queryKey: 'revenue-master-daily',
    columns: [
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
    ],
    filterConfig: [
      { key: 'verified', label: '검증', type: 'select', options: [{ value: 'true', label: '완료' }, { value: 'false', label: '미검증' }] },
    ],
    queryFn: async () => {
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
  }],
};

/* ── 예산관리 (BUDGET) ── */
MODULES.BUDGET = {
  code: 'BUDGET',
  title: '예산관리 종합 현황',
  subtitle: '전체 예산 편성 및 집행 현황',
  tabs: [{
    key: 'items', label: '예산항목', exportFileName: '예산관리종합', frozenColumns: 3,
    queryKey: 'budget-master',
    columns: [
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
    ],
    filterConfig: [
      { key: 'budget_type', label: '구분', type: 'select', options: [{ value: '세입', label: '세입' }, { value: '세출', label: '세출' }] },
    ],
    queryFn: async () => {
      const { data } = await supabase.from('budget_items').select('*, budget_plans(title, fiscal_year, status)').order('sort_order');
      return (data || []).map((b: any, i: number) => ({
        _no: i + 1, item_code: b.item_code, item_name: b.item_name,
        budget_type: b.budget_type === 'revenue' ? '세입' : '세출',
        category_l1: b.category_l1, category_l2: b.category_l2,
        planned_amount: b.planned_amount, allocated_amount: b.allocated_amount,
        executed_amount: b.executed_amount, remaining_amount: b.remaining_amount,
        execution_rate: b.execution_rate, responsible_team: b.responsible_team,
      }));
    },
  }],
};

/* ── 입찰관리 (PROCUREMENT) ── */
MODULES.PROCUREMENT = {
  code: 'PROCUREMENT',
  title: '입찰관리 종합 현황',
  tabs: [{
    key: 'bids', label: '입찰현황', exportFileName: '입찰관리종합', frozenColumns: 3,
    queryKey: 'procurement-master',
    columns: [
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
      { key: 'status', label: '상태', group: '결과', format: 'badge', width: 80, badgeMap: {
        draft: { label: '작성중', color: 'bg-muted text-muted-foreground' },
        announced: { label: '공고중', color: 'bg-blue-100 text-blue-700' },
        bidding: { label: '투찰중', color: 'bg-yellow-100 text-yellow-700' },
        evaluating: { label: '심사중', color: 'bg-orange-100 text-orange-700' },
        awarded: { label: '낙찰', color: 'bg-green-100 text-green-700' },
        contracted: { label: '계약완료', color: 'bg-green-100 text-green-700' },
        cancelled: { label: '취소', color: 'bg-red-100 text-red-700' },
        failed: { label: '유찰', color: 'bg-red-100 text-red-700' },
      }},
    ],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('*').order('created_at', { ascending: false });
      return (data || []).map((p: any, i: number) => ({ _no: i + 1, ...p }));
    },
    onRowClick: (row) => `/procurement/projects/${row.id}`,
  }],
};

/* ── 용역사업 (SERVICE) ── */
MODULES.SERVICE = {
  code: 'SERVICE',
  title: '용역사업 종합 현황',
  tabs: [{
    key: 'projects', label: '사업현황', exportFileName: '용역사업종합', frozenColumns: 3,
    queryKey: 'service-master',
    columns: [
      { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
      { key: 'project_number', label: '사업번호', group: '기본정보', width: 120, sticky: true },
      { key: 'project_name', label: '사업명', group: '기본정보', width: 200, sticky: true },
      { key: 'contractor_name', label: '수행업체', group: '사업정보', width: 120 },
      { key: 'contract_amount', label: '계약금액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
      { key: 'paid_amount', label: '지급액', group: '금액', format: 'currency', subTotal: 'sum', width: 120 },
      { key: 'start_date', label: '시작일', group: '일정', format: 'date', width: 100 },
      { key: 'end_date', label: '종료일', group: '일정', format: 'date', width: 100 },
      { key: 'progress_pct', label: '진척률', group: '진행', format: 'percent', width: 80 },
      { key: 'status', label: '상태', group: '진행', format: 'badge', width: 80, badgeMap: {
        planning: { label: '기획', color: 'bg-muted text-muted-foreground' },
        in_progress: { label: '진행중', color: 'bg-blue-100 text-blue-700' },
        inspection: { label: '검수', color: 'bg-yellow-100 text-yellow-700' },
        completed: { label: '완료', color: 'bg-green-100 text-green-700' },
        warranty: { label: '하자보수', color: 'bg-orange-100 text-orange-700' },
        closed: { label: '종료', color: 'bg-muted text-muted-foreground' },
      }},
      { key: 'supervisor_name', label: '담당자', group: '진행', width: 80 },
    ],
    queryFn: async () => {
      const { data } = await supabase.from('service_projects').select('*, supervisor:profiles!service_projects_supervisor_id_fkey(name)').order('created_at', { ascending: false });
      return (data || []).map((p: any, i: number) => ({
        _no: i + 1, project_number: p.project_number, project_name: p.project_name,
        contractor_name: p.contractor_name, contract_amount: p.contract_amount, paid_amount: p.paid_amount,
        start_date: p.start_date, end_date: p.end_date, progress_pct: p.progress_pct, status: p.status,
        supervisor_name: p.supervisor?.name, id: p.id,
      }));
    },
    onRowClick: (row) => `/service/projects/${row.id}`,
  }],
};

/* ── 민원관리 (COMPLAINT) ── */
MODULES.COMPLAINT = {
  code: 'COMPLAINT',
  title: '민원관리 종합 현황',
  tabs: [{
    key: 'complaints', label: '민원현황', exportFileName: '민원관리종합', frozenColumns: 3,
    queryKey: 'complaint-master',
    columns: [
      { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
      { key: 'complaint_number', label: '민원번호', group: '기본정보', width: 130, sticky: true },
      { key: 'title', label: '제목', group: '기본정보', width: 200, sticky: true },
      { key: 'category', label: '유형', group: '민원정보', width: 80 },
      { key: 'channel', label: '채널', group: '민원정보', width: 70 },
      { key: 'priority', label: '우선순위', group: '민원정보', format: 'badge', width: 80, badgeMap: {
        urgent: { label: '긴급', color: 'bg-red-100 text-red-700' },
        high: { label: '높음', color: 'bg-orange-100 text-orange-700' },
        normal: { label: '보통', color: 'bg-blue-100 text-blue-700' },
        low: { label: '낮음', color: 'bg-muted text-muted-foreground' },
      }},
      { key: 'lot_name', label: '주차장', group: '민원정보', width: 100 },
      { key: 'received_at', label: '접수일', group: '처리정보', format: 'date', width: 100 },
      { key: 'closed_at', label: '완료일', group: '처리정보', format: 'date', width: 100 },
      { key: 'processing_days', label: '처리일수', group: '처리정보', format: 'number', subTotal: 'avg', width: 70 },
      { key: 'is_overdue', label: 'SLA초과', group: '처리정보', format: 'boolean', booleanLabels: { true: '초과', false: '-' }, width: 70 },
      { key: 'assigned_name', label: '담당자', group: '처리정보', width: 80 },
      { key: 'satisfaction_score', label: '만족도', group: '처리정보', format: 'number', subTotal: 'avg', width: 70 },
      { key: 'status', label: '상태', group: '처리정보', format: 'badge', width: 80, badgeMap: {
        received: { label: '접수', color: 'bg-blue-100 text-blue-700' },
        assigned: { label: '배정', color: 'bg-yellow-100 text-yellow-700' },
        in_progress: { label: '처리중', color: 'bg-orange-100 text-orange-700' },
        responded: { label: '답변완료', color: 'bg-green-100 text-green-700' },
        closed: { label: '종결', color: 'bg-muted text-muted-foreground' },
      }},
    ],
    filterConfig: [
      { key: 'status', label: '상태', type: 'select', options: [
        { value: 'received', label: '접수' }, { value: 'assigned', label: '배정' },
        { value: 'in_progress', label: '처리중' }, { value: 'responded', label: '답변완료' }, { value: 'closed', label: '종결' },
      ]},
      { key: 'priority', label: '우선순위', type: 'select', options: [
        { value: 'urgent', label: '긴급' }, { value: 'high', label: '높음' },
        { value: 'normal', label: '보통' }, { value: 'low', label: '낮음' },
      ]},
    ],
    queryFn: async () => {
      const { data } = await supabase.from('complaints')
        .select('*, parking_lots(code, name), profiles!complaints_assigned_to_fkey(name)')
        .order('received_at', { ascending: false });
      return (data || []).map((c: any, i: number) => {
        const days = c.closed_at && c.received_at ? Math.ceil((new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 86400000) : null;
        return {
          _no: i + 1, id: c.id, complaint_number: c.complaint_number, title: c.title,
          category: c.category, channel: c.channel, priority: c.priority, lot_name: c.parking_lots?.name,
          received_at: c.received_at, closed_at: c.closed_at, processing_days: days,
          is_overdue: c.is_overdue, assigned_name: (c as any).profiles?.name,
          satisfaction_score: c.satisfaction_score, status: c.status,
        };
      });
    },
    onRowClick: (row) => `/complaints/${row.id}`,
  }],
};

/* ── 신설기획 (PLANNING) ── */
MODULES.PLANNING = {
  code: 'PLANNING',
  title: '신설기획 종합 현황',
  tabs: [{
    key: 'sites', label: '후보부지', exportFileName: '신설기획종합', frozenColumns: 3,
    queryKey: 'planning-master',
    columns: [
      { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
      { key: 'site_number', label: '부지번호', group: '기본정보', width: 100, sticky: true },
      { key: 'name', label: '부지명', group: '기본정보', width: 150, sticky: true },
      { key: 'address_road', label: '소재지', group: '위치정보', width: 200 },
      { key: 'area_sqm', label: '면적(㎡)', group: '규모', format: 'number', width: 90 },
      { key: 'estimated_spaces', label: '예상면수', group: '규모', format: 'number', subTotal: 'sum', width: 80 },
      { key: 'estimated_construction_cost', label: '예상사업비', group: '규모', format: 'currency', subTotal: 'sum', width: 120 },
      { key: 'location_score', label: '접근성', group: '평가', format: 'number', width: 60 },
      { key: 'demand_score', label: '수요', group: '평가', format: 'number', width: 60 },
      { key: 'feasibility_score', label: '경제성', group: '평가', format: 'number', width: 60 },
      { key: 'legal_score', label: '법적', group: '평가', format: 'number', width: 60 },
      { key: 'total_score', label: '총점', group: '평가', format: 'number', subTotal: 'avg', width: 60 },
      { key: 'status', label: '상태', group: '평가', format: 'badge', width: 80, badgeMap: SITE_STATUS },
    ],
    queryFn: async () => {
      const { data } = await supabase.from('site_candidates').select('*').order('total_score', { ascending: false });
      return (data || []).map((s: any, i: number) => ({ _no: i + 1, ...s }));
    },
  }],
};

/* ── 실시간정보 (REALTIME) ── */
MODULES.REALTIME = {
  code: 'REALTIME',
  title: '실시간정보 종합 현황',
  tabs: [{
    key: 'status', label: '실시간현황', exportFileName: '실시간정보종합', frozenColumns: 3,
    queryKey: 'realtime-master',
    columns: [
      { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
      { key: 'lot_name', label: '주차장', group: '기본정보', width: 120, sticky: true },
      { key: 'total_spaces', label: '총면수', group: '기본정보', format: 'number', subTotal: 'sum', width: 70, sticky: true },
      { key: 'occupied_spaces', label: '점유', group: '실시간', format: 'number', subTotal: 'sum', width: 60 },
      { key: 'available', label: '잔여', group: '실시간', format: 'number', subTotal: 'sum', width: 60 },
      { key: 'occupancy_rate', label: '점유율', group: '실시간', format: 'percent', subTotal: 'avg', width: 70 },
      { key: 'congestion_level', label: '혼잡도', group: '실시간', format: 'badge', width: 70, badgeMap: CONGESTION },
      { key: 'today_total_in', label: '입차', group: '당일통계', format: 'number', subTotal: 'sum', width: 60 },
      { key: 'today_total_out', label: '출차', group: '당일통계', format: 'number', subTotal: 'sum', width: 60 },
      { key: 'last_updated', label: '최종갱신', group: '상태', format: 'date', width: 130 },
    ],
    filterConfig: [
      { key: 'congestion_level', label: '혼잡도', type: 'select', options: [
        { value: 'empty', label: '여유' }, { value: 'normal', label: '보통' },
        { value: 'crowded', label: '혼잡' }, { value: 'full', label: '만차' },
      ]},
    ],
    queryFn: async () => {
      const { data } = await supabase.from('lot_realtime_status').select('*, parking_lots(code, name, total_spaces)').order('lot_id');
      return (data || []).map((r: any, i: number) => ({
        _no: i + 1, lot_name: r.parking_lots?.name, total_spaces: r.total_spaces || r.parking_lots?.total_spaces,
        occupied_spaces: r.occupied_spaces, available: (r.total_spaces || 0) - (r.occupied_spaces || 0),
        occupancy_rate: r.total_spaces > 0 ? ((r.occupied_spaces || 0) / r.total_spaces * 100) : 0,
        congestion_level: r.congestion_level, today_total_in: r.today_total_in, today_total_out: r.today_total_out,
        last_updated: r.last_updated,
      }));
    },
  }],
};

/* ── 보고서 (REPORT) ── */
MODULES.REPORT = {
  code: 'REPORT',
  title: '보고서 종합 현황',
  tabs: [{
    key: 'reports', label: '보고서', exportFileName: '보고서종합', frozenColumns: 3,
    queryKey: 'report-master',
    columns: [
      { key: '_no', label: '번호', group: '기본정보', width: 50, sticky: true },
      { key: 'report_number', label: '보고서번호', group: '기본정보', width: 150, sticky: true },
      { key: 'title', label: '보고서명', group: '기본정보', width: 200, sticky: true },
      { key: 'template_name', label: '템플릿', group: '보고서정보', width: 120 },
      { key: 'period', label: '기간', group: '보고서정보', width: 150 },
      { key: 'file_format', label: '형식', group: '보고서정보', width: 60 },
      { key: 'file_size', label: '크기', group: '보고서정보', format: 'number', width: 80 },
      { key: 'page_count', label: '페이지', group: '보고서정보', format: 'number', width: 60 },
      { key: 'created_at', label: '생성일', group: '상태', format: 'date', width: 100 },
      { key: 'status', label: '상태', group: '상태', format: 'badge', width: 80, badgeMap: {
        generating: { label: '생성중', color: 'bg-blue-100 text-blue-700' },
        completed: { label: '완료', color: 'bg-green-100 text-green-700' },
        failed: { label: '실패', color: 'bg-red-100 text-red-700' },
        archived: { label: '보관', color: 'bg-muted text-muted-foreground' },
      }},
      { key: 'generation_time_ms', label: '생성시간(ms)', group: '상태', format: 'number', width: 90 },
    ],
    filterConfig: [
      { key: 'status', label: '상태', type: 'select', options: [
        { value: 'generating', label: '생성중' }, { value: 'completed', label: '완료' },
        { value: 'failed', label: '실패' }, { value: 'archived', label: '보관' },
      ]},
    ],
    queryFn: async () => {
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
  }],
};

/* ═══════════════════════════════════════════
   Registry API
   ═══════════════════════════════════════════ */

/** 모든 모듈 설정 가져오기 */
export function getAllModuleConfigs(): MasterModuleConfig[] {
  return Object.values(MODULES);
}

/** 특정 모듈 설정 가져오기 */
export function getModuleConfig(code: string): MasterModuleConfig | undefined {
  return MODULES[code.toUpperCase()];
}

/** 모듈 코드 목록 */
export function getModuleCodes(): string[] {
  return Object.keys(MODULES);
}

/** URL 경로에서 모듈 코드 매핑 */
const PATH_TO_CODE: Record<string, string> = {
  surveys: 'SURVEY',
  ops: 'OPS',
  facility: 'FACILITY',
  revenue: 'REVENUE',
  budget: 'BUDGET',
  procurement: 'PROCUREMENT',
  service: 'SERVICE',
  complaints: 'COMPLAINT',
  planning: 'PLANNING',
  realtime: 'REALTIME',
  reports: 'REPORT',
};

export function getModuleCodeFromPath(path: string): string | undefined {
  return PATH_TO_CODE[path];
}
