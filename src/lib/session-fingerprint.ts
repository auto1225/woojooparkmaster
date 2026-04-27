/** SEC-WEB-4: 세션 핑거프린트 (세션 고정 공격 방지) */
import { supabase } from '@/integrations/api/supabase-compat';
import { logSecurityAudit } from './auth-security';

/** 브라우저 핑거프린트 생성 */
export function generateFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth.toString(),
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() || '0',
  ];
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/** 로그인 시 핑거프린트 저장 */
export async function registerSessionFingerprint(userId: string) {
  const fingerprint = generateFingerprint();
  sessionStorage.setItem('pm_fp', fingerprint);

  try {
    await (supabase.from('active_sessions') as any)
      .update({
        device_info: {
          fingerprint,
          type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' :
                /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet' : 'desktop',
          browser: /Chrome/.test(navigator.userAgent) ? 'Chrome' :
                   /Firefox/.test(navigator.userAgent) ? 'Firefox' :
                   /Safari/.test(navigator.userAgent) ? 'Safari' : 'Other',
        }
      })
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1);
  } catch { /* silent */ }
}

/** 핑거프린트 검증 */
export function validateFingerprint(): boolean {
  const stored = sessionStorage.getItem('pm_fp');
  const current = generateFingerprint();
  if (stored && stored !== current) {
    logSecurityAudit('security_alert', 'critical', {
      reason: 'session_fingerprint_mismatch',
      stored_fp: stored,
      current_fp: current,
    });
    return false;
  }
  return true;
}
