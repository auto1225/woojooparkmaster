/** SEC-C-1: 코드 삽입 / 역직렬화 방어 */

// JSON.parse 안전 래퍼 (프로토타입 오염 방지)
export function safeJSONParse<T>(input: string, fallback: T): T {
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') {
      delete (parsed as any).__proto__;
      delete (parsed as any).constructor;
      delete (parsed as any).prototype;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

// URL 파라미터 안전 처리
export function sanitizeURLParams(params: URLSearchParams): Record<string, string> {
  const safe: Record<string, string> = {};
  params.forEach((value, key) => {
    safe[key] = value
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  });
  return safe;
}

// HTML 이스케이프
export function escapeHTML(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#x27;', '/': '&#x2F;',
  };
  return str.replace(/[&<>"'/]/g, c => map[c] || c);
}
