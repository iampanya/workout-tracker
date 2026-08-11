import { type ReactNode } from "react";
import { Card } from "./Card";

// Consistent empty-list placeholder: an icon, a headline, an optional line of
// context, and an optional primary action. Use wherever a list can be empty
// so blank screens read as an invitation rather than a bug.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-xs text-sm text-muted">{description}</p>}
      </div>
      {action}
    </Card>
  );
}
