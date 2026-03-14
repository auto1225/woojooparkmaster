import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBusinessNumber, validateBusinessNumber } from "@/lib/validators";
import { CheckCircle, XCircle } from "lucide-react";

interface BusinessNumberInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string) => void;
}

export function BusinessNumberInput({ value = "", onChange, className, ...props }: BusinessNumberInputProps) {
  const raw = value.replace(/[^0-9]/g, "");
  const isComplete = raw.length === 10;
  const isValid = isComplete && validateBusinessNumber(raw);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
    onChange?.(formatBusinessNumber(digits));
  };

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={props.placeholder ?? "123-45-67890"}
        className={cn(
          "pr-8",
          isComplete && !isValid && "border-destructive focus-visible:ring-destructive",
          isComplete && isValid && "border-green-500 focus-visible:ring-green-500",
          className
        )}
        maxLength={12}
      />
      {isComplete && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {isValid ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      )}
      {isComplete && !isValid && (
        <p className="text-[10px] text-destructive mt-1">올바르지 않은 사업자등록번호입니다</p>
      )}
    </div>
  );
}
