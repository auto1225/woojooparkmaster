/** SEC-7: 보안 준수 보고서 (인쇄용) */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, CheckCircle2, XCircle, Shield } from "lucide-react";
import { SECURITY_CONFIG_LABELS } from "@/types/security";

export default function SecurityReport() {
  const { data: config } = useSystemConfig();

  const { data: secConfigs } = useQuery({
    queryKey: ['sec-report-configs'],
    queryFn: async () => {
      const { data } = await supabase.from('system_config').select('*').like('config_key', 'security_%');
      const map: Record<string, string> = {};
      data?.forEach((r: any) => { map[r.config_key] = r.config_value; });
      return map;
    },
  });

  const { data: userStats } = useQuery({
    queryKey: ['sec-report-users'],
    queryFn: async () => {
      const { data: profiles } = await supabase.from('profiles').select('id, role, last_login_at, password_expires_at, is_active');
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

  const { data: eventStats } = useQuery({
    queryKey: ['sec-report-events'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count: totalEvents } = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo);
      const { count: loginFails } = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'auth_login_failed').gte('created_at', thirtyDaysAgo);
      const { count: lockedCount } = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'auth_locked').gte('created_at', thirtyDaysAgo);
      const { count: piiAccess } = await (supabase.from('pii_access_logs') as any)
        .select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo);
      const { count: dataExports } = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'data_export').gte('created_at', thirtyDaysAgo);
      return { totalEvents: totalEvents || 0, loginFails: loginFails || 0, lockedCount: lockedCount || 0, piiAccess: piiAccess || 0, dataExports: dataExports || 0 };
    },
  });

  // Security score (simplified)
  let score = 0;
  if (secConfigs) {
    if (window.location.protocol === 'https:') score += 15;
    if (parseInt(secConfigs.security_password_min_length || '0') >= 8) score += 15;
    if (secConfigs.security_pii_masking_enabled === 'true') score += 10;
    score += 10;
    if (parseInt(secConfigs.security_session_timeout_minutes || '0') > 0) score += 10;
    if (parseInt(secConfigs.security_max_login_attempts || '0') > 0) score += 10;
    score += 10 + 10 + 5;
    if (secConfigs.security_ip_whitelist_enabled === 'true') score += 5;
  }

  const recommendations: string[] = [];
  if (secConfigs) {
    if (secConfigs.security_password_expiry_days === '0') recommendations.push('비밀번호 유효기간이 설정되지 않았습니다. 90일 이내 설정을 권장합니다.');
    if (secConfigs.security_ip_whitelist_enabled !== 'true') recommendations.push('IP 화이트리스트가 비활성화되어 있습니다. 내부망 IP만 허용하는 것을 권장합니다.');
    if (secConfigs.security_2fa_enabled !== 'true') recommendations.push('2단계 인증이 비활성화되어 있습니다. 관리자 계정에 2FA 적용을 권장합니다.');
    if (secConfigs.security_export_requires_approval !== 'true') recommendations.push('데이터 내보내기 승인 절차가 없습니다. 중요 데이터 반출 시 승인을 권장합니다.');
  }

  const now = new Date();
  const reportPeriod = `${now.getFullYear()}년 ${Math.ceil(now.getMonth() / 3) || 4}분기`;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-bold flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />보안 준수 보고서</h1>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />인쇄
          </Button>
        </div>

        {/* 표지 */}
        <Card className="print:shadow-none print:border">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{config?.org_name || '기관명'}</p>
            <h2 className="text-xl font-bold">ParkMaster™ 정보보안 준수 현황 보고서</h2>
            <p className="text-sm text-muted-foreground">보고 기간: {reportPeriod}</p>
            <p className="text-xs text-muted-foreground">작성일: {now.toLocaleDateString('ko-KR')} | 작성: ParkMaster™ 시스템</p>
          </CardContent>
        </Card>

        {/* 1. 시스템 보안 현황 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">1. 시스템 보안 현황</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <p className="font-medium mb-2">1-1. 보안 아키텍처</p>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>배포 방식: 온프레미스</div>
                <div>데이터 저장: 지자체 내부 서버</div>
                <div>암호화: TLS 1.3 + AES-256</div>
                <div>인증: JWT 기반</div>
                <div>접근제어: RBAC + RLS</div>
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
              <p className="font-medium mb-1">1-3. 보안 점수: <span className="text-primary font-bold">{score}/100</span></p>
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
              <div>개인정보 마스킹: <strong>{secConfigs?.security_pii_masking_enabled === 'true' ? '✅ 적용' : '❌ 미적용'}</strong></div>
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
