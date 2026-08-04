/**
 * parking_lots CRUD 라우트.
 *
 * code-master 패턴을 그대로 복제하되 다음만 추가:
 *   - 상태(status), 유형(lot_type) 필터
 *   - 검색어(name·code·address) ilike 부분일치
 *   - GET /api/parking-lots/:id?include=spaces 로 parking_spaces 중첩 조회
 *
 * 호출 비중 1위 테이블(38회) — 기존 Supabase 호출의 대부분을 이 라우트가 커버한다.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import { logActivity } from "../lib/audit-log.js";
import { ApiError } from "../lib/pg-errors.js";

const TABLE = "parking_lots";
const PATH = "/api/parking-lots";

const LotType = z.enum(["offstreet", "onstreet", "multilevel", "vacant_lot", "underground"]);
const OperatorType = z.enum(["direct", "outsourced", "other"]);
const Surface = z.enum(["ascon", "block", "concrete", "other"]);
const Power = z.enum(["supplied", "available", "unavailable"]);
const Status = z.enum(["active", "inactive", "construction", "closed"]);

const ListQuery = z.object({
  status: Status.optional(),
  lot_type: LotType.optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  address_jibun: z.string().max(300).optional(),
  address_road: z.string().max(300).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  lot_type: LotType.default("offstreet"),
  total_spaces: z.number().int().nonnegative().default(0),
  disabled_spaces: z.number().int().nonnegative().default(0),
  ev_spaces: z.number().int().nonnegative().default(0),
  compact_spaces: z.number().int().nonnegative().default(0),
  pregnant_spaces: z.number().int().nonnegative().default(0),
  other_spaces: z.number().int().nonnegative().default(0),
  floors: z.number().int().positive().default(1),
  floor_detail: z.unknown().optional(),
  area_sqm: z.number().optional(),
  operator_type: OperatorType.default("direct"),
  operator_name: z.string().max(200).optional(),
  surface_type: Surface.optional(),
  operating_hours: z.unknown().optional(),
  fee_policy: z.unknown().optional(),
  has_gate: z.boolean().default(false),
  has_lpr: z.boolean().default(false),
  has_kiosk: z.boolean().default(false),
  has_cctv: z.boolean().default(false),
  has_display_board: z.boolean().default(false),
  has_sensor: z.boolean().default(false),
  control_system_linked: z.boolean().default(false),
  portal_linked: z.boolean().default(false),
  power_status: Power.optional(),
  network_type: z.string().max(50).optional(),
  status: Status.default("active"),
  notes: z.string().optional(),
  layout_data: z.unknown().optional(),
  author_name: z.string().optional(),
});

const UpdateBody = CreateBody.partial();
const IdParam = z.object({ id: z.string().uuid() });

const COLUMNS = [
  "id", "code", "name", "address_jibun", "address_road", "latitude", "longitude",
  "lot_type", "total_spaces", "disabled_spaces", "ev_spaces", "compact_spaces",
  "pregnant_spaces", "other_spaces", "floors", "floor_detail", "area_sqm",
  "operator_type", "operator_name", "surface_type", "operating_hours", "fee_policy",
  "has_gate", "has_lpr", "has_kiosk", "has_cctv", "has_display_board", "has_sensor",
  "control_system_linked", "portal_linked", "power_status", "network_type",
  "status", "notes", "layout_data", "author_name",
  "created_by", "created_at", "updated_at",
];

export async function registerParkingLotsRoutes(app: FastifyInstance) {
  // GET /api/parking-lots
  app.get(
    PATH,
    { preHandler: [app.authenticate] },
    async (req) => {
      const q = ListQuery.parse(req.query);
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (q.status) { params.push(q.status); conditions.push(`status = $${params.length}`); }
      if (q.lot_type) { params.push(q.lot_type); conditions.push(`lot_type = $${params.length}`); }
      if (q.q) {
        params.push(`%${q.q}%`);
        conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR address_road ILIKE $${params.length} OR address_jibun ILIKE $${params.length})`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const total = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM parking_lots ${where}`,
        params,
      );

      params.push(q.limit, q.offset);
      const rows = await pool.query(
        `SELECT ${COLUMNS.join(", ")} FROM parking_lots ${where}
         ORDER BY code
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return { data: rows.rows, total: Number(total.rows[0].count), limit: q.limit, offset: q.offset };
    },
  );

  // GET /api/parking-lots/:id?include=spaces
  app.get<{ Params: { id: string }; Querystring: { include?: string } }>(
    `${PATH}/:id`,
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const r = await pool.query(
        `SELECT ${COLUMNS.join(", ")} FROM parking_lots WHERE id = $1`,
        [id],
      );
      if (r.rows.length === 0) throw new ApiError(404, "주차장을 찾을 수 없습니다.");
      const lot = r.rows[0] as Record<string, unknown>;
      if (req.query.include === "spaces") {
        const sp = await pool.query(
          `SELECT * FROM parking_spaces WHERE lot_id = $1
           ORDER BY floor, zone NULLS FIRST, space_number`,
          [id],
        );
        lot.parking_spaces = sp.rows;
      }
      return lot;
    },
  );

  // POST /api/parking-lots
  app.post(
    PATH,
    { preHandler: [app.authenticate, requireEditor] },
    async (req, reply) => {
      const body = CreateBody.parse(req.body);
      const fields = Object.entries(body);
      const cols = fields.map(([k]) => k).concat("created_by");
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const values = fields.map(([, v]) => v).concat(req.authUser!.id);
      const r = await pool.query(
        `INSERT INTO parking_lots (${cols.join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING ${COLUMNS.join(", ")}`,
        values,
      );
      const created = r.rows[0];
      await logActivity({
        userId: req.authUser!.id,
        action: "CREATE",
        table: TABLE,
        recordId: created.id,
        diff: { after: created },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  // PATCH /api/parking-lots/:id
  app.patch<{ Params: { id: string } }>(
    `${PATH}/:id`,
    { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = UpdateBody.parse(req.body);
      const fields = Object.entries(body).filter(([, v]) => v !== undefined);
      if (fields.length === 0) throw new ApiError(400, "수정할 필드가 없습니다.");

      const before = await pool.query(`SELECT ${COLUMNS.join(", ")} FROM parking_lots WHERE id = $1`, [id]);
      if (before.rows.length === 0) throw new ApiError(404, "주차장을 찾을 수 없습니다.");

      const sets = fields.map(([k], i) => `${k} = $${i + 2}`);
      const params = [id, ...fields.map(([, v]) => v)];
      const r = await pool.query(
        `UPDATE parking_lots SET ${sets.join(", ")} WHERE id = $1 RETURNING ${COLUMNS.join(", ")}`,
        params,
      );

      await logActivity({
        userId: req.authUser!.id,
        action: "UPDATE",
        table: TABLE,
        recordId: id,
        diff: { before: before.rows[0], after: r.rows[0] },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      });
      return r.rows[0];
    },
  );

  // DELETE /api/parking-lots/:id
  app.delete<{ Params: { id: string } }>(
    `${PATH}/:id`,
    { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await pool.query(`SELECT ${COLUMNS.join(", ")} FROM parking_lots WHERE id = $1`, [id]);
      if (before.rows.length === 0) throw new ApiError(404, "주차장을 찾을 수 없습니다.");

      await pool.query("DELETE FROM parking_lots WHERE id = $1", [id]);

      await logActivity({
        userId: req.authUser!.id,
        action: "DELETE",
        table: TABLE,
        recordId: id,
        diff: { before: before.rows[0] },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      });
      return reply.code(204).send();
    },
  );
}
