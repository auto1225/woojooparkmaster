import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { data: config } = useSystemConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({ title: "로그인 실패", description: "이메일 또는 비밀번호가 올바르지 않습니다.", variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const orgName = config?.org_name || "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-accent/5 to-background p-4">
      <Card className="w-full max-w-sm shadow-lg border">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground font-mono">P</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ParkMaster</h1>
            <p className="text-xs text-muted-foreground mt-1">공영주차장 통합관리 플랫폼</p>
            {orgName && (
              <span className="inline-block mt-2 text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                {orgName}
              </span>
            )}
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {isExpired && (
              <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3 text-center">
                세션이 만료되었습니다. 다시 로그인해주세요.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">이메일</Label>
              <Input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs">비밀번호</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              로그인
            </Button>
            <p className="text-[10px] text-muted-foreground">우주주차 (WoojooJoocha)</p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
