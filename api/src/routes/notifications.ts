/**
 * notifications CRUD — 사용자별 알림.
 * 호출 9회. 본인 알림만 조회/수정 (행 단위 권한).
 *
 * 패턴: GET /api/notifications 는 자기 자신 알림만 반환 (admin은 user_id 필터로 우회 가능).
 *      PATCH /api/notifications/:id/read — read 상태 토글 단일 엔드포인트.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdmin } from "../middleware/authorize.js";
import { ApiError } from "../lib/pg-errors.js";
import { listWithCount, WhereBuilder, fetchOne, recordAudit } from "../lib/crud-helpers.js";

const TABLE = "notifications";
const PATH = "/api/notifications";

const ListQuery = z.object({
  user_id: z.string().uuid().optional(),  // admin만 의미 있음
  is_read: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
  module: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  user_id: z.string().uuid(),
  module: z.string().min(1).max(50),
  type: z.string().max(50).default("info"),
  title: z.string().min(1).max(200),
  message: z.string().optional(),
  link: z.string().optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function registerNotificationsRoutes(app: FastifyInstance) {
  // GET — 본인 알림. admin이면 user_id 쿼리로 다른 사용자 조회 가능.
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const isAdmin = req.authUser!.role === "admin";
    const targetUserId = isAdmin && q.user_id ? q.user_id : req.authUser!.id;
    const wb = new WhereBuilder()
      .eq("user_id", targetUserId)
      .eq("is_read", q.is_read)
      .eq("module", q.module);
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY created_at DESC", q.limit, q.offset);
  });

  // POST — 시스템·admin이 알림 생성 (일반 사용자는 알림 생성 불필요)
  app.post(PATH, { preHandler: [app.authenticate, requireAdmin] }, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const fields = Object.entries(body);
    const cols = fields.map(([k]) => k);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const r = await pool.query(
      `INSERT INTO ${TABLE} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      fields.map(([, v]) => v),
    );
    return reply.code(201).send(r.rows[0]);
  });

  // PATCH /api/notifications/:id/read — 읽음 처리 (본인 것만)
  app.patch<{ Params: { id: string } }>(`${PATH}/:id/read`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query(
      `UPDATE ${TABLE} SET is_read = true, read_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.authUser!.id],
    );
    if (r.rows.length === 0) throw new ApiError(404, "알림을 찾을 수 없거나 권한이 없습니다.");
    return r.rows[0];
  });

  // PATCH /api/notifications/read-all — 본인 모든 미읽음 알림 일괄 처리
  app.patch(`${PATH}/read-all`, { preHandler: [app.authenticate] }, async (req) => {
    const r = await pool.query(
      `UPDATE ${TABLE} SET is_read = true, read_at = now()
       WHERE user_id = $1 AND is_read = false RETURNING id`,
      [req.authUser!.id],
    );
    return { updated: r.rowCount ?? 0 };
  });

  // DELETE — 본인 알림만 삭제 가능
  app.delete<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const before = await fetchOne<{ user_id: string }>(TABLE, id, "알림을 찾을 수 없습니다.");
    if (before.user_id !== req.authUser!.id && req.authUser!.role !== "admin") {
      throw new ApiError(403, "본인 알림만 삭제할 수 있습니다.");
    }
    await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
    await recordAudit({
      action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
      diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });
    return reply.code(204).send();
  });
}
