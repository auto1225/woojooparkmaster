/**
 * Supabase → 부서 PG 데이터 이전 스크립트.
 *
 * 운영 중인 Supabase 데이터를 자체 PostgreSQL로 한 번에 옮긴다.
 *
 * 환경변수:
 *   SOURCE_SUPABASE_URL          예: https://brvixccuvkcnkzlycbbm.supabase.co
 *   SOURCE_SUPABASE_SERVICE_KEY  service_role 키 (RLS 우회 위해 service key 필수)
 *   PG_*                         이미 설정된 부서 PG (.env)
 *
 * 사용법:
 *   1) 외부 인터넷 가능한 PC에서 실행 (운영 중 Supabase 접근)
 *   2) 또는 일회성으로 부서 서버에 화이트리스트로 Supabase 도메인 허용 후 실행
 *
 * 실행:
 *   npm run migrate              # 먼저 자체 PG 스키마 생성
 *   npm run import:supabase      # 본 스크립트 실행
 *
 * 안전장치:
 *   - 각 테이블 INSERT는 ON CONFLICT (id) DO UPDATE 로 멱등성 보장
 *   - auth.users 데이터는 자체 users 테이블로 매핑 (id 보존, 비밀번호는 임시값 + must_change_password=true)
 *   - 진행 상황을 JSON 파일에 저장 (재실행 시 이미 처리한 테이블 건너뜀)
 *   - 실패한 행은 별도 파일에 기록
 *
 * 의존 순서: 외래키가 있는 테이블은 부모부터 먼저 옮김.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcrypt";
import { pool } from "../src/db.js";

const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error("❌ SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_KEY 가 설정되지 않았습니다.");
  process.exit(1);
}

const src = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { persistSession: false },
});

const PROGRESS_FILE = "/tmp/parkmaster-import-progress.json";
const FAILED_FILE = "/tmp/parkmaster-import-failed.json";

// 의존 순서대로 — 부모 테이블 먼저
const TABLES_IN_ORDER: { table: string; batchSize?: number; transform?: (row: any) => any }[] = [
  { table: "system_config", batchSize: 200 },
  { table: "module_licenses", batchSize: 200 },
  { table: "code_master", batchSize: 500 },
  // users 는 별도 처리 (auth.users)
  // profiles 는 users INSERT 후
  { table: "parking_lots", batchSize: 200 },
  { table: "parking_spaces", batchSize: 500 },
  { table: "fee_policies", batchSize: 200 },
  { table: "fee_exemptions", batchSize: 200 },
  { table: "free_hours_settings", batchSize: 200 },
  { table: "operations_staff", batchSize: 200 },
  { table: "outsourcing_contracts", batchSize: 200 },
  { table: "monthly_passes", batchSize: 500 },
  { table: "permits", batchSize: 200 },
  { table: "equipment", batchSize: 200 },
  { table: "gateway_devices", batchSize: 200 },
  { table: "display_boards", batchSize: 200 },
  { table: "sensor_devices", batchSize: 500 },
  { table: "lot_realtime_status", batchSize: 200 },
  { table: "surveys", batchSize: 200 },
  { table: "survey_basic_info", batchSize: 200 },
  { table: "survey_operation", batchSize: 200 },
  { table: "survey_infra", batchSize: 200 },
  { table: "survey_usage", batchSize: 200 },
  { table: "survey_sensor_plan", batchSize: 200 },
  { table: "survey_photos", batchSize: 500 },
  { table: "site_candidates", batchSize: 200 },
  { table: "construction_projects", batchSize: 200 },
  { table: "design_documents", batchSize: 200 },
  { table: "complaints", batchSize: 500 },
  { table: "complaint_comments", batchSize: 500 },
  { table: "enforcement_records", batchSize: 500 },
  { table: "revenue_daily", batchSize: 500 },
  { table: "revenue_reconciliation", batchSize: 500 },
  { table: "budget_plans", batchSize: 200 },
  { table: "budget_items", batchSize: 500 },
  { table: "budget_executions", batchSize: 500 },
  { table: "budget_transfers", batchSize: 200 },
  { table: "bid_projects", batchSize: 200 },
  { table: "bid_documents", batchSize: 500 },
  { table: "bid_submissions", batchSize: 500 },
  { table: "bid_evaluations", batchSize: 500 },
  { table: "bid_contracts", batchSize: 200 },
  { table: "service_projects", batchSize: 200 },
  { table: "service_milestones", batchSize: 500 },
  { table: "service_inspections", batchSize: 500 },
  { table: "service_payments", batchSize: 500 },
  { table: "service_deliverables", batchSize: 500 },
  { table: "service_issues", batchSize: 500 },
  { table: "approval_lines", batchSize: 500 },
  { table: "approval_steps", batchSize: 500 },
  { table: "approval_records", batchSize: 500 },
  { table: "attachments", batchSize: 500 },
  { table: "maintenance_schedules", batchSize: 500 },
  { table: "maintenance_logs", batchSize: 500 },
  { table: "safety_inspections", batchSize: 500 },
  { table: "surface_markings", batchSize: 500 },
  { table: "report_templates", batchSize: 200 },
  { table: "report_schedules", batchSize: 200 },
  { table: "report_generated", batchSize: 500 },
  { table: "dashboard_widgets", batchSize: 500 },
  { table: "ip_whitelist", batchSize: 200 },
  { table: "api_keys", batchSize: 200 },
  { table: "notifications", batchSize: 1000 },
  { table: "message_logs", batchSize: 1000 },
  { table: "security_audit_logs", batchSize: 1000 },
  { table: "security_training_logs", batchSize: 500 },
  { table: "pii_access_logs", batchSize: 1000 },
  { table: "active_sessions", batchSize: 500 },
  { table: "activity_logs", batchSize: 1000 },
];

interface Progress {
  done: string[];
  rowsImported: Record<string, number>;
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { done: [], rowsImported: {} };
}

function saveProgress(p: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

const failedRows: Array<{ table: string; row: any; error: string }> = [];

function logFailed() {
  if (failedRows.length === 0) return;
  writeFileSync(FAILED_FILE, JSON.stringify(failedRows, null, 2));
  console.warn(`⚠️ 실패한 행 ${failedRows.length}개: ${FAILED_FILE} 참조`);
}

/**
 * users 별도 처리 — Supabase auth.users → 자체 users 테이블.
 * Supabase Admin API 의 listUsers 사용.
 */
async function importUsers(progress: Progress): Promise<number> {
  if (progress.done.includes("__users__")) return 0;
  console.log("[users] auth.users → users 이전 시작...");

  const tempPasswordHash = await bcrypt.hash(
    "TEMP_" + Math.random().toString(36).slice(2, 12),
    12,
  );

  let page = 1;
  let total = 0;
  while (true) {
    const { data, error } = await src.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    if (!data?.users?.length) break;

    for (const u of data.users) {
      try {
        await pool.query(
          `INSERT INTO users (id, email, password_hash, is_active, must_change_password, last_login_at, created_at, updated_at)
           VALUES ($1, $2, $3, true, true, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE
             SET email = EXCLUDED.email, last_login_at = EXCLUDED.last_login_at`,
          [
            u.id,
            u.email ?? `noemail-${u.id}@parkmaster.local`,
            tempPasswordHash,
            u.last_sign_in_at ?? null,
            u.created_at,
            u.updated_at ?? u.created_at,
          ],
        );
        total++;
      } catch (err) {
        failedRows.push({ table: "users", row: u, error: String(err) });
      }
    }
    if (data.users.length < 100) break;
    page++;
  }

  // profiles 도 같이 (FK 의존)
  console.log("[profiles] 이전...");
  const { data: profiles, error } = await src.from("profiles").select("*");
  if (error) throw error;
  for (const p of profiles ?? []) {
    try {
      await pool.query(
        `INSERT INTO profiles (id, name, email, phone, employee_number, department,
                               team, role, avatar_url, is_active, last_login_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
           department = EXCLUDED.department, team = EXCLUDED.team, role = EXCLUDED.role,
           avatar_url = EXCLUDED.avatar_url, is_active = EXCLUDED.is_active,
           updated_at = EXCLUDED.updated_at`,
        [
          p.id, p.name ?? "(이름없음)", p.email, p.phone, p.employee_number,
          p.department, p.team ?? "operations", p.role ?? "viewer", p.avatar_url,
          p.is_active ?? true, p.last_login_at, p.created_at, p.updated_at,
        ],
      );
    } catch (err) {
      failedRows.push({ table: "profiles", row: p, error: String(err) });
    }
  }

  progress.done.push("__users__");
  progress.rowsImported.users = total;
  progress.rowsImported.profiles = profiles?.length ?? 0;
  saveProgress(progress);
  console.log(`[users] 완료: ${total}명, profiles: ${profiles?.length ?? 0}건`);
  return total;
}

/**
 * 일반 테이블 이전.
 * Supabase에서 페이지 단위로 가져와 PG에 ON CONFLICT UPSERT.
 */
async function importTable(
  table: string,
  batchSize: number,
  progress: Progress,
  transform?: (row: any) => any,
): Promise<number> {
  if (progress.done.includes(table)) {
    console.log(`[${table}] 건너뜀 (이미 완료)`);
    return 0;
  }

  let total = 0;
  let from = 0;
  while (true) {
    const { data, error, count } = await src
      .from(table)
      .select("*", { count: from === 0 ? "exact" : undefined })
      .range(from, from + batchSize - 1);
    if (error) {
      console.warn(`[${table}] 읽기 실패: ${error.message}`);
      // 테이블 자체가 Supabase에 없는 경우 건너뜀
      if (/does not exist/i.test(error.message)) break;
      throw error;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const r = transform ? transform(row) : row;
      try {
        const cols = Object.keys(r);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const updateSets = cols
          .filter((c) => c !== "id")
          .map((c) => `${c} = EXCLUDED.${c}`)
          .join(", ");
        const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
                     ON CONFLICT (id) DO UPDATE SET ${updateSets || "id = EXCLUDED.id"}`;
        await pool.query(sql, cols.map((c) => r[c]));
        total++;
      } catch (err) {
        failedRows.push({ table, row: r, error: String(err) });
      }
    }
    if (from === 0) console.log(`[${table}] 총 ${count ?? "?"}행 발견`);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  progress.done.push(table);
  progress.rowsImported[table] = total;
  saveProgress(progress);
  console.log(`[${table}] 완료: ${total}건`);
  return total;
}

async function main() {
  const progress = loadProgress();
  console.log("=== Supabase → PG 데이터 이전 시작 ===");
  console.log(`소스: ${SOURCE_URL}`);
  console.log(`이미 완료된 테이블: ${progress.done.length}개\n`);

  // 1. users + profiles 먼저 (다른 테이블의 FK 의존)
  await importUsers(progress);

  // 2. 일반 테이블 — 의존 순서대로
  for (const cfg of TABLES_IN_ORDER) {
    try {
      await importTable(cfg.table, cfg.batchSize ?? 500, progress, cfg.transform);
    } catch (err) {
      console.error(`[${cfg.table}] 치명적 오류:`, (err as Error).message);
      console.error("이 테이블 건너뜀 — 다른 테이블 계속 진행");
    }
  }

  // 3. 결과 요약
  logFailed();
  console.log("\n=== 이전 결과 요약 ===");
  for (const [table, count] of Object.entries(progress.rowsImported)) {
    console.log(`  ${table.padEnd(30)} ${count}건`);
  }
  console.log(`\n실패: ${failedRows.length}건`);
  console.log(`진행 파일: ${PROGRESS_FILE}`);
  console.log(`재실행 시 이미 완료된 테이블은 건너뜁니다.`);

  await pool.end();
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  logFailed();
  pool.end().finally(() => process.exit(1));
});
