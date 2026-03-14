// ParkMaster™ 공통 유효성 검증 유틸리티

/** 차량번호 (한국) — 123가4567 또는 12가3456 */
export const VEHICLE_NUMBER_REGEX = /^[0-9]{2,3}[가-힣][0-9]{4}$/;

/** 사업자등록번호 (10자리 + 체크디짓 검증) */
export function validateBusinessNumber(num: string): boolean {
  const n = num.replace(/-/g, '');
  if (n.length !== 10 || !/^\d{10}$/.test(n)) return false;
  const keys = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * keys[i];
  sum += Math.floor((parseInt(n[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === parseInt(n[9]);
}

/** 전화번호 포맷 자동 변환 */
export function formatPhoneNumber(phone: string): string {
  const n = phone.replace(/[^0-9]/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (n.length === 10) return n.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (n.length === 9) return n.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
  return phone;
}

/** 사업자등록번호 포맷 */
export function formatBusinessNumber(num: string): string {
  const n = num.replace(/[^0-9]/g, '');
  if (n.length >= 6) return n.replace(/(\d{3})(\d{2})(\d{0,5})/, '$1-$2-$3');
  if (n.length >= 4) return n.replace(/(\d{3})(\d{0,2})/, '$1-$2');
  return n;
}

/** 금액 포맷 (원) */
export function formatWon(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

/** 금액 포맷 (만원/억원) */
export function formatManWon(amount: number): string {
  if (Math.abs(amount) >= 100000000) return (amount / 100000000).toFixed(1) + '억원';
  if (Math.abs(amount) >= 10000) return (amount / 10000).toFixed(0) + '만원';
  return formatWon(amount);
}

/** 금액을 한글 변환 표시 */
export function formatAmountDescription(amount: number): string {
  if (amount === 0) return '0원';
  const eok = Math.floor(amount / 100000000);
  const man = Math.floor((amount % 100000000) / 10000);
  const won = amount % 10000;
  let result = '';
  if (eok > 0) result += `${eok}억 `;
  if (man > 0) result += `${man.toLocaleString()}만 `;
  if (won > 0) result += `${won.toLocaleString()}`;
  return result.trim() + '원';
}

/** GPS 좌표 검증 (한국 범위) */
export function isValidKoreaCoords(lat: number, lng: number): boolean {
  return lat >= 33.0 && lat <= 38.7 && lng >= 124.5 && lng <= 132.0;
}

/** 허용 이미지 타입 */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** 허용 문서 타입 */
export const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/** 최대 파일 크기 (20MB) */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 파일 검증 */
export function validateFile(
  file: File,
  allowedTypes: string[],
  maxSize = MAX_FILE_SIZE
): { valid: boolean; error?: string } {
  if (file.size > maxSize)
    return { valid: false, error: `파일 크기가 ${maxSize / 1024 / 1024}MB를 초과합니다.` };
  if (!allowedTypes.includes(file.type))
    return { valid: false, error: '허용되지 않는 파일 형식입니다.' };
  return { valid: true };
}
