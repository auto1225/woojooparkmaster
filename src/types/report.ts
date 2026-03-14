export interface ReportTemplate {
  id: string;
  template_code: string;
  name: string;
  description?: string;
  report_type: string;
  report_category: string;
  target_audience?: string;
  required_modules: string[];
  template_format: string;
  parameters?: any[];
  sections?: any[];
  is_system: boolean;
  is_favorite: boolean;
  sort_order: number;
  created_by?: string;
  created_at: string;
}

export interface ReportGenerated {
  id: string;
  report_number: string;
  template_id: string;
  title: string;
  period_start?: string;
  period_end?: string;
  file_path?: string;
  file_format?: string;
  file_size?: number;
  page_count?: number;
  excel_path?: string;
  data_snapshot?: any;
  summary_data?: any;
  status: "queued" | "generating" | "completed" | "failed" | "archived";
  error_message?: string;
  generation_time_ms?: number;
  generated_by?: string;
  created_at: string;
  template?: ReportTemplate;
  generator?: { name: string };
}

export interface ReportSchedule {
  id: string;
  schedule_name: string;
  template_id: string;
  frequency: string;
  day_of_week?: number;
  day_of_month?: number;
  month_of_year?: number;
  execution_time?: string;
  target_lots?: any;
  parameters?: any;
  recipients: any[];
  send_method: string;
  email_subject?: string;
  email_body?: string;
  output_format: string;
  include_excel: boolean;
  last_run?: string;
  last_status?: string;
  next_run?: string;
  run_count: number;
  fail_count: number;
  consecutive_fails: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  template?: ReportTemplate;
}

export interface DashboardWidget {
  id: string;
  user_id: string;
  dashboard_name: string;
  widget_type: string;
  title: string;
  description?: string;
  data_source: string;
  data_config: any;
  chart_type?: string;
  chart_config?: any;
  display_config?: any;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_visible: boolean;
  sort_order: number;
}

export const REPORT_TYPE_LABELS: Record<string, string> = {
  daily: "일보",
  weekly: "주보",
  monthly: "월보",
  quarterly: "분기",
  semi_annual: "반기",
  yearly: "연보",
  council: "시의회",
  audit: "감사",
  custom: "맞춤",
  dashboard: "대시보드",
};

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  operation: "운영",
  facility: "시설",
  revenue: "수입",
  budget: "예산",
  complaint: "민원",
  planning: "기획",
  realtime: "실시간",
  comprehensive: "종합",
};

export const AUDIENCE_LABELS: Record<string, string> = {
  internal: "내부",
  mayor: "시장",
  council: "시의회",
  mois: "행안부",
  molit: "국토부",
  audit: "감사원",
  public: "공개",
};

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  quarterly: "매분기",
  semi_annual: "반기",
  yearly: "매년",
};

export const WIDGET_TYPE_LABELS: Record<string, string> = {
  kpi_card: "KPI 카드",
  bar_chart: "막대 차트",
  line_chart: "라인 차트",
  area_chart: "영역 차트",
  pie_chart: "파이 차트",
  donut_chart: "도넛 차트",
  table: "테이블",
  map: "지도",
  gauge: "게이지",
  heatmap: "히트맵",
  counter: "카운터",
};

export const REPORT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued: { label: "대기", color: "bg-muted text-muted-foreground" },
  generating: { label: "생성중", color: "bg-blue-100 text-blue-700" },
  completed: { label: "완료", color: "bg-green-100 text-green-700" },
  failed: { label: "실패", color: "bg-red-100 text-red-700" },
  archived: { label: "보관", color: "bg-muted text-muted-foreground" },
};

export const CATEGORY_ICONS: Record<string, string> = {
  operation: "Settings",
  facility: "Wrench",
  revenue: "Banknote",
  budget: "Calculator",
  complaint: "MessageSquare",
  planning: "MapPin",
  realtime: "Zap",
  comprehensive: "BarChart3",
};
