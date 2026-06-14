/**
 * 백엔드 전역 공유 타입.
 * 프론트엔드와 동기화가 필요한 타입은 추후 별도 패키지로 분리 고려.
 */

/** 기존 Supabase profiles의 role_type ENUM과 동일 */
export type UserRole = "admin" | "manager" | "editor" | "viewer";

/** 기존 Supabase profiles의 team_type ENUM과 동일 */
export type UserTeam = "operations" | "facilities" | "planning" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team: UserTeam;
}

/** Fastify request에 인증된 사용자를 부착하기 위한 모듈 보강 */
declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}
