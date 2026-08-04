/** equipment CRUD — 설비 자산. 호출 7회. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";

const TABLE = "equipment";
const PATH = "/api/equipment";

const ListQuery = z.object({
  lot_id: z.string().uuid().optional(),
  equipment_type: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  lot_id: z.string().uuid(),
  equipment_code: z.string().min(1).max(30),
  equipment_type: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  model: z.string().max(200).optional(),
  manufacturer: z.string().max(200).optional(),
  serial_number: z.string().max(100).optional(),
  specification: z.unknown().optional(),
  install_date: z.string().optional(),
  warranty_start: z.string().optional(),
  warranty_end: z.string().optional(),
  useful_life_years: z.number().int().optional(),
  replacement_due: z.string().optional(),
  purchase_cost: z.number().int().nonnegative().optional(),
  current_value: z.number().int().nonnegative().optional(),
  depreciation_method: z.string().max(20).optional(),
  location_detail: z.string().max(200).optional(),
  floor: z.number().int().optional(),
  quantity: z.number().int().positive().optional(),
  power_consumption: z.string().max(50).optional(),
  network_required: z.boolean().optional(),
  ip_address: z.string().max(45).optional(),
  firmware_version: z.string().max(50).optional(),
  status: z.string().max(20).optional(),
  notes: z.string().optional(),
});
const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().uuid() });

export async function registerEquipmentRoutes(app: FastifyInstance) {
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("lot_id", q.lot_id)
      .eq("equipment_type", q.equipment_type)
      .eq("status", q.status)
      .ilikeAny(["equipment_code", "name", "model", "manufacturer"], q.q);
    const { sql, params } = wb.build();
    return listWithCount(pool, TABLE, sql, params, "ORDER BY equipment_code", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(TABLE, id, "설비를 찾을 수 없습니다.");
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
      const before = await fetchOne(TABLE, id, "설비를 찾을 수 없습니다.");
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
      const before = await fetchOne(TABLE, id, "설비를 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
