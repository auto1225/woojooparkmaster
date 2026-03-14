/** SEC-WEB-4: 토큰/세션 보안 */
import { supabase } from '@/integrations/supabase/client';

/** 탭 전환 시 토큰 유효성 재확인 */
export function initTokenSecurity() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = '/login?reason=expired';
      }
    }
  });
}

/** 안전한 세션 가져오기 (만료 체크) */
export async function getSecureSession() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    const exp = data.session.expires_at;
    if (exp && exp * 1000 < Date.now()) {
      await supabase.auth.signOut();
      window.location.href = '/login?reason=expired';
      return null;
    }
  }
  return data;
}
