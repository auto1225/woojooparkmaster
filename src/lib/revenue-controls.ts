export type RevenueSortKey = "date" | "lot" | "lot_type" | "total" | "cash_ratio" | "exemption_rate" | "verified";

export function localDateIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function monthKey(date = new Date()) {
  return localDateIso(date).slice(0, 7);
}

export function monthStart(date = new Date()) {
  return `${monthKey(date)}-01`;
}

export function previousMonthKey(date = new Date()) {
  return monthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function validateRevenueNumbers(values: number[]) {
  return values.every((value) => Number.isFinite(value) && value >= 0);
}

export function revenueTotal(record: Record<string, unknown>) {
  return ["cash_amount", "card_amount", "mobile_amount", "monthly_pass_amount", "other_amount"]
    .reduce((sum, key) => sum + (Number(record[key]) || 0), 0);
}
