/** service_projects CRUD — 용역 프로젝트. 호출 6회. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";

const TABLE = "service_projects";
const PATH = "/api/service-projects";

const ListQuery = z.object({
  status: z.string().optional(),
  service_type: z.string().optional(),
  lot_id: z.string().uuid().optional(),
  supervisor_id: z.string().uuid().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  title: z.string().min(1).max(300),
  project_number: z.string().min(1).max(50),
  lot_id: z.string().uuid().optional(),
  service_type: z.string().min(1).max(50),
  service_category: z.string().max(100).optional(),
  description: z.string().optional(),
  contractor_name: z.string().min(1).max(200),
  contract_amount: z.number().int().nonnegative(),
  total_amount: z.number().int().nonnegative(),
  start_date: z.string(),
  end_date: z.string(),
  status: z.string().max(20).default("planning"),
  supervisor_id: z.string().uuid().optional(),
  paid_amount: z.number().int().nonnegative().optional(),
}).passthrough();

const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().uuid() });

export async function registerServiceProjectsRoutes(app: FastifyInstance) {
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("status", q.status)
      .eq("service_type", q.service_type)
      .eq("lot_id", q.lot_id)
      .eq("supervisor_id", q.supervisor_id)
      .ilikeAny(["title", "project_number", "contractor_name"], q.q);
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY created_at DESC", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "용역 프로젝트를 찾을 수 없습니다.");
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
      const before = await fetchOne(TABLE, id, "용역 프로젝트를 찾을 수 없습니다.");
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
      const before = await fetchOne(TABLE, id, "용역 프로젝트를 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
