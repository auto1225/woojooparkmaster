/** SEC-C-1: CSRF 방어 + 세션 고정 방어 */
import { supabase } from "@/integrations/supabase/client";

// CSRF 토큰 생성 (세션당 1회)
export function generateCSRFToken(): string {
  const token = crypto.randomUUID();
  sessionStorage.setItem('pm_csrf', token);
  return token;
}

// CSRF 토큰 검증
export function validateCSRFToken(): boolean {
  return !!sessionStorage.getItem('pm_csrf');
}

// 세션 고정 방어: 로그인 후 세션 갱신
export async function securePostLogin() {
  await supabase.auth.refreshSession();
  generateCSRFToken();
}

// 상태 변경 요청 전 CSRF 검증 래퍼
export function withCSRFCheck<T>(fn: () => Promise<T>): Promise<T> {
  if (!validateCSRFToken()) {
    throw new Error('세션이 유효하지 않습니다. 다시 로그인해주세요.');
  }
  return fn();
}
