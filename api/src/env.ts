/**
 * 환경 변수 로드·검증.
 * 서버 부팅 시 한 번만 실행되며, 필수 변수가 없으면 즉시 종료한다.
 */
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),

  PG_HOST: z.string().default("localhost"),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_DATABASE: z.string().min(1),
  PG_USER: z.string().min(1),
  PG_PASSWORD: z.string().min(1),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  COOKIE_DOMAIN: z.string().optional(),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(20),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ 환경 변수 검증 실패:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
