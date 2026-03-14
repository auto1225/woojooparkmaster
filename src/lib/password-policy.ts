// ParkMaster™ 비밀번호 정책

export interface PasswordCheck {
  label: string;
  passed: boolean;
}

export function validatePassword(password: string, email?: string): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    { label: '최소 8자 이상', passed: password.length >= 8 },
    { label: '대문자 1자 이상', passed: /[A-Z]/.test(password) },
    { label: '소문자 1자 이상', passed: /[a-z]/.test(password) },
    { label: '숫자 1자 이상', passed: /[0-9]/.test(password) },
    { label: '특수문자 1자 이상', passed: /[!@#$%^&*()_+\-=]/.test(password) },
  ];

  // 연속 문자 3자 이상 금지
  let hasSequential = false;
  for (let i = 0; i < password.length - 2; i++) {
    const c1 = password.charCodeAt(i);
    const c2 = password.charCodeAt(i + 1);
    const c3 = password.charCodeAt(i + 2);
    if (c2 - c1 === 1 && c3 - c2 === 1) { hasSequential = true; break; }
    if (c1 - c2 === 1 && c2 - c3 === 1) { hasSequential = true; break; }
  }
  checks.push({ label: '연속 문자 3자 이상 금지', passed: !hasSequential });

  // 아이디 포함 금지
  if (email) {
    const localPart = email.split('@')[0]?.toLowerCase();
    if (localPart && localPart.length >= 3) {
      checks.push({ label: '이메일 아이디 포함 금지', passed: !password.toLowerCase().includes(localPart) });
    }
  }

  return checks;
}

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export function getPasswordStrength(checks: PasswordCheck[]): PasswordStrength {
  const passed = checks.filter(c => c.passed).length;
  if (passed <= 3) return 'weak';
  if (passed <= 5) return 'medium';
  return 'strong';
}

export const STRENGTH_LABELS: Record<PasswordStrength, { label: string; color: string }> = {
  weak: { label: '약함', color: 'bg-red-500' },
  medium: { label: '보통', color: 'bg-yellow-500' },
  strong: { label: '강함', color: 'bg-green-500' },
};
