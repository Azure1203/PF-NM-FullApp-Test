import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

interface InvoiceItem {
  id: string;
  qty: number;
  height: number | null;
  width: number | null;
  thickness: number | null;
  type: string;
  supplyType: string;
}

interface InvoiceSection {
  sku: string;
  color: string | null;
  exportType: string | null;
  productDescription: string;
  items: InvoiceItem[];
  totalItems: number;
}

interface InvoiceData {
  orderName: string;
  dealer: string | null;
  sections: InvoiceSection[];
  itemCount: number;
}

interface PackingSlipTabProps {
  orderId: number;
  slipType: 'customer' | 'internal';
}

export function PackingSlipTab({ orderId, slipType }: PackingSlipTabProps) {
  const { data, isLoading } = useQuery<InvoiceData>({
    queryKey: ['/api/orders', orderId, 'data', 'invoice'],
    queryFn: () => fetch(`/api/orders/${orderId}/data/invoice`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!orderId,
  });

  const pdfUrl = slipType === 'customer'
    ? `/api/orders/${orderId}/pdf/customer-packing-slip`
    : `/api/orders/${orderId}/pdf/internal-packing-slip`;

  const label = slipType === 'customer' ? 'Customer Packing Slip' : 'Internal Packing Slip';

  if (isLoading) {
    return <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (!data) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Failed to load packing slip data.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">{data.orderName}</h2>
          {data.dealer && <p className="text-sm text-muted-foreground">{data.dealer}</p>}
          <p className="text-sm text-muted-foreground mt-1">{data.itemCount} items total</p>
        </div>
        <a href={pdfUrl} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" data-testid={`button-download-${slipType}-slip-pdf`}>
            <Download className="w-4 h-4 mr-1.5" />
            Download {label} PDF
          </Button>
        </a>
      </div>

      {data.sections.map((section, si) => (
        <div key={si} className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-primary">{section.sku}</span>
              {section.color && <span className="text-sm text-muted-foreground">— {section.color}</span>}
              {section.exportType && (
                <Badge variant="secondary" className="text-[10px]">{section.exportType}</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{section.totalItems} pcs</span>
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
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-center font-medium">Supply</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, ii) => (
                  <tr key={ii} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{item.id}</td>
                    <td className="px-3 py-1.5 text-center">{item.qty}</td>
                    <td className="px-3 py-1.5 text-center text-xs whitespace-nowrap">
                      {item.height ?? '?'} × {item.width ?? '?'}
                    </td>
                    {(section.exportType === 'ORD' || section.exportType === 'ELIAS') && (
                      <td className="px-3 py-1.5 text-center text-xs">{item.thickness ?? '—'}</td>
                    )}
                    <td className="px-3 py-1.5 text-xs">{item.type || '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <Badge variant={item.supplyType === 'BUYOUT' ? 'secondary' : 'outline'} className="text-[10px]">
                        {item.supplyType}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
