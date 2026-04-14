import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PalletManager } from "./PalletManager";
import type { FileSummaryItem, ShippingFileSummaryItem } from "./FileSidebar";
import { Package, Scissors, ClipboardCheck, ChevronRight } from "lucide-react";

interface Props {
  orderId: number;
  fileId: number;
  fileSummary: FileSummaryItem | null;
  shippingProgress: ShippingFileSummaryItem | null;
}

export function ShippingView({ orderId, fileId, fileSummary, shippingProgress }: Props) {
  if (!fileSummary) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
        <Package className="w-10 h-10 opacity-30" />
        <p>Select a file to view shipping details.</p>
      </div>
    );
  }

  const { packingProgress, hardwareProgress, ctsProgress } = shippingProgress ?? {
    packingProgress: null,
    hardwareProgress: null,
    ctsProgress: null,
  };

  return (
    <div className="space-y-5">
      {/* ─── Checklists for this file ─── */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{fileSummary.displayName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{fileSummary.itemCount} items · file #{fileId}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Packing Checklist */}
          <ChecklistCard
            href={`/files/${fileId}/checklist`}
            label="Packing Checklist"
            icon={<ClipboardCheck className="w-4 h-4" />}
            progress={packingProgress ? {
              done: packingProgress.checked,
              total: packingProgress.total,
              pct: packingProgress.percentage,
            } : null}
            testId={`link-packing-${fileId}`}
          />

          {/* Hardware Checklist — only if file has hardware */}
          {fileSummary.hasHardware && (
            <ChecklistCard
              href={`/files/${fileId}/hardware-checklist`}
              label="Hardware Checklist"
              icon={<Package className="w-4 h-4" />}
              progress={hardwareProgress ? {
                done: hardwareProgress.packed,
                total: hardwareProgress.total,
                pct: hardwareProgress.percentage,
              } : null}
              testId={`link-hardware-checklist-${fileId}`}
            />
          )}

          {/* Cut-to-Size — only if file has CTS */}
          {fileSummary.hasCTS && (
            <ChecklistCard
              href={`/files/${fileId}/cts`}
              label="Cut-to-Size Parts"
              icon={<Scissors className="w-4 h-4" />}
              progress={ctsProgress ? {
                done: ctsProgress.cut,
                total: ctsProgress.total,
                pct: ctsProgress.percentage,
              } : null}
              testId={`link-cts-${fileId}`}
            />
          )}
        </div>
      </div>

      {/* ─── Pallets (project-wide) ─── */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Pallets</h3>
        <PalletManager orderId={orderId} />
      </div>
    </div>
  );
}

interface ChecklistCardProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  progress: { done: number; total: number; pct: number } | null;
  testId: string;
}

function ChecklistCard({ href, label, icon, progress, testId }: ChecklistCardProps) {
  const isDone = progress ? progress.pct >= 100 : false;

  return (
    <Link href={href}>
      <a
        data-testid={testId}
        className="flex flex-col gap-2.5 rounded-md border p-3 hover:bg-muted/40 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className={isDone ? "text-green-600 dark:text-green-400" : "text-primary"}>
              {icon}
            </span>
            {label}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>

        {progress && progress.total > 0 ? (
          <div className="space-y-1">
            <Progress value={progress.pct} className="h-1.5" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.done}/{progress.total}</span>
              {isDone ? (
                <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-green-600 border-green-300 dark:text-green-400">
                  Done
                </Badge>
              ) : (
                <span>{Math.round(progress.pct)}%</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No items yet</p>
        )}
      </a>
    </Link>
  );
}
