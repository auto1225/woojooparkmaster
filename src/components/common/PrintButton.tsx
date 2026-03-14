import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface PrintButtonProps {
  className?: string;
}

export function PrintButton({ className }: PrintButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className={`no-print ${className ?? ""}`}
    >
      <Printer className="h-3.5 w-3.5 mr-1" />
      인쇄
    </Button>
  );
}
