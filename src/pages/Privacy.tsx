/** SEC-C-7: 개인정보 처리방침 (공개 페이지) */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PrivacyPage() {
  const { data: configList } = useQuery({
    queryKey: ["privacy-config"],
    queryFn: async () => {
      const { data } = await supabase.from("system_config").select("config_key, config_value")
        .in("config_key", [
          "org_name", "privacy_policy_version", "privacy_policy_date",
          "privacy_manager_name", "privacy_manager_dept",
          "privacy_manager_phone", "privacy_manager_email",
        ]);
      const map: Record<string, string> = {};
      data?.forEach(c => { map[c.config_key] = c.config_value; });
      return map;
    },
  });

  const cfg = configList || {};

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold">개인정보 처리방침</h1>
        </div>
        <p className="text-xs text-muted-foreground">시행일: {cfg.privacy_policy_date || '2025-09-01'} | 버전: {cfg.privacy_policy_version || '1.0'}</p>

        <Card>
          <CardHeader><CardTitle className="text-sm">1. 개인정보의 처리 목적</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p><strong>{cfg.org_name || 'ParkMaster'}</strong>는 공영주차장 관리 업무 수행을 위해 최소한의 개인정보를 처리합니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>주차장 민원 처리</li>
              <li>월정기권 관리</li>
              <li>단속 관리</li>
              <li>시스템 사용자 관리</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">2. 처리하는 개인정보 항목</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b"><th className="text-left p-2">업무</th><th className="text-left p-2">수집 항목</th><th className="text-left p-2">보유 기간</th></tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b"><td className="p-2">민원 처리</td><td className="p-2">이름, 전화번호, 이메일</td><td className="p-2">처리 완료 후 3년</td></tr>
                  <tr className="border-b"><td className="p-2">월정기권</td><td className="p-2">이름, 전화번호, 차량번호</td><td className="p-2">이용 종료 후 1년</td></tr>
                  <tr className="border-b"><td className="p-2">단속</td><td className="p-2">차량번호</td><td className="p-2">과태료 완납 후 5년</td></tr>
                  <tr><td className="p-2">시스템 사용</td><td className="p-2">이름, 이메일, 접속 로그</td><td className="p-2">퇴직/탈퇴 후 1년</td></tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">3. 개인정보의 제3자 제공</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>원칙적으로 제3자에게 제공하지 않으며, 법률에 의한 경우에만 제공합니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">4. 개인정보 처리의 위탁</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>원칙적으로 위탁하지 않으며, 위탁 시 별도 공지합니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">5. 정보주체의 권리·의무 및 행사 방법</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>정보주체는 다음의 권리를 행사할 수 있습니다:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>개인정보 열람 청구</li>
              <li>오류 등이 있을 경우 정정 청구</li>
              <li>삭제 청구</li>
              <li>처리정지 청구</li>
            </ul>
            <p>청구 방법: 개인정보 보호책임자에게 서면 또는 이메일로 신청</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">6. 개인정보의 파기</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>보유기간이 만료된 개인정보는 지체없이 파기합니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>전자적 파일: 복구 불가능한 방법으로 영구 삭제</li>
              <li>종이 문서: 파쇄 또는 소각</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">7. 개인정보의 안전성 확보 조치</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1">
              <li>관리적 조치: 내부관리계획 수립·시행, 정기적 직원 교육</li>
              <li>기술적 조치: 개인정보 접근 제한, 비밀번호 암호화, 접근 기록 보관, 보안프로그램 설치</li>
              <li>물리적 조치: 전산실, 자료보관실 등 접근 통제</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">8. 개인정보 보호책임자</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <div>이름: {cfg.privacy_manager_name || '(미설정)'}</div>
              <div>부서: {cfg.privacy_manager_dept || '(미설정)'}</div>
              <div>연락처: {cfg.privacy_manager_phone || '(미설정)'}</div>
              <div>이메일: {cfg.privacy_manager_email || '(미설정)'}</div>
            </div>
            <p className="mt-3 text-xs">※ 개인정보 침해 신고: 한국인터넷진흥원(KISA) 개인정보침해신고센터 (privacy.kisa.or.kr, 국번없이 118)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">9. 처리방침 변경에 관한 사항</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>이 개인정보 처리방침은 {cfg.privacy_policy_date || '2025-09-01'}부터 시행됩니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
