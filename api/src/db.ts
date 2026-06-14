/**
 * PostgreSQL 연결 풀.
 * - 모든 쿼리는 이 풀을 통해 실행
 * - 트랜잭션은 withTransaction 헬퍼로 감싸서 실행
 */
import pg from "pg";
import { env } from "./env.js";

// PG의 BIGINT(int8, OID 20)와 NUMERIC(numeric, OID 1700)은 기본값으로 문자열을 반환한다.
// 이는 JS Number가 53비트밖에 표현할 수 없어 BIGINT 정밀도 손실을 막기 위한 것인데,
// 우리 도메인(주차 수입·예산)은 모두 안전 범위 안이므로 number로 변환한다.
// 결과: 프론트엔드 타입 바인딩의 `number` 선언이 실제로 number를 받는다.
pg.types.setTypeParser(20, (v) => v === null ? null : parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => v === null ? null : parseFloat(v));

export const pool = new pg.Pool({
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[pg pool] unexpected error on idle client:", err);
});

/**
 * 한 번의 트랜잭션 안에서 여러 쿼리를 실행.
 * 콜백이 throw하면 ROLLBACK, 정상 반환되면 COMMIT.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* 롤백 실패는 원본 에러 우선 */
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 헬스체크용 단순 쿼리.
 */
export async function pingDb(): Promise<boolean> {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
