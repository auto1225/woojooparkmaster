export interface RevenueDaily {
  id: string;
  lot_id: string;
  revenue_date: string;
  cash_amount: number;
  card_amount: number;
  mobile_amount: number;
  monthly_pass_amount: number;
  other_amount: number;
  total_amount: number;
  total_vehicles: number;
  peak_hour_vehicles?: number;
  peak_hour?: string;
  avg_parking_minutes?: number;
  turnover_rate?: number;
  exemption_count: number;
  exemption_amount: number;
  exemption_detail?: any;
  data_source: 'manual' | 'kiosk' | 'system' | 'import';
  source_detail?: string;
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
  discrepancy_note?: string;
  input_by?: string;
  created_at?: string;
  updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export interface RevenueReconciliation {
  id: string;
  lot_id: string;
  recon_number: string;
  period_type: string;
  period_start: string;
  period_end: string;
  reported_cash: number;
  reported_card: number;
  reported_mobile: number;
  reported_other: number;
  reported_total: number;
  reported_vehicles: number;
  reported_exemptions: number;
  report_date?: string;
  report_document_path?: string;
  system_cash: number;
  system_card: number;
  system_mobile: number;
  system_other: number;
  system_total: number;
  system_vehicles: number;
  system_exemptions: number;
  diff_amount: number;
  diff_rate: number;
  diff_analysis?: string;
  status: 'pending' | 'reviewing' | 'matched' | 'discrepancy' | 'resolved' | 'disputed';
  resolution_type?: string;
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
  company_name?: string;
  contract_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  parking_lots?: { code: string; name: string };
}

export const DATA_SOURCE_LABELS: Record<string, string> = {
  manual: '수동입력',
  kiosk: '무인정산기',
  system: '관제시스템',
  import: '파일가져오기',
};

export const RECON_STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  reviewing: '검토중',
  matched: '일치',
  discrepancy: '불일치',
  resolved: '해결',
  disputed: '이의제기',
};

export const RECON_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-blue-100 text-blue-700',
  matched: 'bg-green-100 text-green-700',
  discrepancy: 'bg-red-100 text-red-700',
  resolved: 'bg-teal-100 text-teal-700',
  disputed: 'bg-orange-100 text-orange-700',
};

export function formatWon(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

export function formatManWon(amount: number): string {
  if (Math.abs(amount) >= 100000000) return (amount / 100000000).toFixed(1) + '억원';
  if (Math.abs(amount) >= 10000) return (amount / 10000).toFixed(1) + '만원';
  return formatWon(amount);
}
