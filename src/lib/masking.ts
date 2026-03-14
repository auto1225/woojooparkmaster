// ParkMaster™ 개인정보 마스킹 유틸리티

/** 전화번호: 010-****-5678 */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/-/g, '');
  if (cleaned.length === 11) return cleaned.slice(0, 3) + '-****-' + cleaned.slice(7);
  return phone.slice(0, -4) + '****';
}

/** 차량번호: 12가**** */
export function maskVehicle(num: string): string {
  if (!num || num.length < 4) return num || '';
  return num.slice(0, -4) + '****';
}

/** 이름: 홍*동 */
export function maskName(name: string): string {
  if (!name) return '';
  if (name.length <= 1) return '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

/** 이메일: ho****@gmail.com */
export function maskEmail(email: string): string {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  return parts[0].slice(0, 2) + '****@' + parts[1];
}

export type UserRole = 'admin' | 'manager' | 'editor' | 'viewer';

/** 역할 기반 마스킹 필요 여부 */
export function shouldMask(role?: string): boolean {
  return !role || role === 'viewer';
}

/** 역할 기반 조건부 마스킹 */
export function conditionalMask(
  value: string,
  maskFn: (v: string) => string,
  role?: string
): string {
  if (role === 'admin' || role === 'manager') return value;
  return maskFn(value);
}
