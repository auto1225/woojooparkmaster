import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/validators";

interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string) => void;
}

export function PhoneInput({ value = "", onChange, className, ...props }: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
    const formatted = formatPhoneNumber(raw);
    onChange?.(formatted);
  };

  return (
    <Input
      {...props}
      type="tel"
      value={value}
      onChange={handleChange}
      placeholder={props.placeholder ?? "010-1234-5678"}
      className={cn(className)}
      maxLength={13}
    />
  );
}
