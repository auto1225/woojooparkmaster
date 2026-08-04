import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Printer } from "lucide-react";

interface CheckItem { label: string; passed: boolean; }

export default function DeliveryChecklist() {
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('delivery-checklist') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('delivery-checklist', JSON.stringify(manualChecks));
  }, [manualChecks]);

  const { data: autoChecks = [], isLoading } = useQuery({
    queryKey: ['delivery-auto-checks'],
    queryFn: async () => {
      const checks: CheckItem[] = [];

      // 기본 설정
      const { data: config } = await supabase.from('system_config').select('config_key, config_value');
      const cfgMap: Record<string, string> = {};
      config?.forEach(c => { cfgMap[c.config_key] = c.config_value; });
      checks.push({ label: 'system_config에 org_name 설정됨', passed: !!cfgMap['org_name'] });
      checks.push({ label: 'system_config에 map_center_lat/lng 설정됨', passed: !!cfgMap['map_center_lat'] && !!cfgMap['map_center_lng'] });

      // 사용자
      const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      checks.push({ label: '사용자 2명 이상 등록됨', passed: (profileCount || 0) >= 2 });

      // 관리자
      const { count: adminCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
      checks.push({ label: '관리자 계정 1개 이상 존재', passed: (adminCount || 0) >= 1 });

      // 모듈
      const { data: modules } = await supabase.from('module_licenses').select('module_code, is_active');
      const coreActive = modules?.find(m => m.module_code === 'CORE');
      checks.push({ label: 'CORE 모듈 활성화', passed: !!coreActive?.is_active });
      const activeCount = modules?.filter(m => m.is_active).length || 0;
      checks.push({ label: `활성화 모듈 ${activeCount}개 확인`, passed: activeCount >= 1 });

      // 데이터
      const { count: lotCount } = await supabase.from('parking_lots').select('*', { count: 'exact', head: true });
      checks.push({ label: 'parking_lots에 1건 이상 데이터 존재', passed: (lotCount || 0) >= 1 });

      // 코드마스터
      const { count: codeCount } = await supabase.from('code_master').select('*', { count: 'exact', head: true });
      checks.push({ label: 'code_master에 기본 공통코드 존재', passed: (codeCount || 0) >= 1 });

      // 기능 테스트
      const { data: recentLogs } = await supabase.from('activity_logs').select('action').order('created_at', { ascending: false }).limit(10);
      const hasLogin = recentLogs?.some(l => l.action === 'login_success');
      checks.push({ label: '로그인 기록 확인', passed: !!hasLogin });
      const hasCrud = recentLogs?.some(l => ['create', 'update'].includes(l.action));
      checks.push({ label: '데이터 CRUD 작동 확인', passed: !!hasCrud });

      return checks;
    },
  });

  const MANUAL_ITEMS = {
    '교육': ['관리자 교육 완료', '운영팀 교육 완료', '시설팀 교육 완료', '매뉴얼 전달 완료'],
    '인수인계': ['설치 매뉴얼 전달', '관리자 계정 정보 전달', '유지보수 계약 체결', '비상 연락망 교환'],
    '데이터 이관': ['기존 주차장 목록 입력 완료', 'GPS 좌표 입력 완료', '기존 엑셀 데이터 이관 완료'],
  };

  const autoPassed = autoChecks.filter(c => c.passed).length;
  const autoTotal = autoChecks.length;
  const manualTotal = Object.values(MANUAL_ITEMS).flat().length;
  const manualPassed = Object.values(MANUAL_ITEMS).flat().filter(item => manualChecks[item]).length;
  const allPassed = autoPassed === autoTotal && manualPassed === manualTotal;

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">납품 체크리스트</h1>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />점검 결과 출력
          </Button>
        </div>

        {/* Summary */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-4">
              <Badge className={allPassed ? 'bg-green-500 text-white text-sm px-4 py-1' : 'bg-red-500 text-white text-sm px-4 py-1'}>
                {allPassed ? '✅ 납품 준비 완료' : `❌ ${(autoTotal - autoPassed) + (manualTotal - manualPassed)}건 미완료`}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">자동 점검: {autoPassed}/{autoTotal}</p>
                <Progress value={autoTotal > 0 ? (autoPassed / autoTotal) * 100 : 0} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">수동 점검: {manualPassed}/{manualTotal}</p>
                <Progress value={manualTotal > 0 ? (manualPassed / manualTotal) * 100 : 0} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auto checks */}
        <Card>
          <CardHeader><CardTitle className="text-sm">자동 점검 항목</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <p className="text-sm text-muted-foreground">점검 중...</p> :
              autoChecks.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {c.passed ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                  <span className={c.passed ? '' : 'text-red-600 font-medium'}>{c.label}</span>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Manual checks */}
        {Object.entries(MANUAL_ITEMS).map(([category, items]) => (
          <Card key={category}>
            <CardHeader><CardTitle className="text-sm">{category}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {items.map(item => (
                <div key={item} className="flex items-center gap-2">
                  <Checkbox
                    checked={!!manualChecks[item]}
                    onCheckedChange={v => setManualChecks(prev => ({ ...prev, [item]: !!v }))}
                  />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
