import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VEHICLE_NUMBER_REGEX } from "@/lib/validators";
import { CheckCircle, XCircle } from "lucide-react";

interface VehicleNumberInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string) => void;
}

export function VehicleNumberInput({ value = "", onChange, className, ...props }: VehicleNumberInputProps) {
  const trimmed = value.trim();
  const isComplete = trimmed.length >= 7;
  const isValid = VEHICLE_NUMBER_REGEX.test(trimmed);

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={props.placeholder ?? "12가3456"}
        className={cn(
          "pr-8",
          isComplete && !isValid && "border-destructive focus-visible:ring-destructive",
          isComplete && isValid && "border-green-500 focus-visible:ring-green-500",
          className
        )}
        maxLength={9}
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
        <p className="text-[10px] text-destructive mt-1">올바른 차량번호 형식이 아닙니다 (예: 12가3456)</p>
      )}
    </div>
  );
}
