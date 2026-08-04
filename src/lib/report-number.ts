const REPORT_NUMBER_PREFIX = "RPT";

export function nextAnnualReportNumber(
  existingNumbers: Array<string | null | undefined>,
  year = new Date().getFullYear(),
): string {
  const prefix = `${REPORT_NUMBER_PREFIX}-${year}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const currentMaximum = existingNumbers.reduce((maximum, value) => {
    const match = value?.match(pattern);
    if (!match) return maximum;

    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);

  return `${prefix}${String(currentMaximum + 1).padStart(4, "0")}`;
}
