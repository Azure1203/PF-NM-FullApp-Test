import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Package, CheckCircle, Box } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HardwareChecklistItem {
  id: number;
  fileId: number;
  productId: number | null;
  productCode: string;
  productName: string | null;
  quantity: number;
  isBuyout: boolean;
  buyoutArrived: boolean;
  isPacked: boolean;
  packedAt: string | null;
  packedBy: string | null;
  sortOrder: number;
  imagePath: string | null;
  productStockStatus: string | null;
  ctsCutLength?: number;
}

interface HardwareChecklistProgress {
  total: number;
  packed: number;
  buyoutItems: number;
  buyoutArrived: number;
}

interface Props {
  fileId: number;
  projectId?: number;
}

export function HardwareChecklistInline({ fileId, projectId }: Props) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>({
    queryKey: ["/api/files", fileId, "hardware-checklist"],
    enabled: fileId > 0,
    refetchInterval: 60000,
  });

  const { mutate: togglePacked } = useMutation({
    mutationFn: ({ itemId, isPacked }: { itemId: number; isPacked: boolean }) =>
      apiRequest("POST", `/api/hardware-checklist/${itemId}/toggle-packed`, { isPacked, packedBy: "User" }),
    onMutate: async ({ itemId, isPacked }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/files", fileId, "hardware-checklist"] });
      const prev = queryClient.getQueryData<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>(["/api/files", fileId, "hardware-checklist"]);
      if (prev) {
        const updatedItems = prev.items.map(i => i.id === itemId ? { ...i, isPacked, packedAt: isPacked ? new Date().toISOString() : null } : i);
        const packed = updatedItems.filter(i => i.isPacked).length;
        queryClient.setQueryData(["/api/files", fileId, "hardware-checklist"], { items: updatedItems, progress: { ...prev.progress, packed } });
      }
      return { prev };
    },
    onError: (err: Error, _, context: any) => {
      if (context?.prev) queryClient.setQueryData(["/api/files", fileId, "hardware-checklist"], context.prev);
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", fileId, "hardware-checklist"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders", projectId, "pallets"] });
      }
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const items = data?.items ?? [];
  const progress = data?.progress ?? { total: 0, packed: 0, buyoutItems: 0, buyoutArrived: 0 };
  const progressPercent = progress.total > 0 ? (progress.packed / progress.total) * 100 : 0;
  const allPacked = progress.packed === progress.total && progress.total > 0;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Box className="w-12 h-12 opacity-30" />
        <p>No hardware checklist for this file.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${allPacked ? "bg-green-500" : "bg-primary"}`}>
            {allPacked ? <CheckCircle className="w-5 h-5 text-white" /> : <Package className="w-5 h-5 text-white" />}
          </div>
          <div>
            <p className={`font-semibold ${allPacked ? "text-green-600 dark:text-green-400" : ""}`}>
              {allPacked ? "All Hardware Packed!" : "Hardware Packing Progress"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={allPacked ? "default" : "secondary"} className={allPacked ? "bg-green-500" : ""}>
                {progress.packed}/{progress.total} Packed
              </Badge>
              {progress.buyoutItems > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                  {progress.buyoutItems} Buyout
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="w-36">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground text-right mt-1">{Math.round(progressPercent)}%</p>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <Card
            key={item.id}
            className={`transition-colors ${item.isPacked ? "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800" : ""}`}
            data-testid={`hardware-item-${item.id}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox
                    checked={item.isPacked}
                    onCheckedChange={(checked) => togglePacked({ itemId: item.id, isPacked: !!checked })}
                    className="w-6 h-6 border-2 flex-shrink-0 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                    data-testid={`checkbox-packed-${item.id}`}
                  />
                  <div className="min-w-0">
                    <CardTitle className={`text-sm font-mono break-all ${item.isPacked ? "line-through text-muted-foreground" : ""}`}>
                      {item.productCode}
                    </CardTitle>
                    <CardDescription className="text-xs">{item.productName || "No description"}</CardDescription>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-2xl font-bold ${item.isPacked ? "text-green-600" : "text-primary"}`}>x{item.quantity}</div>
                  <div className="text-xs text-muted-foreground">{item.isPacked ? "Packed" : "Quantity"}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center gap-2">
                {item.isBuyout ? (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">BUYOUT</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600 border-green-300">In Stock</Badge>
                )}
                {item.ctsCutLength !== undefined && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                    Cut: {Number(item.ctsCutLength).toFixed(1)} mm
                  </Badge>
                )}
                {item.imagePath && (
                  <div className="w-12 h-12 rounded border overflow-hidden bg-white flex-shrink-0">
                    <img src={item.imagePath} alt={item.productCode} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
              </div>
              {item.isPacked && item.packedAt && (
                <div className="flex items-center gap-1 text-xs text-green-600 mt-2">
                  <CheckCircle className="w-3 h-3" />
                  Packed {new Date(item.packedAt).toLocaleString()}{item.packedBy && ` by ${item.packedBy}`}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
