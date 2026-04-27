/**
 * 초기 관리자 계정 생성.
 * - .env의 ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME 사용
 * - users + profiles 두 테이블에 동시 생성
 * - 이미 존재하면 안내 메시지만 출력하고 종료 (멱등성)
 *
 * 운영 첫날 1회 실행. 이후 일반 계정은 관리자 화면에서 추가.
 */
import { pool, withTransaction } from "../src/db.js";
import { env } from "../src/env.js";
import { hashPassword } from "../src/auth/password.js";

async function main() {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  const name = env.ADMIN_NAME ?? "시스템관리자";

  if (!email || !password) {
    console.error("❌ ADMIN_EMAIL, ADMIN_PASSWORD 환경변수가 필요합니다.");
    process.exit(1);
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    console.log(`이미 존재하는 계정: ${email} (id=${existing.rows[0].id})`);
    await pool.end();
    return;
  }

  const hash = await hashPassword(password);

  const userId = await withTransaction(async (client) => {
    const u = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, must_change_password)
       VALUES ($1, $2, true)
       RETURNING id`,
      [email, hash],
    );
    const id = u.rows[0].id;

    await client.query(
      `INSERT INTO profiles (id, name, email, team, role)
       VALUES ($1, $2, $3, 'admin', 'admin')`,
      [id, name, email],
    );

    return id;
  });

  console.log(`✅ 관리자 계정 생성: ${email} (id=${userId})`);
  console.log("   ※ 첫 로그인 시 비밀번호 변경이 강제됩니다.");
  await pool.end();
}

main().catch((err) => {
  console.error("seed-admin 실패:", err);
  pool.end().finally(() => process.exit(1));
});
