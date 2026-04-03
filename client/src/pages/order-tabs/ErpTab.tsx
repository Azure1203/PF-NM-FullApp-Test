import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download } from "lucide-react";

export function ErpTab({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery<string>({
    queryKey: ['/api/orders', orderId, 'export', 'erp'],
    queryFn: () => fetch(`/api/orders/${orderId}/export/erp`, { credentials: 'include' }).then(r => r.text()),
    enabled: !!orderId,
  });

  if (isLoading) return <div className="space-y-3">{[0, 1].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">ERP import format</p>
        <a href={`/api/orders/${orderId}/export/erp`} target="_blank" rel="noreferrer" download>
          <Button variant="outline" size="sm" data-testid="button-download-erp-tab">
            <Download className="w-4 h-4 mr-1.5" />
            Download CSV
          </Button>
        </a>
      </div>
      <ScrollArea className="h-96 rounded-md border bg-muted/30">
        <pre className="p-4 text-xs font-mono whitespace-pre leading-relaxed">{data || 'No ERP data available.'}</pre>
      </ScrollArea>
    </div>
  );
}
