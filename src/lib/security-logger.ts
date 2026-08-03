/** Compatibility facade for security event logging. */
import { logSecurityAudit } from "@/lib/auth-security";

type Severity = "info" | "warning" | "critical";

export async function logSecurityEvent(
  eventType: string,
  severity: Severity,
  details?: Record<string, unknown>,
) {
  await logSecurityAudit(eventType, severity, details);
}
