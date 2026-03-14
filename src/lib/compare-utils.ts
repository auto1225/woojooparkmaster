/** P6-7: 기간 비교 유틸리티 */

export interface ChangeResult {
  diff: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
  formatted: string;
}

export function calcChange(current: number, previous: number): ChangeResult {
  if (previous === 0) {
    return { diff: current, percent: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat', formatted: current > 0 ? '▲ 신규' : '-' };
  }
  const diff = current - previous;
  const percent = (diff / previous) * 100;
  const direction: 'up' | 'down' | 'flat' = Math.abs(percent) < 0.5 ? 'flat' : percent > 0 ? 'up' : 'down';
  const sign = percent > 0 ? '+' : '';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '─';
  return { diff, percent, direction, formatted: `${arrow} ${sign}${percent.toFixed(1)}%` };
}

export function formatCompareLabel(type: string, date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const q = Math.ceil(m / 3);
  switch (type) {
    case 'prevMonth': return `${y}년 ${m}월`;
    case 'prevQuarter': return `${y}년 ${q}분기`;
    case 'prevYear': return `${y - 1}년 ${m}월`;
    case 'custom': return '사용자 지정';
    default: return '';
  }
}

export function getCompareRange(type: string, start: Date, end: Date): { start: Date; end: Date } {
  const diffMs = end.getTime() - start.getTime();
  switch (type) {
    case 'prevMonth': return { start: new Date(start.getFullYear(), start.getMonth() - 1, start.getDate()), end: new Date(end.getFullYear(), end.getMonth() - 1, end.getDate()) };
    case 'prevQuarter': return { start: new Date(start.getFullYear(), start.getMonth() - 3, start.getDate()), end: new Date(end.getFullYear(), end.getMonth() - 3, end.getDate()) };
    case 'prevYear': return { start: new Date(start.getFullYear() - 1, start.getMonth(), start.getDate()), end: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()) };
    default: return { start: new Date(start.getTime() - diffMs), end: new Date(start.getTime() - 1) };
  }
}

export function formatDateKR(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatMonthKR(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}
