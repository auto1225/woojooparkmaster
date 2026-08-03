/** SEC-7: 보안 준수 보고서 (인쇄용) */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, XCircle, Shield, AlertTriangle } from "lucide-react";
import { SECURITY_CONFIG_LABELS } from "@/types/security";
import { runtimeConfig } from "@/config/runtime-config";

export default function SecurityReport() {
  const { data: config } = useSystemConfig();

  const { data: secConfigs, error: secConfigError } = useQuery({
    queryKey: ['sec-report-configs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('system_config').select('*').like('config_key', 'security_%');
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach((r: any) => { map[r.config_key] = r.config_value; });
      return map;
    },
  });

  const { data: userStats, error: userStatsError } = useQuery({
    queryKey: ['sec-report-users'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from('profiles').select('id, role, last_login_at, password_expires_at, is_active');
      if (error) throw error;
      const all = profiles || [];
      const active = all.filter((p: any) => p.is_active !== false);
      const inactive = all.filter((p: any) => {
        if (!p.last_login_at) return true;
        return (Date.now() - new Date(p.last_login_at).getTime()) > 30 * 86400000;
      });
      const roles = { admin: 0, manager: 0, editor: 0, viewer: 0 };
      all.forEach((p: any) => { if (p.role && roles[p.role as keyof typeof roles] !== undefined) roles[p.role as keyof typeof roles]++; });
      const pwExpired = all.filter((p: any) => p.password_expires_at && new Date(p.password_expires_at) < new Date());
      return { total: all.length, active: active.length, inactive: inactive.length, roles, pwExpired: pwExpired.length };
    },
  });

  const { data: eventStats, error: eventStatsError } = useQuery({
    queryKey: ['sec-report-events'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const totalResult = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo);
      const loginResult = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'auth_login_failed').gte('created_at', thirtyDaysAgo);
      const lockedResult = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'auth_locked').gte('created_at', thirtyDaysAgo);
      const piiResult = await (supabase.from('pii_access_logs') as any)
        .select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo);
      const exportResult = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'data_export').gte('created_at', thirtyDaysAgo);
      const failed = [totalResult, loginResult, lockedResult, piiResult, exportResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      return { totalEvents: totalResult.count || 0, loginFails: loginResult.count || 0, lockedCount: lockedResult.count || 0, piiAccess: piiResult.count || 0, dataExports: exportResult.count || 0 };
    },
  });

  // Security score (simplified)
  const scoreChecks = secConfigs ? [
    window.location.protocol === 'https:',
    true, // The current application validator enforces at least eight characters.
    secConfigs.security_pii_masking_enabled === 'true',
    parseInt(secConfigs.security_session_timeout_minutes || '0') > 0,
    (userStats?.inactive || 0) === 0,
  ] : [];
  const score = scoreChecks.length ? Math.round(scoreChecks.filter(Boolean).length / scoreChecks.length * 100) : 0;

  const recommendations: string[] = [];
  if (secConfigs) {
    if (secConfigs.security_password_expiry_days === '0') recommendations.push('비밀번호 유효기간이 설정되지 않았습니다. 90일 이내 설정을 권장합니다.');
    recommendations.push('IP 제한과 2단계 인증은 화면 정책값만으로 강제되지 않습니다. 운영 방화벽과 인증 서버 적용 결과를 별도 증빙으로 확인하세요.');
    if (secConfigs.security_export_requires_approval !== 'true') recommendations.push('데이터 내보내기 승인 절차가 없습니다. 중요 데이터 반출 시 승인을 권장합니다.');
  }

  const now = new Date();
  const reportPeriod = `${now.getFullYear()}년 ${Math.ceil((now.getMonth() + 1) / 3)}분기`;
  const hasQueryError = Boolean(secConfigError || userStatsError || eventStatsError);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-bold flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />보안 준수 보고서</h1>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={hasQueryError}>
            <Printer className="h-4 w-4 mr-1" />인쇄
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />이 보고서는 애플리케이션에서 확인 가능한 설정과 로그의 자체 점검 자료입니다. 방화벽, 망 분리, 저장 암호화, 보안 헤더는 운영 인프라 증빙 없이는 ‘확인되지 않음’으로 판단해야 합니다.
        </div>
        {hasQueryError && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">일부 보안 자료 조회에 실패하여 이 보고서를 공식 증빙으로 사용할 수 없습니다.</div>}

        {/* 표지 */}
        <Card className="print:shadow-none print:border">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{config?.org_name || '기관명'}</p>
            <h2 className="text-xl font-bold">ParkMaster 정보보안 자체 점검 보고서</h2>
            <p className="text-sm text-muted-foreground">보고 기간: {reportPeriod}</p>
            <p className="text-xs text-muted-foreground">작성일: {now.toLocaleDateString('ko-KR')} | 작성: ParkMaster 시스템</p>
          </CardContent>
        </Card>

        {/* 1. 시스템 보안 현황 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">1. 시스템 보안 현황</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <p className="font-medium mb-2">1-1. 확인 가능한 실행 환경</p>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>배포 모드: {runtimeConfig.deploymentMode === 'on_premises' ? '온프레미스 설정' : '개발·검증 설정'}</div>
                <div>데이터 저장 위치: 운영 인프라 확인 필요</div>
                <div>전송 구간: {window.location.protocol === 'https:' ? 'HTTPS 확인' : 'HTTPS 미확인'}</div>
                <div>저장 암호화: 운영 인프라 확인 필요</div>
                <div>인증: Supabase Auth</div>
                <div>접근제어: 애플리케이션 역할·RLS 정책 구성, 전수검증 필요</div>
              </div>
            </div>
            <Separator />
            <div>
              <p className="font-medium mb-2">1-2. 보안 설정 현황</p>
              <div className="grid grid-cols-2 gap-1">
                {secConfigs && Object.entries(secConfigs).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{SECURITY_CONFIG_LABELS[k] || k}:</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <p className="font-medium mb-1">1-3. 확인 가능한 설정 점수: <span className="text-primary font-bold">{score}/100</span></p>
            </div>
          </CardContent>
        </Card>

        {/* 2. 사용자 관리 현황 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">2. 사용자 관리 현황</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>전체 계정: <strong>{userStats?.total || 0}개</strong></div>
              <div>활성 계정: <strong>{userStats?.active || 0}개</strong></div>
              <div>미사용 계정 (30일+): <strong>{userStats?.inactive || 0}개</strong></div>
              <div>비밀번호 만료: <strong>{userStats?.pwExpired || 0}개</strong></div>
            </div>
            <div className="flex gap-3 mt-2">
              {userStats?.roles && Object.entries(userStats.roles).map(([r, c]) => (
                <Badge key={r} variant="secondary" className="text-[10px]">{r}: {c}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 3. 접근 통제 현황 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">3. 접근 통제 현황 (최근 30일)</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>총 보안 이벤트: <strong>{eventStats?.totalEvents || 0}건</strong></div>
              <div>로그인 실패: <strong>{eventStats?.loginFails || 0}회</strong></div>
              <div>계정 잠금: <strong>{eventStats?.lockedCount || 0}회</strong></div>
            </div>
          </CardContent>
        </Card>

        {/* 4. 개인정보 보호 현황 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">4. 개인정보 보호 현황 (최근 30일)</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>개인정보 마스킹 설정: <strong>{secConfigs?.security_pii_masking_enabled === 'true' ? '사용' : '미사용'}</strong></div>
              <div>마스킹 해제/접근: <strong>{eventStats?.piiAccess || 0}회</strong></div>
              <div>데이터 내보내기: <strong>{eventStats?.dataExports || 0}회</strong></div>
            </div>
          </CardContent>
        </Card>

        {/* 7. 보안 권고사항 */}
        {recommendations.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">5. 보안 권고 사항</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <XCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
