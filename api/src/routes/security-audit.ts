/**
 * security_audit_logs + active_sessions 라우트.
 * 두 테이블 모두 read-mostly. 보안 감사용.
 *
 * - security_audit_logs: admin 조회 + 시스템·로그인 관련 코드에서 INSERT만
 * - active_sessions: 본인 세션 조회 + admin 모두 조회 + 본인 종료
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdmin } from "../middleware/authorize.js";
import { ApiError } from "../lib/pg-errors.js";
import { listWithCount, WhereBuilder } from "../lib/crud-helpers.js";

const IdParam = z.object({ id: z.string().uuid() });

export async function registerSecurityAuditRoutes(app: FastifyInstance) {
  // ─── security_audit_logs ───
  const SAL_PATH = "/api/security-audit-logs";
  const SALQuery = z.object({
    event_type: z.string().optional(),
    severity: z.enum(["info", "warning", "critical"]).optional(),
    user_id: z.string().uuid().optional(),
    success: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get(SAL_PATH, { preHandler: [app.authenticate, requireAdmin] }, async (req) => {
    const q = SALQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("event_type", q.event_type)
      .eq("severity", q.severity)
      .eq("user_id", q.user_id)
      .eq("success", q.success)
      .gte("created_at", q.date_from)
      .lte("created_at", q.date_to);
    const { sql, params } = wb.build();
    return listWithCount(pool, "security_audit_logs", sql, params, "ORDER BY created_at DESC", q.limit, q.offset);
  });

  // POST — 시스템·서버 코드에서만 사용. admin 토큰으로도 호출 가능 (수동 기록).
  const SALInsert = z.object({
    event_type: z.string().min(1).max(50),
    severity: z.enum(["info", "warning", "critical"]).default("info"),
    user_id: z.string().uuid().optional(),
    user_name: z.string().max(100).optional(),
    user_role: z.string().max(20).optional(),
    user_team: z.string().max(20).optional(),
    resource_type: z.string().max(50).optional(),
    resource_id: z.string().uuid().optional(),
    resource_name: z.string().max(200).optional(),
    action_detail: z.unknown().optional(),
    before_value: z.unknown().optional(),
    after_value: z.unknown().optional(),
    success: z.boolean().default(true),
    failure_reason: z.string().optional(),
    session_id: z.string().max(100).optional(),
    request_path: z.string().max(300).optional(),
  });
  app.post(SAL_PATH, { preHandler: [app.authenticate, requireAdmin] }, async (req, reply) => {
    const body = SALInsert.parse(req.body);
    const fields = Object.entries(body);
    const cols = [...fields.map(([k]) => k), "ip_address", "user_agent"];
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = [...fields.map(([, v]) => v), req.ip, req.headers["user-agent"]?.slice(0, 1000) ?? null];
    const r = await pool.query(
      `INSERT INTO security_audit_logs (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values,
    );
    return reply.code(201).send(r.rows[0]);
  });

  // ─── active_sessions ───
  const AS_PATH = "/api/active-sessions";
  const ASQuery = z.object({
    user_id: z.string().uuid().optional(),
    is_active: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get(AS_PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ASQuery.parse(req.query);
    const isAdmin = req.authUser!.role === "admin";
    const targetUser = isAdmin && q.user_id ? q.user_id : req.authUser!.id;
    const wb = new WhereBuilder()
      .eq("user_id", targetUser)
      .eq("is_active", q.is_active);
    const { sql, params } = wb.build();
    return listWithCount(pool, "active_sessions", sql, params, "ORDER BY last_activity DESC", q.limit, q.offset);
  });

  // 본인 세션 종료
  app.delete<{ Params: { id: string } }>(`${AS_PATH}/:id`, { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query(
      "SELECT user_id FROM active_sessions WHERE id = $1",
      [id],
    );
    if (r.rows.length === 0) throw new ApiError(404, "세션을 찾을 수 없습니다.");
    if (r.rows[0].user_id !== req.authUser!.id && req.authUser!.role !== "admin") {
      throw new ApiError(403, "본인 세션만 종료할 수 있습니다.");
    }
    await pool.query("UPDATE active_sessions SET is_active = false WHERE id = $1", [id]);
    return reply.code(204).send();
  });
}
