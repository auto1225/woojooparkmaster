/**
 * 파일 업로드/다운로드 라우트.
 *
 * Supabase Storage를 자체 디스크 저장소로 대체.
 * 파일은 UPLOAD_DIR (기본: ./uploads/) 아래 {bucket}/{path...} 로 저장.
 *
 * 엔드포인트:
 *   POST   /api/files/:bucket/*       multipart/form-data 업로드 (param "file")
 *   GET    /api/files/:bucket/*       파일 다운로드 (인증 쿠키 자동)
 *   DELETE /api/files/:bucket/*       파일 삭제
 *   GET    /api/files/:bucket         bucket 안 파일 목록 (옵션)
 *
 * 보안:
 *   - 모든 엔드포인트 인증 필수
 *   - 업로드는 editor 이상
 *   - 삭제는 manager 이상
 *   - bucket 이름은 영숫자·하이픈·언더스코어만 허용 (path traversal 방지)
 *   - path는 .. 포함 시 400
 */
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import { requireEditor, requireManager } from "../middleware/authorize.js";
import { recordAudit } from "../lib/crud-helpers.js";
import { ApiError } from "../lib/pg-errors.js";

const BUCKET_RE = /^[a-zA-Z0-9_-]+$/;

function sanitizeBucket(bucket: string): string {
  if (!BUCKET_RE.test(bucket)) throw new ApiError(400, "잘못된 bucket 이름");
  return bucket;
}

function sanitizePath(p: string): string {
  if (!p) throw new ApiError(400, "파일 경로가 비어있습니다");
  if (p.includes("..") || p.startsWith("/")) {
    throw new ApiError(400, "잘못된 파일 경로");
  }
  return p;
}

function resolvePath(bucket: string, relPath: string): string {
  const root = path.resolve(env.UPLOAD_DIR);
  const full = path.resolve(root, sanitizeBucket(bucket), sanitizePath(relPath));
  // 안전성: 최종 경로가 root 아래에 있어야 함
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new ApiError(400, "허용되지 않은 경로");
  }
  return full;
}

export async function registerFilesRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      files: 1,
    },
  });

  // POST /api/files/:bucket/* — 업로드
  app.post<{ Params: { bucket: string; "*": string } }>(
    "/api/files/:bucket/*",
    { preHandler: [app.authenticate, requireEditor] },
    async (req, reply) => {
      const data = await req.file();
      if (!data) throw new ApiError(400, "파일이 첨부되지 않았습니다");

      const bucket = sanitizeBucket(req.params.bucket);
      const relPath = sanitizePath(req.params["*"]);
      const dst = resolvePath(bucket, relPath);

      await fs.mkdir(path.dirname(dst), { recursive: true });

      const buffer = await data.toBuffer();
      await fs.writeFile(dst, buffer);

      await recordAudit({
        action: "FILE_UPLOAD",
        table: "files",
        recordId: relPath,
        user: req.authUser!,
        diff: { after: { bucket, path: relPath, size: buffer.length, mimeType: data.mimetype } },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return reply.code(201).send({
        bucket,
        path: relPath,
        size: buffer.length,
        url: `/api/files/${bucket}/${relPath}`,
      });
    },
  );

  // GET /api/files/:bucket/* — 다운로드
  app.get<{ Params: { bucket: string; "*": string }; Querystring: { inline?: string } }>(
    "/api/files/:bucket/*",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const bucket = sanitizeBucket(req.params.bucket);
      const relPath = sanitizePath(req.params["*"]);
      const fp = resolvePath(bucket, relPath);

      try {
        const stat = await fs.stat(fp);
        if (!stat.isFile()) throw new ApiError(404, "파일 아님");
      } catch {
        throw new ApiError(404, "파일을 찾을 수 없습니다");
      }

      const filename = path.basename(relPath);
      const inline = req.query.inline === "1" || req.query.inline === "true";
      reply.header(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(filename)}"`,
      );
      return reply.send(createReadStream(fp));
    },
  );

  // DELETE /api/files/:bucket/*
  app.delete<{ Params: { bucket: string; "*": string } }>(
    "/api/files/:bucket/*",
    { preHandler: [app.authenticate, requireManager] },
    async (req, reply) => {
      const bucket = sanitizeBucket(req.params.bucket);
      const relPath = sanitizePath(req.params["*"]);
      const fp = resolvePath(bucket, relPath);
      await fs.unlink(fp).catch(() => {
        throw new ApiError(404, "파일을 찾을 수 없거나 삭제 실패");
      });

      await recordAudit({
        action: "FILE_DELETE",
        table: "files",
        recordId: relPath,
        user: req.authUser!,
        diff: { before: { bucket, path: relPath } },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return reply.code(204).send();
    },
  );

  // 호환 헬퍼: bucket 안 파일 목록 (간단)
  app.get<{ Params: { bucket: string }; Querystring: { prefix?: string } }>(
    "/api/files/:bucket",
    { preHandler: [app.authenticate] },
    async (req) => {
      const bucket = sanitizeBucket(req.params.bucket);
      const prefix = req.query.prefix ?? "";
      sanitizePath(prefix || "x");  // ".." 등 검증
      const dir = path.resolve(env.UPLOAD_DIR, bucket, prefix);
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return {
          data: entries
            .filter((e) => e.isFile())
            .map((e) => ({
              name: e.name,
              path: prefix ? `${prefix}/${e.name}` : e.name,
            })),
        };
      } catch {
        return { data: [] };
      }
    },
  );
}
