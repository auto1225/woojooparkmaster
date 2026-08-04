export const OPERATIONS_REPORT_TEMPLATE_CODE = "RPT-OPS-STATUS";
export const ANNUAL_PARKING_REPORT_TEMPLATE_CODE = "RPT-JEJU-ANNUAL";

export type ReportBuilderKind = "operations" | "annual_parking" | "generic";

export function getReportBuilderKind(templateCode?: string | null, scope?: string | null): ReportBuilderKind {
  if (scope === "operations" || templateCode === OPERATIONS_REPORT_TEMPLATE_CODE) return "operations";
  if (scope === "annual_parking" || templateCode === ANNUAL_PARKING_REPORT_TEMPLATE_CODE) return "annual_parking";
  return "generic";
}

export function reportGeneratePath(templateCode?: string | null, sourceId?: string | null, scope?: string | null): string {
  const search = new URLSearchParams();
  const builderKind = getReportBuilderKind(templateCode, scope);
  const routedTemplateCode = builderKind === "operations"
    ? OPERATIONS_REPORT_TEMPLATE_CODE
    : builderKind === "annual_parking"
      ? ANNUAL_PARKING_REPORT_TEMPLATE_CODE
      : templateCode;
  if (routedTemplateCode) search.set("template", routedTemplateCode);
  if (builderKind === "operations") search.set("scope", "operations");
  if (builderKind === "annual_parking") search.set("scope", "annual_parking");
  if (sourceId) search.set("source", sourceId);
  const query = search.toString();
  return query ? `/reports/generate?${query}` : "/reports/generate";
}
