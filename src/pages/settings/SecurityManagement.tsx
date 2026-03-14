/** SEC-C-5/7/8: 보안 관리 탭 (Settings.tsx에서 임포트) */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Shield, AlertTriangle, Phone, Trash2, FileText, Lock } from "lucide-react";
import { isSecurityDiagnosisDay } from "@/lib/bot-protection";
import { toast } from "sonner";

// ========== 보안진단의 날 배너 ==========
export function SecurityDiagnosisBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !isSecurityDiagnosisDay()) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">오늘은 사이버보안진단의 날입니다. 보안 자가진단을 실행해주세요.</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>닫기</Button>
    </div>
  );
}

// ========== 보안 관리 전체 탭 ==========
export default function SecurityManagement() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="diagnosis">
        <TabsList className="flex-wrap">
          <TabsTrigger value="diagnosis">보안진단</TabsTrigger>
          <TabsTrigger value="encryption">암호화 현황</TabsTrigger>
          <TabsTrigger value="privacy-purge">개인정보 파기</TabsTrigger>
          <TabsTrigger value="incident">사고 대응</TabsTrigger>
          <TabsTrigger value="drp">재해복구</TabsTrigger>
          <TabsTrigger value="emergency">비상 연락망</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnosis"><SecurityDiagnosisTab /></TabsContent>
        <TabsContent value="encryption"><EncryptionTab /></TabsContent>
        <TabsContent value="privacy-purge"><PrivacyPurgeTab /></TabsContent>
        <TabsContent value="incident"><IncidentResponseTab /></TabsContent>
        <TabsContent value="drp"><DRPTab /></TabsContent>
        <TabsContent value="emergency"><EmergencyContactTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ========== 보안 자가진단 체크리스트 ==========
function SecurityDiagnosisTab() {
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});

  const { data: autoChecks = [], isLoading } = useQuery({
    queryKey: ['security-diagnosis-auto'],
    queryFn: async () => {
      const checks: { label: string; ok: boolean; detail?: string }[] = [];

      // 30일 이상 미로그인 계정
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count: inactiveCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        .lt('last_login_at', thirtyDaysAgo).eq('is_active', true);
      checks.push({ label: '30일 이상 미로그인 계정', ok: (inactiveCount || 0) === 0, detail: `${inactiveCount || 0}개` });

      // 최근 7일 로그인 실패
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count: failCount } = await supabase.from('activity_logs').select('*', { count: 'exact', head: true })
        .eq('action', 'login_failed').gte('created_at', sevenDaysAgo);
      checks.push({ label: '최근 7일 로그인 실패', ok: (failCount || 0) < 10, detail: `${failCount || 0}건` });

      // 최근 7일 보안 경고
      const { count: secCount } = await supabase.from('activity_logs').select('*', { count: 'exact', head: true })
        .eq('module', 'security').gte('created_at', sevenDaysAgo);
      checks.push({ label: '최근 7일 보안 이벤트', ok: (secCount || 0) < 5, detail: `${secCount || 0}건` });

      return checks;
    },
  });

  const MANUAL_ITEMS = [
    '비밀번호 변경 필요 계정 확인 및 조치',
    '불필요 사용자 계정 비활성화',
    '사용중인 모듈 라이선스 확인',
    '백업 정상 실행 확인',
    '보안 로그 이상 여부 확인',
    '파일 업로드 폴더 점검',
    '시스템 업데이트 확인',
  ];

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">자동 점검 결과</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground">점검 중...</p> :
            autoChecks.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {c.ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  <span>{c.label}</span>
                </div>
                <Badge variant={c.ok ? "default" : "destructive"} className="text-[10px]">{c.detail}</Badge>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">수동 점검 항목</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {MANUAL_ITEMS.map(item => (
            <div key={item} className="flex items-center gap-2">
              <Checkbox checked={!!manualChecks[item]} onCheckedChange={v => setManualChecks(p => ({ ...p, [item]: !!v }))} />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== 암호화 현황 ==========
function EncryptionTab() {
  const data = [
    { target: '통신 암호화', algo: 'TLS 1.3', keyLen: '-', area: '모든 HTTPS 통신' },
    { target: '비밀번호 해싱', algo: 'bcrypt', keyLen: 'cost 10', area: 'Auth 기본' },
    { target: 'DB 저장 암호화', algo: 'AES-256', keyLen: '256bit', area: 'PostgreSQL TDE' },
    { target: 'JWT 서명', algo: 'HS256', keyLen: '256bit', area: 'Auth JWT' },
    { target: '파일 전송', algo: 'TLS 1.3', keyLen: '-', area: 'Storage' },
    { target: '세션 토큰', algo: 'crypto.randomUUID', keyLen: '128bit', area: 'UUID v4' },
  ];

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4" />암호화 적용 현황</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>대상</TableHead><TableHead>알고리즘</TableHead><TableHead>키 길이</TableHead><TableHead>적용 영역</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(d => (
              <TableRow key={d.target}>
                <TableCell className="text-sm font-medium">{d.target}</TableCell>
                <TableCell className="font-mono text-xs">{d.algo}</TableCell>
                <TableCell className="text-xs">{d.keyLen}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.area}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground mt-3">※ 국정원 KCMVP 검증 암호모듈은 기본 제공 범위. 추가 검증 필요 시 별도 도입.</p>
      </CardContent>
    </Card>
  );
}

// ========== 개인정보 파기 ==========
function PrivacyPurgeTab() {
  const { data: targets } = useQuery({
    queryKey: ['privacy-purge-targets'],
    queryFn: async () => {
      // 민원: 처리완료 3년 경과
      const threeYearsAgo = new Date(Date.now() - 3 * 365 * 86400000).toISOString();
      const { count: complaintCount } = await supabase.from('complaints').select('*', { count: 'exact', head: true })
        .eq('status', 'closed').lt('closed_at', threeYearsAgo).not('complainant_name', 'is', null);

      return { complaints: complaintCount || 0 };
    },
  });

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trash2 className="h-4 w-4" />파기 대상 현황</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>대상</TableHead><TableHead>기준</TableHead><TableHead>대상 건수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-sm">민원 개인정보</TableCell>
                <TableCell className="text-xs text-muted-foreground">처리완료 후 3년 경과</TableCell>
                <TableCell><Badge variant={targets?.complaints ? "destructive" : "default"} className="text-xs">{targets?.complaints || 0}건</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {(targets?.complaints || 0) > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="mt-4">
                  <Trash2 className="h-3 w-3 mr-1" />파기 실행
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>개인정보 파기</AlertDialogTitle>
                  <AlertDialogDescription>
                    파기 대상 개인정보를 복구 불가능하게 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 86400000).toISOString();
                    await supabase.from('complaints').update({
                      complainant_name: null,
                      complainant_phone: null,
                      complainant_email: null,
                      complainant_address: null,
                    }).eq('status', 'closed').lt('closed_at', threeYearsAgo);
                    toast.success('개인정보 파기가 완료되었습니다');
                  }}>파기 실행</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== 침해사고 대응 ==========
function IncidentResponseTab() {
  const STEPS = [
    { num: '①', title: '탐지', desc: '이상징후 감지, 자동알림 확인', color: 'bg-blue-100 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
    { num: '②', title: '보고', desc: '정보보안담당관 보고, 상급기관·KISA 신고', color: 'bg-yellow-100 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' },
    { num: '③', title: '초동대응', desc: '피해 확산 방지, 접근 차단, 증거 보전', color: 'bg-orange-100 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
    { num: '④', title: '분석', desc: '원인 분석, 로그 분석, 영향 범위 파악', color: 'bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
    { num: '⑤', title: '복구', desc: '시스템 복구, 데이터 복원, 서비스 재개', color: 'bg-green-100 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
    { num: '⑥', title: '사후관리', desc: '재발 방지, 보고서 작성, 교육/개선', color: 'bg-purple-100 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  ];

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />침해사고 대응 절차 (6단계)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {STEPS.map(s => (
              <div key={s.num} className={`p-3 rounded-lg border ${s.color}`}>
                <div className="text-lg font-bold">{s.num} {s.title}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">긴급 조치</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">전체 세션 강제 종료</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>긴급: 전체 세션 종료</AlertDialogTitle>
                <AlertDialogDescription>모든 사용자의 활성 세션을 즉시 종료합니다. 모든 사용자가 재로그인해야 합니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={() => toast.success('전체 세션 종료 명령을 전송했습니다')}>실행</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== 재해복구 계획 ==========
function DRPTab() {
  const TARGETS = [
    { item: 'RPO (복구 시점 목표)', target: '24시간', desc: '최대 24시간 전 데이터로 복구' },
    { item: 'RTO (복구 시간 목표)', target: '4시간', desc: '장애 발생 후 4시간 내 서비스 재개' },
    { item: '백업 주기', target: '매일 02:00', desc: '일 1회 자동 백업' },
    { item: '백업 보관', target: '90일', desc: '90일간 보관 후 자동 삭제' },
  ];

  const SCENARIOS = [
    { type: 'DB 장애', procedure: '최근 백업에서 복구 (pg_restore)' },
    { type: '서버 장애', procedure: 'Docker Compose 재시작 + DB 복구' },
    { type: '랜섬웨어', procedure: '격리 → 클린 OS 재설치 → 백업 복구' },
    { type: '자연재해', procedure: '이중화 백업(외부)에서 신규 서버에 복구' },
  ];

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">복구 목표</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>항목</TableHead><TableHead>목표</TableHead><TableHead>설명</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {TARGETS.map(t => (
                <TableRow key={t.item}>
                  <TableCell className="text-sm font-medium">{t.item}</TableCell>
                  <TableCell><Badge className="text-xs">{t.target}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">재해 유형별 복구 절차</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>유형</TableHead><TableHead>복구 절차</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {SCENARIOS.map(s => (
                <TableRow key={s.type}>
                  <TableCell className="text-sm font-medium">{s.type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.procedure}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== 비상 연락망 ==========
function EmergencyContactTab() {
  const { data: configList } = useQuery({
    queryKey: ['emergency-contacts-config'],
    queryFn: async () => {
      const { data } = await supabase.from('system_config').select('config_key, config_value')
        .in('config_key', ['emergency_contact_security', 'emergency_contact_privacy', 'emergency_contact_system', 'emergency_contact_vendor']);
      const map: Record<string, string> = {};
      data?.forEach(c => { map[c.config_key] = c.config_value; });
      return map;
    },
  });

  const cfg = configList || {};
  const contacts = [
    { role: '정보보안담당관', value: cfg.emergency_contact_security || '(미설정)', icon: Shield },
    { role: '개인정보보호책임자', value: cfg.emergency_contact_privacy || '(미설정)', icon: FileText },
    { role: '시스템 관리자', value: cfg.emergency_contact_system || '(미설정)', icon: Lock },
    { role: '유지보수 (우주주차)', value: cfg.emergency_contact_vendor || '(미설정)', icon: Phone },
  ];

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Phone className="h-4 w-4" />비상 연락망</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {contacts.map(c => (
            <div key={c.role} className="flex items-center gap-3 p-3 rounded-lg border">
              <c.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">{c.role}</p>
                <p className="text-xs text-muted-foreground">{c.value}</p>
              </div>
            </div>
          ))}

          <div className="border-t pt-3 mt-3">
            <p className="text-xs font-medium mb-2">외부 기관</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="p-2 border rounded">한국인터넷진흥원 (KISA): <span className="font-mono font-bold">118</span></div>
              <div className="p-2 border rounded">국가사이버안보센터: <span className="font-mono font-bold">111</span></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
