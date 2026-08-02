import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.PARKMASTER_URL || "http://127.0.0.1:5173";
const outDir = path.resolve("work", "test-results");
fs.mkdirSync(outDir, { recursive: true });

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  lot: "22222222-2222-4222-8222-222222222222",
  survey: "33333333-3333-4333-8333-333333333333",
  complaint: "44444444-4444-4444-8444-444444444444",
  equipment: "55555555-5555-4555-8555-555555555555",
  maintenance: "66666666-6666-4666-8666-666666666666",
  project: "77777777-7777-4777-8777-777777777777",
  contract: "88888888-8888-4888-8888-888888888888",
  report: "99999999-9999-4999-8999-999999999999",
};

const today = new Date().toISOString().slice(0, 10);
const isoNow = new Date().toISOString();

const profile = {
  id: ids.user,
  name: "E2E 관리자",
  email: "parkmaster.e2e@woojoocha.local",
  team: "admin",
  department: "품질검증",
  role: "admin",
  is_active: true,
  onboarding_completed: true,
  theme_preference: "light",
  created_at: isoNow,
  updated_at: isoNow,
};

const lot = {
  id: ids.lot,
  code: "PM-E2E-001",
  name: "E2E 중앙공영주차장",
  address_jibun: "제주시 테스트동 1",
  address_road: "제주시 테스트로 1",
  admin_dong: "테스트동",
  lot_type: "off_street",
  operation_type: "direct",
  operator_type: "direct",
  status: "active",
  total_spaces: 120,
  available_spaces: 37,
  latitude: 33.4996,
  longitude: 126.5312,
  fee_policy: "paid",
  phone: "064-000-0000",
  notes: "[DEMO] E2E 샘플 주차장",
  created_at: isoNow,
  updated_at: isoNow,
};

const nestedLot = { id: lot.id, code: lot.code, name: lot.name, address_jibun: lot.address_jibun, address_road: lot.address_road, total_spaces: lot.total_spaces, latitude: lot.latitude, longitude: lot.longitude, lot_type: lot.lot_type };
const sampleProfile = { id: ids.user, name: profile.name, email: profile.email, team: profile.team, role: profile.role, is_active: true };

const fixtures = {
  profiles: [profile],
  module_licenses: [
    "SURVEY", "OPS", "FACILITY", "REVENUE", "BUDGET", "PROCUREMENT", "SERVICE", "COMPLAINT", "PLANNING", "REALTIME", "REPORT", "CORE",
  ].map((module_code) => ({ module_code, module_name: module_code, is_active: true, starts_at: null, expires_at: null, activated_at: isoNow })),
  system_config: [
    { config_key: "org_name", config_value: "ParkMaster E2E" },
    { config_key: "ai_enabled", config_value: "false" },
    { config_key: "security_password_min_length", config_value: "8" },
    { config_key: "security_max_login_attempts", config_value: "5" },
  ],
  parking_lots: [lot],
  parking_spaces: [{ id: "space-1", lot_id: lot.id, space_number: "A-01", status: "available", sensor_id: "S-E2E-001" }],
  surveys: [{
    id: ids.survey,
    lot_id: lot.id,
    parking_lots: nestedLot,
    surveyor: sampleProfile,
    profiles: sampleProfile,
    survey_type: "regular",
    status: "submitted",
    survey_date: today,
    surveyor_id: ids.user,
    submitted_at: isoNow,
    notes: "[DEMO] E2E 조사",
    created_at: isoNow,
    updated_at: isoNow,
  }],
  survey_basic_info: [{ id: "sbi-1", survey_id: ids.survey, lot_name: lot.name, address: lot.address_jibun, total_spaces: lot.total_spaces }],
  survey_operation: [{ id: "so-1", survey_id: ids.survey, operator_type: "direct", operating_hours: "24시간" }],
  survey_infra: [{ id: "si-1", survey_id: ids.survey, surface_type: "asphalt", lighting_status: "good", cctv_count: 6 }],
  survey_usage: [{ id: "su-1", survey_id: ids.survey, peak_occupancy_rate: 82, average_turnover: 3.4 }],
  survey_sensor_plan: [{ id: "ssp-1", survey_id: ids.survey, recommended_sensor_count: 120, gateway_count: 3 }],
  survey_photos: [{ id: "photo-1", survey_id: ids.survey, category: "entrance", file_path: "demo/e2e.jpg", sort_order: 1 }],
  operations_staff: [{ id: "staff-1", lot_id: lot.id, parking_lots: nestedLot, staff_name: "김운영", role: "manager", phone: "010-0000-0000", is_active: true }],
  outsourcing_contracts: [{ id: "ops-contract-1", lot_id: lot.id, parking_lots: nestedLot, company_name: "E2E 운영사", status: "active", contract_start: today, contract_end: "2026-12-31" }],
  fee_policies: [{ id: "fee-1", lot_id: lot.id, parking_lots: nestedLot, base_minutes: 30, base_fee: 1000, additional_minutes: 10, additional_fee: 500 }],
  exemptions: [{ id: "ex-1", lot_id: lot.id, parking_lots: nestedLot, exemption_type: "disabled", discount_rate: 50, is_active: true }],
  monthly_passes: [{ id: "pass-1", lot_id: lot.id, parking_lots: nestedLot, vehicle_number: "12가3456", holder_name: "정기권샘플", pass_start: today, pass_end: "2026-12-31", status: "active" }],
  enforcement_records: [{ id: "enf-1", lot_id: lot.id, parking_lots: nestedLot, vehicle_number: "34나5678", violation_type: "unpaid", violation_date: today, status: "pending", amount: 30000 }],
  free_hours: [{ id: "free-1", lot_id: lot.id, parking_lots: nestedLot, title: "점심 무료", minutes: 60, is_active: true }],
  equipment: [{ id: ids.equipment, lot_id: lot.id, parking_lots: nestedLot, equipment_code: "EQ-E2E-001", name: "E2E 차단기", equipment_type: "barrier", status: "normal", installed_at: "2024-01-10", warranty_end: "2027-01-10", purchase_cost: 3000000 }],
  maintenance_logs: [{ id: ids.maintenance, lot_id: lot.id, parking_lots: nestedLot, equipment: { name: "E2E 차단기", equipment_type: "barrier" }, log_number: "ML-E2E-001", title: "차단기 점검", status: "assigned", priority: "high", reported_at: isoNow, assigned_to: ids.user, resolution: "" }],
  maintenance_schedules: [{ id: "ms-1", lot_id: lot.id, parking_lots: nestedLot, equipment_id: ids.equipment, schedule_name: "월간 차단기 점검", schedule_type: "monthly", next_due_date: today, assigned_to: ids.user, is_active: true }],
  safety_inspections: [{ id: "safe-1", lot_id: lot.id, parking_lots: nestedLot, inspection_date: today, grade: "A", status: "completed" }],
  surface_markings: [{ id: "mark-1", lot_id: lot.id, parking_lots: nestedLot, marking_type: "line", condition: "good", last_painted_at: today }],
  revenue_daily: [{ id: "rev-1", lot_id: lot.id, parking_lots: nestedLot, revenue_date: today, cash_amount: 120000, card_amount: 350000, mobile_amount: 90000, monthly_pass_amount: 500000, other_amount: 10000, total_amount: 1070000, total_vehicles: 430, verified: false, data_source: "manual" }],
  revenue_reconciliation: [{ id: "recon-1", lot_id: lot.id, parking_lots: nestedLot, company_name: "E2E 운영사", period_start: today, period_end: today, expected_amount: 1000000, actual_amount: 980000, difference_amount: -20000, status: "review" }],
  revenue_missing_days: [{ lot_id: lot.id, parking_lots: nestedLot, missing_date: today, reason: "E2E 누락 확인" }],
  revenue_period_closes: [{ id: "close-1", lot_id: lot.id, period_month: today.slice(0, 7), status: "open" }],
  budget_plans: [{ id: "bp-1", fiscal_year: 2026, plan_type: "original", plan_number: "BP-E2E", title: "E2E 본예산", status: "approved", total_revenue: 100000000, total_expense: 80000000, notes: "[DEMO]" }],
  budget_items: [{ id: "bi-1", plan_id: "bp-1", lot_id: lot.id, item_code: "B-E2E", item_name: "시설 유지관리", category_l1: "시설", budget_type: "expenditure", allocated_amount: 10000000, executed_amount: 3000000, planned_amount: 10000000, returned_amount: 0, is_summary: false, sort_order: 1 }],
  budget_executions: [{ id: "be-1", lot_id: lot.id, budget_item_id: "bi-1", budget_items: { item_code: "B-E2E", item_name: "시설 유지관리", category_l1: "시설" }, description: "차단기 수리", vendor_name: "E2E 업체", amount: 1200000, execution_date: today, execution_type: "expense", status: "pending" }],
  budget_transfers: [{ id: "bt-1", transfer_type: "change", reason: "E2E 예산 조정", amount: 500000, status: "pending", created_at: isoNow }],
  bid_projects: [{ id: ids.project, lot_id: lot.id, parking_lots: nestedLot, bid_number: "BID-E2E-001", title: "차단기 교체 입찰", bid_type: "construction", estimated_amount: 12000000, contract_amount: 11500000, successful_bidder: "E2E 시공", bid_deadline: today, status: "open", description: "[DEMO]" }],
  bid_submissions: [{ id: "bs-1", bid_project_id: ids.project, company_name: "E2E 시공", bid_amount: 11500000, status: "submitted" }],
  bid_contracts: [{ id: ids.contract, bid_project_id: ids.project, contract_number: "CT-E2E-001", company_name: "E2E 시공", contract_amount: 11500000, status: "active" }],
  procurement_documents: [{ id: "pd-1", bid_project_id: ids.project, doc_type: "spec", title: "E2E 시방서", file_path: "/demo/spec.pdf" }],
  service_projects: [{ id: ids.project, lot_id: lot.id, parking_lots: nestedLot, supervisor: sampleProfile, inspector: sampleProfile, project_number: "SV-E2E-001", title: "E2E 용역사업", service_type: "maintenance", contractor_name: "E2E 용역사", start_date: today, end_date: "2026-12-31", progress_pct: 45, status: "in_progress", contract_amount: 50000000 }],
  service_milestones: [{ id: "sm-1", project_id: ids.project, milestone_type: "kickoff", title: "착수", planned_date: today, status: "completed" }],
  service_deliverables: [{ id: "sd-1", project_id: ids.project, title: "월간보고서", due_date: today, status: "submitted" }],
  service_inspections: [{ id: "si2-1", project_id: ids.project, inspection_number: "INSP-E2E", title: "1차 검수", inspection_type: "interim", inspection_date: today, status: "pending", target_amount: 10000000 }],
  service_payments: [{ id: "sp-1", project_id: ids.project, payment_number: "PAY-E2E", payment_type: "progress", amount: 9000000, status: "requested", due_date: today }],
  service_issues: [{ id: "issue-1", project_id: ids.project, title: "작업 지연", priority: "high", status: "open", created_at: isoNow }],
  complaints: [{ id: ids.complaint, lot_id: lot.id, parking_lots: nestedLot, profiles: sampleProfile, complaint_number: "C-E2E-001", title: "정산기 오류", category: "payment", channel: "phone", status: "assigned", priority: "urgent", received_at: isoNow, due_date: today, complainant_name: "홍길동", complainant_phone: "010-1234-5678", assigned_to: ids.user, notes: "[DEMO] E2E 민원" }],
  complaint_comments: [{ id: "cc-1", complaint_id: ids.complaint, comment_type: "internal", content: "현장 확인 필요", created_by: ids.user, created_at: isoNow }],
  complaint_hotspot: [{ lot_id: lot.id, lot_name: lot.name, complaint_count: 7, category: "payment" }],
  complaint_staff_performance: [{ staff_id: ids.user, staff_name: profile.name, assigned_count: 8, closed_count: 5, avg_hours: 12 }],
  site_candidates: [{ id: "site-1", name: "E2E 후보지", address: "제주시 후보로 2", total_score: 88, status: "review", latitude: 33.5, longitude: 126.53 }],
  construction_projects: [{ id: "const-1", site_id: "site-1", site: { name: "E2E 후보지" }, parking_lot: nestedLot, project_number: "CP-E2E", title: "E2E 신설공사", status: "construction", progress_pct: 35, start_date: today, end_date: "2026-12-31" }],
  design_documents: [{ id: "design-1", project_id: "const-1", doc_type: "drawing", title: "배치도", file_path: "/demo/design.pdf" }],
  permits: [{ id: "permit-1", project_id: "const-1", permit_type: "road", status: "submitted", submitted_at: today }],
  lot_realtime_status: [{ id: "lrt-1", lot_id: lot.id, parking_lots: nestedLot, total_spaces: 120, available_spaces: 37, occupied_spaces: 83, congestion_level: "normal", updated_at: isoNow }],
  gateway_devices: [{ id: "gw-1", lot_id: lot.id, parking_lots: nestedLot, device_id: "GW-E2E-001", device_name: "E2E 게이트웨이", status: "online", last_seen_at: isoNow }],
  sensor_devices: [{ id: "sensor-1", lot_id: lot.id, parking_lots: nestedLot, gateway_devices: { device_id: "GW-E2E-001" }, device_id: "S-E2E-001", device_name: "A-01 센서", sensor_type: "occupancy", status: "online", last_seen_at: isoNow }],
  sensor_incidents: [{ id: "incident-1", lot_id: lot.id, parking_lots: { name: lot.name }, sensor_devices: { device_id: "S-E2E-001", device_name: "A-01 센서" }, maintenance_logs: { log_number: "ML-E2E-001", status: "assigned" }, status: "open", priority: "high", title: "센서 미응답", detected_at: isoNow }],
  sensor_readings: [{ id: "reading-1", sensor_id: "S-E2E-001", value: 1, measured_at: isoNow }],
  display_boards: [{ id: "display-1", lot_id: lot.id, parking_lots: nestedLot, board_id: "DSP-E2E-001", name: "입구 전광판", status: "online" }],
  api_keys: [{ id: "api-1", key_name: "E2E API", status: "active", notes: "[DEMO]", created_at: isoNow }],
  api_call_logs: [{ id: "acl-1", endpoint: "/realtime", status_code: 200, created_at: isoNow }],
  report_templates: [{ id: "tmpl-1", template_code: "RPT-E2E", name: "E2E 종합 보고서", description: "전체 모듈 샘플 보고서", report_type: "summary", report_category: "comprehensive", target_audience: "manager", required_modules: ["SURVEY", "FACILITY"], parameters: [], is_favorite: false, sort_order: 1 }],
  report_generated: [{ id: ids.report, report_number: "RPT-GEN-E2E", template_id: "tmpl-1", template: { name: "E2E 종합 보고서", template_code: "RPT-E2E" }, title: "E2E 생성 보고서", status: "completed", output_paths: ["/demo/report.pdf"], period_start: today, period_end: today, created_at: isoNow }],
  report_schedules: [{ id: "rs-1", template_id: "tmpl-1", template: { name: "E2E 종합 보고서" }, schedule_name: "월간 E2E", cron_expr: "0 9 1 * *", next_run: isoNow, is_active: true }],
  dashboard_widgets: [{ id: "dw-1", user_id: ids.user, dashboard_name: "default", widget_type: "kpi_card", title: "총 주차장", data_source: "parking_lots", data_config: { aggregation: "count" }, width: 3, height: 2, sort_order: 1 }],
  notifications: [{ id: "noti-1", user_id: ids.user, title: "E2E 알림", message: "테스트 알림입니다", module: "COMPLAINT", is_read: false, created_at: isoNow, link: "/complaints" }],
  activity_logs: [{ id: "log-1", user_id: ids.user, user_name: profile.name, module: "CORE", action: "view", target_type: "parking_lot", target_id: lot.id, target_name: lot.name, details: { demo: true }, created_at: isoNow }],
  message_logs: [{ id: "msg-1", recipient: "010-0000-0000", message_type: "alimtalk", status: "sent", created_at: isoNow }],
  approval_lines: [{ id: "line-1", line_name: "E2E 결재", module: "SERVICE", document_type: "payment", is_active: true }],
  approval_records: [{ id: "ar-1", line_id: "line-1", title: "E2E 결재건", status: "pending", created_at: isoNow }],
  approval_steps: [{ id: "as-1", record_id: "ar-1", approver_id: ids.user, step_order: 1, status: "pending" }],
  security_audit_logs: [{ id: "sal-1", event_type: "auth_login_success", severity: "info", created_at: isoNow }],
  pii_access_logs: [{ id: "pii-1", user_id: ids.user, table_name: "complaints", field_name: "complainant_phone", accessed_at: isoNow }],
  active_sessions: [{ id: "sess-1", user_id: ids.user, is_active: true, last_activity: isoNow }],
  ip_whitelist: [{ id: "ip-1", ip_address: "127.0.0.1", description: "E2E", created_at: isoNow }],
};

function rowsFor(table) {
  return fixtures[table] ?? [{ id: `${table}-e2e`, name: `${table} 샘플`, title: `${table} 샘플`, status: "active", created_at: isoNow, updated_at: isoNow }];
}

function objectRequested(request) {
  return (request.headers().accept || "").includes("application/vnd.pgrst.object+json");
}

async function fulfillJson(route, body, status = 200, extraHeaders = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

async function installMocks(page) {
  await page.route("**/auth/v1/token**", (route) => fulfillJson(route, {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    user: { id: ids.user, email: profile.email, user_metadata: { name: profile.name, role: "admin", team: "admin" } },
  }));
  await page.route("**/auth/v1/user**", (route) => fulfillJson(route, {
    id: ids.user,
    email: profile.email,
    user_metadata: { name: profile.name, role: "admin", team: "admin" },
  }));
  await page.route("**/auth/v1/logout**", (route) => fulfillJson(route, {}));
  await page.route("**/functions/v1/**", (route) => fulfillJson(route, { success: true, data: {}, message: "E2E mock function response" }));
  await page.route("**/storage/v1/**", (route) => fulfillJson(route, { signedURL: "/demo/mock-file", path: "/demo/mock-file" }));
  await page.route("**/rest/v1/rpc/**", (route) => fulfillJson(route, [{ success: true, id: "rpc-e2e", status: "ok" }]));
  await page.route("**/rest/v1/**", async (route, request) => {
    const url = new URL(request.url());
    const table = decodeURIComponent(url.pathname.split("/rest/v1/")[1] || "").split("/")[0];
    const method = request.method();
    const rows = rowsFor(table);
    const headers = { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`, "range-unit": "items" };
    if (method === "HEAD") return route.fulfill({ status: 200, headers });
    if (method === "POST" || method === "PATCH" || method === "PUT") {
      const payload = request.postDataJSON?.() ?? {};
      const body = objectRequested(request) ? { ...rows[0], ...payload } : [{ ...rows[0], ...(Array.isArray(payload) ? payload[0] : payload) }];
      return fulfillJson(route, body, 201, headers);
    }
    if (method === "DELETE") return fulfillJson(route, [], 200, headers);
    const body = objectRequested(request) ? rows[0] : rows;
    return fulfillJson(route, body, 200, headers);
  });
}

const routes = [
  "/", "/master", "/master/surveys", "/master/ops", "/master/facility", "/master/revenue", "/master/budget", "/master/procurement", "/master/service", "/master/complaints", "/master/planning", "/master/realtime", "/master/reports",
  "/lots", "/lots/new", `/lots/${ids.lot}`, `/lots/${ids.lot}/edit`, "/surveys", "/surveys/progress", `/surveys/${ids.survey}`, `/surveys/${ids.survey}/review`, `/surveys/${ids.survey}/print`,
  "/ops", "/ops/staff", "/ops/contracts", "/ops/fees", "/ops/exemptions", "/ops/passes", "/ops/enforcement", "/ops/free-hours",
  "/facility", "/facility/equipment", "/facility/maintenance", "/facility/schedule", "/facility/safety", "/facility/markings", `/facility/layout/${ids.lot}`, "/facility/analysis",
  "/revenue", "/revenue/daily", "/revenue/reconcile", "/revenue/analysis", "/revenue/print-monthly",
  "/budget", "/budget/plans", "/budget/plans/bp-1", "/budget/executions", "/budget/transfers", "/budget/analysis",
  "/procurement", "/procurement/projects", "/procurement/projects/new", `/procurement/projects/${ids.project}`, "/procurement/contracts", "/procurement/documents",
  "/service", "/service/projects", "/service/projects/new", `/service/projects/${ids.project}`, "/service/inspections", "/service/payments", "/service/issues",
  "/complaints", "/complaints/new", "/complaints/stats", `/complaints/${ids.complaint}`,
  "/planning", "/planning/sites", "/planning/projects", "/planning/projects/const-1", "/planning/documents", "/planning/permits",
  "/realtime", "/realtime/sensors", "/realtime/gateways", "/realtime/displays", "/realtime/api", "/realtime/monitor",
  "/reports", "/reports/generate", "/reports/history", "/reports/schedules", "/reports/dashboard-builder", "/reports/ranking", "/reports/executive", "/reports/print-quarterly", "/lots/print-summary",
  "/approvals", "/notifications", "/profile", "/settings", "/settings/analytics", "/help", "/admin/delivery-checklist", "/admin/security-review", "/settings/security/report",
];

const executablePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await installMocks(page);

const globalLogs = [];
page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) globalLogs.push({ type: msg.type(), text: msg.text(), url: page.url() });
});
page.on("pageerror", (error) => globalLogs.push({ type: "pageerror", text: error.message, url: page.url() }));

await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
await page.locator('input[type="email"], input[name="email"]').first().fill(profile.email);
await page.locator('input[type="password"], input[name="password"]').first().fill("Password123!");
await page.getByRole("button", { name: /로그인|Login/i }).click();
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});

const results = [];
for (const route of routes) {
  const url = `${baseUrl}${route}`;
  const beforeLogCount = globalLogs.length;
  let status = "ok";
  let title = "";
  let bodyText = "";
  let finalUrl = "";
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    finalUrl = page.url();
    title = await page.locator("h1, h2").first().textContent({ timeout: 3000 }).catch(() => "");
    bodyText = (await page.locator("body").innerText({ timeout: 5000 })).replace(/\s+/g, " ").slice(0, 600);
    if (finalUrl.includes("/login")) status = "redirected-login";
    if (finalUrl.includes("/403")) status = "forbidden";
    if (!bodyText.trim()) status = "blank";
    if (/404|페이지를 찾을 수|Not Found/i.test(bodyText)) status = "not-found";
  } catch (error) {
    status = "error";
    bodyText = error.message;
  }
  const logs = globalLogs.slice(beforeLogCount).filter((log) => !/Not using HTTPS/.test(log.text));
  if (status === "ok" && logs.some((log) => log.type === "pageerror" || /error/i.test(log.text))) status = "console-error";
  results.push({ route, status, finalUrl, title: title?.trim() || "", logs, bodyText });
}

await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  routeCount: routes.length,
  ok: results.filter((r) => r.status === "ok").length,
  failures: results.filter((r) => r.status !== "ok"),
  results,
};
fs.writeFileSync(path.join(outDir, "all-menu-smoke-results.json"), JSON.stringify(summary, null, 2), "utf8");
fs.writeFileSync(path.join(outDir, "all-menu-smoke-summary.txt"), [
  `Generated: ${summary.generatedAt}`,
  `Base URL: ${baseUrl}`,
  `Routes: ${summary.routeCount}`,
  `OK: ${summary.ok}`,
  `Failures: ${summary.failures.length}`,
  "",
  ...summary.failures.map((f) => `${f.status}\t${f.route}\t${f.title}\t${f.logs.map((l) => l.text).join(" | ") || f.bodyText.slice(0, 160)}`),
].join("\n"), "utf8");

console.log(JSON.stringify({ routeCount: summary.routeCount, ok: summary.ok, failures: summary.failures.length, resultFile: path.join(outDir, "all-menu-smoke-results.json") }, null, 2));
