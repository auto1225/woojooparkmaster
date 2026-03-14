/** SEC-2: 비밀번호 강도 검증 유틸 */
import type { PasswordValidation } from '@/types/security';

const COMMON_PASSWORDS = [
  'password', '12345678', 'qwerty123', 'admin1234', 'password1',
  'letmein', 'welcome1', 'abc12345', 'iloveyou', 'admin123',
  'changeme', 'p@ssw0rd', 'password!', '1q2w3e4r',
];

export function validatePassword(password: string, email?: string, minLength = 8): PasswordValidation {
  const checks = {
    minLength: password.length >= minLength,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    noSequential: !/(.)\1{2}|abc|bcd|cde|def|efg|123|234|345|456|567|678|789/i.test(password),
    noUserId: email ? !password.toLowerCase().includes(email.split('@')[0].toLowerCase()) : true,
    noCommonPassword: !COMMON_PASSWORDS.includes(password.toLowerCase()),
  };

  const passedCount = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passedCount / Object.keys(checks).length) * 100);

  return {
    isValid: checks.minLength && checks.hasUppercase && checks.hasLowercase && checks.hasNumber && checks.hasSpecial,
    strength: score >= 87 ? 'strong' : score >= 62 ? 'medium' : 'weak',
    score,
    checks,
  };
}

export const CHECK_LABELS: Record<string, string> = {
  minLength: '8자 이상',
  hasUppercase: '대문자 포함',
  hasLowercase: '소문자 포함',
  hasNumber: '숫자 포함',
  hasSpecial: '특수문자 포함',
  noSequential: '연속문자 없음',
  noUserId: '아이디 미포함',
  noCommonPassword: '흔한 비밀번호 아님',
};
