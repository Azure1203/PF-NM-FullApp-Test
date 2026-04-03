import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";

interface EliasItem {
  sku: string | null;
  qty: number | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  exportText: string | null;
  pricingError: string | null;
  supplyType: string | null;
}

interface EliasData {
  items: EliasItem[];
  total: number;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function EliasTab({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery<EliasData>({
    queryKey: ['/api/orders', orderId, 'data', 'elias'],
    queryFn: () => fetch(`/api/orders/${orderId}/data/elias`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!orderId,
  });

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (!data || data.items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No Elias Dovetail items in this order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data.items.length} items · {fmt.format(data.total)}</p>
        <div className="flex gap-2">
          <a href={`/api/orders/${orderId}/export/elias`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" data-testid="button-elias-csv">
              <Download className="w-4 h-4 mr-1.5" />
              Download CSV
            </Button>
          </a>
          <a href={`/api/orders/${orderId}/pdf/elias`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" data-testid="button-elias-pdf-tab">
              <FileText className="w-4 h-4 mr-1.5" />
              Download PDF
            </Button>
          </a>
        </div>
      </div>

      <ScrollArea className="max-h-[500px] rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="font-bold">SKU</TableHead>
              <TableHead className="font-bold text-center">Qty</TableHead>
              <TableHead className="font-bold text-center">H × W × D</TableHead>
              <TableHead className="font-bold text-center">Supply</TableHead>
              <TableHead className="font-bold text-right">Unit</TableHead>
              <TableHead className="font-bold text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item, i) => (
              <TableRow key={i} className={item.pricingError ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
                <TableCell className="text-center">{item.qty}</TableCell>
                <TableCell className="text-center text-xs whitespace-nowrap text-muted-foreground">
                  {item.height ?? '?'} × {item.width ?? '?'} × {item.depth ?? '?'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={item.supplyType === 'BUYOUT' ? 'secondary' : 'outline'} className="text-[10px]">
                    {item.supplyType ?? 'STOCK'}
                  </Badge>
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

      {data.items.some(i => i.exportText) && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Export Text</p>
          <ScrollArea className="h-48 rounded-md border bg-muted/30">
            <pre className="p-4 text-xs font-mono whitespace-pre leading-relaxed">
              {data.items.filter(i => i.exportText).map(i => i.exportText).join('\n')}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
