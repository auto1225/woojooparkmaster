/**
 * SEC-WEB-3: API 보안 + 클라이언트 Rate Limiting (자체 인증 모델)
 *
 * 자체 백엔드는 토큰을 httpOnly 쿠키로 자동 전송하므로 access_token을 JS에서 직접 다루지 않는다.
 * 이 모듈은 클라이언트측 rate limiting만 담당.
 */
import { authApi } from '@/integrations/api';

class SecureAPI {
  private requestCount = 0;
  private requestWindowStart = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 120;

  /**
   * 요청 직전 호출. 인증 상태 확인 + rate limit 체크.
   * 반환값은 더 이상 토큰을 포함하지 않으며, fetch는 credentials: "include"로 쿠키만 보내면 된다.
   */
  async request(method: string, path: string, body?: any) {
    this.checkRateLimit();

    const user = await authApi.me();
    if (!user) throw new Error('SESSION_EXPIRED');

    this.requestCount++;
    return { method, path, body };
  }

  private checkRateLimit() {
    const now = Date.now();
    if (now - this.requestWindowStart > 60000) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }
    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      console.warn('[SECURITY] Client-side rate limit reached');
      throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  getRequestCount() {
    return this.requestCount;
  }
}

export const secureApi = new SecureAPI();
