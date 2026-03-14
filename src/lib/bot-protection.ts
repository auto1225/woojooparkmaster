/** SEC-C-5: 봇/자동화 공격 방어 */

// 허니팟 필드 감지
export function checkHoneypot(value: string): boolean {
  return value.length > 0; // 값이 있으면 봇
}

// 폼 제출 속도 감지
const formLoadTimes = new Map<string, number>();

export function markFormLoad(formId: string) {
  formLoadTimes.set(formId, Date.now());
}

export function checkSubmitSpeed(formId: string): boolean {
  const loadTime = formLoadTimes.get(formId);
  if (!loadTime) return false;
  const elapsed = Date.now() - loadTime;
  return elapsed < 2000; // 2초 미만이면 봇 의심
}

// 반복 요청 탐지
const requestCounts = new Map<string, { count: number; firstAt: number; blockedUntil: number }>();

export function checkRateLimit(endpoint: string, maxRequests = 10, windowMs = 10000, blockMs = 60000): boolean {
  const now = Date.now();
  const entry = requestCounts.get(endpoint);

  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return true; // 차단됨
  }

  if (!entry || now - entry.firstAt > windowMs) {
    requestCounts.set(endpoint, { count: 1, firstAt: now, blockedUntil: 0 });
    return false;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    entry.blockedUntil = now + blockMs;
    return true; // 차단
  }
  return false;
}

// 사이버보안진단의 날 확인 (매월 셋째 수요일)
export function isSecurityDiagnosisDay(date: Date = new Date()): boolean {
  if (date.getDay() !== 3) return false; // 수요일 아니면 false
  const day = date.getDate();
  // 셋째 수요일: 15~21일 사이의 수요일
  return day >= 15 && day <= 21;
}
