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
