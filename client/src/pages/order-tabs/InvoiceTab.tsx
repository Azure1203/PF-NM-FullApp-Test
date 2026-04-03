import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, AlertTriangle } from "lucide-react";

interface InvoiceItem {
  id: string;
  qty: number;
  height: number | null;
  width: number | null;
  length: number | null;
  thickness: number | null;
  edgeLeft: string;
  edgeRight: string;
  edgeTop: string;
  edgeBottom: string;
  type: string;
  supplyType: string;
  unitPrice: number;
  totalPrice: number;
  pricingError: string | null;
}

interface InvoiceSection {
  sku: string;
  color: string | null;
  exportType: string | null;
  categoryLabel: string;
  productDescription: string;
  items: InvoiceItem[];
  totalItems: number;
  subtotal: number;
}

interface InvoiceData {
  orderName: string;
  dealer: string | null;
  orderId: number;
  sections: InvoiceSection[];
  grandTotal: number;
  itemCount: number;
  errorCount: number;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function edgeCells(item: InvoiceItem) {
  return `${item.edgeLeft}/${item.edgeRight}/${item.edgeTop}/${item.edgeBottom}`;
}

function dimDisplay(item: InvoiceItem, exportType: string | null) {
  switch (exportType) {
    case 'CTS':
      return `${item.length ?? '—'}"`;
    case 'HARDWARE':
      return '—';
    default:
      return `${item.height ?? '?'} × ${item.width ?? '?'}`;
  }
}

export function InvoiceTab({ orderId }: { orderId: number }) {
  const { data, isLoading, error } = useQuery<InvoiceData>({
    queryKey: ['/api/orders', orderId, 'data', 'invoice'],
    queryFn: () => fetch(`/api/orders/${orderId}/data/invoice`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Failed to load invoice data.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">{data.orderName}</h2>
          {data.dealer && <p className="text-sm text-muted-foreground">{data.dealer}</p>}
          {data.errorCount > 0 && (
            <Badge variant="destructive" className="mt-1 gap-1">
              <AlertTriangle className="w-3 h-3" /> {data.errorCount} pricing error{data.errorCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <a href={`/api/orders/${orderId}/pdf/invoice`} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" data-testid="button-download-invoice-pdf">
            <Download className="w-4 h-4 mr-1.5" />
            Download PDF
          </Button>
        </a>
      </div>

      {data.sections.map((section, si) => (
        <div key={si} className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-primary">{section.sku}</span>
              {section.color && (
                <span className="text-sm text-muted-foreground">— {section.color}</span>
              )}
              {section.exportType && (
                <Badge variant="secondary" className="text-[10px]">{section.exportType}</Badge>
              )}
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold">{fmt.format(section.subtotal)}</span>
              <span className="text-xs text-muted-foreground ml-2">({section.totalItems} pcs)</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-center font-medium">Qty</th>
                  <th className="px-3 py-2 text-center font-medium">H × W</th>
                  {(section.exportType === 'ORD' || section.exportType === 'ELIAS') && (
                    <th className="px-3 py-2 text-center font-medium">Depth</th>
                  )}
                  {section.exportType === 'ORD' && (
                    <th className="px-3 py-2 text-center font-medium">Edges</th>
                  )}
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-center font-medium">Supply</th>
                  <th className="px-3 py-2 text-right font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, ii) => (
                  <tr key={ii} className={`border-b last:border-0 ${item.pricingError ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{item.id}</td>
                    <td className="px-3 py-1.5 text-center">{item.qty}</td>
                    <td className="px-3 py-1.5 text-center text-xs whitespace-nowrap">
                      {item.height ?? '?'} × {item.width ?? '?'}
                    </td>
                    {(section.exportType === 'ORD' || section.exportType === 'ELIAS') && (
                      <td className="px-3 py-1.5 text-center text-xs">{item.thickness ?? '—'}</td>
                    )}
                    {section.exportType === 'ORD' && (
                      <td className="px-3 py-1.5 text-center font-mono text-xs">{edgeCells(item)}</td>
                    )}
                    <td className="px-3 py-1.5 text-xs">{item.type || '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <Badge variant={item.supplyType === 'BUYOUT' ? 'secondary' : 'outline'} className="text-[10px]">
                        {item.supplyType}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{fmt.format(item.unitPrice)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">
                      {item.pricingError
                        ? <span className="text-red-500 text-[10px]" title={item.pricingError}>ERROR</span>
                        : fmt.format(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-2 border-t">
        <span className="text-base font-bold">Grand Total: {fmt.format(data.grandTotal)}</span>
      </div>
    </div>
  );
}
