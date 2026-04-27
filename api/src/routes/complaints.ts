/**
 * complaints CRUD — 민원.
 * 호출 12회. 자주 쓰는 필터: status, assigned_team, assigned_to, lot_id, 날짜.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";

const TABLE = "complaints";
const PATH = "/api/complaints";

const Team = z.enum(["operations", "facilities", "planning", "admin"]);

const ListQuery = z.object({
  status: z.string().optional(),
  assigned_team: Team.optional(),
  assigned_to: z.string().uuid().optional(),
  lot_id: z.string().uuid().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  is_overdue: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
  q: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  lot_id: z.string().uuid().nullish(),
  complaint_number: z.string().min(1).max(30),
  channel: z.string().min(1).max(20),
  category: z.string().min(1).max(50),
  sub_category: z.string().max(50).optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  location_detail: z.string().max(300).optional(),
  incident_date: z.string().optional(),
  incident_time: z.string().max(10).optional(),
  vehicle_number: z.string().max(20).optional(),
  complainant_name: z.string().max(100).optional(),
  complainant_phone: z.string().max(20).optional(),
  complainant_email: z.string().email().max(255).optional(),
  complainant_address: z.string().max(300).optional(),
  is_anonymous: z.boolean().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  due_date: z.string().optional(),
  due_days: z.number().int().optional(),
  assigned_team: Team.optional(),
  assigned_to: z.string().uuid().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateBody = CreateBody.partial().extend({
  response: z.string().optional(),
  response_type: z.string().max(30).optional(),
  response_channel: z.string().max(20).optional(),
  closed_at: z.string().optional(),
  satisfaction_rating: z.number().int().optional(),
  satisfaction_feedback: z.string().optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function registerComplaintsRoutes(app: FastifyInstance) {
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("status", q.status)
      .eq("assigned_team", q.assigned_team)
      .eq("assigned_to", q.assigned_to)
      .eq("lot_id", q.lot_id)
      .eq("category", q.category)
      .eq("priority", q.priority)
      .eq("is_overdue", q.is_overdue)
      .gte("received_at", q.date_from)
      .lte("received_at", q.date_to)
      .ilikeAny(["complaint_number", "title", "content", "complainant_name", "vehicle_number"], q.q);
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY received_at DESC", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "민원을 찾을 수 없습니다.");
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
    `${PATH}/:id`, { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = UpdateBody.parse(req.body);
      const before = await fetchOne(TABLE, id, "민원을 찾을 수 없습니다.");
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
      const before = await fetchOne(TABLE, id, "민원을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
