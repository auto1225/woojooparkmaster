/** SEC-C-3: 비밀번호 재설정 완료 페이지 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Lock, Loader2, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { logSecurityEvent } from "@/lib/security-logger";
import { validatePassword } from "@/lib/password-policy";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const checks = validatePassword(password);
  const allPassed = checks.every(c => c.passed);
  const passwordMatch = password === confirm && password.length > 0;
  const canSubmit = allPassed && passwordMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // 비밀번호 변경 후 프로필 갱신
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({
          password_changed_at: new Date().toISOString(),
          login_fail_count: 0,
          locked_until: null,
        } as any).eq("id", user.id);
      }

      await logSecurityEvent('password_reset_completed', 'warning');
      toast({ title: "비밀번호가 변경되었습니다", description: "다시 로그인해주세요." });

      await supabase.auth.signOut();
      navigate("/login");
    } catch (e: any) {
      toast({ title: "변경 실패", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(221 83% 53% / 0.08) 0%, hsl(var(--background)) 50%, hsl(221 83% 53% / 0.04) 100%)" }}>
      <Card className="w-full max-w-[400px] shadow-premium-xl border border-border/60 rounded-2xl">
        <CardHeader className="text-center space-y-4 pb-2 pt-10 px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-glow">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">새 비밀번호 설정</h1>
            <p className="text-xs text-muted-foreground mt-1">비밀번호 정책에 맞는 새 비밀번호를 입력해주세요.</p>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 px-10 pt-4">
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">새 비밀번호</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required className="h-11 rounded-lg" placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">비밀번호 확인</Label>
              <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required className="h-11 rounded-lg" placeholder="••••••••" />
            </div>
            {/* 비밀번호 강도 표시 */}
            {password.length > 0 && (
              <div className="space-y-1.5 p-3 bg-muted/50 rounded-lg">
                <p className="text-[11px] font-medium text-muted-foreground">비밀번호 정책</p>
                {validation.checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    {c.passed ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-red-400" />}
                    <span className={c.passed ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>{c.label}</span>
                  </div>
                ))}
                {confirm.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {passwordMatch ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-red-400" />}
                    <span className={passwordMatch ? "text-green-600 dark:text-green-400" : "text-red-500"}>비밀번호 일치</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="px-10 pb-10 pt-2">
            <Button type="submit" className="w-full h-11 text-sm font-semibold rounded-lg" disabled={!canSubmit || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              비밀번호 변경
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
