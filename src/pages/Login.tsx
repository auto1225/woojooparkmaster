import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { securePostLogin } from "@/lib/csrf-protection";
import { secureLogin } from "@/lib/auth-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [lockCountdown, setLockCountdown] = useState(0);
  const [failMessage, setFailMessage] = useState("");
  const { signIn } = useAuth();
  const { data: config } = useSystemConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";

  useEffect(() => {
    if (lockCountdown <= 0) return;
    const timer = setInterval(() => {
      setLockCountdown(prev => {
        if (prev <= 1) { setLockMessage(""); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockCountdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockCountdown > 0) return;
    setLoading(true);
    setFailMessage("");

    const result = await secureLogin(email, password, signIn);

    if (!result.success) {
      if (result.locked) {
        const seconds = (result.remainingMinutes || 5) * 60;
        setLockCountdown(seconds);
        setLockMessage(result.error || "계정이 잠겼습니다.");
      } else {
        setFailMessage(result.error || "로그인 실패");
      }
      setLoading(false);
      return;
    }

    // Success
    await securePostLogin();

    if (result.mustChangePassword) {
      navigate("/change-password?reason=expired");
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  const orgName = config?.org_name || "";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(221 83% 53% / 0.08) 0%, hsl(var(--background)) 50%, hsl(221 83% 53% / 0.04) 100%)",
      }}
    >
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <Card className="w-full max-w-[400px] shadow-premium-xl border border-border/60 rounded-2xl relative z-10">
        <CardHeader className="text-center space-y-4 pb-2 pt-10 px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-glow">
            <span className="text-xl font-bold text-white font-display">P</span>
          </div>
          <div>
            <h1 className="text-h2 font-display">
              <span className="font-light">Park</span>
              <span className="font-bold text-primary">Master</span>
            </h1>
            <p className="text-caption text-muted-foreground mt-1.5">공영주차장 통합관리 플랫폼</p>
            {orgName && (
              <span className="inline-block mt-3 text-[10px] font-mono bg-sunken text-muted-foreground px-2.5 py-1 rounded-full">
                {orgName}
              </span>
            )}
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 px-10 pt-4">
            {isExpired && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 text-center border border-destructive/20">
                세션이 만료되었습니다. 다시 로그인해주세요.
              </div>
            )}
            {lockMessage && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 text-center border border-destructive/20">
                {lockMessage}
                {lockCountdown > 0 && (
                  <div className="mt-1.5 font-mono text-sm font-semibold">
                    {Math.floor(lockCountdown / 60)}:{(lockCountdown % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </div>
            )}
            {failMessage && !lockMessage && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 text-center border border-destructive/20">
                {failMessage}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[13px] font-medium">이메일</Label>
              <Input id="email" type="email" placeholder="admin@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required className="h-11 rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[13px] font-medium">비밀번호</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 pr-10 rounded-lg" />
                <Button type="button" variant="ghost" size="icon"
                  className="absolute right-0 top-0 h-full w-10 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-6 px-10 pb-10 pt-2">
            <Button type="submit" className="w-full h-11 text-sm font-semibold rounded-lg shadow-premium-sm hover:shadow-glow transition-all active:scale-[0.98]"
              disabled={loading || lockCountdown > 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              로그인
            </Button>
            <div className="flex items-center justify-between w-full">
              <Link to="/forgot-password" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                비밀번호를 잊으셨나요?
              </Link>
              <Link to="/privacy" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                개인정보 처리방침
              </Link>
            </div>
            <p className="text-[10px] text-muted-foreground/50 font-mono">우주주차 (WoojooJoocha)</p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
