/** fee_exemptions CRUD — 요금 감면 기준. 호출 5회. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";

const TABLE = "fee_exemptions";
const PATH = "/api/fee-exemptions";

const ListQuery = z.object({
  lot_id: z.string().uuid().optional(),
  is_active: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
  exemption_type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  lot_id: z.string().uuid().optional(),
  exemption_type: z.string().min(1).max(50),
  exemption_name: z.string().min(1).max(100),
  discount_type: z.string().max(20).default("rate"),
  discount_rate: z.number().optional(),
  discount_amount: z.number().int().nonnegative().optional(),
  max_hours: z.number().optional(),
  max_discount_amount: z.number().int().nonnegative().optional(),
  required_documents: z.string().max(300).optional(),
  description: z.string().max(300).optional(),
  legal_basis: z.string().max(200).optional(),
  is_active: z.boolean().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
});
const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().uuid() });

export async function registerFeeExemptionsRoutes(app: FastifyInstance) {
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("lot_id", q.lot_id)
      .eq("is_active", q.is_active)
      .eq("exemption_type", q.exemption_type);
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY effective_from DESC, exemption_name", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "감면 기준을 찾을 수 없습니다.");
  });

  app.post(PATH, { preHandler: [app.authenticate, requireEditor] }, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const fields = Object.entries(body);
    const cols = fields.map(([k]) => k);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const r = await pool.query(
      `INSERT INTO ${TABLE} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      fields.map(([, v]) => v),
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
      const before = await fetchOne(TABLE, id, "감면 기준을 찾을 수 없습니다.");
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
      const before = await fetchOne(TABLE, id, "감면 기준을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
