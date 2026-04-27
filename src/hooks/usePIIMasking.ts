/** SEC-4: 개인정보 마스킹 훅 */
import { useAuth } from '@/hooks/useAuth';
import { maskField, type PIIFieldType } from '@/lib/pii-masking';
import { supabase } from '@/integrations/api/supabase-compat';
import { logSecurityAudit } from '@/lib/auth-security';

export function usePIIMasking() {
  const { user, profile } = useAuth();
  const role = (profile as any)?.role || 'viewer';

  function shouldMask(field: string, createdBy?: string): boolean {
    if (role === 'admin') return false;
    if (role === 'manager') return false;
    if (role === 'editor' && createdBy === user?.id) return false;
    return true;
  }

  function getMasked(value: string, field: PIIFieldType, createdBy?: string): string {
    if (!value) return '';
    if (!shouldMask(field, createdBy)) return value;
    return maskField(value, field);
  }

  async function requestUnmask(table: string, id: string, field: string): Promise<string | null> {
    try {
      // Log PII access
      await (supabase.from('pii_access_logs') as any).insert({
        user_id: user?.id,
        user_name: (profile as any)?.name || user?.email?.split('@')[0],
        access_type: 'unmask',
        target_table: table,
        target_id: id,
        target_field: field,
      });

      await logSecurityAudit('pii_unmask', 'warning', { table, id, field });

      // Fetch original value
      const { data } = await supabase.from(table as any).select(field).eq('id', id).single();
      return (data as any)?.[field] || null;
    } catch {
      return null;
    }
  }

  return { shouldMask, getMasked, requestUnmask, role };
}
