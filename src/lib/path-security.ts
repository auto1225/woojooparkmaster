/** SEC-C-1: 경로 추적(Path Traversal) 방어 */

// 파일 경로에서 위험 패턴 제거
export function sanitizePath(path: string): string {
  let safe = path
    .replace(/\.\.[\/\\]/g, '')       // 상위 디렉터리 이동 차단
    .replace(/^[\/\\]/, '')            // 절대 경로 차단
    .replace(/\x00/g, '')             // null 바이트 차단
    .replace(/[\/\\]+/g, '/');         // 연속 슬래시 정리
  return safe;
}

// 경로 안전성 검증
export function isPathSafe(requestedPath: string, basePath: string): boolean {
  const normalized = sanitizePath(requestedPath);
  return !normalized.includes('..') && !normalized.startsWith('/');
}

// URL 안전성 검증 (오픈 리다이렉트 방지)
export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    // 같은 origin만 허용
    if (parsed.origin !== window.location.origin) {
      return '/';
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
}
