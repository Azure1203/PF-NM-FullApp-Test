import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

interface OrderItemRow {
  id: number;
  fileId: number;
  productId: number | null;
  productName: string | null;
  sku: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  pricingError: string | null;
  exportType: string | null;
  supplyType: string | null;
}

interface ProjectFile {
  id: number;
  originalFilename?: string;
  filename?: string;
}

interface HardwareTabProps {
  orderItems: OrderItemRow[] | undefined;
  files?: ProjectFile[];
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function HardwareTab({ orderItems, files }: HardwareTabProps) {
  const items = (orderItems ?? []).filter(i => i.exportType === 'HARDWARE');
  const total = items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);

  if (items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No Hardware items in this order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} items · {fmt.format(total)}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold">SKU</TableHead>
            <TableHead className="font-bold">Product</TableHead>
            <TableHead className="font-bold text-center">Qty</TableHead>
            <TableHead className="font-bold text-center">Supply</TableHead>
            <TableHead className="font-bold text-right">Unit</TableHead>
            <TableHead className="font-bold text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id} className={item.pricingError ? 'bg-red-50 dark:bg-red-950/20' : ''}>
              <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
              <TableCell className="text-sm">{item.productName || <Badge variant="outline" className="text-[10px]">No Match</Badge>}</TableCell>
              <TableCell className="text-center">{item.quantity}</TableCell>
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

      {files && files.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5" /> Hardware Checklists
          </p>
          <div className="flex flex-wrap gap-2">
            {files.map(f => (
              <Link key={f.id} href={`/files/${f.id}/hardware-checklist`}>
                <Button variant="outline" size="sm" className="text-xs" data-testid={`button-hw-checklist-${f.id}`}>
                  {(f.originalFilename || f.filename || `File ${f.id}`).replace(/\.[^/.]+$/, '')}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
