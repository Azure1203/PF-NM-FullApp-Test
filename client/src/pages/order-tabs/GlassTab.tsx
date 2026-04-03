import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  pricingError: string | null;
  exportType: string | null;
  supplyType: string | null;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function GlassTab({ orderItems }: { orderItems: OrderItemRow[] | undefined }) {
  const items = (orderItems ?? []).filter(i => i.exportType === 'GLASS');
  const total = items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);

  if (items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No Glass items in this order.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{items.length} items · {fmt.format(total)}</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold">SKU</TableHead>
            <TableHead className="font-bold text-center">Qty</TableHead>
            <TableHead className="font-bold text-center">H × W × T</TableHead>
            <TableHead className="font-bold text-center">Supply</TableHead>
            <TableHead className="font-bold text-right">Unit</TableHead>
            <TableHead className="font-bold text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id} className={item.pricingError ? 'bg-red-50 dark:bg-red-950/20' : ''}>
              <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
              <TableCell className="text-center">{item.quantity}</TableCell>
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
    </div>
  );
}
