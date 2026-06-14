/**
 * Fastify 앱 엔트리.
 *
 * 부팅 순서:
 *   1) DB 핑 (실패 시 즉시 종료)
 *   2) 보안 플러그인 (helmet, cors, cookie, rate-limit)
 *   3) JWT 등록
 *   4) 인증 미들웨어 데코레이터 등록
 *   5) 라우트 등록
 *   6) 글로벌 에러 핸들러
 *   7) listen
 */
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";

import { env, isProd } from "./env.js";
import { pingDb } from "./db.js";
import { registerJwt } from "./auth/jwt.js";
import authenticate from "./middleware/authenticate.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerCodeMasterRoutes } from "./routes/code-master.js";
import { registerParkingLotsRoutes } from "./routes/parking-lots.js";
import { registerProfilesRoutes } from "./routes/profiles.js";
import { registerRevenueDailyRoutes } from "./routes/revenue-daily.js";
import { registerComplaintsRoutes } from "./routes/complaints.js";
import { registerBudgetRoutes } from "./routes/budget.js";
import { registerNotificationsRoutes } from "./routes/notifications.js";
import { registerSurveysRoutes } from "./routes/surveys.js";
import { registerEquipmentRoutes } from "./routes/equipment.js";
import { registerSystemConfigRoutes } from "./routes/system-config.js";
import { registerFeePoliciesRoutes } from "./routes/fee-policies.js";
import { registerSecurityAuditRoutes } from "./routes/security-audit.js";
import { registerBidProjectsRoutes } from "./routes/bid-projects.js";
import { registerServiceProjectsRoutes } from "./routes/service-projects.js";
import { registerFeeExemptionsRoutes } from "./routes/fee-exemptions.js";
import { registerLongTailRoutes } from "./routes/long-tail.js";
import { sendError } from "./lib/pg-errors.js";

async function main() {
  // 1) DB 핑
  if (!(await pingDb())) {
    console.error("❌ PostgreSQL 연결 실패. .env의 PG_* 값을 확인하세요.");
    process.exit(1);
  }

  const app = Fastify({
    logger: {
      level: isProd ? "info" : "debug",
      transport: isProd ? undefined : { target: "pino-pretty" },
    },
    trustProxy: true,
  });

  // 2) 보안
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });

  // 3) JWT
  await registerJwt(app);

  // 4) 인증 데코레이터
  await app.register(authenticate);

  // 5) 라우트
  await registerAuthRoutes(app);
  await registerCodeMasterRoutes(app);
  await registerParkingLotsRoutes(app);
  await registerProfilesRoutes(app);
  await registerRevenueDailyRoutes(app);
  await registerComplaintsRoutes(app);
  await registerBudgetRoutes(app);
  await registerNotificationsRoutes(app);
  await registerSurveysRoutes(app);
  await registerEquipmentRoutes(app);
  await registerSystemConfigRoutes(app);
  await registerFeePoliciesRoutes(app);
  await registerSecurityAuditRoutes(app);
  await registerBidProjectsRoutes(app);
  await registerServiceProjectsRoutes(app);
  await registerFeeExemptionsRoutes(app);
  await registerLongTailRoutes(app);

  // 헬스체크
  app.get("/api/health", async () => ({
    ok: true,
    db: await pingDb(),
    time: new Date().toISOString(),
  }));

  // 6) 글로벌 에러 핸들러
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "입력 형식이 올바르지 않습니다.",
        details: err.flatten(),
      });
    }
    req.log.error(err);
    return sendError(reply, err, isProd);
  });

  // 7) listen
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 parkmaster-api listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
