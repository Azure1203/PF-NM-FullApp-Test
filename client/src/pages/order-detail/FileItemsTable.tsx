import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface OrderItem {
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

interface Props {
  orderId: number;
  fileId: number;
}

export function FileItemsTable({ orderId, fileId }: Props) {
  const { data: items, isLoading } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", orderId, "items", fileId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/items?fileId=${fileId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: orderId > 0 && fileId > 0,
  });

  const fmt = (v: number | null | undefined) =>
    v == null ? "—" : `${parseFloat(v.toFixed(2))}`;
  const fmtPrice = (v: number | null | undefined) =>
    v == null ? "—" : `$${parseFloat(v.toFixed(2)).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const exportTypeColor = (type: string | null) => {
    switch (type) {
      case "ORD": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "ELIAS": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "MJ": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "HARDWARE": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "GLASS": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
      case "CTS": return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <p>No items found for this file.</p>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
  const errorCount = items.filter(i => i.pricingError).length;

  return (
    <div className="space-y-3">
      {errorCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {errorCount} item{errorCount !== 1 ? "s" : ""} with pricing errors
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">SKU</TableHead>
              <TableHead>Product / Description</TableHead>
              <TableHead className="text-center w-[100px]">Dimensions</TableHead>
              <TableHead className="text-center w-[50px]">Qty</TableHead>
              <TableHead className="text-right w-[90px]">Unit</TableHead>
              <TableHead className="text-right w-[90px]">Total</TableHead>
              <TableHead className="w-[80px]">Type</TableHead>
              <TableHead className="w-[70px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                className={item.pricingError ? "bg-red-50/50 dark:bg-red-950/20" : ""}
                data-testid={`row-item-${item.id}`}
              >
                <TableCell className="font-mono text-xs whitespace-nowrap">{item.sku ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {item.productName ? (
                    <span className="font-medium">{item.productName}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">{item.description ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  {[item.width, item.height, item.depth].some(v => v != null)
                    ? `${fmt(item.width)}×${fmt(item.height)}×${fmt(item.depth)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-center">{item.quantity ?? "—"}</TableCell>
                <TableCell className="text-right text-xs">{fmtPrice(item.unitPrice)}</TableCell>
                <TableCell className="text-right text-sm font-medium">{fmtPrice(item.totalPrice)}</TableCell>
                <TableCell>
                  {item.exportType && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${exportTypeColor(item.exportType)}`}>
                      {item.exportType}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {item.pricingError ? (
                    <Badge variant="destructive" className="text-xs px-1 py-0" title={item.pricingError}>
                      Error
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs px-1 py-0 text-green-600 border-green-300">
                      OK
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2 pt-1 border-t text-sm text-muted-foreground">
        <span>{items.length} items</span>
        <span className="font-semibold text-foreground">{fmtPrice(subtotal)}</span>
      </div>
    </div>
  );
}
