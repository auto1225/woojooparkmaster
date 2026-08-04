/** Removes traversal syntax, absolute path prefixes, and null bytes. */
export function sanitizePath(path: string): string {
  return path
    .replace(/\.\.[/\\]/g, '')
    .replace(/^[/\\]/, '')
    .split('\0').join('')
    .replace(/[/\\]+/g, '/');
}

export function isPathSafe(requestedPath: string, basePath: string): boolean {
  void basePath;
  const normalized = requestedPath.replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return false;
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false;
  return !normalized.split('/').includes('..');
}

export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return '/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
}
