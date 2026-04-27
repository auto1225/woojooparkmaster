/**
 * SEC-WEB-4: 토큰/세션 보안 (자체 인증 모델)
 *
 * 자체 인증에서는 토큰이 httpOnly 쿠키로 관리되므로 만료시간을 JS에서 직접 보지 못한다.
 * 대신 visibilitychange 시 /api/auth/me 핑으로 세션 유효성 확인.
 */
import { authApi } from '@/integrations/api';

/** 탭 전환 시 세션 유효성 재확인 */
export function initTokenSecurity() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const user = await authApi.me().catch(() => null);
      if (!user) {
        window.location.href = '/login?reason=expired';
      }
    }
  });
}

/** 안전한 세션 가져오기 (자체 인증 모델: me() 호출) */
export async function getSecureSession() {
  const user = await authApi.me().catch(() => null);
  if (!user) {
    await authApi.logout().catch(() => { /* ignore */ });
    window.location.href = '/login?reason=expired';
    return null;
  }
  return { session: { user } };
}
