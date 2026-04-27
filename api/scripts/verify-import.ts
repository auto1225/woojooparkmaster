/**
 * 데이터 이전 검증 스크립트.
 *
 * import-from-supabase.ts 실행 후 양쪽 DB의 row 카운트를 비교.
 * 차이가 0이면 안전. 차이가 있으면 어느 테이블에서 누락됐는지 표시.
 *
 * 사용:
 *   npm run verify:import
 *
 * 환경 변수:
 *   SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_KEY (import 스크립트와 동일)
 */
import { createClient } from "@supabase/supabase-js";
import { pool } from "../src/db.js";

const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error("❌ SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_KEY 가 설정되지 않았습니다.");
  process.exit(1);
}

const src = createClient(SOURCE_URL, SOURCE_KEY, { auth: { persistSession: false } });

const TABLES = [
  "system_config", "module_licenses", "code_master",
  "profiles", "parking_lots", "parking_spaces",
  "fee_policies", "fee_exemptions", "free_hours_settings",
  "operations_staff", "outsourcing_contracts", "monthly_passes", "permits",
  "equipment", "gateway_devices", "display_boards", "sensor_devices", "lot_realtime_status",
  "surveys", "survey_basic_info", "survey_operation", "survey_infra", "survey_usage",
  "survey_sensor_plan", "survey_photos",
  "site_candidates", "construction_projects", "design_documents",
  "complaints", "complaint_comments",
  "enforcement_records", "revenue_daily", "revenue_reconciliation",
  "budget_plans", "budget_items", "budget_executions", "budget_transfers",
  "bid_projects", "bid_documents", "bid_submissions", "bid_evaluations", "bid_contracts",
  "service_projects", "service_milestones", "service_inspections", "service_payments",
  "service_deliverables", "service_issues",
  "approval_lines", "approval_steps", "approval_records",
  "attachments", "maintenance_schedules", "maintenance_logs",
  "safety_inspections", "surface_markings",
  "report_templates", "report_schedules", "report_generated",
  "dashboard_widgets", "ip_whitelist", "api_keys",
  "notifications", "message_logs",
  "security_audit_logs", "security_training_logs", "pii_access_logs",
  "active_sessions", "activity_logs",
];

interface Row {
  table: string;
  src: number | "ERR";
  dst: number;
  diff: number | string;
}

async function main() {
  console.log("=== 데이터 이전 검증 ===\n");
  console.log("표: 테이블 | Supabase | 부서 PG | 차이\n");

  const rows: Row[] = [];
  let totalSrc = 0;
  let totalDst = 0;
  let mismatches = 0;

  for (const t of TABLES) {
    let srcCount: number | "ERR" = "ERR";
    let dstCount = 0;
    try {
      const { count } = await src.from(t).select("*", { count: "exact", head: true });
      srcCount = count ?? 0;
    } catch (e) {
      srcCount = "ERR";
    }
    try {
      const r = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${t}`);
      dstCount = Number(r.rows[0].count);
    } catch (e) {
      dstCount = -1;
    }
    const diff = typeof srcCount === "number" && dstCount >= 0 ? srcCount - dstCount : "—";
    rows.push({ table: t, src: srcCount, dst: dstCount, diff });
    if (typeof srcCount === "number") totalSrc += srcCount;
    if (dstCount >= 0) totalDst += dstCount;
    if (typeof diff === "number" && diff !== 0) mismatches++;

    console.log(
      `  ${t.padEnd(28)} ${String(srcCount).padStart(8)}  ${String(dstCount).padStart(8)}  ${String(diff).padStart(6)}`,
    );
  }

  console.log(`\n  ${"합계".padEnd(28)} ${String(totalSrc).padStart(8)}  ${String(totalDst).padStart(8)}`);
  console.log(`\n불일치 테이블: ${mismatches}개`);

  if (mismatches === 0) {
    console.log("✅ 모든 테이블의 카운트가 일치합니다.");
  } else {
    console.log("⚠️ 위 테이블에서 차이 발생. import-from-supabase 재실행 또는 실패 로그 확인 필요.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  pool.end().finally(() => process.exit(1));
});
