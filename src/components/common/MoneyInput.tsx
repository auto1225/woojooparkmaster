import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAmountDescription } from "@/lib/validators";

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: number;
  onChange?: (value: number) => void;
  showDescription?: boolean;
}

export function MoneyInput({ value, onChange, showDescription = true, className, ...props }: MoneyInputProps) {
  const [display, setDisplay] = React.useState(() =>
    value != null && value > 0 ? value.toLocaleString("ko-KR") : ""
  );

  React.useEffect(() => {
    if (value != null && value > 0) {
      setDisplay(value.toLocaleString("ko-KR"));
    } else if (value === 0 || value == null) {
      // don't overwrite user typing
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    if (raw === "") {
      setDisplay("");
      onChange?.(0);
      return;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num)) return;
    setDisplay(num.toLocaleString("ko-KR"));
    onChange?.(num);
  };

  const numValue = value ?? 0;

  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          className={cn("pr-8 text-right", className)}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          원
        </span>
      </div>
      {showDescription && numValue > 0 && (
        <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
          = {formatAmountDescription(numValue)}
        </p>
      )}
    </div>
  );
}
