/**
 * system_config CRUD — 전역 설정.
 * 호출 6회. admin 전용 (조회는 모두 허용).
 *
 * config_key 단일 검색이 압도적으로 흔한 패턴이라 별도 단축 엔드포인트 제공:
 *   GET /api/system-config/by-key/:key
 *   PUT /api/system-config/by-key/:key  (UPSERT)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdmin } from "../middleware/authorize.js";
import { ApiError } from "../lib/pg-errors.js";
import { listWithCount, recordAudit, fetchOne } from "../lib/crud-helpers.js";

const TABLE = "system_config";
const PATH = "/api/system-config";

const Body = z.object({
  config_key: z.string().min(1).max(100),
  config_value: z.string(),
  description: z.string().max(300).optional(),
});
const IdParam = z.object({ id: z.string().uuid() });
const KeyParam = z.object({ key: z.string().min(1) });

export async function registerSystemConfigRoutes(app: FastifyInstance) {
  // 전체 목록 (인증된 사용자 누구나)
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(200),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);
    return listWithCount(pool, TABLE, "", [], "ORDER BY config_key", q.limit, q.offset);
  });

  // key로 단건 조회
  app.get<{ Params: { key: string } }>(`${PATH}/by-key/:key`, { preHandler: [app.authenticate] }, async (req) => {
    const { key } = KeyParam.parse(req.params);
    const r = await pool.query(`SELECT * FROM ${TABLE} WHERE config_key = $1`, [key]);
    if (r.rows.length === 0) throw new ApiError(404, "설정 키를 찾을 수 없습니다.");
    return r.rows[0];
  });

  // id로 단건
  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "설정을 찾을 수 없습니다.");
  });

  // UPSERT by key (admin 전용)
  app.put<{ Params: { key: string } }>(
    `${PATH}/by-key/:key`,
    { preHandler: [app.authenticate, requireAdmin] },
    async (req) => {
      const { key } = KeyParam.parse(req.params);
      const body = Body.partial({ config_key: true }).parse(req.body);
      const r = await pool.query(
        `INSERT INTO ${TABLE} (config_key, config_value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (config_key) DO UPDATE
           SET config_value = EXCLUDED.config_value,
               description = COALESCE(EXCLUDED.description, ${TABLE}.description),
               updated_at = now()
         RETURNING *`,
        [key, body.config_value ?? "", body.description ?? null],
      );
      await recordAudit({
        action: "UPDATE", table: TABLE, recordId: r.rows[0].id, user: req.authUser!,
        diff: { after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return r.rows[0];
    },
  );

  app.delete<{ Params: { id: string } }>(
    `${PATH}/:id`, { preHandler: [app.authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await fetchOne(TABLE, id, "설정을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
