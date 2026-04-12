import { CheckCircle, AlertTriangle, XCircle, Package, Scissors, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface FileSummaryItem {
  fileId: number;
  displayName: string;
  filename: string;
  poNumber: string | null;
  itemCount: number;
  subtotal: number;
  pricingErrors: number;
  exportTypes: string[];
  hasElias: boolean;
  hasMJ: boolean;
  hasHardware: boolean;
  hasGlass: boolean;
  hasCTS: boolean;
  hasORD: boolean;
}

export interface ShippingFileSummaryItem {
  fileId: number;
  displayName: string;
  packingProgress: { total: number; checked: number; percentage: number };
  hardwareProgress: { total: number; packed: number; percentage: number; buyoutItems: number; buyoutArrived: number } | null;
  ctsProgress: { total: number; cut: number; allCut: boolean; percentage: number } | null;
}

interface Props {
  mode: "documents" | "shipping";
  files: FileSummaryItem[];
  shippingFiles?: ShippingFileSummaryItem[];
  selectedFileId: number | null;
  onSelectFile: (fileId: number) => void;
}

function fmtCurrency(v: number) {
  return `$${v.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FileSidebar({ mode, files, shippingFiles, selectedFileId, onSelectFile }: Props) {
  const shippingMap = new Map(shippingFiles?.map(f => [f.fileId, f]) ?? []);

  return (
    <div className="flex flex-col gap-1 py-2">
      {files.map((file) => {
        const isSelected = selectedFileId === file.fileId;
        const shipping = shippingMap.get(file.fileId);

        return (
          <button
            key={file.fileId}
            onClick={() => onSelectFile(file.fileId)}
            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
              isSelected
                ? "border-primary bg-primary/10 dark:bg-primary/20 shadow-sm"
                : "border-transparent hover:border-border hover:bg-muted/50"
            }`}
            data-testid={`sidebar-file-${file.fileId}`}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                {file.displayName}
              </p>
              {isSelected && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-primary" />}
            </div>

            {mode === "documents" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{file.itemCount} items</span>
                  <span className="font-medium text-foreground">{fmtCurrency(file.subtotal)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {file.pricingErrors > 0 ? (
                    <Badge variant="destructive" className="text-xs h-4 px-1 py-0 gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {file.pricingErrors} err
                    </Badge>
                  ) : file.itemCount > 0 ? (
                    <Badge variant="outline" className="text-xs h-4 px-1 py-0 gap-0.5 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                      <CheckCircle className="w-2.5 h-2.5" />
                      OK
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs h-4 px-1 py-0 text-muted-foreground">
                      Empty
                    </Badge>
                  )}
                  {file.hasORD && <Badge variant="secondary" className="text-xs h-4 px-1 py-0">ORD</Badge>}
                  {file.hasCTS && <Badge variant="secondary" className="text-xs h-4 px-1 py-0">CTS</Badge>}
                  {file.hasElias && <Badge variant="secondary" className="text-xs h-4 px-1 py-0">Elias</Badge>}
                  {file.hasMJ && <Badge variant="secondary" className="text-xs h-4 px-1 py-0">M&J</Badge>}
                </div>
              </div>
            )}

            {mode === "shipping" && shipping && (
              <div className="space-y-1.5">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Package className="w-2.5 h-2.5" />
                      Pack
                    </span>
                    <span className={shipping.packingProgress.percentage === 100 ? "text-green-600 font-medium" : ""}>
                      {shipping.packingProgress.checked}/{shipping.packingProgress.total}
                    </span>
                  </div>
                  {shipping.packingProgress.total > 0 && (
                    <Progress value={shipping.packingProgress.percentage} className="h-1" />
                  )}
                </div>
                {shipping.hardwareProgress && (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>HW</span>
                      <span className={shipping.hardwareProgress.percentage === 100 ? "text-green-600 font-medium" : ""}>
                        {shipping.hardwareProgress.packed}/{shipping.hardwareProgress.total}
                      </span>
                    </div>
                    <Progress value={shipping.hardwareProgress.percentage} className="h-1" />
                  </div>
                )}
                {shipping.ctsProgress && (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Scissors className="w-2.5 h-2.5" />
                        CTS
                      </span>
                      <span className={shipping.ctsProgress.allCut ? "text-green-600 font-medium" : ""}>
                        {shipping.ctsProgress.cut}/{shipping.ctsProgress.total}
                      </span>
                    </div>
                    <Progress value={shipping.ctsProgress.percentage} className="h-1" />
                  </div>
                )}
              </div>
            )}

            {mode === "shipping" && !shipping && (
              <p className="text-xs text-muted-foreground">{file.itemCount} items</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
