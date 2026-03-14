/** SEC-WEB-3: API 보안 + 클라이언트 Rate Limiting */
import { supabase } from '@/integrations/supabase/client';

class SecureAPI {
  private requestCount = 0;
  private requestWindowStart = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 120;

  async request(method: string, path: string, body?: any) {
    this.checkRateLimit();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('SESSION_EXPIRED');
    }

    this.requestCount++;
    return { method, path, body, token: session.access_token };
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
