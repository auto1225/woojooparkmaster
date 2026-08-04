/** SEC-C-3: 비밀번호 재설정 (자체 인증 모델: 미지원 안내) */
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(221 83% 53% / 0.08) 0%, hsl(var(--background)) 50%, hsl(221 83% 53% / 0.04) 100%)" }}>
      <Card className="w-full max-w-[440px] shadow-premium-xl border border-border/60 rounded-2xl">
        <CardHeader className="text-center space-y-4 pb-2 pt-10 px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-glow">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">이 페이지는 사용하지 않습니다</h1>
            <p className="text-xs text-muted-foreground mt-1">
              자동 재설정 링크 방식은 지원되지 않습니다.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-10 pt-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 text-xs p-4 border border-blue-200 dark:border-blue-800 leading-relaxed">
            비밀번호 변경은 <strong>로그인 후 → 내 정보</strong>에서 가능합니다.
            잊으신 경우 시스템 관리자에게 초기화를 요청해주세요.
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
