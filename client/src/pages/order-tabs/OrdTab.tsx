import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, AlertCircle, FileArchive } from "lucide-react";

interface OrdItem {
  sku: string | null;
  qty: number | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  pricingError: string | null;
  exportText: string | null;
}

interface OrdRoom {
  roomNumber: number;
  fileId: number;
  fileName: string;
  roomName: string;
  itemCount: number;
  items: OrdItem[];
}

interface OrdData {
  projectName: string;
  rooms: OrdRoom[];
  totalItems: number;
  total: number;
  downloadFormat: 'ord' | 'zip';
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
    window.open(`/api/orders/${orderId}/download/ord`, '_blank');
  };

  if (isLoading) return <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (!data || data.rooms.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No Cabinet Vision export data found for this order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {data.rooms.length} {data.rooms.length === 1 ? 'room' : 'rooms'} · {data.totalItems} items · {fmt.format(data.total)}
          </p>
          {data.rooms.length > 1 && (
            <Badge variant="secondary" className="text-xs">Multi-Room</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-ord-file">
          {data.downloadFormat === 'zip'
            ? <><FileArchive className="w-4 h-4 mr-1.5" />Download ORD Files (.ZIP)</>
            : <><Download className="w-4 h-4 mr-1.5" />Download .ORD</>}
        </Button>
      </div>

      {data.rooms.map(room => (
        <div key={room.fileId} className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">Room {room.roomNumber}</Badge>
            <span className="text-sm font-medium">{room.roomName}</span>
            <span className="text-xs text-muted-foreground">({room.itemCount} items)</span>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold w-8 text-center">#</TableHead>
                  <TableHead className="font-bold">SKU</TableHead>
                  <TableHead className="font-bold text-center">Qty</TableHead>
                  <TableHead className="font-bold text-center">H × W × D</TableHead>
                  <TableHead className="font-bold text-right">Unit</TableHead>
                  <TableHead className="font-bold text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.items.map((item, i) => (
                  <TableRow key={i} className={item.pricingError ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                    <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
                    <TableCell className="text-center">{item.qty}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                      {item.height ?? '?'} × {item.width ?? '?'} × {item.depth ?? '?'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt.format(item.unitPrice ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {item.pricingError
                        ? <span className="text-red-500 text-[10px] flex items-center justify-end gap-1">
                            <AlertCircle className="w-3 h-3" />ERROR
                          </span>
                        : fmt.format(item.totalPrice ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
