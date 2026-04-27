/**
 * 호출 빈도 4~5회의 8개 테이블 CRUD를 묶음 등록.
 *
 * 테이블이 단순하고 각자 작아서 파일을 8개로 쪼개는 게 오히려 노이즈가 됨.
 * 같은 패턴을 반복하므로 한 파일에서 묶어 관리.
 *
 * 등록되는 라우트:
 *   /api/free-hours-settings
 *   /api/monthly-passes
 *   /api/survey-photos
 *   /api/outsourcing-contracts
 *   /api/gateway-devices
 *   /api/display-boards
 *   /api/survey-basic-info
 *   /api/survey-operation
 *
 * 각 테이블당 5개 엔드포인트 (GET 목록·단건, POST, PATCH, DELETE).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import {
  buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne,
} from "../lib/crud-helpers.js";
import { parseExpand, buildExpand } from "../lib/expand.js";

const IdParam = z.object({ id: z.string().uuid() });

/**
 * 표준 CRUD 5개 라우트를 등록하는 헬퍼.
 * 각 테이블의 zod 검증 스키마와 필터 빌더만 다르고 나머지는 동일.
 */
function buildCrud(opts: {
  app: FastifyInstance;
  table: string;
  path: string;
  list: { schema: z.ZodTypeAny; build: (q: any) => WhereBuilder; order: string };
  create: { schema: z.ZodTypeAny; ownerCol?: "created_by" | "issued_by" | "registered_by" | null };
  update: { schema: z.ZodTypeAny };
  errorMsg: string;
  /** 허용된 expand 키 목록. 비어있으면 expand 미지원 */
  allowedExpands?: string[];
}) {
  const { app, table, path, list, create, update, errorMsg, allowedExpands } = opts;
  const ownerCol = create.ownerCol === undefined ? "created_by" : create.ownerCol;

  app.get(path, { preHandler: [app.authenticate] }, async (req) => {
    const q = list.schema.parse(req.query);
    const wb = list.build(q);
    const { sql: whereSql, params } = wb.build();

    if (allowedExpands && allowedExpands.length > 0) {
      const expansions = parseExpand((req.query as any).expand, allowedExpands);
      if (expansions.length > 0) {
        // expand 적용 — PG는 unqualified 컬럼을 메인 테이블로 자동 해석한다.
        // expand alias는 e_X 형태라 메인 컬럼과 충돌 없음.
        const { selectClause, joinClause } = buildExpand(expansions, "m.*");
        const limit = q.limit ?? 100;
        const offset = q.offset ?? 0;
        const totalRes = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${table} m ${joinClause} ${whereSql}`,
          params,
        );
        const allParams = [...params, limit, offset];
        const rows = await pool.query(
          `SELECT ${selectClause} FROM ${table} m ${joinClause} ${whereSql} ${list.order} LIMIT $${allParams.length - 1} OFFSET $${allParams.length}`,
          allParams,
        );
        return {
          data: rows.rows,
          total: Number(totalRes.rows[0].count),
          limit,
          offset,
        };
      }
    }
    return listWithCount(pool, table, whereSql, params, list.order, q.limit ?? 100, q.offset ?? 0);
  });

  app.get<{ Params: { id: string } }>(`${path}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return fetchOne(table, id, errorMsg);
  });

  app.post(path, { preHandler: [app.authenticate, requireEditor] }, async (req, reply) => {
    const body = create.schema.parse(req.body) as Record<string, unknown>;
    const fields = Object.entries(body);
    const cols = ownerCol ? [...fields.map(([k]) => k), ownerCol] : fields.map(([k]) => k);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = ownerCol
      ? [...fields.map(([, v]) => v), req.authUser!.id]
      : fields.map(([, v]) => v);
    const r = await pool.query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values,
    );
    await recordAudit({
      action: "CREATE", table, recordId: r.rows[0].id, user: req.authUser!,
      diff: { after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });
    return reply.code(201).send(r.rows[0]);
  });

  app.patch<{ Params: { id: string } }>(
    `${path}/:id`, { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = update.schema.parse(req.body) as Record<string, unknown>;
      const before = await fetchOne(table, id, errorMsg);
      const { setSql, params } = buildUpdateSet(body);
      const r = await pool.query(`UPDATE ${table} SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...params]);
      await recordAudit({
        action: "UPDATE", table, recordId: id, user: req.authUser!,
        diff: { before, after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return r.rows[0];
    },
  );

  app.delete<{ Params: { id: string } }>(
    `${path}/:id`, { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await fetchOne(table, id, errorMsg);
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      await recordAudit({
        action: "DELETE", table, recordId: id, user: req.authUser!,
        diff: { before }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return reply.code(204).send();
    },
  );
}

export async function registerLongTailRoutes(app: FastifyInstance) {
  const baseList = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  });

  // free_hours_settings
  buildCrud({
    app, table: "free_hours_settings", path: "/api/free-hours-settings",
    list: {
      schema: baseList.extend({
        lot_id: z.string().uuid().optional(),
        is_active: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
      }),
      build: (q) => new WhereBuilder().eq("lot_id", q.lot_id).eq("is_active", q.is_active),
      order: "ORDER BY effective_from DESC",
    },
    create: {
      schema: z.object({
        lot_id: z.string().uuid(),
        setting_name: z.string().max(100).optional(),
        day_type: z.string().max(20),
        start_time: z.string(),
        end_time: z.string(),
        reason: z.string().max(200).optional(),
        approved_by: z.string().uuid().optional(),
        effective_from: z.string().optional(),
        effective_to: z.string().optional(),
        is_active: z.boolean().optional(),
      }),
      ownerCol: null,
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "무료 시간대 설정을 찾을 수 없습니다.",
  });

  // monthly_passes
  buildCrud({
    app, table: "monthly_passes", path: "/api/monthly-passes",
    list: {
      schema: baseList.extend({
        lot_id: z.string().uuid().optional(),
        status: z.string().optional(),
        vehicle_number: z.string().optional(),
        q: z.string().optional(),
      }),
      build: (q) => new WhereBuilder()
        .eq("lot_id", q.lot_id).eq("status", q.status).eq("vehicle_number", q.vehicle_number)
        .ilikeAny(["pass_number", "vehicle_number", "holder_name"], q.q),
      order: "ORDER BY pass_end DESC",
    },
    create: {
      schema: z.object({
        lot_id: z.string().uuid(),
        pass_number: z.string().min(1).max(30),
        vehicle_number: z.string().min(1).max(20),
        vehicle_type: z.string().max(30).optional(),
        holder_name: z.string().max(100).optional(),
        holder_phone: z.string().max(20).optional(),
        holder_address: z.string().max(300).optional(),
        pass_start: z.string(),
        pass_end: z.string(),
        fee_amount: z.number().int().nonnegative(),
        fee_paid: z.number().int().nonnegative().optional(),
        payment_method: z.string().max(20).optional(),
        payment_date: z.string().optional(),
        receipt_number: z.string().max(50).optional(),
        status: z.string().max(20).optional(),
        auto_renew: z.boolean().optional(),
        notes: z.string().optional(),
      }),
      ownerCol: "issued_by",
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "정기권을 찾을 수 없습니다.",
  });

  // survey_photos
  buildCrud({
    app, table: "survey_photos", path: "/api/survey-photos",
    list: {
      schema: baseList.extend({
        survey_id: z.string().uuid().optional(),
        category: z.string().optional(),
      }),
      build: (q) => new WhereBuilder().eq("survey_id", q.survey_id).eq("category", q.category),
      order: "ORDER BY survey_id, sort_order, taken_at",
    },
    create: {
      schema: z.object({
        survey_id: z.string().uuid(),
        category: z.string().min(1).max(30),
        file_path: z.string().min(1),
        thumbnail_path: z.string().optional(),
        caption: z.string().max(200).optional(),
        sort_order: z.number().int().optional(),
        taken_at: z.string().optional(),
        gps_lat: z.number().optional(),
        gps_lng: z.number().optional(),
      }),
      ownerCol: null,
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "사진을 찾을 수 없습니다.",
  });

  // outsourcing_contracts
  buildCrud({
    app, table: "outsourcing_contracts", path: "/api/outsourcing-contracts",
    list: {
      schema: baseList.extend({
        lot_id: z.string().uuid().optional(),
        status: z.string().optional(),
        q: z.string().optional(),
      }),
      build: (q) => new WhereBuilder()
        .eq("lot_id", q.lot_id).eq("status", q.status)
        .ilikeAny(["company_name", "contract_number", "representative"], q.q),
      order: "ORDER BY contract_start DESC",
    },
    create: {
      schema: z.object({
        lot_id: z.string().uuid(),
        company_name: z.string().min(1).max(200),
        business_number: z.string().max(20).optional(),
        representative: z.string().max(100).optional(),
        contract_number: z.string().max(50).optional(),
        contract_start: z.string(),
        contract_end: z.string(),
        contract_amount: z.number().int().nonnegative().optional(),
        monthly_fee: z.number().int().nonnegative().optional(),
        revenue_share_rate: z.number().optional(),
        contact_person: z.string().max(100).optional(),
        contact_phone: z.string().max(20).optional(),
        contact_email: z.string().email().max(255).optional(),
        status: z.string().max(20).optional(),
        notes: z.string().optional(),
      }),
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "위탁 계약을 찾을 수 없습니다.",
  });

  // gateway_devices
  buildCrud({
    app, table: "gateway_devices", path: "/api/gateway-devices",
    list: {
      schema: baseList.extend({
        lot_id: z.string().uuid().optional(),
        status: z.string().optional(),
      }),
      build: (q) => new WhereBuilder().eq("lot_id", q.lot_id).eq("status", q.status),
      order: "ORDER BY device_id",
    },
    create: {
      schema: z.object({
        lot_id: z.string().uuid(),
        device_id: z.string().min(1).max(50),
        device_name: z.string().max(100).optional(),
        ip_address: z.string().max(45).optional(),
        mac_address: z.string().max(20).optional(),
        protocol: z.string().max(20).optional(),
        mqtt_topic: z.string().max(200).optional(),
        location_detail: z.string().max(200).optional(),
        floor: z.number().int().optional(),
        install_date: z.string().optional(),
        max_sensors: z.number().int().optional(),
        firmware_version: z.string().max(30).optional(),
        status: z.string().max(20).optional(),
        config: z.unknown().optional(),
        notes: z.string().optional(),
      }),
      ownerCol: "registered_by",
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "게이트웨이를 찾을 수 없습니다.",
  });

  // display_boards
  buildCrud({
    app, table: "display_boards", path: "/api/display-boards",
    list: {
      schema: baseList.extend({
        lot_id: z.string().uuid().optional(),
        status: z.string().optional(),
      }),
      build: (q) => new WhereBuilder().eq("lot_id", q.lot_id).eq("status", q.status),
      order: "ORDER BY board_id",
    },
    create: {
      schema: z.object({
        lot_id: z.string().uuid(),
        board_id: z.string().min(1).max(50),
        board_name: z.string().max(100).optional(),
        location: z.string().max(200).optional(),
        location_type: z.string().max(30).optional(),
        floor: z.number().int().optional(),
        direction: z.string().max(20).optional(),
        protocol: z.string().max(30).optional(),
        ip_address: z.string().max(45).optional(),
        port: z.number().int().optional(),
        display_type: z.string().max(30).optional(),
        display_size: z.string().max(30).optional(),
        max_lines: z.number().int().optional(),
        push_interval_sec: z.number().int().optional(),
        status: z.string().max(20).optional(),
        manufacturer: z.string().max(100).optional(),
        model: z.string().max(100).optional(),
        notes: z.string().optional(),
      }),
      ownerCol: null,
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "표시판을 찾을 수 없습니다.",
  });

  // survey_basic_info — 1:1 with surveys (UNIQUE survey_id)
  buildCrud({
    app, table: "survey_basic_info", path: "/api/survey-basic-info",
    list: {
      schema: baseList.extend({ survey_id: z.string().uuid().optional() }),
      build: (q) => new WhereBuilder().eq("survey_id", q.survey_id),
      order: "ORDER BY survey_id",
    },
    create: {
      schema: z.object({
        survey_id: z.string().uuid(),
        lot_name: z.string().max(200).optional(),
        address: z.string().max(300).optional(),
        lot_type: z.string().max(30).optional(),
        operator_type: z.string().max(30).optional(),
        total_spaces: z.number().int().optional(),
        disabled_spaces: z.number().int().optional(),
        ev_spaces: z.number().int().optional(),
        compact_spaces: z.number().int().optional(),
      }).passthrough(),
      ownerCol: null,
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "기본 정보를 찾을 수 없습니다.",
  });

  // survey_operation — 1:1 with surveys
  buildCrud({
    app, table: "survey_operation", path: "/api/survey-operation",
    list: {
      schema: baseList.extend({ survey_id: z.string().uuid().optional() }),
      build: (q) => new WhereBuilder().eq("survey_id", q.survey_id),
      order: "ORDER BY survey_id",
    },
    create: {
      schema: z.object({
        survey_id: z.string().uuid(),
        operating_hours: z.string().max(100).optional(),
        operating_hours_custom: z.string().max(200).optional(),
        payment_cash: z.boolean().optional(),
        payment_card: z.boolean().optional(),
        payment_mobile: z.boolean().optional(),
        payment_none: z.boolean().optional(),
        staff_type: z.string().max(20).optional(),
        staff_count: z.number().int().optional(),
        management_type: z.string().max(30).optional(),
        management_etc: z.string().max(200).optional(),
        control_linked: z.boolean().optional(),
        portal_linked: z.boolean().optional(),
      }),
      ownerCol: null,
    },
    update: { schema: z.object({}).passthrough() },
    errorMsg: "운영 정보를 찾을 수 없습니다.",
  });


  // 0009 추가 10개
  buildCrud({ app, table: "operations_staff", path: "/api/operations-staff",
    list: { schema: baseList.extend({ lot_id: z.string().uuid().optional(), is_active: z.string().optional().transform(v => v === undefined ? undefined : v === "true") }),
            build: q => new WhereBuilder().eq("lot_id", q.lot_id).eq("is_active", q.is_active),
            order: "ORDER BY staff_name" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "직원을 찾을 수 없습니다.", allowedExpands: ["parking_lots"] });
  buildCrud({ app, table: "enforcement_records", path: "/api/enforcement-records",
    list: { schema: baseList.extend({ lot_id: z.string().uuid().optional(), payment_status: z.string().optional(), q: z.string().optional() }),
            build: q => new WhereBuilder().eq("lot_id", q.lot_id).eq("payment_status", q.payment_status).ilikeAny(["enforcement_number", "vehicle_number"], q.q),
            order: "ORDER BY violation_date DESC" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "단속 기록을 찾을 수 없습니다.", allowedExpands: ["parking_lots"] });
  buildCrud({ app, table: "budget_executions", path: "/api/budget-executions",
    list: { schema: baseList.extend({ item_id: z.string().uuid().optional(), status: z.string().optional() }),
            build: q => new WhereBuilder().eq("item_id", q.item_id).eq("status", q.status),
            order: "ORDER BY execution_date DESC" },
    create: { schema: z.object({}).passthrough(), ownerCol: "created_by" }, update: { schema: z.object({}).passthrough() },
    errorMsg: "예산 집행을 찾을 수 없습니다.", allowedExpands: ["budget_items", "parking_lots"] });
  buildCrud({ app, table: "bid_evaluations", path: "/api/bid-evaluations",
    list: { schema: baseList.extend({ bid_project_id: z.string().uuid().optional() }),
            build: q => new WhereBuilder().eq("bid_project_id", q.bid_project_id),
            order: "ORDER BY total_score DESC" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "평가를 찾을 수 없습니다.", allowedExpands: ["bid_projects"] });
  buildCrud({ app, table: "bid_contracts", path: "/api/bid-contracts",
    list: { schema: baseList.extend({ bid_project_id: z.string().uuid().optional(), status: z.string().optional() }),
            build: q => new WhereBuilder().eq("bid_project_id", q.bid_project_id).eq("status", q.status),
            order: "ORDER BY contract_date DESC" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "계약을 찾을 수 없습니다.", allowedExpands: ["bid_projects"] });
  buildCrud({ app, table: "survey_infra", path: "/api/survey-infra",
    list: { schema: baseList.extend({ survey_id: z.string().uuid().optional() }),
            build: q => new WhereBuilder().eq("survey_id", q.survey_id),
            order: "ORDER BY survey_id" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "기반시설 정보를 찾을 수 없습니다.", allowedExpands: ["surveys"] });
  buildCrud({ app, table: "site_candidates", path: "/api/site-candidates",
    list: { schema: baseList.extend({ status: z.string().optional(), q: z.string().optional() }),
            build: q => new WhereBuilder().eq("status", q.status).ilikeAny(["site_number", "name", "address_road"], q.q),
            order: "ORDER BY created_at DESC" },
    create: { schema: z.object({}).passthrough() }, update: { schema: z.object({}).passthrough() },
    errorMsg: "후보지를 찾을 수 없습니다.", allowedExpands: [] });
  buildCrud({ app, table: "report_generated", path: "/api/report-generated",
    list: { schema: baseList.extend({ status: z.string().optional() }),
            build: q => new WhereBuilder().eq("status", q.status),
            order: "ORDER BY created_at DESC" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "리포트를 찾을 수 없습니다.", allowedExpands: ["report_templates"] });
  buildCrud({ app, table: "maintenance_logs", path: "/api/maintenance-logs",
    list: { schema: baseList.extend({ lot_id: z.string().uuid().optional(), status: z.string().optional() }),
            build: q => new WhereBuilder().eq("lot_id", q.lot_id).eq("status", q.status),
            order: "ORDER BY reported_at DESC" },
    create: { schema: z.object({}).passthrough(), ownerCol: null }, update: { schema: z.object({}).passthrough() },
    errorMsg: "정비 로그를 찾을 수 없습니다.", allowedExpands: ["parking_lots", "equipment"] });

  // lot_realtime_status (lot_id가 PK)
  app.get("/api/lot-realtime-status", { preHandler: [app.authenticate] }, async (req) => {
    const q = baseList.parse(req.query);
    return listWithCount(pool, "lot_realtime_status", "", [], "ORDER BY last_updated DESC", q.limit, q.offset);
  });
  app.get("/api/lot-realtime-status/:lot_id", { preHandler: [app.authenticate] }, async (req) => {
    const r = await pool.query("SELECT * FROM lot_realtime_status WHERE lot_id = $1", [req.params.lot_id]);
    if (r.rows.length === 0) return { lot_id: req.params.lot_id };
    return r.rows[0];
  });
  app.put("/api/lot-realtime-status/:lot_id", { preHandler: [app.authenticate, requireEditor] }, async (req) => {
    const body = (req.body ?? {});
    const fields = Object.entries(body);
    const cols = ["lot_id", ...fields.map(([k]) => k)];
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = [req.params.lot_id, ...fields.map(([, v]) => v)];
    const updates = fields.map(([k]) => `${k} = EXCLUDED.${k}`).join(", ");
    const r = await pool.query(
      `INSERT INTO lot_realtime_status (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
       ON CONFLICT (lot_id) DO UPDATE SET ${updates || "last_updated = now()"}, last_updated = now()
       RETURNING *`,
      values,
    );
    return r.rows[0];
  });

  // 0010 추가 28개 (호출 1~3회)
  const T = (name) => name; // for readability

  for (const cfg of [
    { table: "approval_lines", path: "/api/approval-lines",
      filters: ["module", "status"], q: ["line_name"], owner: "created_by" , expands: ["assignee"]},
    { table: "approval_steps", path: "/api/approval-steps",
      filters: ["line_id", "approver_id", "status"], owner: null , expands: ["assignee"]},
    { table: "approval_records", path: "/api/approval-records",
      filters: ["step_id", "approver_id"], owner: null },
    { table: "attachments", path: "/api/attachments",
      filters: ["module", "reference_id"], owner: "uploaded_by" , expands: []},
    { table: "bid_documents", path: "/api/bid-documents",
      filters: ["bid_project_id", "document_type"], owner: null , expands: ["bid_projects"]},
    { table: "bid_submissions", path: "/api/bid-submissions",
      filters: ["bid_project_id"], q: ["bidder_name"], owner: null , expands: ["bid_projects"]},
    { table: "design_documents", path: "/api/design-documents",
      filters: ["lot_id", "document_type", "status"], q: ["title"], owner: "created_by" , expands: ["parking_lots"]},
    { table: "budget_transfers", path: "/api/budget-transfers",
      filters: ["status"], q: ["transfer_number"], owner: "created_by" },
    { table: "complaint_comments", path: "/api/complaint-comments",
      filters: ["complaint_id", "author_id", "is_internal"], owner: null , expands: []},
    { table: "construction_projects", path: "/api/construction-projects",
      filters: ["lot_id", "status"], q: ["title", "project_number"], owner: "created_by" , expands: ["parking_lots"]},
    { table: "dashboard_widgets", path: "/api/dashboard-widgets",
      filters: ["user_id", "widget_type"], owner: null },
    { table: "ip_whitelist", path: "/api/ip-whitelist",
      filters: ["is_active"], owner: "created_by" },
    { table: "pii_access_logs", path: "/api/pii-access-logs",
      filters: ["user_id", "table_name"], owner: null },
    { table: "api_keys", path: "/api/api-keys",
      filters: ["is_active"], q: ["name"], owner: "created_by" },
    { table: "maintenance_schedules", path: "/api/maintenance-schedules",
      filters: ["lot_id", "equipment_id", "is_active"], owner: null , expands: ["parking_lots", "equipment", "assignee"]},
    { table: "message_logs", path: "/api/message-logs",
      filters: ["module", "channel", "status"], owner: null },
    { table: "module_licenses", path: "/api/module-licenses",
      filters: ["is_active"], q: ["module_code", "module_name"], owner: null },
    { table: "permits", path: "/api/permits",
      filters: ["lot_id", "permit_type", "status"], q: ["permit_number", "vehicle_number"], owner: null , expands: ["parking_lots"]},
    { table: "report_templates", path: "/api/report-templates",
      filters: ["template_type", "is_active"], q: ["template_code", "template_name"], owner: "created_by" },
    { table: "report_schedules", path: "/api/report-schedules",
      filters: ["template_id", "is_active"], owner: null , expands: ["report_templates"]},
    { table: "revenue_reconciliation", path: "/api/revenue-reconciliation",
      filters: ["lot_id", "status"], owner: null , expands: ["parking_lots"]},
    { table: "safety_inspections", path: "/api/safety-inspections",
      filters: ["lot_id", "result", "status"], owner: null , expands: ["parking_lots"]},
    { table: "sensor_devices", path: "/api/sensor-devices",
      filters: ["lot_id", "gateway_id", "status", "device_type"], q: ["device_id"], owner: null , expands: ["parking_lots"]},
    { table: "service_milestones", path: "/api/service-milestones",
      filters: ["project_id", "status"], owner: null , expands: ["service_projects"]},
    { table: "service_inspections", path: "/api/service-inspections",
      filters: ["project_id", "milestone_id", "status"], owner: null , expands: ["service_projects"]},
    { table: "service_payments", path: "/api/service-payments",
      filters: ["project_id", "status", "payment_type"], owner: null , expands: ["service_projects"]},
    { table: "service_deliverables", path: "/api/service-deliverables",
      filters: ["project_id", "milestone_id", "status"], owner: null , expands: ["service_projects"]},
    { table: "service_issues", path: "/api/service-issues",
      filters: ["project_id", "status", "severity"], q: ["issue_number", "title"], owner: null , expands: ["service_projects"]},
    { table: "surface_markings", path: "/api/surface-markings",
      filters: ["lot_id", "marking_type", "status"], owner: null , expands: ["parking_lots"]},
    { table: "survey_usage", path: "/api/survey-usage",
      filters: ["survey_id"], owner: null , expands: ["surveys"]},
    { table: "survey_sensor_plan", path: "/api/survey-sensor-plan",
      filters: ["survey_id"], owner: null , expands: ["surveys"]},
    { table: "security_training_logs", path: "/api/security-training-logs",
      filters: ["user_id", "training_type", "passed"], owner: null },
  ]) {
    const filterShape = {};
    for (const f of cfg.filters) filterShape[f] = z.string().optional();
    const listSchema = baseList.extend(cfg.q ? { ...filterShape, q: z.string().optional() } : filterShape);
    buildCrud({
      app, table: cfg.table, path: cfg.path,
      list: {
        schema: listSchema,
        build: (q) => {
          const wb = new WhereBuilder();
          for (const f of cfg.filters) wb.eq(f, q[f]);
          if (cfg.q) wb.ilikeAny(cfg.q, q.q);
          return wb;
        },
        order: "ORDER BY created_at DESC",
      },
      create: { schema: z.object({}).passthrough(), ownerCol: cfg.owner },
      update: { schema: z.object({}).passthrough() },
      errorMsg: cfg.table + "을(를) 찾을 수 없습니다.",
      allowedExpands: cfg.expands,
    });
  }
}
