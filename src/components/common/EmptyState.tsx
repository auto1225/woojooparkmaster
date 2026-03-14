import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Icon className="h-12 w-12 text-muted-foreground/40" />
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground/70">{description}</p>}
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
