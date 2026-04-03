import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ClipboardList, Download, FileText, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderItemRow {
  id: number;
  fileId: number;
  productId: number | null;
  productName: string | null;
  sku: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  exportText: string | null;
  pricingError: string | null;
  exportType: string | null;
  supplyType: string | null;
}

interface ProjectFile {
  id: number;
  originalFilename?: string;
  filename?: string;
}

interface AllItemsTabProps {
  orderId: number;
  orderItems: OrderItemRow[] | undefined;
  isLoading: boolean;
  files?: ProjectFile[];
  exportTypeCounts: Record<string, number>;
  hasElias: boolean;
  hasMJ: boolean;
  hasGlass: boolean;
  hasCTS: boolean;
  repricePending: boolean;
  regeneratePending: boolean;
  onReprice: () => void;
  onRegenerate: () => void;
  onDownloadOrd: () => void;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function AllItemsTab({
  orderId,
  orderItems,
  isLoading,
  files,
  exportTypeCounts,
  hasElias, hasMJ, hasGlass, hasCTS,
  repricePending,
  regeneratePending,
  onReprice,
  onRegenerate,
  onDownloadOrd,
}: AllItemsTabProps) {
  const [fileFilter, setFileFilter] = useState<'all' | number>('all');
  const { toast } = useToast();

  const filteredItems = useMemo(() => {
    if (fileFilter === 'all') return orderItems ?? [];
    return (orderItems ?? []).filter(i => i.fileId === fileFilter);
  }, [orderItems, fileFilter]);

  const grandTotal = (orderItems ?? []).reduce((s, i) => s + (i.totalPrice ?? 0), 0);
  const fileSubtotal = filteredItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="button-reprice"
          variant="outline"
          size="sm"
          onClick={onReprice}
          disabled={repricePending}
        >
          {repricePending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
          Re-run Pricing
        </Button>
        <Button
          data-testid="button-regenerate-checklists"
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={regeneratePending}
        >
          {regeneratePending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-1.5" />}
          Regenerate Checklists
        </Button>
        <Button
          data-testid="button-download-ord"
          variant="outline"
          size="sm"
          onClick={onDownloadOrd}
        >
          <Download className="w-4 h-4 mr-1.5" />
          Download .ORD
        </Button>
        {hasElias && (
          <Button data-testid="button-download-elias" variant="outline" size="sm"
            onClick={() => window.open(`/api/orders/${orderId}/export/elias`, '_blank')}>
            <Download className="w-4 h-4 mr-1.5" />
            Elias CSV ({exportTypeCounts['ELIAS']})
          </Button>
        )}
        {hasElias && (
          <Button data-testid="button-elias-pdf" variant="outline" size="sm"
            onClick={() => window.open(`/api/orders/${orderId}/pdf/elias`, '_blank')}>
            <FileText className="w-4 h-4 mr-1.5" />
            Elias PDF ({exportTypeCounts['ELIAS']})
          </Button>
        )}
        {hasMJ && (
          <Button data-testid="button-download-mj" variant="outline" size="sm"
            onClick={() => window.open(`/api/orders/${orderId}/export/mj`, '_blank')}>
            <Download className="w-4 h-4 mr-1.5" />
            M&amp;J CSV ({exportTypeCounts['MJ']})
          </Button>
        )}
        {(hasMJ || hasGlass) && (
          <Button data-testid="button-mj-shaker-pdf" variant="outline" size="sm"
            onClick={() => window.open(`/api/orders/${orderId}/pdf/mj`, '_blank')}>
            <FileText className="w-4 h-4 mr-1.5" />
            M&amp;J Shaker PDF ({(exportTypeCounts['MJ'] || 0) + (exportTypeCounts['GLASS'] || 0)})
          </Button>
        )}
        {hasCTS && (
          <Button data-testid="button-download-cts" variant="outline" size="sm"
            onClick={() => window.open(`/api/orders/${orderId}/export/cts`, '_blank')}>
            <Download className="w-4 h-4 mr-1.5" />
            Cut-to-Size ({exportTypeCounts['CTS']})
          </Button>
        )}
        {hasCTS && (
          <Button data-testid="button-cts-pdf" variant="outline" size="sm"
            onClick={() => window.open(`/api/orders/${orderId}/pdf/cut-to-size`, '_blank')}>
            <FileText className="w-4 h-4 mr-1.5" />
            Cut-to-Size PDF ({exportTypeCounts['CTS']})
          </Button>
        )}
        <Button data-testid="button-download-erp" variant="outline" size="sm"
          onClick={() => window.open(`/api/orders/${orderId}/export/erp`, '_blank')}>
          <Download className="w-4 h-4 mr-1.5" />
          ERP Import
        </Button>
        <Button data-testid="button-invoice-pdf" variant="outline" size="sm"
          onClick={() => window.open(`/api/orders/${orderId}/pdf/invoice`, '_blank')}>
          <FileText className="w-4 h-4 mr-1.5" />
          Invoice PDF
        </Button>
        <Button data-testid="button-customer-packing-slip" variant="outline" size="sm"
          onClick={() => window.open(`/api/orders/${orderId}/pdf/customer-packing-slip`, '_blank')}>
          <FileText className="w-4 h-4 mr-1.5" />
          Customer Packing Slip
        </Button>
        <Button data-testid="button-internal-packing-slip" variant="outline" size="sm"
          onClick={() => window.open(`/api/orders/${orderId}/pdf/internal-packing-slip`, '_blank')}>
          <FileText className="w-4 h-4 mr-1.5" />
          Internal Packing Slip
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!orderItems || orderItems.length === 0) && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No pricing data available. Re-upload the order CSV to generate pricing breakdown.
        </div>
      )}

      {/* Items table */}
      {!isLoading && orderItems && orderItems.length > 0 && (
        <>
          {files && files.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setFileFilter('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${fileFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border text-muted-foreground'}`}
              >
                All Files ({orderItems.length})
              </button>
              {files.map(f => {
                const count = orderItems.filter(i => i.fileId === f.id).length;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFileFilter(f.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${fileFilter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border text-muted-foreground'}`}
                  >
                    {(f.originalFilename || f.filename || `File ${f.id}`).replace(/\.[^/.]+$/, '')} ({count})
                  </button>
                );
              })}
            </div>
          )}

          <ScrollArea className="max-h-[600px] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="font-bold">SKU</TableHead>
                  <TableHead className="font-bold">Product</TableHead>
                  <TableHead className="font-bold">Description</TableHead>
                  <TableHead className="font-bold text-center">W × H × L</TableHead>
                  <TableHead className="font-bold text-center">Qty</TableHead>
                  <TableHead className="font-bold text-right">Unit Price</TableHead>
                  <TableHead className="font-bold text-right">Total</TableHead>
                  <TableHead className="font-bold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => {
                  const hasError = !!item.pricingError;
                  const matched = item.productId !== null;
                  const zeroPriced = matched && !hasError && (item.unitPrice ?? 0) === 0;
                  const priced = matched && !hasError && (item.unitPrice ?? 0) > 0;
                  const rowClass = hasError
                    ? 'bg-red-50 dark:bg-red-950/20'
                    : zeroPriced ? 'bg-yellow-50 dark:bg-yellow-950/20'
                    : priced ? 'bg-emerald-50 dark:bg-emerald-950/20' : '';
                  return (
                    <TableRow key={item.id} data-testid={`row-order-item-${item.id}`} className={rowClass}>
                      <TableCell className="font-mono text-xs">
                        <div>{item.sku}</div>
                        {hasError && (
                          <div className="mt-1 text-[10px] text-red-600 dark:text-red-400 font-sans">{item.pricingError}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.productName
                          ? <span className="text-sm">{item.productName}</span>
                          : <Badge variant="destructive" className="text-[10px]">No Match</Badge>}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">{item.description || '—'}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                        {item.width ?? '?'} × {item.height ?? '?'} × {item.depth ?? '?'}
                      </TableCell>
                      <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-sm">${(item.unitPrice ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">${(item.totalPrice ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        {hasError ? (
                          <Badge variant="destructive" data-testid={`badge-error-${item.id}`} className="gap-1 text-[10px]">
                            <X className="h-3 w-3" /> Error
                          </Badge>
                        ) : zeroPriced ? (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 gap-1 text-[10px]" data-testid={`badge-warn-${item.id}`}>
                            <AlertTriangle className="h-3 w-3" /> $0
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-[10px]" data-testid={`badge-ok-${item.id}`}>
                            <Check className="h-3 w-3" /> OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-t pt-3">
            <span><strong>{filteredItems.length}</strong> items{fileFilter !== 'all' && <span className="text-xs ml-1">(filtered)</span>}</span>
            {filteredItems.filter(i => !!i.pricingError).length > 0 && (
              <span className="text-red-500"><strong>{filteredItems.filter(i => !!i.pricingError).length}</strong> errors</span>
            )}
            {filteredItems.filter(i => !i.productId).length > 0 && (
              <span className="text-amber-500"><strong>{filteredItems.filter(i => !i.productId).length}</strong> unmatched SKUs</span>
            )}
            <span className="ml-auto font-bold text-foreground">
              {fileFilter !== 'all' ? 'File Subtotal' : 'Grand Total'}: {fmt.format(fileFilter !== 'all' ? fileSubtotal : grandTotal)}
              {fileFilter !== 'all' && (
                <span className="ml-2 font-normal text-muted-foreground text-xs">(Order: {fmt.format(grandTotal)})</span>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
