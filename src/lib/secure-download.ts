/** SEC-WEB-6: 파일 다운로드 보안 */
import { supabase } from '@/integrations/supabase/client';
import { logSecurityAudit } from './auth-security';
import { toast } from 'sonner';

/** 안전한 파일 다운로드 (서명된 URL 사용) */
export async function secureDownload(filePath: string, bucket: string, displayName: string) {
  // 1. 인증 확인
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    toast.error('로그인이 필요합니다.');
    return;
  }

  // 2. 서명된 URL 생성 (1시간 유효)
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 3600);

  if (error || !data) {
    toast.error('파일 다운로드 권한이 없습니다.');
    return;
  }

  // 3. 보안 감사 로그
  await logSecurityAudit('file_download', 'info', {
    bucket, filePath, displayName,
  });

  // 4. 다운로드
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.download = displayName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** 이미지 표시용 서명된 URL (24시간 유효) */
export async function getSignedImageUrl(filePath: string, bucket: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 86400);
  if (error || !data) return null;
  return data.signedUrl;
}
