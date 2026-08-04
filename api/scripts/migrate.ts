/**
 * 마이그레이션 러너.
 * - api/migrations/*.sql 파일을 파일명 사전순으로 적용
 * - 적용 이력은 schema_migrations 테이블에 기록
 * - 이미 적용된 파일은 건너뜀
 *
 * 운영 흐름:
 *   1) 새 .sql 파일을 api/migrations/ 에 추가 (다음 번호 + 설명)
 *   2) 서버 PC에서 `node dist/scripts/migrate.js` (또는 update.bat이 자동 호출)
 *   3) 새 파일만 트랜잭션 안에서 실행
 *
 * 안전장치:
 *   - 각 파일은 단일 트랜잭션으로 적용 (실패 시 자동 ROLLBACK)
 *   - 적용 중 에러 발생하면 즉시 종료 (이후 파일은 건드리지 않음)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, withTransaction } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedSet(): Promise<Set<string>> {
  const r = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  return new Set(r.rows.map((row) => row.filename));
}

async function applyOne(filename: string) {
  const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
  await withTransaction(async (client) => {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename],
    );
  });
}

async function main() {
  console.log("[migrate] 시작:", MIGRATIONS_DIR);

  await ensureMigrationsTable();
  const applied = await getAppliedSet();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`  · 건너뜀 (적용됨): ${f}`);
      continue;
    }
    process.stdout.write(`  · 적용 중: ${f} ... `);
    await applyOne(f);
    console.log("OK");
    count += 1;
  }

  console.log(`[migrate] 완료. 신규 적용 ${count}건.`);
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] 실패:", err);
  pool.end().finally(() => process.exit(1));
});
