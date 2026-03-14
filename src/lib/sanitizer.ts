/** SEC-WEB-1: XSS 방어 — 입력값 정화 */
import DOMPurify from 'dompurify';

/** HTML 태그 완전 제거 (일반 텍스트 필드용) */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] }).trim();
}

/** 안전한 HTML만 허용 (리치 텍스트용) */
export function sanitizeHTML(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'p', 'br', 'ul', 'ol', 'li', 'strong', 'em'],
    ALLOWED_ATTR: [],
  });
}

/** URL 검증 (javascript: 프로토콜 차단) */
export function sanitizeInputURL(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/** SQL 위험 문자 이스케이프 (Supabase가 기본 처리하지만 추가 방어) */
export function escapeForQuery(input: string): string {
  if (!input) return '';
  return input.replace(/['";\\]/g, '');
}
