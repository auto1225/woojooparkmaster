/**
 * 자체 JWT 발급·검증.
 * - access 토큰: 짧은 수명 (기본 15분), API 인증용
 * - refresh 토큰: 긴 수명 (기본 7일), access 토큰 재발급용
 *
 * 두 토큰 모두 httpOnly 쿠키로 전달하여 XSS로부터 보호한다.
 */
import jwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "../types.js";
import { env } from "../env.js";

// fastify-jwt의 req.user 는 "검증된 JWT 페이로드"를 담는다.
// 우리 AuthUser는 DB에서 로드되어 req.authUser 에 부착된다 (types.ts 참고).
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string; team: string };
    user: { sub: string; email: string; role: string; team: string };
  }
}

export async function registerJwt(app: FastifyInstance) {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "pm_access",
      signed: false,
    },
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    },
  });
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  team: string;
}

export function buildPayload(user: AuthUser): JwtPayload {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    team: user.team,
  };
}
