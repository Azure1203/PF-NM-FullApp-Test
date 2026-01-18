import { useRoute, useSearch, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Package, Loader2, CheckCircle, Home, Truck, Clock, Box } from "lucide-react";
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

interface FileInfo {
  file: {
    id: number;
    projectId: number;
    originalFilename: string;
    allmoxyJobNumber: string | null;
    poNumber: string | null;
  };
  projectName: string;
}

export default function HardwareChecklist() {
  const [match, params] = useRoute("/files/:fileId/hardware-checklist");
  const fileId = parseInt(params?.fileId || "0");
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const palletId = searchParams.get('palletId');
  const { toast } = useToast();

  const { data: fileInfo } = useQuery<FileInfo>({
    queryKey: ['/api/files', fileId],
    enabled: !!fileId && fileId > 0,
  });

  if (!match || !fileId || fileId <= 0) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <p className="text-muted-foreground" data-testid="text-invalid-file">Invalid file ID</p>
      </div>
    );
  }

  const { data, isLoading } = useQuery<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>({
    queryKey: ['/api/files', fileId, 'hardware-checklist'],
    enabled: !!fileId && fileId > 0,
  });

  const { mutate: togglePacked } = useMutation({
    mutationFn: async ({ itemId, isPacked }: { itemId: number; isPacked: boolean }) => {
      return apiRequest('POST', `/api/hardware-checklist/${itemId}/toggle-packed`, { isPacked, packedBy: 'User' });
    },
    onMutate: async ({ itemId, isPacked }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
      const previousData = queryClient.getQueryData<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>(['/api/files', fileId, 'hardware-checklist']);
      if (previousData) {
        const updatedItems = previousData.items.map(item =>
          item.id === itemId ? { ...item, isPacked, packedAt: isPacked ? new Date().toISOString() : null } : item
        );
        const packed = updatedItems.filter(i => i.isPacked).length;
        queryClient.setQueryData(['/api/files', fileId, 'hardware-checklist'], {
          items: updatedItems,
          progress: { ...previousData.progress, packed }
        });
      }
      return { previousData };
    },
    onError: (error: Error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/files', fileId, 'hardware-checklist'], context.previousData);
      }
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
    }
  });

  const { mutate: toggleBuyoutArrived } = useMutation({
    mutationFn: async ({ itemId, buyoutArrived }: { itemId: number; buyoutArrived: boolean }) => {
      return apiRequest('POST', `/api/hardware-checklist/${itemId}/toggle-buyout-arrived`, { buyoutArrived });
    },
    onMutate: async ({ itemId, buyoutArrived }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
      const previousData = queryClient.getQueryData<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>(['/api/files', fileId, 'hardware-checklist']);
      if (previousData) {
        const updatedItems = previousData.items.map(item =>
          item.id === itemId ? { ...item, buyoutArrived } : item
        );
        const buyoutArrivedCount = updatedItems.filter(i => i.isBuyout && i.buyoutArrived).length;
        queryClient.setQueryData(['/api/files', fileId, 'hardware-checklist'], {
          items: updatedItems,
          progress: { ...previousData.progress, buyoutArrived: buyoutArrivedCount }
        });
      }
      return { previousData };
    },
    onError: (error: Error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/files', fileId, 'hardware-checklist'], context.previousData);
      }
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'hardware-checklist'] });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = data?.items || [];
  const progress = data?.progress || { total: 0, packed: 0, buyoutItems: 0, buyoutArrived: 0 };
  const progressPercent = progress.total > 0 ? (progress.packed / progress.total) * 100 : 0;
  const allPacked = progress.packed === progress.total && progress.total > 0;

  let boStatus: 'NO_BO' | 'WAITING' | 'ARRIVED' = 'NO_BO';
  if (progress.buyoutItems > 0) {
    boStatus = progress.buyoutArrived === progress.buyoutItems ? 'ARRIVED' : 'WAITING';
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        <div className="flex gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          {fileInfo && (
            <Link href={`/orders/${fileInfo.file.projectId}${palletId ? `?scrollToPallet=${palletId}` : ''}`}>
              <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground" data-testid="button-back-order">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Order
              </Button>
            </Link>
          )}
        </div>

        <PageHeader 
          title="Hardware Packing Checklist" 
          description="Hardware items that need to be packed for this order."
        />

        {fileInfo && (
          <Card className="border-none shadow-md mb-6" data-testid="hardware-file-info">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Box className="w-6 h-6 text-primary" />
                <div>
                  {fileInfo.file?.allmoxyJobNumber && (
                    <p className="text-sm text-primary font-medium" data-testid="text-job-number">Allmoxy Job #{fileInfo.file.allmoxyJobNumber}</p>
                  )}
                  <p className="text-xs text-muted-foreground" data-testid="text-order-name">Order Name: {fileInfo.file?.poNumber || fileInfo.file?.originalFilename || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground" data-testid="text-project-name">Project: {fileInfo.projectName}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {progress.total > 0 && (
          <Card className="border-none shadow-md mb-6" data-testid="hardware-progress-card">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${allPacked ? 'bg-green-500' : 'bg-primary'}`}>
                    {allPacked ? (
                      <CheckCircle className="w-6 h-6 text-white" />
                    ) : (
                      <Package className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <p className={`text-lg font-semibold ${allPacked ? 'text-green-600' : ''}`} data-testid="text-progress-status">
                      {allPacked ? 'All Hardware Packed!' : 'Packing Progress'}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant={allPacked ? 'default' : 'secondary'} className={allPacked ? 'bg-green-500' : ''} data-testid="badge-progress">
                        {progress.packed}/{progress.total} Packed
                      </Badge>
                      {boStatus === 'NO_BO' && (
                        <Badge variant="outline" className="gap-1" data-testid="badge-bo-status">
                          <CheckCircle className="w-3 h-3" />
                          No BO Hardware
                        </Badge>
                      )}
                      {boStatus === 'WAITING' && (
                        <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid="badge-bo-status">
                          <Clock className="w-3 h-3" />
                          Waiting for BO ({progress.buyoutArrived}/{progress.buyoutItems})
                        </Badge>
                      )}
                      {boStatus === 'ARRIVED' && (
                        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-bo-status">
                          <Truck className="w-3 h-3" />
                          BO Hardware Arrived
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-full sm:w-48">
                  <Progress value={progressPercent} className="h-3" />
                  <p className="text-xs text-muted-foreground text-right mt-1" data-testid="text-progress-percent">{Math.round(progressPercent)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {items.length === 0 ? (
          <Card className="border-none shadow-md">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Box className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground" data-testid="text-empty-title">No Hardware Items</p>
              <p className="text-sm text-muted-foreground/70" data-testid="text-empty-description">This file doesn't have a hardware checklist yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <Card 
                key={item.id} 
                className={`border-none shadow-md transition-colors ${
                  item.isPacked 
                    ? 'bg-green-50 dark:bg-green-950/20 border-2 border-green-400' 
                    : item.isBuyout && !item.buyoutArrived
                      ? 'bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-400'
                      : ''
                }`} 
                data-testid={`hardware-item-${item.id}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={item.isPacked}
                        onCheckedChange={(checked) => togglePacked({ itemId: item.id, isPacked: !!checked })}
                        disabled={item.isBuyout && !item.buyoutArrived}
                        className="w-8 h-8 border-2 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                        data-testid={`checkbox-packed-${item.id}`}
                      />
                      <div>
                        <CardTitle className={`text-lg font-mono ${item.isPacked ? 'line-through text-muted-foreground' : ''}`} data-testid={`text-product-code-${item.id}`}>
                          {item.productCode}
                        </CardTitle>
                        <CardDescription data-testid={`text-product-name-${item.id}`}>
                          {item.productName || "No description"}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-3xl font-bold ${item.isPacked ? 'text-green-600' : 'text-primary'}`} data-testid={`text-quantity-${item.id}`}>
                        x{item.quantity}
                      </div>
                      <div className="text-sm text-muted-foreground">{item.isPacked ? 'Packed' : 'Quantity'}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid={`text-stock-status-${item.id}`}>
                          {item.productStockStatus === 'BUYOUT' ? (
                            <span className="text-amber-600">Buyout Item</span>
                          ) : (
                            <span className="text-green-600">In Stock</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-stock-label-${item.id}`}>Stock Status</p>
                      </div>
                    </div>
                    
                    {item.isBuyout && (
                      <div className="flex items-center gap-3">
                        <Truck className="w-5 h-5 text-muted-foreground" />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`buyout-${item.id}`}
                            checked={item.buyoutArrived}
                            onCheckedChange={(checked) => toggleBuyoutArrived({ itemId: item.id, buyoutArrived: !!checked })}
                            data-testid={`checkbox-buyout-arrived-${item.id}`}
                          />
                          <label htmlFor={`buyout-${item.id}`} className="text-sm cursor-pointer">
                            {item.buyoutArrived ? (
                              <span className="text-green-600 font-medium">BO Arrived</span>
                            ) : (
                              <span className="text-amber-600">Waiting for BO</span>
                            )}
                          </label>
                        </div>
                      </div>
                    )}

                    {item.imagePath && (
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded border overflow-hidden bg-white" data-testid={`container-image-${item.id}`}>
                          <img
                            src={item.imagePath}
                            alt={item.productCode}
                            className="w-full h-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            data-testid={`img-product-${item.id}`}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid={`text-image-label-${item.id}`}>Product Image</p>
                      </div>
                    )}
                  </div>

                  {item.isPacked && item.packedAt && (
                    <div className="flex items-center gap-2 text-sm text-green-600" data-testid={`text-packed-at-${item.id}`}>
                      <CheckCircle className="w-4 h-4" />
                      Packed {new Date(item.packedAt).toLocaleString()}
                      {item.packedBy && ` by ${item.packedBy}`}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-8 border-t mt-8">
          {fileInfo?.file?.projectId && (
            <Link href={`/orders/${fileInfo.file.projectId}${palletId ? `?scrollToPallet=${palletId}` : ''}`}>
              <Button variant="outline" className="w-full sm:w-auto" data-testid="button-bottom-back-order">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Order
              </Button>
            </Link>
          )}
          <Link href="/">
            <Button variant="outline" className="w-full sm:w-auto" data-testid="button-bottom-back-dashboard">
              <Home className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
