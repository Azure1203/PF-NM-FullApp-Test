import { useRoute, useSearch, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Package, Loader2, CheckCircle, Home, Box } from "lucide-react";
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
    refetchInterval: 60000,
  });

  if (!match || !fileId || fileId <= 0) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <p className="text-muted-foreground" data-testid="text-invalid-file">Invalid file ID</p>
      </div>
    );
  }

  const { data, isLoading } = useQuery<{ items: HardwareChecklistItem[]; progress: HardwareChecklistProgress }>({
    queryKey: ['/api/files', fileId, 'hardware-checklist'],
    enabled: !!fileId && fileId > 0,
    refetchInterval: 60000,
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
      // Invalidate both pallets and order queries so BO status updates in order details
      if (fileInfo?.file?.projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/orders', fileInfo.file.projectId, 'pallets'] });
        // Use the correct query key format that matches useOrder hook: ['/api/orders/:id', id]
        queryClient.invalidateQueries({ queryKey: ['/api/orders/:id', fileInfo.file.projectId] });
      }
    }
  });


  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = data?.items || [];
  const progress = data?.progress || { total: 0, packed: 0, buyoutItems: 0, buyoutArrived: 0 };
  const progressPercent = progress.total > 0 ? (progress.packed / progress.total) * 100 : 0;
  const allPacked = progress.packed === progress.total && progress.total > 0;

  const buyoutCount = progress.buyoutItems;

  return (
    <div className="min-h-screen bg-muted/30 pb-20">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-10">
        
        <div className="flex flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
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
          <Card className="border-none shadow-md mb-4 sm:mb-6" data-testid="hardware-file-info">
            <CardContent className="py-3 sm:py-4">
              <div className="flex items-center gap-3 min-w-0">
                <Box className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate" data-testid="text-order-name">Order Name: {fileInfo.file?.poNumber || fileInfo.file?.originalFilename || 'N/A'}</p>
                  {fileInfo.file?.allmoxyJobNumber && (
                    <p className="text-sm text-primary font-medium" data-testid="text-job-number">Allmoxy Job #{fileInfo.file.allmoxyJobNumber}</p>
                  )}
                  <p className="text-xs text-muted-foreground" data-testid="text-project-name">Project: {fileInfo.projectName}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {progress.total > 0 && (
          <Card className="border-none shadow-md mb-4 sm:mb-6" data-testid="hardware-progress-card">
            <CardContent className="py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`p-2 sm:p-3 rounded-lg ${allPacked ? 'bg-green-500' : 'bg-primary'}`}>
                    {allPacked ? (
                      <CheckCircle className="w-6 h-6 text-white" />
                    ) : (
                      <Package className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <p className={`text-base sm:text-lg font-semibold ${allPacked ? 'text-green-600' : ''}`} data-testid="text-progress-status">
                      {allPacked ? 'All Hardware Packed!' : 'Packing Progress'}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant={allPacked ? 'default' : 'secondary'} className={allPacked ? 'bg-green-500' : ''} data-testid="badge-progress">
                        {progress.packed}/{progress.total} Packed
                      </Badge>
                      {buyoutCount > 0 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-buyout-count">
                          {buyoutCount} Buyout
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
                    : ''
                }`} 
                data-testid={`hardware-item-${item.id}`}
              >
                <CardHeader className="pb-2 sm:pb-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                      <Checkbox
                        checked={item.isPacked}
                        onCheckedChange={(checked) => togglePacked({ itemId: item.id, isPacked: !!checked })}
                        className="w-7 h-7 sm:w-8 sm:h-8 border-2 flex-shrink-0 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                        data-testid={`checkbox-packed-${item.id}`}
                      />
                      <div className="min-w-0">
                        <CardTitle className={`text-sm sm:text-lg font-mono break-all ${item.isPacked ? 'line-through text-muted-foreground' : ''}`} data-testid={`text-product-code-${item.id}`}>
                          {item.productCode}
                        </CardTitle>
                        <CardDescription className="text-xs sm:text-sm" data-testid={`text-product-name-${item.id}`}>
                          {item.productName || "No description"}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-2xl sm:text-3xl font-bold ${item.isPacked ? 'text-green-600' : 'text-primary'}`} data-testid={`text-quantity-${item.id}`}>
                        x{item.quantity}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground">{item.isPacked ? 'Packed' : 'Quantity'}</div>
                      {item.ctsCutLength !== undefined && (
                        <Badge 
                          variant="outline" 
                          className="mt-1 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                          data-testid={`badge-cts-length-${item.id}`}
                        >
                          Cut: {Number(item.ctsCutLength).toFixed(1)} mm
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid={`text-stock-status-${item.id}`}>
                          {item.isBuyout ? (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              BUYOUT
                            </Badge>
                          ) : (
                            <span className="text-green-600">In Stock</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-stock-label-${item.id}`}>Stock Status</p>
                      </div>
                    </div>

                    {item.imagePath && (
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-20 sm:w-[7.5rem] sm:h-[7.5rem] rounded border overflow-hidden bg-white flex-shrink-0" data-testid={`container-image-${item.id}`}>
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
          {items.length > 0 && (
            <Button 
              className={`w-full sm:w-auto ${
                progress.packed === progress.total && progress.total > 0
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : ''
              }`}
              variant={progress.packed === progress.total && progress.total > 0 ? 'default' : 'outline'}
              data-testid="button-complete-checklist"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {progress.packed === progress.total && progress.total > 0 
                ? 'All Items Packed!' 
                : `${progress.packed}/${progress.total} Packed`}
            </Button>
          )}
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
