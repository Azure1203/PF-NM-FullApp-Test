import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Package, CheckCircle, AlertCircle, Box, Truck, Clock } from "lucide-react";
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
}

export function HardwarePackingChecklist({ fileId, fileName }: HardwarePackingChecklistProps) {
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
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleBuyoutArrivedMutation = useMutation({
    mutationFn: async ({ itemId, buyoutArrived }: { itemId: number; buyoutArrived: boolean }) => {
      return await apiRequest('POST', `/api/hardware-checklist/${itemId}/toggle-buyout-arrived`, { buyoutArrived });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
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
  
  // Calculate BO status
  let boStatus: 'NO BO HARDWARE' | 'WAITING FOR BO HARDWARE' | 'BO HARDWARE ARRIVED' = 'NO BO HARDWARE';
  if (progress.buyoutItems > 0) {
    boStatus = progress.buyoutArrived === progress.buyoutItems ? 'BO HARDWARE ARRIVED' : 'WAITING FOR BO HARDWARE';
  }

  const getBoStatusBadge = () => {
    switch (boStatus) {
      case 'NO BO HARDWARE':
        return (
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="w-3 h-3" />
            No BO Hardware
          </Badge>
        );
      case 'WAITING FOR BO HARDWARE':
        return (
          <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            <Clock className="w-3 h-3" />
            Waiting for BO Hardware ({progress.buyoutArrived}/{progress.buyoutItems})
          </Badge>
        );
      case 'BO HARDWARE ARRIVED':
        return (
          <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <Truck className="w-3 h-3" />
            BO Hardware Arrived
          </Badge>
        );
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-4" data-testid={`hardware-checklist-${fileId}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover-elevate">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-primary" />
                Hardware Packing Checklist
                <Badge variant={allPacked ? 'default' : 'secondary'} className="ml-2">
                  {progress.packed}/{progress.total}
                </Badge>
                {getBoStatusBadge()}
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
                      : item.isBuyout && !item.buyoutArrived
                        ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
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
                          className={`text-xs ${
                            item.buyoutArrived 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          }`}
                        >
                          {item.buyoutArrived ? 'BO Arrived' : 'BO Waiting'}
                        </Badge>
                      )}
                    </div>
                    {item.productName && (
                      <p className="text-sm text-muted-foreground truncate">
                        {item.productName}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {item.isBuyout && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`buyout-arrived-${item.id}`}
                          checked={item.buyoutArrived}
                          onCheckedChange={(checked) => {
                            toggleBuyoutArrivedMutation.mutate({
                              itemId: item.id,
                              buyoutArrived: !!checked,
                            });
                          }}
                          disabled={toggleBuyoutArrivedMutation.isPending}
                          data-testid={`checkbox-buyout-arrived-${item.id}`}
                        />
                        <label
                          htmlFor={`buyout-arrived-${item.id}`}
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          Arrived
                        </label>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`packed-${item.id}`}
                        checked={item.isPacked}
                        onCheckedChange={(checked) => {
                          togglePackedMutation.mutate({
                            itemId: item.id,
                            isPacked: !!checked,
                          });
                        }}
                        disabled={togglePackedMutation.isPending || (item.isBuyout && !item.buyoutArrived)}
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
