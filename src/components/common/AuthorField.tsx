import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPen } from "lucide-react";

interface AuthorFieldProps {
  value: string;
  onChange: (name: string) => void;
  label?: string;
  readOnly?: boolean;
}

export function AuthorField({ value, onChange, label = "작성자", readOnly }: AuthorFieldProps) {
  const { profile } = useAuth();

  useEffect(() => {
    if (!value && profile?.name) {
      onChange(profile.name);
    }
  }, [profile?.name]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">
        <UserPen className="h-3 w-3" />
        {label}
      </Label>
      <Input
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        disabled={readOnly}
        placeholder={profile?.name || "작성자 입력"}
        className="h-9"
      />
      {value && profile?.name && value !== profile.name && (
        <p className="text-[10px] text-muted-foreground">
          로그인: {profile.name} | 작성자: {value}
        </p>
      )}
    </div>
  );
}
