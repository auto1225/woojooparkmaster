/** SEC-WEB-5: 프론트엔드 보안 체크 */

export function runSecurityChecks(): string[] {
  const issues: string[] = [];

  // Preserve field drafts created before the storage-key policy was tightened.
  const legacyDraftPrefix = 'parkmaster:complaint-field-draft:';
  const legacyDraftKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(legacyDraftPrefix)) legacyDraftKeys.push(key);
  }
  legacyDraftKeys.forEach((key) => {
    const value = localStorage.getItem(key);
    const complaintId = key.slice(legacyDraftPrefix.length);
    if (value && complaintId) localStorage.setItem(`parkmaster-complaint-field-draft-${complaintId}`, value);
    localStorage.removeItem(key);
  });

  // HTTPS 확인
  const isLocalLoopback = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '::1';
  if (window.location.protocol !== 'https:' && !isLocalLoopback) {
    issues.push('HTTPS가 적용되지 않았습니다.');
    console.warn('[SECURITY] Not using HTTPS');
  }

  // localStorage에 민감 데이터 확인
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !key.startsWith('sb-') && !key.startsWith('parkmaster-') && !key.startsWith('ally-') && !key.startsWith('vite-')) {
      console.warn(`[SECURITY] Unknown localStorage key: ${key}`);
    }
  }

  // 개발자 도구 경고 (프로덕션)
  if (import.meta.env.PROD) {
    console.log(
      '%c⚠️ 경고',
      'color: red; font-size: 40px; font-weight: bold;'
    );
    console.log(
      '%c이 콘솔에 코드를 붙여넣으면 해킹 공격에 노출될 수 있습니다.\n개발자가 아니라면 이 창을 닫아주세요.',
      'color: red; font-size: 16px;'
    );
  }

  return issues;
}
