/** SEC-C-4: 403 접근 거부 페이지 */
import { Button } from "@/components/ui/button";
import { ShieldX, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="text-center space-y-4 max-w-md">
        <ShieldX className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">
          이 페이지에 접근할 권한이 없습니다. 관리자에게 필요한 권한을 요청해주세요.
        </p>
        <Button onClick={() => navigate("/")} className="gap-2">
          <Home className="h-4 w-4" />홈으로
        </Button>
      </div>
    </div>
  );
}
