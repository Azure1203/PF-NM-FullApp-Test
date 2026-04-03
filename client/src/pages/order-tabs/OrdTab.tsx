import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

interface OrdItem {
  sku: string | null;
  qty: number | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  exportText: string | null;
  pricingError: string | null;
}

interface OrdData {
  items: OrdItem[];
  assembledOrdText: string;
  total: number;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

interface OrdTabProps {
  orderId: number;
  projectName: string;
}

export function OrdTab({ orderId, projectName }: OrdTabProps) {
  const { data, isLoading } = useQuery<OrdData>({
    queryKey: ['/api/orders', orderId, 'data', 'ord'],
    queryFn: () => fetch(`/api/orders/${orderId}/data/ord`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!orderId,
  });

  const handleDownload = () => {
    if (!data?.assembledOrdText) return;
    const blob = new Blob([data.assembledOrdText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName ?? 'order'}.ord`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (!data || data.items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No Cabinet Vision export data found for this order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data.items.length} items · {fmt.format(data.total)}</p>
        <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-ord-file">
          <Download className="w-4 h-4 mr-1.5" />
          Download .ORD
        </Button>
      </div>

      <ScrollArea className="max-h-[400px] rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="font-bold">SKU</TableHead>
              <TableHead className="font-bold text-center">Qty</TableHead>
              <TableHead className="font-bold text-center">H × W × D</TableHead>
              <TableHead className="font-bold text-right">Unit</TableHead>
              <TableHead className="font-bold text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item, i) => (
              <TableRow key={i} className={item.pricingError ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
                <TableCell className="text-center">{item.qty}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  {item.height ?? '?'} × {item.width ?? '?'} × {item.depth ?? '?'}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{fmt.format(item.unitPrice ?? 0)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold">
                  {item.pricingError
                    ? <span className="text-red-500 text-[10px]" title={item.pricingError}>ERROR</span>
                    : fmt.format(item.totalPrice ?? 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assembled .ORD Text</p>
        <ScrollArea className="h-64 rounded-md border bg-muted/30">
          <pre className="p-4 text-xs font-mono whitespace-pre leading-relaxed">{data.assembledOrdText}</pre>
        </ScrollArea>
      </div>
    </div>
  );
}
