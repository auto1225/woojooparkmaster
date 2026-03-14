/** 보안 관련 타입 정의 */

export interface SecurityAuditLog {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  user_id?: string;
  user_name?: string;
  user_role?: string;
  user_team?: string;
  ip_address?: string;
  user_agent?: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  action_detail?: any;
  before_value?: any;
  after_value?: any;
  success: boolean;
  failure_reason?: string;
  session_id?: string;
  request_path?: string;
  created_at: string;
}

export interface ActiveSession {
  id: string;
  user_id: string;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  device_info?: any;
  started_at: string;
  last_activity: string;
  expires_at: string;
  is_active: boolean;
}

export interface PIIAccessLog {
  id: string;
  user_id: string;
  user_name?: string;
  access_type: string;
  target_table: string;
  target_id: string;
  target_field: string;
  reason?: string;
  ip_address?: string;
  created_at: string;
}

export interface IPWhitelistEntry {
  id: string;
  ip_address: string;
  ip_range?: string;
  description?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
}

export interface PasswordValidation {
  isValid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  score: number;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
    noSequential: boolean;
    noUserId: boolean;
    noCommonPassword: boolean;
  };
}

export interface LoginResult {
  success: boolean;
  error?: string;
  locked?: boolean;
  remainingMinutes?: number;
  mustChangePassword?: boolean;
}

export const SECURITY_CONFIG_LABELS: Record<string, string> = {
  security_password_min_length: '비밀번호 최소 길이',
  security_password_require_upper: '대문자 필수',
  security_password_require_lower: '소문자 필수',
  security_password_require_number: '숫자 필수',
  security_password_require_special: '특수문자 필수',
  security_password_expiry_days: '비밀번호 유효기간 (일)',
  security_max_login_attempts: '최대 로그인 실패 횟수',
  security_lockout_minutes: '계정 잠금 시간 (분)',
  security_session_timeout_minutes: '세션 타임아웃 (분)',
  security_max_concurrent_sessions: '최대 동시 세션',
  security_ip_whitelist_enabled: 'IP 화이트리스트',
  security_2fa_enabled: '2단계 인증',
  security_pii_masking_enabled: '개인정보 마스킹',
  security_audit_retention_days: '감사로그 보관기간 (일)',
  security_data_encryption_enabled: '데이터 암호화',
  security_export_requires_approval: '내보내기 승인 필요',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  auth_login: '로그인',
  auth_logout: '로그아웃',
  auth_login_failed: '로그인 실패',
  auth_password_changed: '비밀번호 변경',
  auth_locked: '계정 잠금',
  session_timeout: '세션 만료',
  data_create: '데이터 생성',
  data_update: '데이터 수정',
  data_delete: '데이터 삭제',
  data_export: '데이터 내보내기',
  data_import: '데이터 가져오기',
  pii_access: '개인정보 조회',
  pii_unmask: '마스킹 해제',
  pii_export: '개인정보 내보내기',
  role_change: '역할 변경',
  permission_change: '권한 변경',
  module_activation: '모듈 활성화',
  config_change: '설정 변경',
  system_backup: '시스템 백업',
  security_alert: '보안 알림',
};

export const SEVERITY_CONFIG = {
  info: { label: '정보', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  warning: { label: '경고', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  critical: { label: '위험', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};
