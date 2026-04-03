import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Scissors, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

interface CtsItem {
  sku: string;
  quantity: number;
  length: number;
  supplyType: string;
  rackLocation: string | null;
}

interface CtsData {
  items: CtsItem[];
  totalLengthMm: number;
  totalLengthInches: number;
  totalRodsNeeded: number;
}

interface ProjectFile {
  id: number;
  originalFilename?: string;
  filename?: string;
}

interface CtsTabProps {
  orderId: number;
  files?: ProjectFile[];
}

export function CtsTab({ orderId, files }: CtsTabProps) {
  const { data, isLoading, error } = useQuery<CtsData>({
    queryKey: ['/api/orders', orderId, 'export', 'cts'],
    queryFn: () => fetch(`/api/orders/${orderId}/export/cts`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!orderId,
  });

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (error || !data || data.items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No Cut-to-Size items in this order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span><Scissors className="w-4 h-4 inline mr-1" />{data.items.length} rods</span>
          <span>{data.totalLengthInches.toFixed(1)}"  total</span>
          <span><strong className="text-foreground">{data.totalRodsNeeded}</strong> full rods needed</span>
        </div>
        <div className="flex gap-2">
          <a href={`/api/orders/${orderId}/export/cts`} target="_blank" rel="noreferrer" download>
            <Button variant="outline" size="sm" data-testid="button-cts-export">
              <Download className="w-4 h-4 mr-1.5" />
              Download JSON
            </Button>
          </a>
          <a href={`/api/orders/${orderId}/pdf/cut-to-size`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" data-testid="button-cts-pdf-tab">
              <FileText className="w-4 h-4 mr-1.5" />
              Download PDF
            </Button>
          </a>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold">SKU</TableHead>
            <TableHead className="font-bold text-center">Qty</TableHead>
            <TableHead className="font-bold text-right">Cut Length (in)</TableHead>
            <TableHead className="font-bold text-center">Supply</TableHead>
            <TableHead className="font-bold">Rack Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono text-xs">{item.sku}</TableCell>
              <TableCell className="text-center">{item.quantity}</TableCell>
              <TableCell className="text-right font-mono text-xs">{item.length}"</TableCell>
              <TableCell className="text-center">
                <Badge variant={item.supplyType === 'BUYOUT' ? 'secondary' : 'outline'} className="text-[10px]">
                  {item.supplyType}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.rackLocation ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {files && files.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5" /> Per-File CTS Pages
          </p>
          <div className="flex flex-wrap gap-2">
            {files.map(f => (
              <Link key={f.id} href={`/files/${f.id}/cts`}>
                <Button variant="outline" size="sm" className="text-xs" data-testid={`button-cts-file-${f.id}`}>
                  <Scissors className="w-3.5 h-3.5 mr-1.5" />
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
