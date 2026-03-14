/** SEC-C-3: 안전한 비밀번호 재설정 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Mail, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { logSecurityEvent } from "@/lib/security-logger";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || !email) return;
    setLoading(true);

    try {
      // 성공/실패 모두 동일 메시지 (계정 존재 미노출)
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      await logSecurityEvent('password_reset_requested', 'warning', { email });
    } catch {
      // 에러도 무시 — 동일 메시지
    }

    setSent(true);
    setLoading(false);
    // 5분 쿨다운
    setCooldown(300);
    const timer = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(221 83% 53% / 0.08) 0%, hsl(var(--background)) 50%, hsl(221 83% 53% / 0.04) 100%)" }}>
      <Card className="w-full max-w-[400px] shadow-premium-xl border border-border/60 rounded-2xl">
        <CardHeader className="text-center space-y-4 pb-2 pt-10 px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-glow">
            <Mail className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">비밀번호 재설정</h1>
            <p className="text-xs text-muted-foreground mt-1">
              가입한 이메일로 재설정 링크를 보내드립니다.
            </p>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 px-10 pt-4">
            {sent ? (
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 text-xs p-4 text-center border border-green-200 dark:border-green-800">
                <p className="font-medium mb-1">메일이 발송되었습니다</p>
                <p>입력하신 이메일로 비밀번호 재설정 안내를 발송했습니다. 이메일을 확인해주세요.</p>
                {cooldown > 0 && (
                  <p className="mt-2 text-muted-foreground">
                    재발송: {Math.floor(cooldown / 60)}:{(cooldown % 60).toString().padStart(2, '0')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] font-medium">이메일</Label>
                <Input id="email" type="email" placeholder="admin@example.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  required className="h-11 rounded-lg" />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 px-10 pb-10 pt-2">
            {!sent && (
              <Button type="submit" className="w-full h-11 text-sm font-semibold rounded-lg"
                disabled={loading || cooldown > 0}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                재설정 링크 발송
              </Button>
            )}
            <Link to="/login" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />로그인으로 돌아가기
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
