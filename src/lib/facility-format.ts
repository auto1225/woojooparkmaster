export function formatFacilityDate(value?: string | null) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

export function formatFacilityDateTime(value?: string | null) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function formatFacilityCurrency(value?: number | null) {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatFacilityNumber(value?: number | null, suffix = "") {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}${suffix}`;
}

export function formatFacilityRelativeDay(value?: string | null, baseDate = new Date()) {
  if (!value) return "-";
  const target = new Date(`${value.slice(0, 10)}T00:00:00`);
  const base = new Date(baseDate);
  base.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return value;

  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000);
  if (diff === 0) return "D-day";
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}
