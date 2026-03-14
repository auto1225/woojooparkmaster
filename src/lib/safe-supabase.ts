/** SEC-WEB-1: Supabase 쿼리 래퍼 — 입력 자동 정화 */
import { supabase } from '@/integrations/supabase/client';
import { sanitizeText } from './sanitizer';

/** INSERT/UPDATE 시 모든 문자열 필드를 자동 정화 */
export function sanitizeRecord<T extends Record<string, any>>(record: T): T {
  const sanitized = {} as any;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

/** 안전한 INSERT */
export async function safeInsert(table: string, record: Record<string, any>) {
  return (supabase.from(table) as any).insert(sanitizeRecord(record));
}

/** 안전한 UPDATE */
export async function safeUpdate(table: string, record: Record<string, any>, id: string) {
  return (supabase.from(table) as any).update(sanitizeRecord(record)).eq('id', id);
}
