/**
 * SEC-WEB-6: 파일 다운로드 (자체 백엔드 모델, 임시 placeholder)
 *
 * 자체 백엔드의 파일 API(/api/files/...)가 구현된 후 본격적으로 사용한다.
 * 현재는 대체 구현으로 동작:
 *  - 인증된 fetch로 /api/files/{id} 호출 → blob 다운로드
 *  - 인증 쿠키는 자동 첨부됨
 *
 * Supabase storage의 createSignedUrl 모델은 사용하지 않는다 (httpOnly 쿠키 인증으로 대체).
 */
import { authApi } from '@/integrations/api';
import { logSecurityAudit } from './auth-security';
import { toast } from 'sonner';

const API_BASE =
  (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '';

/** 안전한 파일 다운로드 (인증 쿠키 자동) */
export async function secureDownload(filePath: string, bucket: string, displayName: string) {
  const user = await authApi.me().catch(() => null);
  if (!user) {
    toast.error('로그인이 필요합니다.');
    return;
  }

  try {
    // 신규 파일 API 사용 — 백엔드가 권한 검증 후 스트림으로 반환
    const url = `${API_BASE}/api/files/${encodeURIComponent(bucket)}/${encodeURIComponent(filePath)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = displayName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);

    await logSecurityAudit('file_download', 'info', { bucket, filePath, displayName });
  } catch (err: any) {
    toast.error('파일 다운로드 실패: ' + (err?.message ?? '알 수 없는 오류'));
  }
}

/** 이미지 표시용 URL (인증 쿠키 자동 — img src로 사용) */
export async function getSignedImageUrl(filePath: string, bucket: string): Promise<string | null> {
  const user = await authApi.me().catch(() => null);
  if (!user) return null;
  return `${API_BASE}/api/files/${encodeURIComponent(bucket)}/${encodeURIComponent(filePath)}?inline=1`;
}
