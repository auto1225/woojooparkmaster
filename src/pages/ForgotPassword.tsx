/** SEC-C-3: 비밀번호 분실 안내 (폐쇄망 정책: 관리자 수동 초기화) */
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(221 83% 53% / 0.08) 0%, hsl(var(--background)) 50%, hsl(221 83% 53% / 0.04) 100%)" }}>
      <Card className="w-full max-w-[440px] shadow-premium-xl border border-border/60 rounded-2xl">
        <CardHeader className="text-center space-y-4 pb-2 pt-10 px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-glow">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">비밀번호 분실 안내</h1>
            <p className="text-xs text-muted-foreground mt-1">
              부서 내부망 운영 정책상 자동 재설정은 지원되지 않습니다.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-10 pt-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs p-4 border border-amber-200 dark:border-amber-800 leading-relaxed">
            <p className="font-medium mb-2">비밀번호를 잊으셨나요?</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>시스템 관리자에게 비밀번호 초기화를 요청하세요.</li>
              <li>임시 비밀번호를 발급받습니다.</li>
              <li>임시 비밀번호로 로그인 후 첫 화면에서 새 비밀번호를 설정합니다.</li>
            </ol>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed pt-1">
            <p className="font-medium">관리자 연락처</p>
            <p>(부서 IT 담당자에게 문의)</p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center px-10 pb-10 pt-2">
          <Link to="/login" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />로그인으로 돌아가기
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
