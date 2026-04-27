/**
 * 파일 업로드/다운로드 typed binding.
 *
 * Supabase storage의 supabase.storage.from(bucket).{upload,remove,getPublicUrl} 대체.
 * 자체 백엔드는 인증을 httpOnly 쿠키로 자동 처리하므로 토큰 인자 불필요.
 *
 * 매핑:
 *   .from(b).upload(p, file)        → filesApi.upload(b, p, file)
 *   .from(b).remove([p])            → filesApi.remove(b, p)
 *   .from(b).getPublicUrl(p)        → filesApi.getUrl(b, p)
 *   .from(b).createSignedUrl(p, t)  → filesApi.getUrl(b, p, { inline: true })
 */
import { ApiError } from "./client";

const BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? "";

function sanitize(s: string) {
  return s.split("/").map(encodeURIComponent).join("/");
}

export const filesApi = {
  /** multipart 업로드. file은 Blob/File. */
  async upload(
    bucket: string,
    relPath: string,
    file: Blob | File,
  ): Promise<{ bucket: string; path: string; size: number; url: string }> {
    const fd = new FormData();
    fd.append("file", file);
    const url = `${BASE}/api/files/${encodeURIComponent(bucket)}/${sanitize(relPath)}`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`, body);
    }
    return res.json();
  },

  async remove(bucket: string, relPath: string): Promise<void> {
    const url = `${BASE}/api/files/${encodeURIComponent(bucket)}/${sanitize(relPath)}`;
    const res = await fetch(url, { method: "DELETE", credentials: "include" });
    if (!res.ok && res.status !== 204) {
      throw new ApiError(res.status, `HTTP ${res.status}`);
    }
  },

  /** 표시·다운로드 URL. inline=true면 img src로 사용 가능. */
  getUrl(bucket: string, relPath: string, opts?: { inline?: boolean }): string {
    const inline = opts?.inline ? "?inline=1" : "";
    return `${BASE}/api/files/${encodeURIComponent(bucket)}/${sanitize(relPath)}${inline}`;
  },

  /** Supabase 호환 헬퍼: 응답 형태가 { data, error } */
  async legacyUpload(bucket: string, relPath: string, file: Blob | File) {
    try {
      const data = await this.upload(bucket, relPath, file);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  },
};
