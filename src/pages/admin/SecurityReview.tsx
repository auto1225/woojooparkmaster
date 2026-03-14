/** SEC-C-8: 보안성 검토 체크리스트 (납품용) */
import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface CheckCategory {
  title: string;
  items: string[];
}

const SW_SECURITY_CHECKS: CheckCategory[] = [
  {
    title: '입력 데이터 검증 (11개)',
    items: [
      'SQL 인젝션 방어 (RLS + 매개변수 바인딩)',
      'XSS 방어 (DOMPurify sanitize)',
      '경로 조작 방어 (sanitizePath)',
      '코드 삽입 방어 (eval/new Function 미사용)',
      'HTTP 응답 분할 방어',
      '위험한 파일 업로드 차단 (7단계 검증)',
      '위험한 파일 다운로드 차단 (서명된 URL)',
      'XML 외부 엔티티 공격 방어 (XML 미사용)',
      '신뢰할 수 없는 URL 리다이렉트 차단 (sanitizeURL)',
      '정규표현식 서비스 거부 방어 (ReDoS)',
      '역직렬화 방어 (safeJSONParse)',
    ],
  },
  {
    title: '보안 기능 (10개)',
    items: [
      '적절한 인증 (JWT + Auth)',
      '적절한 인가 (RBAC + RLS + useAuthorization)',
      '비밀번호 안전 저장 (bcrypt)',
      '하드코딩된 비밀정보 없음',
      '충분한 암호화 키 길이 (AES-256)',
      '적절한 난수 생성 (crypto API)',
      '취약한 암호화 알고리즘 미사용',
      '중요 정보 평문 저장 없음',
      '중요 정보 평문 전송 없음 (TLS)',
      '사용자 하드디스크에 중요 정보 저장 없음',
    ],
  },
  {
    title: '에러 처리 (3개)',
    items: [
      '오류 메시지에 시스템 정보 미노출 (sanitizeErrorMessage)',
      '오류 상황 적절한 처리 (ErrorBoundary)',
      '부적절한 예외 처리 없음',
    ],
  },
];

const WEB_SECURITY_CHECKS: string[] = [
  '버퍼 오버플로우 (N/A — React/JS)',
  '포맷스트링 (N/A — React/JS)',
  'LDAP 인젝션 (N/A — LDAP 미사용)',
  '운영체제 명령 실행 방어',
  'SQL 인젝션 방어',
  'SSI 인젝션 (N/A — React SPA)',
  'XPath 인젝션 (N/A — XML 미사용)',
  '디렉터리 인덱싱 차단',
  '정보 누출 방지',
  '악성 콘텐츠 차단',
  'XSS 방어',
  '약한 문자열 강도 방어',
  '불충분한 인증 방어',
  '취약한 패스워드 복구 방어',
  'CSRF 방어',
  '세션 예측 방어',
  '불충분한 인가 방어',
  '불충분한 세션 만료 방어',
  '세션 고정 방어',
  '자동화 공격 방어',
  '프로세스 검증 누락 방어',
  '파일 업로드 검증',
  '파일 다운로드 보안',
  '관리자 페이지 보호',
  '경로 추적 방어',
  '위치 공개 차단',
  '데이터 평문 전송 차단 (HTTPS)',
  '쿠키 변조 방어',
];

export default function SecurityReview() {
  const [swChecks, setSwChecks] = useState<Record<string, 'pass' | 'fail' | 'na'>>({});
  const [webChecks, setWebChecks] = useState<Record<string, 'pass' | 'fail' | 'na'>>({});

  const allSwItems = SW_SECURITY_CHECKS.flatMap(c => c.items);
  const swPassed = allSwItems.filter(i => swChecks[i] === 'pass' || swChecks[i] === 'na').length;
  const webPassed = WEB_SECURITY_CHECKS.filter(i => webChecks[i] === 'pass' || webChecks[i] === 'na').length;

  const StatusToggle = ({ itemKey, checks, setChecks }: { itemKey: string; checks: Record<string, any>; setChecks: any }) => {
    const st = checks[itemKey] || 'unchecked';
    const cycle = () => {
      const next = st === 'unchecked' ? 'pass' : st === 'pass' ? 'fail' : st === 'fail' ? 'na' : 'unchecked';
      setChecks((p: any) => ({ ...p, [itemKey]: next }));
    };
    return (
      <Button variant="ghost" size="sm" className="h-6 w-16 text-[10px]" onClick={cycle}>
        {st === 'pass' && <><CheckCircle2 className="h-3 w-3 text-green-500 mr-1" />통과</>}
        {st === 'fail' && <><XCircle className="h-3 w-3 text-red-500 mr-1" />미통과</>}
        {st === 'na' && <><AlertTriangle className="h-3 w-3 text-yellow-500 mr-1" />N/A</>}
        {st === 'unchecked' && '미점검'}
      </Button>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">보안성 검토 체크리스트</h1>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />결과서 출력
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">SW 개발보안: {swPassed}/{allSwItems.length}</p>
              <Progress value={allSwItems.length > 0 ? (swPassed / allSwItems.length) * 100 : 0} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">웹 취약점: {webPassed}/{WEB_SECURITY_CHECKS.length}</p>
              <Progress value={WEB_SECURITY_CHECKS.length > 0 ? (webPassed / WEB_SECURITY_CHECKS.length) * 100 : 0} />
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="sw">
          <TabsList>
            <TabsTrigger value="sw">SW 개발보안 (행안부 49개 기반)</TabsTrigger>
            <TabsTrigger value="web">웹 취약점 (KISA 28개)</TabsTrigger>
          </TabsList>

          <TabsContent value="sw" className="space-y-4 mt-4">
            {SW_SECURITY_CHECKS.map(cat => (
              <Card key={cat.title}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{cat.title}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {cat.items.map(item => (
                    <div key={item} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span className="text-xs">{item}</span>
                      <StatusToggle itemKey={item} checks={swChecks} setChecks={setSwChecks} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="web" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">KISA 웹 28개 취약점 점검</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {WEB_SECURITY_CHECKS.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span className="text-xs">{i + 1}. {item}</span>
                    <StatusToggle itemKey={item} checks={webChecks} setChecks={setWebChecks} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
