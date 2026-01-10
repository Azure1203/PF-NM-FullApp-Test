import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface StatusBadgeProps {
  status: "pending" | "synced" | "error";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border shadow-sm transition-all",
        status === "synced" && "bg-green-50 text-green-700 border-green-200",
        status === "pending" && "bg-amber-50 text-amber-700 border-amber-200",
        status === "error" && "bg-red-50 text-red-700 border-red-200",
        className
      )}
    >
      {status === "synced" && <CheckCircle2 className="w-3.5 h-3.5" />}
      {status === "pending" && <Clock className="w-3.5 h-3.5" />}
      {status === "error" && <AlertCircle className="w-3.5 h-3.5" />}
      
      <span className="capitalize">{status}</span>
    </div>
  );
}
