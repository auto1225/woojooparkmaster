export const OPERATIONS_REPORT_TEMPLATE_CODE = "RPT-OPS-STATUS";
export const ANNUAL_PARKING_REPORT_TEMPLATE_CODE = "RPT-JEJU-ANNUAL";
export const FACILITY_REPORT_TEMPLATE_CODE = "RPT-FACILITY";
export const REVENUE_REPORT_TEMPLATE_CODE = "RPT-REVENUE";
export const BUDGET_REPORT_TEMPLATE_CODE = "RPT-BUDGET";
export const SERVICE_REPORT_TEMPLATE_CODE = "RPT-SERVICE";
export const PROCUREMENT_REPORT_TEMPLATE_CODE = "RPT-PROCUREMENT";
export const COMPLAINT_REPORT_TEMPLATE_CODE = "RPT-COMPLAINT";
export const SURVEY_REPORT_TEMPLATE_CODE = "RPT-SURVEY";
export const PLANNING_REPORT_TEMPLATE_CODE = "RPT-PLANNING";
export const REALTIME_REPORT_TEMPLATE_CODE = "RPT-REALTIME";

export type ReportBuilderKind = "operations" | "facility" | "annual_parking" | "revenue" | "budget" | "service" | "procurement" | "complaint" | "survey" | "planning" | "realtime" | "generic";

export function getReportBuilderKind(templateCode?: string | null, scope?: string | null): ReportBuilderKind {
  if (scope === "operations" || templateCode === OPERATIONS_REPORT_TEMPLATE_CODE) return "operations";
  if (scope === "facility" || templateCode === FACILITY_REPORT_TEMPLATE_CODE) return "facility";
  if (scope === "annual_parking" || templateCode === ANNUAL_PARKING_REPORT_TEMPLATE_CODE) return "annual_parking";
  if (scope === "revenue" || templateCode === REVENUE_REPORT_TEMPLATE_CODE) return "revenue";
  if (scope === "budget" || templateCode === BUDGET_REPORT_TEMPLATE_CODE) return "budget";
  if (scope === "service" || templateCode === SERVICE_REPORT_TEMPLATE_CODE) return "service";
  if (scope === "procurement" || templateCode === PROCUREMENT_REPORT_TEMPLATE_CODE) return "procurement";
  if (scope === "complaint" || templateCode === COMPLAINT_REPORT_TEMPLATE_CODE) return "complaint";
  if (scope === "survey" || templateCode === SURVEY_REPORT_TEMPLATE_CODE) return "survey";
  if (scope === "planning" || templateCode === PLANNING_REPORT_TEMPLATE_CODE) return "planning";
  if (scope === "realtime" || templateCode === REALTIME_REPORT_TEMPLATE_CODE) return "realtime";
  return "generic";
}

export function reportGeneratePath(templateCode?: string | null, sourceId?: string | null, scope?: string | null): string {
  const search = new URLSearchParams();
  const builderKind = getReportBuilderKind(templateCode, scope);
  const routedTemplateCode = builderKind === "operations"
    ? OPERATIONS_REPORT_TEMPLATE_CODE
    : builderKind === "facility"
      ? FACILITY_REPORT_TEMPLATE_CODE
    : builderKind === "annual_parking"
      ? ANNUAL_PARKING_REPORT_TEMPLATE_CODE
    : builderKind === "revenue"
      ? REVENUE_REPORT_TEMPLATE_CODE
    : builderKind === "budget"
      ? BUDGET_REPORT_TEMPLATE_CODE
    : builderKind === "service"
      ? SERVICE_REPORT_TEMPLATE_CODE
    : builderKind === "procurement"
      ? PROCUREMENT_REPORT_TEMPLATE_CODE
    : builderKind === "complaint"
      ? COMPLAINT_REPORT_TEMPLATE_CODE
    : builderKind === "survey"
      ? SURVEY_REPORT_TEMPLATE_CODE
    : builderKind === "planning"
      ? PLANNING_REPORT_TEMPLATE_CODE
    : builderKind === "realtime"
      ? REALTIME_REPORT_TEMPLATE_CODE
      : templateCode;
  if (routedTemplateCode) search.set("template", routedTemplateCode);
  if (builderKind === "operations") search.set("scope", "operations");
  if (builderKind === "facility") search.set("scope", "facility");
  if (builderKind === "annual_parking") search.set("scope", "annual_parking");
  if (builderKind === "revenue") search.set("scope", "revenue");
  if (builderKind === "budget") search.set("scope", "budget");
  if (builderKind === "service") search.set("scope", "service");
  if (builderKind === "procurement") search.set("scope", "procurement");
  if (builderKind === "complaint") search.set("scope", "complaint");
  if (builderKind === "survey") search.set("scope", "survey");
  if (builderKind === "planning") search.set("scope", "planning");
  if (builderKind === "realtime") search.set("scope", "realtime");
  if (sourceId) search.set("source", sourceId);
  const query = search.toString();
  return query ? `/reports/generate?${query}` : "/reports/generate";
}
