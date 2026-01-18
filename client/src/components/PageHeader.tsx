import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-8", className)}>
      <div className="space-y-0.5 sm:space-y-1">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <div className="text-muted-foreground text-sm sm:text-lg">{description}</div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
