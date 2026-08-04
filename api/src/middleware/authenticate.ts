/**
 * authenticate 미들웨어.
 *
 * 동작:
 *   1. 쿠키 또는 Authorization 헤더의 access JWT 검증
 *   2. 페이로드에서 user_id 추출 → DB에서 최신 프로필 조회 (역할 변경 즉시 반영)
 *   3. req.authUser 에 부착
 *
 * 실패 시 401 응답.
 *
 * 사용:
 *   app.get("/api/something", { preHandler: [app.authenticate] }, handler)
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db.js";
import type { AuthUser, UserRole, UserTeam } from "../types.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "인증 필요" });
    }

    const payload = req.user;
    const r = await pool.query<{
      id: string;
      name: string;
      email: string;
      role: UserRole;
      team: UserTeam;
      is_active: boolean;
    }>(
      `SELECT p.id, p.name, p.email, p.role, p.team, COALESCE(u.is_active, p.is_active) AS is_active
       FROM profiles p
       JOIN users u ON u.id = p.id
       WHERE p.id = $1`,
      [payload.sub],
    );
    const row = r.rows[0];
    if (!row || !row.is_active) {
      return reply.code(401).send({ error: "유효하지 않은 사용자" });
    }

    const authUser: AuthUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      team: row.team,
    };
    req.authUser = authUser;
  });
});
