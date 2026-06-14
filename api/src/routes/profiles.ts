/**
 * profiles CRUD 라우트.
 *
 * 19회 호출 — 사용자 프로필 조회·수정.
 * 권한 모델:
 *   - GET 목록·단건: 인증 사용자 누구나 (직원 디렉터리 성격)
 *   - PATCH /api/profiles/me: 본인 프로필 수정 (이름·전화·테마·온보딩 플래그 등)
 *   - PATCH /api/profiles/:id: admin만 (역할·팀·활성여부 변경)
 *   - POST /api/profiles, DELETE: admin만 (계정 생성·삭제는 보통 관리자 페이지)
 *
 * 주의: 비밀번호 변경은 /api/auth/change-password 에서. 여기서 password 컬럼은 절대 노출하지 않는다.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAdmin } from "../middleware/authorize.js";
import { ApiError } from "../lib/pg-errors.js";
import { buildUpdateSet, recordAudit, listWithCount, WhereBuilder, fetchOne } from "../lib/crud-helpers.js";

const TABLE = "profiles";
const PATH = "/api/profiles";

// 프론트에 노출 가능한 컬럼만 SELECT
const PUBLIC_COLS = `
  id, name, email, phone, employee_number, department, team, role,
  avatar_url, is_active, last_login_at, theme_preference,
  notification_settings, onboarding_completed, must_change_password,
  created_at, updated_at
`;

const Team = z.enum(["operations", "facilities", "planning", "admin"]);
const Role = z.enum(["admin", "manager", "editor", "viewer"]);

const ListQuery = z.object({
  team: Team.optional(),
  role: Role.optional(),
  is_active: z.string().optional().transform((v) => v === undefined ? undefined : v === "true"),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** 본인이 직접 수정 가능한 필드만 (role, team, is_active 등은 admin 전용) */
const SelfUpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  avatar_url: z.string().url().nullish(),
  theme_preference: z.enum(["light", "dark"]).optional(),
  notification_settings: z.record(z.unknown()).optional(),
  onboarding_completed: z.boolean().optional(),
});

const AdminUpdateBody = SelfUpdateBody.extend({
  team: Team.optional(),
  role: Role.optional(),
  is_active: z.boolean().optional(),
  department: z.string().max(100).optional(),
  employee_number: z.string().max(30).optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function registerProfilesRoutes(app: FastifyInstance) {
  // GET /api/profiles — 부서원 디렉터리 (인증된 사용자 누구나 조회 가능)
  app.get(PATH, { preHandler: [app.authenticate] }, async (req) => {
    const q = ListQuery.parse(req.query);
    const wb = new WhereBuilder()
      .eq("team", q.team)
      .eq("role", q.role)
      .eq("is_active", q.is_active)
      .ilikeAny(["name", "email", "department", "employee_number"], q.q);
    const { sql: where, params } = wb.build();
    return listWithCount(pool, TABLE, where, params, "ORDER BY name", q.limit, q.offset, PUBLIC_COLS);
  });

  // GET /api/profiles/me
  app.get(`${PATH}/me`, { preHandler: [app.authenticate] }, async (req) => {
    return fetchOne(TABLE, req.authUser!.id, "내 프로필을 찾을 수 없습니다.");
  });

  // GET /api/profiles/:id
  app.get<{ Params: { id: string } }>(`${PATH}/:id`, { preHandler: [app.authenticate] }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query(`SELECT ${PUBLIC_COLS} FROM profiles WHERE id = $1`, [id]);
    if (r.rows.length === 0) throw new ApiError(404, "프로필을 찾을 수 없습니다.");
    return r.rows[0];
  });

  // PATCH /api/profiles/me — 본인 프로필
  app.patch(`${PATH}/me`, { preHandler: [app.authenticate] }, async (req) => {
    const body = SelfUpdateBody.parse(req.body);
    const id = req.authUser!.id;
    const before = await fetchOne(TABLE, id);
    const { setSql, params } = buildUpdateSet(body);
    const r = await pool.query(
      `UPDATE profiles SET ${setSql} WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
      [id, ...params],
    );
    await recordAudit({
      action: "UPDATE", table: TABLE, recordId: id, user: req.authUser!,
      diff: { before, after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });
    return r.rows[0];
  });

  // PATCH /api/profiles/:id — admin만 (역할·팀 변경 가능)
  app.patch<{ Params: { id: string } }>(
    `${PATH}/:id`,
    { preHandler: [app.authenticate, requireAdmin] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = AdminUpdateBody.parse(req.body);
      const before = await fetchOne(TABLE, id, "프로필을 찾을 수 없습니다.");
      const { setSql, params } = buildUpdateSet(body);
      const r = await pool.query(
        `UPDATE profiles SET ${setSql} WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
        [id, ...params],
      );
      // is_active=false 시 users도 비활성화 (로그인 차단)
      if (body.is_active === false) {
        await pool.query("UPDATE users SET is_active = false WHERE id = $1", [id]);
      } else if (body.is_active === true) {
        await pool.query("UPDATE users SET is_active = true WHERE id = $1", [id]);
      }
      await recordAudit({
        action: "UPDATE", table: TABLE, recordId: id, user: req.authUser!,
        diff: { before, after: r.rows[0] }, ipAddress: req.ip, userAgent: req.headers["user-agent"],
      });
      return r.rows[0];
    },
  );
}
