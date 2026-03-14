/** SEC-C-2: 에러 메시지 정보 누출 방지 */

const SENSITIVE_PATTERNS = [
  /at\s+[\w./]+\s*\(.*?:\d+:\d+\)/g,    // 스택 트레이스
  /\/home\/[\w/]+/g,                       // 서버 경로
  /\/usr\/[\w/]+/g,
  /\/var\/[\w/]+/g,
  /postgres(ql)?:\/\/[^\s]+/g,             // DB 연결 문자열
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP 주소
  /column\s+"[\w]+"/g,                     // DB 컬럼명
  /relation\s+"[\w]+"/g,                   // DB 테이블명
  /ERROR:\s+.+/g,                          // PostgreSQL 에러
  /DETAIL:\s+.+/g,
  /HINT:\s+.+/g,
  /node_modules\/[\w@/.-]+/g,              // 패키지 경로
  /supabase[a-zA-Z0-9]+\.supabase\.co/g,   // Supabase 프로젝트 URL
];

export function sanitizeErrorMessage(error: any): string {
  const message = error?.message || error?.toString?.() || '알 수 없는 오류';
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// 프로덕션 콘솔 에러 필터링 초기화
export function initProductionErrorFilter() {
  if (import.meta.env.PROD) {
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: any[]) => {
      // 프로덕션에서는 민감 정보 제거 후 출력
      const sanitized = args.map(a => 
        typeof a === 'string' ? sanitizeErrorMessage(a) : a
      );
      originalError.apply(console, sanitized);
    };
    console.warn = (...args: any[]) => {
      const sanitized = args.map(a => 
        typeof a === 'string' ? sanitizeErrorMessage(a) : a
      );
      originalWarn.apply(console, sanitized);
    };
  }
}

// 사용자에게 표시할 안전한 에러 메시지
export function getUserFriendlyError(error: any): string {
  const code = error?.code;
  if (code === '42501') return '권한이 없습니다.';
  if (code === '23505') return '이미 존재하는 데이터입니다.';
  if (code === '23503') return '연관된 데이터가 있어 처리할 수 없습니다.';
  if (code === '23502') return '필수 항목이 누락되었습니다.';
  if (code === 'PGRST301') return '인증이 만료되었습니다.';
  return '처리 중 오류가 발생했습니다.';
}
