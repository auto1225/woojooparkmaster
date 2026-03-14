export interface OperationsStaff {
  id: string; lot_id: string; staff_name: string;
  staff_type: string; phone?: string | null;
  position?: string | null; schedule?: any; hire_date?: string | null;
  resign_date?: string | null; is_active: boolean; notes?: string | null;
  created_at?: string; updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export interface OutsourcingContract {
  id: string; lot_id: string; company_name: string;
  business_number?: string | null; representative?: string | null;
  contract_number?: string | null;
  contract_start: string; contract_end: string;
  contract_amount?: number | null; monthly_fee?: number | null;
  revenue_share_rate?: number | null;
  contact_person?: string | null; contact_phone?: string | null;
  contact_email?: string | null;
  performance_score?: number | null; evaluation_date?: string | null;
  evaluation_note?: string | null;
  auto_renew?: boolean; status: string; notes?: string | null;
  created_by?: string | null; created_at?: string; updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export interface FeePolicy {
  id: string; lot_id: string; policy_name: string;
  day_type: string; time_start?: string | null; time_end?: string | null;
  base_minutes?: number | null; base_fee?: number | null;
  add_minutes?: number | null; add_fee?: number | null;
  daily_max?: number | null; monthly_pass_fee?: number | null;
  is_active: boolean; effective_from: string; effective_to?: string | null;
  legal_basis?: string | null; notes?: string | null;
  created_at?: string; updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export interface FeeExemption {
  id: string; lot_id?: string | null; exemption_type: string;
  exemption_name: string; discount_type: string;
  discount_rate?: number | null; discount_amount?: number | null;
  max_hours?: number | null; max_discount_amount?: number | null;
  required_documents?: string | null; description?: string | null;
  legal_basis?: string | null; is_active: boolean;
  effective_from?: string | null; effective_to?: string | null;
  created_at?: string;
}

export interface MonthlyPass {
  id: string; lot_id: string; pass_number: string;
  vehicle_number: string; vehicle_type?: string | null;
  holder_name?: string | null; holder_phone?: string | null;
  holder_address?: string | null;
  pass_start: string; pass_end: string;
  fee_amount: number; fee_paid: number;
  payment_method?: string | null; payment_date?: string | null;
  receipt_number?: string | null;
  status: string; auto_renew: boolean; renewal_count: number;
  previous_pass_id?: string | null; issued_by?: string | null;
  notes?: string | null; created_at?: string; updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export interface EnforcementRecord {
  id: string; lot_id?: string | null; enforcement_number: string;
  vehicle_number: string; vehicle_type?: string | null;
  violation_type: string; violation_date: string;
  violation_location?: string | null; location_detail?: string | null;
  photo_paths?: any; fine_amount?: number | null;
  fine_due_date?: string | null; fine_paid_date?: string | null;
  payment_status: string; appeal_status?: string | null;
  appeal_date?: string | null; appeal_reason?: string | null;
  appeal_result?: string | null;
  officer_id?: string | null; officer_name?: string | null;
  notes?: string | null; created_at?: string; updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export interface FreeHoursSetting {
  id: string; lot_id: string; setting_name?: string | null;
  day_type: string; start_time: string; end_time: string;
  reason?: string | null; is_active: boolean;
  effective_from?: string | null; effective_to?: string | null;
  created_at?: string;
  parking_lots?: { code: string; name: string };
}

export const STAFF_TYPE_LABELS: Record<string, string> = { resident: '상주', non_resident: '비상주' };
export const DAY_TYPE_LABELS: Record<string, string> = { weekday: '평일', weekend: '주말', holiday: '공휴일', special: '특별', everyday: '매일', specific_date: '특정일' };
export const VIOLATION_TYPE_LABELS: Record<string, string> = { no_ticket: '미발권', overtime: '시간초과', disabled_zone: '장애인구역 위반', fire_lane: '소방구역', double_parking: '이중주차', no_parking_zone: '주차금지구역' };
export const PAYMENT_STATUS_LABELS: Record<string, string> = { unpaid: '미납', paid: '납부', overdue: '체납', exempted: '면제' };
export const PAYMENT_STATUS_COLORS: Record<string, string> = { unpaid: 'bg-yellow-100 text-yellow-700', paid: 'bg-success/10 text-success', overdue: 'bg-destructive/10 text-destructive', exempted: 'bg-muted text-muted-foreground' };
export const CONTRACT_STATUS_LABELS: Record<string, string> = { active: '계약중', expired: '만료', terminated: '해지', pending_renewal: '갱신대기' };
export const CONTRACT_STATUS_COLORS: Record<string, string> = { active: 'bg-success/10 text-success', expired: 'bg-muted text-muted-foreground', terminated: 'bg-destructive/10 text-destructive', pending_renewal: 'bg-orange-100 text-orange-700' };
export const PASS_STATUS_LABELS: Record<string, string> = { active: '활성', expired: '만료', cancelled: '취소', suspended: '정지' };
export const EXEMPTION_TYPE_LABELS: Record<string, string> = { disabled: '장애인', veteran: '국가유공자', low_emission: '저공해 1종', low_emission_2: '저공해 2종', ev: '전기차', compact: '경형자동차', multicultural: '다문화가족', official: '관용차량', pregnant: '임산부', etc: '기타' };
export const DISCOUNT_TYPE_LABELS: Record<string, string> = { rate: '정률(%)', amount: '정액(원)', free: '전액면제' };
