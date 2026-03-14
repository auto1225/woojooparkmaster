/** Supabase 에러를 사용자 친화적 한글 메시지로 변환 */
export function handleSupabaseError(error: any): string {
  const code = error?.code;
  const message = error?.message || '';

  // RLS 권한 에러
  if (code === '42501' || message.includes('policy')) {
    return '권한이 없습니다. 관리자에게 문의하세요.';
  }
  // 중복 키
  if (code === '23505') {
    return '이미 존재하는 데이터입니다.';
  }
  // 외래키 제약
  if (code === '23503') {
    return '연관된 데이터가 있어 처리할 수 없습니다.';
  }
  // NOT NULL 위반
  if (code === '23502') {
    return '필수 항목이 누락되었습니다.';
  }
  // 네트워크 에러
  if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
    return '네트워크 연결을 확인해주세요.';
  }
  // 인증 관련
  if (code === 'PGRST301' || message.includes('JWT')) {
    return '인증이 만료되었습니다. 다시 로그인해주세요.';
  }

  return '처리 중 오류가 발생했습니다. 다시 시도해주세요.';
}
