/**
 * PG 에러 코드 → 의미 있는 HTTP 응답으로 변환.
 *
 * 라우트마다 try/catch로 23505 처리하던 보일러플레이트를 한 곳에 모은다.
 * 70개 테이블이 같은 에러 응답 형식을 보장한다.
 *
 * 사용 패턴:
 *   try {
 *     await pool.query(...);
 *   } catch (err) {
 *     throw fromPgError(err);  // → ApiError 인스턴스로 정규화
 *   }
 *
 * 또는 글로벌 에러 핸들러에서 ApiError와 PG 에러를 동일한 형식으로 변환.
 */
import type { FastifyReply } from "fastify";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly clientMessage: string,
    public readonly details?: unknown,
  ) {
    super(clientMessage);
    this.name = "ApiError";
  }
}

interface PgErrorShape {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

/**
 * PG 에러를 ApiError로 변환. 매칭되지 않으면 null 반환 (호출자가 그대로 throw).
 */
export function fromPgError(err: unknown): ApiError | null {
  if (!err || typeof err !== "object") return null;
  const pg = err as PgErrorShape;
  if (!pg.code) return null;

  switch (pg.code) {
    case "23505": // unique_violation
      return new ApiError(409, "이미 존재하는 값입니다.", {
        constraint: pg.constraint,
        detail: pg.detail,
      });
    case "23503": // foreign_key_violation
      return new ApiError(
        409,
        "연결된 데이터가 있어 작업할 수 없습니다.",
        { constraint: pg.constraint, table: pg.table },
      );
    case "23502": // not_null_violation
      return new ApiError(400, `필수 항목이 누락되었습니다: ${pg.column}`, {
        column: pg.column,
      });
    case "23514": // check_violation
      return new ApiError(400, "입력값이 허용 범위를 벗어났습니다.", {
        constraint: pg.constraint,
      });
    case "22P02": // invalid_text_representation (UUID 형식 오류 등)
      return new ApiError(400, "입력 형식이 올바르지 않습니다.");
    case "42P01": // undefined_table
    case "42703": // undefined_column
      // 코드 버그 — 사용자에게 노출하지 않음
      return new ApiError(500, "서버 내부 오류");
    default:
      return null;
  }
}

/**
 * 글로벌 에러 핸들러용 헬퍼.
 * - ApiError → 그대로 응답
 * - PG 에러 → fromPgError 변환 시도
 * - 그 외 → 500
 */
export function sendError(reply: FastifyReply, err: unknown, isProd: boolean) {
  if (err instanceof ApiError) {
    return reply.code(err.statusCode).send({
      error: err.clientMessage,
      ...(err.details && !isProd ? { details: err.details } : {}),
    });
  }
  const apiErr = fromPgError(err);
  if (apiErr) {
    return reply.code(apiErr.statusCode).send({
      error: apiErr.clientMessage,
      ...(apiErr.details && !isProd ? { details: apiErr.details } : {}),
    });
  }
  return reply.code(500).send({
    error: isProd ? "서버 오류" : (err as Error)?.message ?? "Unknown error",
  });
}
