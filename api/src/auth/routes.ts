/**
 * 인증 라우트 — 자체 ID/PW 기반.
 *
 * 엔드포인트:
 *   POST   /api/auth/login           로그인 (email + password)
 *   POST   /api/auth/logout          로그아웃 (refresh 토큰 폐기 + 쿠키 삭제)
 *   POST   /api/auth/refresh         access 토큰 재발급
 *   GET    /api/auth/me              현재 사용자 조회
 *   POST   /api/auth/change-password 본인 비밀번호 변경
 *
 * 폐쇄망 정책:
 *   - 비밀번호 분실 시 관리자에게 요청해 수동 초기화 (이메일 SMTP 의존성 제거)
 *   - 5회 연속 로그인 실패 시 계정 15분 잠금
 *
 * 보안:
 *   - access/refresh 모두 httpOnly 쿠키로 전달 (XSS로부터 보호)
 *   - refresh 토큰은 DB에 해시값으로 저장하여 폐기 추적 가능
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "../db.js";
import { env, isProd } from "../env.js";
import { hashPassword, verifyPassword } from "./password.js";
import { buildPayload } from "./jwt.js";
import type { AuthUser, UserRole, UserTeam } from "../types.js";

// ────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MIN = 15;
const REFRESH_DAYS = 7;

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  const baseOpts = {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: "lax" as const,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
  };
  reply.setCookie("pm_access", accessToken, baseOpts);
  reply.setCookie("pm_refresh", refreshToken, {
    ...baseOpts,
    maxAge: REFRESH_DAYS * 24 * 60 * 60,
  });
}

function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie("pm_access", { path: "/" });
  reply.clearCookie("pm_refresh", { path: "/" });
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
}

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team: UserTeam;
}

async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const r = await pool.query<ProfileRow>(
    "SELECT id, name, email, role, team FROM profiles WHERE id = $1",
    [userId],
  );
  return r.rows[0] ?? null;
}

// ────────────────────────────────────────────────
// 라우트
// ────────────────────────────────────────────────

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordBody = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post("/api/auth/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);

    const userRes = await pool.query<UserRow>(
      `SELECT id, email, password_hash, is_active, failed_login_count, locked_until
       FROM users WHERE email = $1`,
      [body.email],
    );
    const user = userRes.rows[0];

    // 정보 누출 방지: 사용자 없음·비번 틀림 모두 동일한 메시지
    if (!user) {
      return reply.code(401).send({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    if (!user.is_active) {
      return reply.code(403).send({ error: "비활성화된 계정입니다. 관리자에게 문의하세요." });
    }

    if (user.locked_until && user.locked_until > new Date()) {
      return reply.code(423).send({
        error: `로그인 시도 횟수를 초과하여 잠겼습니다. ${LOCK_DURATION_MIN}분 후 다시 시도하세요.`,
      });
    }

    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      const newCount = user.failed_login_count + 1;
      const shouldLock = newCount >= MAX_FAILED_LOGINS;
      await pool.query(
        `UPDATE users
         SET failed_login_count = $1,
             locked_until = CASE WHEN $2 THEN now() + interval '${LOCK_DURATION_MIN} minutes' ELSE locked_until END
         WHERE id = $3`,
        [newCount, shouldLock, user.id],
      );
      return reply.code(401).send({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    // 성공: 실패 카운트 초기화 + last_login 갱신
    await pool.query(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
       WHERE id = $1`,
      [user.id],
    );

    const auth = await loadAuthUser(user.id);
    if (!auth) {
      return reply.code(500).send({ error: "프로필이 존재하지 않습니다. 관리자에게 문의하세요." });
    }

    const accessToken = await reply.jwtSign(buildPayload(auth));
    const refreshToken = newRefreshToken();
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, now() + interval '${REFRESH_DAYS} days', $3, $4)`,
      [
        user.id,
        hashRefreshToken(refreshToken),
        req.headers["user-agent"]?.slice(0, 300) ?? null,
        req.ip,
      ],
    );

    setAuthCookies(reply, accessToken, refreshToken);
    return { user: auth };
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies.pm_refresh;
    if (token) {
      await pool.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [hashRefreshToken(token)],
      );
    }
    clearAuthCookies(reply);
    return { ok: true };
  });

  // POST /api/auth/refresh
  app.post("/api/auth/refresh", async (req, reply) => {
    const token = req.cookies.pm_refresh;
    if (!token) return reply.code(401).send({ error: "refresh 토큰 없음" });

    const r = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hashRefreshToken(token)],
    );
    const row = r.rows[0];
    if (!row) {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: "유효하지 않거나 만료된 토큰" });
    }

    const auth = await loadAuthUser(row.user_id);
    if (!auth) return reply.code(401).send({ error: "사용자 없음" });

    const accessToken = await reply.jwtSign(buildPayload(auth));
    // refresh 토큰 회전: 기존 폐기 후 새 토큰 발급
    const newToken = newRefreshToken();
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
      [hashRefreshToken(token)],
    );
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, now() + interval '${REFRESH_DAYS} days', $3, $4)`,
      [row.user_id, hashRefreshToken(newToken), req.headers["user-agent"]?.slice(0, 300) ?? null, req.ip],
    );

    setAuthCookies(reply, accessToken, newToken);
    return { user: auth };
  });

  // GET /api/auth/me
  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.authUser };
  });

  // POST /api/auth/change-password
  app.post("/api/auth/change-password", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = ChangePasswordBody.parse(req.body);
    const userId = req.authUser!.id;

    const r = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );
    const row = r.rows[0];
    if (!row) return reply.code(404).send({ error: "사용자 없음" });

    const ok = await verifyPassword(body.current_password, row.password_hash);
    if (!ok) return reply.code(400).send({ error: "현재 비밀번호가 일치하지 않습니다." });

    const newHash = await hashPassword(body.new_password);
    await pool.query(
      "UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2",
      [newHash, userId],
    );

    // 다른 세션 모두 폐기 (현재 세션은 쿠키로 유지)
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );

    return { ok: true };
  });
}
