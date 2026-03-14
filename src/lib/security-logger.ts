/** SEC-C-2/6: 보안 감사 로그 */
import { supabase } from "@/integrations/supabase/client";

type Severity = 'info' | 'warning' | 'critical';

export async function logSecurityEvent(
  eventType: string,
  severity: Severity,
  details?: Record<string, any>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("activity_logs").insert([{
      user_id: user?.id || null,
      user_name: user?.email?.split("@")[0] || 'system',
      module: 'security',
      action: eventType,
      details: { severity, ...details } as any,
    }]);
  } catch {
    // 보안 로그 실패는 조용히 처리
  }
}
