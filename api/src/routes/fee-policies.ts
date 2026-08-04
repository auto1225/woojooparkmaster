/** fee_policies CRUD — 요금 정책. 호출 6회. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";

const TABLE = "fee_policies";
const PATH = "/api/fee-policies";

const ListQuery = z.object({
  lot_id: z.string().uuid().optional(),
  is_active: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
  day_type: z.string().optional(),
  effective_on: z.string().optional(),  // 이 날짜에 유효한 정책만
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  lot_id: z.string().uuid(),
  policy_name: z.string().min(1).max(100),
  day_type: z.string().max(20).default("weekday"),
  time_start: z.string().optional(),
  time_end: z.string().optional(),
  base_minutes: z.number().int().nonnegative().optional(),
  base_fee: z.number().int().nonnegative().optional(),
  add_minutes: z.number().int().nonnegative().optional(),
  add_fee: z.number().int().nonnegative().optional(),
  daily_max: z.number().int().nonnegative().optional(),
  monthly_pass_fee: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  approved_by: z.string().uuid().optional(),
  legal_basis: z.string().max(200).optional(),
  notes: z.string().optional(),
});
const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().uuid() });

export async function registerFeePoliciesRoutes(app: FastifyInstance) {
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("lot_id", q.lot_id)
      .eq("is_active", q.is_active)
      .eq("day_type", q.day_type);
    if (q.effective_on) {
      wb.raw("effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)", q.effective_on, q.effective_on);
    }
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY effective_from DESC, lot_id", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "요금 정책을 찾을 수 없습니다.");
  });

  app.post(PATH, { preHandler: [app.authenticate, requireEditor] }, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const fields = Object.entries(body);
    const cols = fields.map(([k]) => k).concat("created_by");
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const r = await pool.query(
      `INSERT INTO ${TABLE} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      [...fields.map(([, v]) => v), req.authUser!.id],
    );
    await recordAudit({
      action: "CREATE", table: TABLE, recordId: r.rows[0].id, user: req.authUser!,
      diff: { after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });
    return reply.code(201).send(r.rows[0]);
  });

  app.patch<{ Params: { id: string } }>(
    `${PATH}/:id`, { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = UpdateBody.parse(req.body);
      const before = await fetchOne(TABLE, id, "요금 정책을 찾을 수 없습니다.");
      const { setSql, params } = buildUpdateSet(body);
      const r = await pool.query(`UPDATE ${TABLE} SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...params]);
      await recordAudit({
        action: "UPDATE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before, after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return r.rows[0];
    },
  );

  app.delete<{ Params: { id: string } }>(
    `${PATH}/:id`, { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await fetchOne(TABLE, id, "요금 정책을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
