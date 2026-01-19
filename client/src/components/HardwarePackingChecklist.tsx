import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, CheckCircle, AlertCircle, Box } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
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
  notInDatabase?: boolean;
}

interface HardwareChecklistProgress {
  total: number;
  packed: number;
  buyoutItems: number;
  buyoutArrived: number;
}

interface HardwarePackingChecklistProps {
  fileId: number;
  fileName: string;
  projectId?: number;
}

export function HardwarePackingChecklist({ fileId, fileName, projectId }: HardwarePackingChecklistProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(true);

  const { data, isLoading, error } = useQuery<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>({
    queryKey: ['/api/files', fileId, 'hardware-checklist'],
    enabled: fileId > 0,
  });

  const togglePackedMutation = useMutation({
    mutationFn: async ({ itemId, isPacked }: { itemId: number; isPacked: boolean }) => {
      return await apiRequest('POST', `/api/hardware-checklist/${itemId}/toggle-packed`, { isPacked, packedBy: 'User' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
      // Invalidate both pallets and order queries so BO status updates in order details
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/orders', projectId, 'pallets'] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders', projectId] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const { items, progress } = data;

  if (items.length === 0) {
    return null;
  }

  const progressPercent = progress.total > 0 ? (progress.packed / progress.total) * 100 : 0;
  const allPacked = progress.packed === progress.total;
  
  // Count buyout items for display
  const buyoutCount = progress.buyoutItems;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-4" data-testid={`hardware-checklist-${fileId}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover-elevate">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <div className="flex items-center gap-2 flex-wrap">
                <Box className="w-4 h-4 text-primary" />
                Hardware Packing Checklist
                <Badge variant={allPacked ? 'default' : 'secondary'} className="ml-2">
                  {progress.packed}/{progress.total}
                </Badge>
                {buyoutCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                    {buyoutCount} Buyout
                  </Badge>
                )}
              </div>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-2">
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
                <span>Packing Progress</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    item.isPacked 
                      ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                      : 'hover-elevate'
                  }`}
                  data-testid={`hardware-item-${item.id}`}
                >
                  {item.imagePath ? (
                    <div className="w-12 h-12 flex-shrink-0 rounded border overflow-hidden bg-muted">
                      <img
                        src={item.imagePath}
                        alt={item.productCode}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 flex-shrink-0 rounded border bg-muted flex items-center justify-center">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium truncate">
                        {item.productCode}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        x{item.quantity}
                      </Badge>
                      {item.isBuyout && (
                        <Badge 
                          variant="secondary" 
                          className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                        >
                          BUYOUT
                        </Badge>
                      )}
                      {item.notInDatabase && (
                        <Badge 
                          variant="secondary" 
                          className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 gap-1"
                        >
                          <AlertCircle className="w-3 h-3" />
                          Not in DB
                        </Badge>
                      )}
                    </div>
                    {item.productName && (
                      <p className="text-sm text-muted-foreground truncate">
                        {item.productName}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Checkbox
                      id={`packed-${item.id}`}
                      checked={item.isPacked}
                      onCheckedChange={(checked) => {
                        togglePackedMutation.mutate({
                          itemId: item.id,
                          isPacked: !!checked,
                        });
                      }}
                      disabled={togglePackedMutation.isPending}
                      data-testid={`checkbox-packed-${item.id}`}
                    />
                    <label
                      htmlFor={`packed-${item.id}`}
                      className="text-xs text-muted-foreground cursor-pointer"
                    >
                      Packed
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {allPacked && (
              <div className="mt-4 flex items-center justify-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-300">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">All hardware packed!</span>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
