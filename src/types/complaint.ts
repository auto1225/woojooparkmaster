export interface Complaint {
  id: string;
  lot_id?: string;
  complaint_number: string;
  channel: string;
  received_at: string;
  category: string;
  sub_category?: string;
  title: string;
  content: string;
  location_detail?: string;
  incident_date?: string;
  incident_time?: string;
  vehicle_number?: string;
  complainant_name?: string;
  complainant_phone?: string;
  complainant_email?: string;
  complainant_address?: string;
  is_anonymous: boolean;
  priority: string;
  due_date?: string;
  due_days?: number;
  is_overdue: boolean;
  assigned_team?: string;
  assigned_to?: string;
  assigned_at?: string;
  response?: string;
  response_type?: string;
  responded_at?: string;
  response_channel?: string;
  closed_at?: string;
  closed_by?: string;
  resolution_type?: string;
  satisfaction_score?: number;
  satisfaction_feedback?: string;
  satisfaction_date?: string;
  saeol_ref?: string;
  saeol_status?: string;
  external_ref?: string;
  is_repeat: boolean;
  related_complaint_id?: string;
  repeat_count: number;
  attachment_paths?: any;
  status: string;
  status_changed_at?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  parking_lots?: { code: string; name: string };
  profiles?: { name: string; team: string };
}

export interface ComplaintComment {
  id: string;
  complaint_id: string;
  author_id: string;
  author_name?: string;
  content: string;
  comment_type: string;
  status_from?: string;
  status_to?: string;
  attachment_path?: string;
  is_system: boolean;
  created_at: string;
}

export const CHANNEL_LABELS: Record<string, string> = {
  phone: "전화", online: "온라인", onsite: "현장", saeol: "새올e",
  mail: "우편", visit: "방문", sns: "SNS", councilman: "의원요청",
};

export const CATEGORY_LABELS: Record<string, string> = {
  fee: "요금", facility: "시설", operation: "운영", enforcement_appeal: "단속이의",
  noise: "소음", safety: "안전", cleanliness: "청결", guidance: "안내/문의",
  suggestion: "건의", other: "기타",
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  received: "접수", assigned: "배정", in_progress: "처리중",
  pending_external: "외부대기", responded: "회신", closed: "완결", reopened: "재개",
};

export const COMPLAINT_STATUS_COLORS: Record<string, string> = {
  received: "bg-muted text-muted-foreground",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  pending_external: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  responded: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  closed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  reopened: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음", normal: "보통", high: "높음", urgent: "긴급",
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const RESOLUTION_TYPE_LABELS: Record<string, string> = {
  resolved: "민원해결", guidance: "안내종결", transferred: "타부서이관",
  withdrawn: "민원취하", dismissed: "각하", expired: "기한만료",
};

export const RESPONSE_TYPE_LABELS: Record<string, string> = {
  resolved: "해결", partially_resolved: "부분해결", transferred: "이관",
  rejected: "불가", information: "안내",
};

export const COMMENT_TYPE_LABELS: Record<string, string> = {
  internal: "내부메모", external: "민원인회신", status_change: "상태변경",
  assignment: "배정", escalation: "상향보고",
};

export function getDDay(dueDate?: string): { text: string; isOverdue: boolean } {
  if (!dueDate) return { text: "-", isOverdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff > 0) return { text: `D-${diff}`, isOverdue: false };
  if (diff === 0) return { text: "D-Day", isOverdue: false };
  return { text: `D+${Math.abs(diff)}`, isOverdue: true };
}

export function getTeamRecommendation(category: string): string | null {
  if (["fee", "operation", "enforcement_appeal"].includes(category)) return "operations";
  if (["facility", "safety", "cleanliness"].includes(category)) return "facilities";
  return null;
}
