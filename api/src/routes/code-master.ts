/**
 * code_master CRUD 라우트 — Phase 0 end-to-end 프로토타입.
 *
 * 이 파일은 "70개 테이블 마이그레이션의 기준 패턴"이다.
 * 같은 구조를 복제해서 parking_lots, profiles, complaints 등 다른 테이블에도 적용한다.
 *
 * 패턴 요약:
 *   1) zod 스키마로 입력 검증
 *   2) app.authenticate (인증) + requireXxx (역할 권한) 미들웨어 조합
 *   3) pg parameterized query (절대 문자열 결합 금지)
 *   4) PG 에러는 fromPgError로 통일 처리 (글로벌 핸들러가 잡음)
 *   5) 변경 작업은 logActivity로 감사 로그 자동 기록
 *   6) 행 단위 권한이 필요하면 ensureOwnership 추가
 *
 * 엔드포인트:
 *   GET    /api/code-master              목록 (group_code 필터, 페이지네이션)
 *   GET    /api/code-master/:id          단건 조회
 *   POST   /api/code-master              생성 (editor 이상)
 *   PATCH  /api/code-master/:id          수정 (editor 이상)
 *   DELETE /api/code-master/:id          삭제 (manager 이상)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import { logActivity } from "../lib/audit-log.js";
import { ApiError } from "../lib/pg-errors.js";

const ListQuery = z.object({
  group_code: z.string().optional(),
  active_only: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateBody = z.object({
  group_code: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

const UpdateBody = CreateBody.partial();

const IdParam = z.object({ id: z.string().uuid() });

interface CodeMasterRow {
  id: string;
  group_code: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const TABLE = "code_master";

export async function registerCodeMasterRoutes(app: FastifyInstance) {
  // GET /api/code-master
  app.get(
    "/api/code-master",
    { preHandler: [app.authenticate] },
    async (req) => {
      const q = ListQuery.parse(req.query);
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (q.group_code) {
        params.push(q.group_code);
        conditions.push(`group_code = $${params.length}`);
      }
      if (q.active_only) {
        conditions.push(`is_active = true`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // 카운트 먼저 (필터 파라미터만)
      const total = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM code_master ${where}`,
        params,
      );

      params.push(q.limit, q.offset);
      const rows = await pool.query<CodeMasterRow>(
        `SELECT * FROM code_master ${where}
         ORDER BY group_code, sort_order, code
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return {
        data: rows.rows,
        total: Number(total.rows[0].count),
        limit: q.limit,
        offset: q.offset,
      };
    },
  );

  // GET /api/code-master/:id
  app.get<{ Params: { id: string } }>(
    "/api/code-master/:id",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const r = await pool.query<CodeMasterRow>(
        `SELECT * FROM code_master WHERE id = $1`,
        [id],
      );
      if (r.rows.length === 0) throw new ApiError(404, "코드를 찾을 수 없습니다.");
      return r.rows[0];
    },
  );

  // POST /api/code-master
  app.post(
    "/api/code-master",
    { preHandler: [app.authenticate, requireEditor] },
    async (req, reply) => {
      const body = CreateBody.parse(req.body);
      const r = await pool.query<CodeMasterRow>(
        `INSERT INTO code_master
           (group_code, code, name, description, sort_order, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          body.group_code,
          body.code,
          body.name,
          body.description ?? null,
          body.sort_order,
          body.is_active,
          req.authUser!.id,
        ],
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

  // PATCH /api/code-master/:id
  app.patch<{ Params: { id: string } }>(
    "/api/code-master/:id",
    { preHandler: [app.authenticate, requireEditor] },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = UpdateBody.parse(req.body);
      const fields = Object.entries(body).filter(([, v]) => v !== undefined);
      if (fields.length === 0) {
        throw new ApiError(400, "수정할 필드가 없습니다.");
      }

      // 변경 전 상태 조회 (감사 로그 diff용)
      const before = await pool.query<CodeMasterRow>(
        `SELECT * FROM code_master WHERE id = $1`,
        [id],
      );
      if (before.rows.length === 0) throw new ApiError(404, "코드를 찾을 수 없습니다.");

      const sets = fields.map(([k], i) => `${k} = $${i + 2}`);
      const params = [id, ...fields.map(([, v]) => v)];
      const r = await pool.query<CodeMasterRow>(
        `UPDATE code_master SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        params,
      );
      const after = r.rows[0];

      await logActivity({
        userId: req.authUser!.id,
        action: "UPDATE",
        table: TABLE,
        recordId: id,
        diff: { before: before.rows[0], after },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      });

      return after;
    },
  );

  // DELETE /api/code-master/:id (manager 이상만)
  app.delete<{ Params: { id: string } }>(
    "/api/code-master/:id",
    { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const before = await pool.query<CodeMasterRow>(
        `SELECT * FROM code_master WHERE id = $1`,
        [id],
      );
      if (before.rows.length === 0) throw new ApiError(404, "코드를 찾을 수 없습니다.");

      await pool.query("DELETE FROM code_master WHERE id = $1", [id]);

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
