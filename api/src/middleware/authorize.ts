/**
 * 권한 검증 미들웨어 팩토리.
 *
 * Supabase의 RLS를 백엔드 미들웨어로 옮긴 핵심 모듈.
 * 70개 테이블·196개 정책을 모두 손으로 옮기는 게 아니라,
 * 역할(role) 기반 + 본인 데이터 검사 정도로 단순화한다.
 *
 * 사용 예:
 *   app.post("/api/lots", {
 *     preHandler: [app.authenticate, requireRole("manager", "admin")]
 *   }, handler)
 *
 * 정책:
 *   admin   — 모든 작업 가능
 *   manager — 본인 팀 + 운영 데이터 수정 가능
 *   editor  — 데이터 입력·수정 가능 (삭제 불가)
 *   viewer  — 조회만
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import type { UserRole } from "../types.js";

export function requireRole(...allowed: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = req.authUser?.role;
    if (!role || !allowed.includes(role)) {
      return reply.code(403).send({ error: "권한이 없습니다." });
    }
  };
}

/** admin만 허용 (시스템 설정·계정 관리 등) */
export const requireAdmin = requireRole("admin");

/** 데이터 입력 권한 (editor, manager, admin) */
export const requireEditor = requireRole("editor", "manager", "admin");

/** 데이터 관리 권한 (manager, admin) */
export const requireManager = requireRole("manager", "admin");
