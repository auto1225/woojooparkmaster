/**
 * budget_plans + budget_items CRUD.
 * 호출: budget_plans 11회, budget_items 10회.
 *
 * 두 테이블이 항상 같이 쓰여 한 파일로 묶음.
 * GET /api/budget-plans/:id?include=items 로 한 번에 조회 가능.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";

const PLAN_TABLE = "budget_plans";
const ITEM_TABLE = "budget_items";

// ────────────── budget_plans ──────────────
const PlanListQuery = z.object({
  fiscal_year: z.coerce.number().int().optional(),
  status: z.string().optional(),
  plan_type: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const PlanCreateBody = z.object({
  fiscal_year: z.number().int(),
  plan_type: z.string().max(20).default("original"),
  plan_number: z.number().int().default(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  total_revenue: z.number().int().nonnegative().default(0),
  total_expenditure: z.number().int().nonnegative().default(0),
  status: z.string().max(20).default("draft"),
  notes: z.string().optional(),
});

const PlanUpdateBody = PlanCreateBody.partial().extend({
  submitted_at: z.string().optional(),
  approved_at: z.string().optional(),
  reject_reason: z.string().optional(),
});

// ────────────── budget_items ──────────────
const ItemListQuery = z.object({
  plan_id: z.string().uuid().optional(),
  lot_id: z.string().uuid().optional(),
  budget_type: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const ItemCreateBody = z.object({
  plan_id: z.string().uuid(),
  lot_id: z.string().uuid().nullish(),
  parent_item_id: z.string().uuid().nullish(),
  item_code: z.string().min(1).max(30),
  budget_type: z.string().min(1).max(20),
  category_l1: z.string().min(1).max(100),
  category_l2: z.string().max(100).optional(),
  category_l3: z.string().max(100).optional(),
  category_l4: z.string().max(100).optional(),
  item_name: z.string().min(1).max(200),
  description: z.string().optional(),
  previous_year_amount: z.number().int().nonnegative().optional(),
  requested_amount: z.number().int().nonnegative().optional(),
  planned_amount: z.number().int().nonnegative().optional(),
  allocated_amount: z.number().int().nonnegative().optional(),
  executed_amount: z.number().int().nonnegative().optional(),
  returned_amount: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

const ItemUpdateBody = ItemCreateBody.partial();

const IdParam = z.object({ id: z.string().uuid() });

// ────────────── 공용 CRUD 헬퍼 ──────────────
async function genericCreate<T>(
  table: string, body: Record<string, unknown>, userId: string,
): Promise<T> {
  const fields = Object.entries(body);
  const cols = fields.map(([k]) => k).concat("created_by");
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const values = fields.map(([, v]) => v).concat(userId);
  const r = await pool.query<T>(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  return r.rows[0];
}

export async function registerBudgetRoutes(app: FastifyInstance) {
  // ────────── /api/budget-plans ──────────
  app.get("/api/budget-plans", { preHandler: [app.authenticate] }, async (req) => {
    const q = PlanListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("fiscal_year", q.fiscal_year)
      .eq("status", q.status)
      .eq("plan_type", q.plan_type)
      .ilikeAny(["title", "description"], q.q);
    const { sql, params } = wb.build();
    return listWithCount(pool, PLAN_TABLE, sql, params,
      "ORDER BY fiscal_year DESC, plan_type, plan_number", q.limit, q.offset);
  });

  app.get<{ Params: { id: string }; Querystring: { include?: string } }>(
    "/api/budget-plans/:id", { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const plan = await fetchOne<Record<string, unknown>>(PLAN_TABLE, id, "예산 계획을 찾을 수 없습니다.");
      if (req.query.include === "items") {
        const items = await pool.query("SELECT * FROM budget_items WHERE plan_id = $1 ORDER BY item_code", [id]);
        plan.budget_items = items.rows;
      }
      return plan;
    },
  );

  app.post(
    "/api/budget-plans", { preHandler: [app.authenticate, requireEditor] },
    async (req, reply) => {
      const body = PlanCreateBody.parse(req.body);
      const created = await genericCreate<{ id: string }>(PLAN_TABLE, body, req.authUser!.id);
      await recordAudit({
        action: "CREATE", table: PLAN_TABLE, recordId: created.id, user: req.authUser!,
        diff: { after: created }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/budget-plans/:id", { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = PlanUpdateBody.parse(req.body);
      const before = await fetchOne(PLAN_TABLE, id, "예산 계획을 찾을 수 없습니다.");
      const { setSql, params } = buildUpdateSet(body);
      const r = await pool.query(`UPDATE ${PLAN_TABLE} SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...params]);
      await recordAudit({
        action: "UPDATE", table: PLAN_TABLE, recordId: id, user: req.authUser!,
        diff: { before, after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return r.rows[0];
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/budget-plans/:id", { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await fetchOne(PLAN_TABLE, id, "예산 계획을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${PLAN_TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: PLAN_TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );

  // ────────── /api/budget-items ──────────
  app.get("/api/budget-items", { preHandler: [app.authenticate] }, async (req) => {
    const q = ItemListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("plan_id", q.plan_id)
      .eq("lot_id", q.lot_id)
      .eq("budget_type", q.budget_type)
      .ilikeAny(["item_code", "item_name", "category_l1", "category_l2"], q.q);
    const { sql, params } = wb.build();
    return listWithCount(pool, ITEM_TABLE, sql, params,
      "ORDER BY item_code", q.limit, q.offset);
  });

  app.get<{ Params: { id: string } }>("/api/budget-items/:id", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(ITEM_TABLE, id, "예산 세목을 찾을 수 없습니다.");
  });

  app.post("/api/budget-items", { preHandler: [app.authenticate, requireEditor] }, async (req, reply) => {
    const body = ItemCreateBody.parse(req.body);
    const created = await genericCreate<{ id: string }>(ITEM_TABLE, body, req.authUser!.id);
    await recordAudit({
      action: "CREATE", table: ITEM_TABLE, recordId: created.id, user: req.authUser!,
      diff: { after: created }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });
    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>(
    "/api/budget-items/:id", { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = ItemUpdateBody.parse(req.body);
      const before = await fetchOne(ITEM_TABLE, id, "예산 세목을 찾을 수 없습니다.");
      const { setSql, params } = buildUpdateSet(body);
      const r = await pool.query(`UPDATE ${ITEM_TABLE} SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...params]);
      await recordAudit({
        action: "UPDATE", table: ITEM_TABLE, recordId: id, user: req.authUser!,
        diff: { before, after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return r.rows[0];
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/budget-items/:id", { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await fetchOne(ITEM_TABLE, id, "예산 세목을 찾을 수 없습니다.");
      await pool.query(`DELETE FROM ${ITEM_TABLE} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table: ITEM_TABLE, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}
