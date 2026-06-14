/**
 * revenue_daily CRUD — 주차장별 일일 수입.
 * 호출 13회. 가장 흔한 쿼리는 lot_id + 날짜 범위(month) 필터.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import { ApiError } from "../lib/pg-errors.js";
import {
  buildUpdateSet,
  recordAudit,
  listWithCount,
  WhereBuilder,
  fetchOne,
} from "../lib/crud-helpers.js";

const TABLE = "revenue_daily";
const PATH = "/api/revenue-daily";

const ListQuery = z.object({
  lot_id: z.string().uuid().optional(),
  date_from: z.string().optional(), // YYYY-MM-DD
  date_to: z.string().optional(),
  verified: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  lot_id: z.string().uuid(),
  revenue_date: z.string(),
  cash_amount: z.number().int().nonnegative().default(0),
  card_amount: z.number().int().nonnegative().default(0),
  mobile_amount: z.number().int().nonnegative().default(0),
  monthly_pass_amount: z.number().int().nonnegative().default(0),
  other_amount: z.number().int().nonnegative().default(0),
  total_vehicles: z.number().int().nonnegative().optional(),
  peak_hour_vehicles: z.number().int().nonnegative().optional(),
  peak_hour: z.string().max(5).optional(),
  avg_parking_minutes: z.number().int().optional(),
  turnover_rate: z.number().optional(),
  exemption_count: z.number().int().nonnegative().optional(),
  exemption_amount: z.number().int().nonnegative().optional(),
  exemption_detail: z.unknown().optional(),
  data_source: z.string().max(20).optional(),
  source_detail: z.string().max(200).optional(),
  verified: z.boolean().optional(),
  notes: z.string().optional(),
});

const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().uuid() });

export async function registerRevenueDailyRoutes(app: FastifyInstance) {
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("lot_id", q.lot_id)
      .eq("verified", q.verified)
      .gte("revenue_date", q.date_from)
      .lte("revenue_date", q.date_to);
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY revenue_date DESC, lot_id", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "수입 기록을 찾을 수 없습니다.");
  });

  app.post(PATH, { preHandler: [app.authenticate, requireEditor] }, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const fields = Object.entries(body);
    const cols = fields.map(([k]) => k).concat("created_by");
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = fields.map(([, v]) => v).concat(req.authUser!.id);
    const r = await pool.query(
      `INSERT INTO ${TABLE} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values,
    );
    await recordAudit({
      action: "CREATE", table: TABLE, recordId: r.rows[0].id, user: req.authUser!,
      diff: { after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });
    return reply.code(201).send(r.rows[0]);
  });

  app.patch<{ Params: { id: string } }>(
    `${PATH}/:id`,
    { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = UpdateBody.parse(req.body);
      const before = await fetchOne(TABLE, id, "수입 기록을 찾을 수 없습니다.");
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
    `${PATH}/:id`,
    { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await fetchOne(TABLE, id, "수입 기록을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
