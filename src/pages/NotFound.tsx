import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center space-y-4">
        <h1 className="text-8xl font-bold text-muted-foreground/30">404</h1>
        <h2 className="text-xl font-semibold">페이지를 찾을 수 없습니다</h2>
        <p className="text-sm text-muted-foreground">
          주소를 확인하시거나, 아래 버튼을 눌러 이동하세요.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={() => navigate("/")}>홈으로</Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> 이전 페이지
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
